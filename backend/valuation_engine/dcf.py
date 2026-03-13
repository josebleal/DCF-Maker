"""
Core DCF valuation engine — EBITDA-first model.

Formula chain (matches investment club Excel DCF framework):
  EBITDA   = Revenue × ebitda_margin
  D&A      = Revenue × da_pct_revenue
  EBIT     = EBITDA - D&A
  NOPAT    = EBIT × (1 - tax_rate)
  Capex    = Revenue × capex_pct_revenue
  NWC      = Revenue × nwc_pct  (or days-based if DSO/DIO/DPO available)
  ΔNWC     = NWC_t - NWC_(t-1)
  FCFF     = NOPAT + D&A - Capex - ΔNWC

Terminal value (two methods, averaged):
  TV_Gordon  = FCFF_n × (1+g) / (WACC - g)
  TV_Exit    = EBITDA_n × exit_EV/EBITDA

Enterprise value:
  EV = Σ PV(FCFF) + PV(TV_avg)

Equity value bridge:
  Equity Value = EV - Net Debt  (net_debt = total_debt - cash)
  Intrinsic Price = Equity Value / Diluted Shares
"""

from __future__ import annotations

from api.schemas import (
    DCFRequest,
    DCFResult,
    ForecastYear,
    TerminalValue,
    ValuationBridge,
    YearAssumption,
)


def _build_forecast(
    last_revenue: float,
    last_nwc: float,
    assumptions: list[YearAssumption],
) -> list[ForecastYear]:
    """Build 5-year explicit forecast anchored to last historical values."""
    years: list[ForecastYear] = []
    prev_revenue = last_revenue
    prev_nwc = last_nwc

    # Derive NWC% from historical anchor — prevents artificial year-1 NWC swing
    nwc_pct_anchor = (last_nwc / last_revenue) if last_revenue else 0.0

    for i, a in enumerate(assumptions):
        # ── Revenue ───────────────────────────────────────────────────────────
        revenue = prev_revenue * (1.0 + a.revenue_growth)

        # ── EBITDA-first P&L ──────────────────────────────────────────────────
        ebitda = revenue * a.ebitda_margin
        da = revenue * a.da_pct_revenue
        ebit = ebitda - da
        ebit_margin = ebit / revenue if revenue else 0.0
        ebitda_margin = a.ebitda_margin

        # ── NOPAT (tax-adjusted operating profit) ─────────────────────────────
        nopat = ebit * (1.0 - a.tax_rate)

        # ── Capex ─────────────────────────────────────────────────────────────
        capex = revenue * a.capex_pct_revenue

        # ── NWC: days-based if all three metrics available, else % of revenue ──
        if a.dso is not None and a.dio is not None and a.dpo is not None:
            nwc = (a.dso + a.dio - a.dpo) / 365.0 * revenue
        elif a.nwc_pct_revenue is not None:
            nwc = revenue * a.nwc_pct_revenue
        else:
            nwc = revenue * nwc_pct_anchor
        change_in_nwc = nwc - prev_nwc

        # ── FCFF ──────────────────────────────────────────────────────────────
        fcff = nopat + da - capex - change_in_nwc

        years.append(ForecastYear(
            year=a.year,
            revenue=revenue,
            ebitda=ebitda,
            ebitda_margin=ebitda_margin,
            da=da,
            ebit=ebit,
            ebit_margin=ebit_margin,
            nopat=nopat,
            capex=capex,
            change_in_nwc=change_in_nwc,
            fcff=fcff,
            pv_fcff=0.0,          # filled in _discount()
            discount_factor=0.0,  # filled in _discount()
        ))

        prev_revenue = revenue
        prev_nwc = nwc

    return years


def _discount(years: list[ForecastYear], wacc: float) -> list[ForecastYear]:
    """Discount each year's FCFF to present value using mid-year or end-of-year convention."""
    for i, yr in enumerate(years):
        t = i + 1  # end-of-year discounting (conservative)
        disc = (1.0 + wacc) ** t
        yr.discount_factor = round(disc, 6)
        yr.pv_fcff = yr.fcff / disc
    return years


def _terminal_value(
    last_fcff: float,
    last_ebitda: float,
    wacc: float,
    terminal_growth: float,
    exit_multiple: float,
    n_years: int,
) -> TerminalValue:
    """
    Compute terminal value using both Gordon Growth Model and Exit Multiple.
    Returns both raw TVs and their PVs discounted back n_years.
    """
    # Gordon Growth Model — TV = FCFF_n × (1+g) / (WACC - g)
    if wacc <= terminal_growth:
        # Numerically undefined — WACC must exceed TGR
        gg_tv = last_fcff * 50  # large placeholder; signals model error
    else:
        gg_tv = last_fcff * (1.0 + terminal_growth) / (wacc - terminal_growth)

    # Exit Multiple — TV = EBITDA_n × EV/EBITDA
    em_tv = last_ebitda * exit_multiple

    # Discount terminal values to present
    disc_factor = (1.0 + wacc) ** n_years
    pv_gg = gg_tv / disc_factor
    pv_em = em_tv / disc_factor

    return TerminalValue(
        gordon_growth_tv=round(gg_tv, 2),
        exit_multiple_tv=round(em_tv, 2),
        pv_gordon_growth=round(pv_gg, 2),
        pv_exit_multiple=round(pv_em, 2),
        terminal_growth_rate=terminal_growth,
        exit_ev_ebitda=exit_multiple,
        wacc=wacc,
    )


def run_dcf(request: DCFRequest) -> DCFResult:
    """Run a full single-scenario DCF and return all output layers."""
    historical = request.historical
    assumptions = request.assumptions

    rows = sorted(historical.financials, key=lambda r: r.year)
    latest = rows[-1]

    # Anchor values from last historical year
    last_revenue = latest.revenue or 1.0
    last_nwc = latest.nwc or 0.0
    wacc = assumptions.wacc

    # ── Build forecast ────────────────────────────────────────────────────────
    forecast = _build_forecast(last_revenue, last_nwc, assumptions.years)
    forecast = _discount(forecast, wacc)

    # ── Terminal value ────────────────────────────────────────────────────────
    n = len(forecast)
    last_year = forecast[-1]
    tv = _terminal_value(
        last_fcff=last_year.fcff,
        last_ebitda=last_year.ebitda,
        wacc=wacc,
        terminal_growth=assumptions.terminal_growth_rate,
        exit_multiple=assumptions.exit_ev_ebitda,
        n_years=n,
    )

    # ── Enterprise Value (simple average of both TV methods) ─────────────────
    sum_pv_fcff = sum(yr.pv_fcff for yr in forecast)
    pv_tv = (tv.pv_gordon_growth + tv.pv_exit_multiple) / 2.0
    enterprise_value = sum_pv_fcff + pv_tv

    # ── Equity Value Bridge ───────────────────────────────────────────────────
    net_debt = assumptions.total_debt - assumptions.cash
    equity_value = enterprise_value - net_debt
    shares = assumptions.diluted_shares or 1.0
    intrinsic = equity_value / shares

    upside: float | None = None
    if request.current_price and request.current_price > 0:
        upside = (intrinsic - request.current_price) / request.current_price

    bridge = ValuationBridge(
        sum_pv_fcff=round(sum_pv_fcff, 2),
        terminal_value_pv=round(pv_tv, 2),
        enterprise_value=round(enterprise_value, 2),
        less_net_debt=round(net_debt, 2),
        equity_value=round(equity_value, 2),
        diluted_shares=round(shares, 0),
        intrinsic_value_per_share=round(intrinsic, 2),
        current_price=request.current_price,
        upside_pct=round(upside * 100, 1) if upside is not None else None,
    )

    # ── Round forecast for clean output ──────────────────────────────────────
    for yr in forecast:
        yr.revenue = round(yr.revenue, 2)
        yr.ebitda = round(yr.ebitda, 2)
        yr.ebitda_margin = round(yr.ebitda_margin, 4)
        yr.da = round(yr.da, 2)
        yr.ebit = round(yr.ebit, 2)
        yr.ebit_margin = round(yr.ebit_margin, 4)
        yr.nopat = round(yr.nopat, 2)
        yr.capex = round(yr.capex, 2)
        yr.change_in_nwc = round(yr.change_in_nwc, 2)
        yr.fcff = round(yr.fcff, 2)
        yr.pv_fcff = round(yr.pv_fcff, 2)

    return DCFResult(
        ticker=historical.ticker,
        scenario=assumptions.scenario,
        forecast_years=forecast,
        terminal_value=tv,
        bridge=bridge,
        wacc=wacc,
        assumptions_used=assumptions,
    )
