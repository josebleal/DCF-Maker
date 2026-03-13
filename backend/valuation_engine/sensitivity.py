"""
Sensitivity analysis engine.
Generates three tables by perturbing key assumptions.

Tables:
  1. WACC vs Terminal Growth Rate
  2. WACC vs Exit EV/EBITDA Multiple
  3. EBITDA Margin vs Revenue CAGR  ← uses ebitda_margin (not ebit_margin)
"""

from __future__ import annotations

import copy

from api.schemas import (
    DCFRequest,
    SensitivityRequest,
    SensitivityResponse,
    SensitivityTable,
)
from valuation_engine.dcf import run_dcf


def _run_and_get_value(request: SensitivityRequest, assumptions_override: dict) -> float:
    """Run DCF with modified assumptions; return intrinsic value/share."""
    base = request.base_assumptions.model_copy(deep=True)
    for k, v in assumptions_override.items():
        setattr(base, k, v)

    dcf_req = DCFRequest(
        ticker=request.ticker,
        historical=request.historical,
        assumptions=base,
        current_price=request.current_price,
    )
    result = run_dcf(dcf_req)
    return result.bridge.intrinsic_value_per_share


def run_sensitivity(request: SensitivityRequest) -> SensitivityResponse:
    base = request.base_assumptions

    # ── Table 1: WACC vs Terminal Growth Rate ─────────────────────────────────
    waccs = [
        base.wacc - 0.02,
        base.wacc - 0.01,
        base.wacc,
        base.wacc + 0.01,
        base.wacc + 0.02,
    ]
    tgrs = [
        base.terminal_growth_rate - 0.01,
        base.terminal_growth_rate - 0.005,
        base.terminal_growth_rate,
        base.terminal_growth_rate + 0.005,
        base.terminal_growth_rate + 0.01,
    ]

    wacc_tgr_values = []
    for w in waccs:
        row = []
        for g in tgrs:
            v = _run_and_get_value(
                request,
                {"wacc": max(0.05, w), "terminal_growth_rate": max(0.0, g)},
            )
            row.append(round(v, 2))
        wacc_tgr_values.append(row)

    table_wacc_tgr = SensitivityTable(
        label="WACC vs Terminal Growth Rate",
        row_label="WACC",
        col_label="Terminal Growth Rate",
        rows=[round(w * 100, 2) for w in waccs],
        cols=[round(g * 100, 2) for g in tgrs],
        values=wacc_tgr_values,
    )

    # ── Table 2: WACC vs Exit EV/EBITDA ──────────────────────────────────────
    multiples = [
        base.exit_ev_ebitda - 4,
        base.exit_ev_ebitda - 2,
        base.exit_ev_ebitda,
        base.exit_ev_ebitda + 2,
        base.exit_ev_ebitda + 4,
    ]

    wacc_em_values = []
    for w in waccs:
        row = []
        for m in multiples:
            v = _run_and_get_value(
                request,
                {"wacc": max(0.05, w), "exit_ev_ebitda": max(1.0, m)},
            )
            row.append(round(v, 2))
        wacc_em_values.append(row)

    table_wacc_em = SensitivityTable(
        label="WACC vs Exit EV/EBITDA",
        row_label="WACC",
        col_label="Exit EV/EBITDA",
        rows=[round(w * 100, 2) for w in waccs],
        cols=[round(m, 1) for m in multiples],
        values=wacc_em_values,
    )

    # ── Table 3: EBITDA Margin vs Revenue CAGR ───────────────────────────────
    # Perturb all 5 forecast years uniformly ±4pp on margin and ±4pp on growth
    margin_deltas = [-0.04, -0.02, 0.0, 0.02, 0.04]
    growth_deltas = [-0.04, -0.02, 0.0, 0.02, 0.04]

    def apply_margin_growth(margin_delta: float, growth_delta: float) -> float:
        mod_base = request.base_assumptions.model_copy(deep=True)
        for yr in mod_base.years:
            yr.ebitda_margin = max(-0.20, yr.ebitda_margin + margin_delta)
            yr.revenue_growth = max(-0.30, yr.revenue_growth + growth_delta)
        dcf_req = DCFRequest(
            ticker=request.ticker,
            historical=request.historical,
            assumptions=mod_base,
            current_price=request.current_price,
        )
        return round(run_dcf(dcf_req).bridge.intrinsic_value_per_share, 2)

    margin_growth_values = []
    for md in margin_deltas:
        row = []
        for gd in growth_deltas:
            row.append(apply_margin_growth(md, gd))
        margin_growth_values.append(row)

    table_margin_growth = SensitivityTable(
        label="EBITDA Margin vs Revenue CAGR",
        row_label="EBITDA Margin Δ (pp)",
        col_label="Revenue Growth Δ (pp)",
        rows=[round(md * 100, 0) for md in margin_deltas],
        cols=[round(gd * 100, 0) for gd in growth_deltas],
        values=margin_growth_values,
    )

    return SensitivityResponse(
        wacc_vs_terminal_growth=table_wacc_tgr,
        wacc_vs_exit_multiple=table_wacc_em,
        ebitda_margin_vs_revenue_cagr=table_margin_growth,
    )
