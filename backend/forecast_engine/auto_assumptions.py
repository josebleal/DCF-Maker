"""
Auto-generate bear/base/bull assumptions from historical data + SEC filings.

Modeling standard: EBITDA-first (matches investment club Excel DCF framework)
  EBITDA margin is the PRIMARY operating driver.
  EBIT = EBITDA - D&A (derived).

Scenario conventions (per investment club standard):
  Bear:  Revenue growth fades to -2% to +2% range; EBITDA margin contracts ~2-3pp
  Base:  Revenue grows mid single digits (3-6%), anchored to guidance/history
  Bull:  Revenue grows mid-high single digits (5-9%); can reach double digits if
         historical CAGR + SEC guidance both support it; margin expands ~1-2pp

WACC is derived from fundamentals (CAPM + leverage), not a hardcoded flat rate.

SEC filing integration:
  - Fetches latest 10-K and 10-Q from SEC EDGAR (free public API)
  - Extracts MD&A guidance snippets for analyst review
  - All extracted guidance is returned as-is — nothing is invented
"""

from __future__ import annotations

import logging
import statistics
from typing import Optional

from api.schemas import (
    AnnualFinancials,
    AssumptionsResponse,
    FilingMemo,
    HistoricalData,
    ScenarioAssumptions,
    WACCBuild,
    YearAssumption,
)
from data_providers.sec_provider import get_filing_data

logger = logging.getLogger(__name__)

FORECAST_YEARS = 5

# Damodaran ERP (Equity Risk Premium) — Damodaran Jan 2025 estimate
ERP = 0.055
# 10-year US Treasury yield (early 2026)
RISK_FREE_RATE = 0.044


# ── Utility helpers ───────────────────────────────────────────────────────────

def _median(values: list[float]) -> float:
    return statistics.median(values) if values else 0.0

def _clamp(val: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, val))

def _collect(rows: list[AnnualFinancials], attr: str) -> list[float]:
    return [getattr(r, attr) for r in rows if getattr(r, attr) is not None]

def _weighted_mean(values: list[float], recent_n: int = 2, recent_weight: float = 2.0) -> float:
    """Weighted mean; last `recent_n` values get `recent_weight`× more influence."""
    if not values:
        return 0.0
    if len(values) == 1:
        return values[0]
    weights = [1.0] * len(values)
    for i in range(max(0, len(values) - recent_n), len(values)):
        weights[i] = recent_weight
    return sum(w * v for w, v in zip(weights, values)) / sum(weights)

def _recent_avg(values: list[float], n: int = 2) -> Optional[float]:
    if not values:
        return None
    return sum(values[-n:]) / min(len(values), n)

def _trend(values: list[float]) -> str:
    if len(values) < 3:
        return "stable"
    recent = _recent_avg(values, 2) or 0.0
    hist   = _median(values[:-2]) if len(values) > 2 else recent
    diff   = recent - hist
    if diff > 0.03:
        return "accelerating"
    if diff < -0.03:
        return "decelerating"
    return "stable"

def _fade_to(start: float, end: float, n: int) -> list[float]:
    if n == 1:
        return [start]
    return [start + (end - start) * i / (n - 1) for i in range(n)]


# ── WACC build ────────────────────────────────────────────────────────────────

def _build_wacc(
    rows: list[AnnualFinancials],
    beta: Optional[float],
    market_cap: Optional[float],
) -> WACCBuild:
    beta_val = beta if (beta and 0.1 < beta < 5.0) else 1.0
    beta_src = "yahoo" if (beta and 0.1 < beta < 5.0) else "default_1.0"

    cost_of_equity = RISK_FREE_RATE + beta_val * ERP

    interest_expenses = _collect(rows, "interest_expense")
    total_debts       = _collect(rows, "total_debt")
    if interest_expenses and total_debts:
        avg_ie   = _recent_avg(interest_expenses, 2) or _median(interest_expenses)
        avg_debt = _recent_avg(total_debts, 2) or _median(total_debts)
        pre_tax_cod = _clamp(avg_ie / avg_debt, 0.02, 0.12) if avg_debt > 0 else 0.05
    else:
        pre_tax_cod = 0.05

    tax_rates = _collect(rows, "effective_tax_rate")
    eff_tax   = _clamp(_median(tax_rates) if tax_rates else 0.21, 0.10, 0.40)
    after_tax_cod = pre_tax_cod * (1.0 - eff_tax)

    latest   = rows[-1]
    debt     = latest.total_debt or (total_debts[-1] if total_debts else 0.0)
    mktcap   = market_cap or 0.0
    total_cap = mktcap + debt
    if total_cap > 0:
        eq_weight = mktcap / total_cap
        de_weight = debt  / total_cap
    else:
        eq_weight = 0.70
        de_weight = 0.30

    wacc = after_tax_cod * de_weight + cost_of_equity * eq_weight

    return WACCBuild(
        risk_free_rate          = round(RISK_FREE_RATE, 4),
        beta                    = round(beta_val, 3),
        equity_risk_premium     = round(ERP, 4),
        cost_of_equity          = round(cost_of_equity, 4),
        pre_tax_cost_of_debt    = round(pre_tax_cod, 4),
        effective_tax_rate      = round(eff_tax, 4),
        after_tax_cost_of_debt  = round(after_tax_cod, 4),
        equity_value            = round(mktcap, 0) if mktcap else None,
        debt_value              = round(debt,   0) if debt   else None,
        equity_weight           = round(eq_weight, 4),
        debt_weight             = round(de_weight, 4),
        wacc                    = round(wacc, 4),
        beta_source             = beta_src,
        rfr_source              = "default",
        erp_source              = "damodaran",
    )


# ── Filing memo ────────────────────────────────────────────────────────────────

def _build_filing_memo(
    ticker: str,
    rows: list[AnnualFinancials],
    wacc_build: WACCBuild,
    base_growth_y1: float,
    base_growth_y5: float,
    base_ebitda_y1: float,
    base_ebitda_y5: float,
    growth_trend: str,
    margin_trend: str,
    sec_data: dict,
) -> FilingMemo:
    latest    = rows[-1]
    n_years   = len(rows)
    rev_growths    = [r.revenue_growth for r in rows if r.revenue_growth  is not None]
    ebitda_margins = [r.ebitda_margin   for r in rows if r.ebitda_margin   is not None]
    da_pcts        = [r.da_pct_revenue  for r in rows if r.da_pct_revenue  is not None]
    capex_pcts     = [r.capex_pct_revenue for r in rows if r.capex_pct_revenue is not None]
    nwc_pcts       = [r.nwc_pct_revenue for r in rows if r.nwc_pct_revenue is not None]
    tax_rates      = [r.effective_tax_rate for r in rows if r.effective_tax_rate is not None]
    interest_exps  = [r.interest_expense for r in rows if r.interest_expense is not None]
    total_debts    = [r.total_debt for r in rows if r.total_debt is not None]

    rev_cagr = None
    if len(rows) >= 2 and rows[0].revenue and rows[-1].revenue and rows[0].revenue > 0:
        rev_cagr = (rows[-1].revenue / rows[0].revenue) ** (1 / (n_years - 1)) - 1

    rg_recent = _recent_avg(rev_growths, 2)
    rg_median = _median(rev_growths) if rev_growths else None
    em_recent = _recent_avg(ebitda_margins, 2)
    em_median = _median(ebitda_margins) if ebitda_margins else None

    # Guidance snippets from SEC (10-Q is more current; show it first)
    guidance_snippets = (
        sec_data.get("guidance_snippets_10q", []) +
        sec_data.get("guidance_snippets_10k", [])
    )[:5]

    guidance_text = ""
    if guidance_snippets:
        guidance_text = (
            " From recent SEC filing MD&A: \""
            + " | ".join(guidance_snippets[:3])
            + "\""
        )

    # Revenue rationale
    rev_rationale = ""
    if rev_cagr is not None:
        rev_rationale += f"{n_years}-yr revenue CAGR: {rev_cagr*100:.1f}%. "
    if rg_recent is not None and rg_median is not None:
        rev_rationale += (
            f"Recent 2-yr avg growth: {rg_recent*100:.1f}% "
            f"(full-period median: {rg_median*100:.1f}%). "
            f"Trend is {growth_trend}. "
        )
    rev_rationale += (
        f"Base forecast: {base_growth_y1*100:.1f}% Year 1 → {base_growth_y5*100:.1f}% Year 5 "
        f"(mid single digit range). "
        f"Bear capped at +2% max, fading to near flat/slightly negative by Year 5. "
        f"Bull assumes continued above-trend growth, up to double digits if historical CAGR supports."
    )
    if guidance_text:
        rev_rationale += guidance_text

    # EBITDA margin rationale
    ebitda_rationale = ""
    if em_recent is not None and em_median is not None:
        ebitda_rationale = (
            f"Recent 2-yr avg EBITDA margin: {em_recent*100:.1f}% "
            f"(full-period median: {em_median*100:.1f}%). "
            f"Margin trend is {margin_trend}. "
            f"Base: {base_ebitda_y1*100:.1f}% → {base_ebitda_y5*100:.1f}% over forecast horizon. "
            f"Review operating leverage, pricing power, and cost structure from latest 10-K MD&A."
        )

    # D&A
    da_median = _median(da_pcts) if da_pcts else None
    da_rationale = (
        f"D&A averaged {da_median*100:.1f}% of revenue historically. "
        f"Held constant in base; check for major capex programs that may shift the asset base." if da_median
        else "D&A data unavailable; using 4% of revenue. Verify from depreciation footnote in 10-K."
    )

    # Capex
    capex_median = _median(capex_pcts) if capex_pcts else None
    capex_recent = _recent_avg(capex_pcts, 2)
    capex_rationale = (
        f"Capex: {capex_median*100:.1f}% of revenue (full-period median), "
        f"{(capex_recent or 0)*100:.1f}% (recent 2-yr avg). "
        f"Adjust if management has guided major step-up or reduction in capital spending." if capex_median
        else "Capex data unavailable; using 4% of revenue. Verify from cash flow statement."
    )

    # Working capital
    nwc_median = _median(nwc_pcts) if nwc_pcts else None
    wc_rationale = (
        f"NWC as % of revenue: {nwc_median*100:.1f}% historical median. "
        f"Forecast anchors to latest year's NWC% to prevent artificial year-1 swings. "
        f"Override with DSO/DIO/DPO if balance sheet detail is available from filings." if nwc_median is not None
        else "NWC data limited; change in NWC assumed minimal. Verify from working capital section."
    )

    # Tax
    tax_median = _median(tax_rates) if tax_rates else None
    tax_rationale = (
        f"Effective tax rate: {tax_median*100:.1f}% historical median. "
        f"Adjust for NOLs, R&D credits, or jurisdiction changes disclosed in 10-K tax footnote." if tax_median
        else "Tax data unavailable; using 21% US statutory rate. Verify from income tax footnote."
    )

    # WACC
    wacc_rationale = (
        f"WACC via CAPM: RFR {wacc_build.risk_free_rate*100:.1f}% "
        f"+ β {wacc_build.beta:.2f} × ERP {wacc_build.equity_risk_premium*100:.1f}% "
        f"= CoE {wacc_build.cost_of_equity*100:.1f}%. "
        f"Pre-tax CoD {wacc_build.pre_tax_cost_of_debt*100:.1f}% "
        f"(from hist. interest expense/debt). "
        f"After-tax CoD {wacc_build.after_tax_cost_of_debt*100:.1f}%. "
        f"Structure: {wacc_build.equity_weight*100:.0f}% equity / "
        f"{wacc_build.debt_weight*100:.0f}% debt → WACC = {wacc_build.wacc*100:.1f}%. "
        f"Beta source: {wacc_build.beta_source}."
    )

    tgr_rationale = (
        "Terminal growth: 2.5% base / 1.5% bear / 3.0% bull. "
        "Base ≈ long-run nominal GDP growth. Reduce for mature/declining industries; "
        "increase only for structurally high-growth markets with a durable moat."
    )

    exit_rationale = (
        f"Exit EV/EBITDA: 12× base / 9× bear / 16× bull. "
        f"Cross-check against current trading multiple and sector comps. "
        f"Latest-year EBITDA margin of {(ebitda_margins[-1] if ebitda_margins else 0)*100:.1f}% "
        f"informs defensible multiple range."
    )

    # Key risks
    risks = []
    if rev_cagr is not None and rev_cagr < 0.03:
        risks.append("Low historical revenue CAGR — base scenario mid-single-digit assumption requires growth acceleration")
    if growth_trend == "decelerating":
        risks.append("Revenue growth has been decelerating — monitor whether year-1 base (3-5%) is achievable")
    if em_recent is not None and em_median is not None and em_recent < em_median - 0.03:
        risks.append("EBITDA margin has compressed recently — base uses recent (lower) margin, not inflated median")
    if latest.net_debt and latest.revenue and latest.revenue > 0 and (latest.net_debt / latest.revenue) > 3.0:
        nd_rev = latest.net_debt / latest.revenue
        risks.append(f"Elevated leverage: net debt/revenue = {nd_rev:.1f}× — WACC may understate credit risk")
    if interest_exps and total_debts:
        ie, td = interest_exps[-1], total_debts[-1]
        if td > 0 and ie / td > 0.08:
            risks.append("High interest-rate cost on debt — refinancing risk in current rate environment")
    if n_years < 4:
        risks.append(f"Only {n_years} years of data — assumption confidence is lower; weight SEC filings more heavily")
    if not risks:
        risks.append("No major quantitative red flags — review qualitative factors (competition, regulation, cycle) from 10-K risk factors")

    # Supporting points
    support = []
    if rev_cagr is not None and rev_cagr > 0.07:
        support.append(f"Strong historical CAGR of {rev_cagr*100:.1f}% — bull double-digit scenario defensible if trend continues")
    if em_recent is not None and em_recent > 0.20:
        support.append(f"Healthy EBITDA margin of {em_recent*100:.1f}% generates strong free cash flow")
    if growth_trend == "accelerating":
        support.append("Revenue momentum is accelerating — Year 1-2 reflects current trajectory")
    if guidance_snippets:
        support.append(f"SEC MD&A guidance extracted: {len(guidance_snippets)} relevant sentence(s) found")
    if not support:
        support.append("Assumptions anchored to actual historical performance — conservative extrapolation")

    # Sources
    sources = ["Yahoo Finance (historical financials, beta, market cap)"]
    if sec_data.get("latest_10k_url"):
        sources.append(f"SEC EDGAR 10-K ({sec_data.get('latest_10k_period', 'latest')})")
    if sec_data.get("latest_10q_url"):
        sources.append(f"SEC EDGAR 10-Q ({sec_data.get('latest_10q_period', 'latest')})")
    if guidance_snippets:
        sources.append("MD&A guidance text extracted from SEC filing document")
    if not sec_data.get("latest_10k_url"):
        sources.append("SEC EDGAR URLs not resolved — verify ticker on edgar.sec.gov")

    return FilingMemo(
        latest_10k_url          = sec_data.get("latest_10k_url"),
        latest_10q_url          = sec_data.get("latest_10q_url"),
        latest_10k_period       = sec_data.get("latest_10k_period"),
        latest_10q_period       = sec_data.get("latest_10q_period"),
        revenue_growth_rationale= rev_rationale or "Revenue growth data unavailable.",
        ebitda_margin_rationale = ebitda_rationale or "EBITDA margin data unavailable.",
        da_rationale            = da_rationale,
        capex_rationale         = capex_rationale,
        working_capital_rationale = wc_rationale,
        tax_rationale           = tax_rationale,
        wacc_rationale          = wacc_rationale,
        terminal_growth_rationale = tgr_rationale,
        exit_multiple_rationale = exit_rationale,
        key_risks               = risks,
        key_supporting_points   = support,
        data_sources            = sources,
    )


# ── Main entry point ──────────────────────────────────────────────────────────

def build_auto_assumptions(
    historical: HistoricalData,
    beta: Optional[float] = None,
    market_cap: Optional[float] = None,
) -> AssumptionsResponse:
    """
    Generate bear/base/bull assumptions from historical data + SEC filing analysis.

    Scenario growth conventions (investment club standard):
      Bear  → low positive to slightly negative  (max +2%, floor ~-2%)
      Base  → mid single digits                  (3–6%, guided by history/filing)
      Bull  → mid-high single digits             (5–9%, can reach 10–14% if CAGR supports)
    """
    rows = sorted(historical.financials, key=lambda r: r.year)
    last_year = rows[-1].year
    latest    = rows[-1]

    # ── Collect historical series ─────────────────────────────────────────────
    rev_growths_raw  = _collect(rows, "revenue_growth")
    ebitda_mgns_raw  = _collect(rows, "ebitda_margin")
    ebit_mgns_raw    = _collect(rows, "ebit_margin")
    da_pcts_raw      = _collect(rows, "da_pct_revenue")
    capex_pcts_raw   = _collect(rows, "capex_pct_revenue")
    tax_rates_raw    = _collect(rows, "effective_tax_rate")
    dsos = _collect(rows, "dso")
    dios = _collect(rows, "dio")
    dpos = _collect(rows, "dpo")

    # Remove outlier growth years (e.g. post-COVID bounce, acquisition spikes)
    rev_growths = [g for g in rev_growths_raw if -0.50 <= g <= 2.0]

    # ── Trend detection ───────────────────────────────────────────────────────
    growth_trend = _trend(rev_growths)
    margin_trend = _trend(ebitda_mgns_raw)

    # ── Historical CAGR ───────────────────────────────────────────────────────
    rev_cagr = None
    if len(rows) >= 2 and rows[0].revenue and rows[-1].revenue and rows[0].revenue > 0:
        rev_cagr = (rows[-1].revenue / rows[0].revenue) ** (1 / (len(rows) - 1)) - 1

    # ── Recency-weighted growth anchor ───────────────────────────────────────
    # Recent 2-year average receives 2× weight vs older years
    recent_2yr_growth = _recent_avg(rev_growths, 2) or 0.0
    weighted_growth   = _weighted_mean(rev_growths, recent_n=2, recent_weight=2.0)

    # ── EBITDA margin anchor (recency-weighted) ───────────────────────────────
    base_ebitda_anchor = _clamp(
        _weighted_mean(ebitda_mgns_raw, recent_n=2, recent_weight=2.0),
        -0.05, 0.60,
    ) if ebitda_mgns_raw else 0.15

    # ── Cash flow driver anchors ──────────────────────────────────────────────
    med_da    = _clamp(_weighted_mean(da_pcts_raw,    recent_n=2) if da_pcts_raw    else 0.04, 0.01, 0.20)
    med_capex = _clamp(_weighted_mean(capex_pcts_raw, recent_n=2) if capex_pcts_raw else 0.04, 0.01, 0.25)
    med_tax   = _clamp(_median(tax_rates_raw) if tax_rates_raw else 0.21, 0.10, 0.40)
    med_dso   = _median(dsos) if dsos else None
    med_dio   = _median(dios) if dios else None
    med_dpo   = _median(dpos) if dpos else None

    # ── Capital structure (latest balance sheet) ──────────────────────────────
    cash            = latest.cash          or 0.0
    debt            = latest.total_debt    or 0.0
    diluted_shares  = latest.diluted_shares or 1.0

    # ── WACC build ────────────────────────────────────────────────────────────
    wacc_build = _build_wacc(rows, beta, market_cap)
    wacc_base  = wacc_build.wacc
    wacc_bear  = _clamp(wacc_base + 0.015, 0.06, 0.20)
    wacc_bull  = _clamp(wacc_base - 0.010, 0.05, 0.18)

    # ── Terminal assumptions ──────────────────────────────────────────────────
    tgr_base  = 0.025
    tgr_bear  = 0.015
    tgr_bull  = 0.030
    exit_base = 12.0
    exit_bear =  9.0
    exit_bull = 16.0

    # ─────────────────────────────────────────────────────────────────────────
    # BASE scenario: mid single digits, anchored to recency-weighted history
    # ─────────────────────────────────────────────────────────────────────────
    # Year 1: use recency-weighted anchor; clamp to 3-8% range
    # If history strongly supports > 8%, allow up to 10%
    base_y1 = _clamp(weighted_growth, 0.02, 0.10)
    if rev_cagr and rev_cagr > 0.10:
        base_y1 = _clamp(weighted_growth, 0.04, 0.12)  # allow slightly higher if CAGR supports

    # Year 5: fade to lower end of mid-single-digits
    base_y5 = _clamp(base_y1 * 0.65, 0.02, 0.07)
    base_growth = _fade_to(base_y1, base_y5, FORECAST_YEARS)

    # EBITDA margin: hold recent level; minor drift based on trend
    if margin_trend == "accelerating":
        base_ebitda_y5 = _clamp(base_ebitda_anchor + 0.01, 0.0, 0.60)
    elif margin_trend == "decelerating":
        base_ebitda_y5 = _clamp(base_ebitda_anchor - 0.01, -0.05, 0.60)
    else:
        base_ebitda_y5 = base_ebitda_anchor
    base_ebitda = _fade_to(base_ebitda_anchor, base_ebitda_y5, FORECAST_YEARS)

    # ─────────────────────────────────────────────────────────────────────────
    # BEAR scenario: low positive to slightly negative
    # Year 1-2: 0-2%; Year 3-5: -1% to +1%
    # ─────────────────────────────────────────────────────────────────────────
    bear_y1 = _clamp(base_y1 * 0.30, -0.01, 0.02)  # compress to 0–2%
    bear_y5 = _clamp(bear_y1 - 0.01, -0.02, 0.01)  # fade to near-flat or slightly negative
    bear_growth = _fade_to(bear_y1, bear_y5, FORECAST_YEARS)

    bear_ebitda = [_clamp(m - 0.025, -0.10, 0.55) for m in base_ebitda]

    # ─────────────────────────────────────────────────────────────────────────
    # BULL scenario: mid-high single digits; double digits if CAGR/history supports
    # Year 1-2: 6-10%; Year 5: 5-8% (or 10-14% if CAGR > 10%)
    # ─────────────────────────────────────────────────────────────────────────
    if rev_cagr and rev_cagr > 0.10:
        bull_y1 = _clamp(recent_2yr_growth * 1.20, 0.08, 0.18)  # double-digit range
        bull_y5 = _clamp(bull_y1 * 0.65, 0.06, 0.14)
    else:
        bull_y1 = _clamp(base_y1 * 1.50, 0.05, 0.12)           # mid-high single digits
        bull_y5 = _clamp(bull_y1 * 0.65, 0.04, 0.09)
    bull_growth = _fade_to(bull_y1, bull_y5, FORECAST_YEARS)

    bull_ebitda = [_clamp(m + 0.015, 0.0, 0.65) for m in base_ebitda]

    # ── Per-year assumption builder ───────────────────────────────────────────
    def build_years(
        growth_profile: list[float],
        ebitda_profile: list[float],
        tax: float,
        da: float,
        capex: float,
    ) -> list[YearAssumption]:
        return [
            YearAssumption(
                year              = last_year + 1 + i,
                revenue_growth    = _clamp(growth_profile[i], -0.30, 1.0),
                ebitda_margin     = _clamp(ebitda_profile[i], -0.20, 0.70),
                tax_rate          = tax,
                da_pct_revenue    = da,
                capex_pct_revenue = capex,
                dso               = med_dso,
                dio               = med_dio,
                dpo               = med_dpo,
            )
            for i in range(FORECAST_YEARS)
        ]

    base_years = build_years(base_growth, base_ebitda, med_tax, med_da, med_capex)
    bear_years = build_years(bear_growth, bear_ebitda, med_tax, med_da, med_capex + 0.005)
    bull_years = build_years(bull_growth, bull_ebitda, med_tax, max(0.01, med_da - 0.003), med_capex)

    # ── Fetch SEC filing data (URLs + guidance text) ──────────────────────────
    sec_data: dict = {}
    try:
        sec_data = get_filing_data(historical.ticker)
    except Exception as e:
        logger.warning(f"SEC data fetch failed for {historical.ticker}: {e}")

    # ── Historical summary for UI ─────────────────────────────────────────────
    historical_summary: dict = {
        "revenue_cagr_pct"         : round(rev_cagr * 100, 1) if rev_cagr else None,
        "recent_2yr_growth_pct"    : round(recent_2yr_growth * 100, 1),
        "base_yr1_growth_pct"      : round(base_y1 * 100, 1),
        "bear_yr1_growth_pct"      : round(bear_y1 * 100, 1),
        "bull_yr1_growth_pct"      : round(bull_y1 * 100, 1),
        "recent_ebitda_margin_pct" : round((_recent_avg(ebitda_mgns_raw, 2) or 0) * 100, 1),
        "median_ebitda_margin_pct" : round(_median(ebitda_mgns_raw) * 100, 1) if ebitda_mgns_raw else None,
        "median_ebit_margin_pct"   : round(_median(ebit_mgns_raw)   * 100, 1) if ebit_mgns_raw   else None,
        "median_tax_rate_pct"      : round(med_tax   * 100, 1),
        "median_da_pct"            : round(med_da    * 100, 1),
        "median_capex_pct"         : round(med_capex * 100, 1),
        "growth_trend"             : growth_trend,
        "margin_trend"             : margin_trend,
        "last_historical_year"     : last_year,
        "years_of_history"         : len(rows),
        "derived_wacc_pct"         : round(wacc_base * 100, 2),
        "sec_10k_found"            : bool(sec_data.get("latest_10k_url")),
        "sec_10q_found"            : bool(sec_data.get("latest_10q_url")),
        "guidance_snippets_found"  : len(sec_data.get("guidance_snippets_10q", []) +
                                         sec_data.get("guidance_snippets_10k", [])),
        "note": (
            "Bear: near-flat to slightly negative growth. "
            "Base: mid single digits (3–6%). "
            "Bull: mid-high single digits; double digits if CAGR history supports. "
            "All values fully editable."
        ),
    }

    # ── Filing memo ───────────────────────────────────────────────────────────
    filing_memo = None
    try:
        filing_memo = _build_filing_memo(
            ticker         = historical.ticker,
            rows           = rows,
            wacc_build     = wacc_build,
            base_growth_y1 = base_y1,
            base_growth_y5 = base_y5,
            base_ebitda_y1 = base_ebitda_anchor,
            base_ebitda_y5 = base_ebitda_y5,
            growth_trend   = growth_trend,
            margin_trend   = margin_trend,
            sec_data       = sec_data,
        )
    except Exception as e:
        logger.warning(f"Filing memo build failed for {historical.ticker}: {e}")

    return AssumptionsResponse(
        ticker = historical.ticker,
        base   = ScenarioAssumptions(
            scenario            = "base",
            years               = base_years,
            terminal_growth_rate= tgr_base,
            exit_ev_ebitda      = exit_base,
            wacc                = wacc_base,
            cash                = cash,
            total_debt          = debt,
            diluted_shares      = diluted_shares,
        ),
        bear   = ScenarioAssumptions(
            scenario            = "bear",
            years               = bear_years,
            terminal_growth_rate= tgr_bear,
            exit_ev_ebitda      = exit_bear,
            wacc                = wacc_bear,
            cash                = cash,
            total_debt          = debt,
            diluted_shares      = diluted_shares,
        ),
        bull   = ScenarioAssumptions(
            scenario            = "bull",
            years               = bull_years,
            terminal_growth_rate= tgr_bull,
            exit_ev_ebitda      = exit_bull,
            wacc                = wacc_bull,
            cash                = cash,
            total_debt          = debt,
            diluted_shares      = diluted_shares,
        ),
        historical_summary = historical_summary,
        wacc_build         = wacc_build,
        filing_memo        = filing_memo,
    )
