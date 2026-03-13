"""
Compute derived financial ratios from raw annual data.
All division is guarded against zero/None.
"""

from __future__ import annotations
import math
from typing import Optional
from api.schemas import AnnualFinancials


def _div(a: Optional[float], b: Optional[float]) -> Optional[float]:
    if a is None or b is None or b == 0:
        return None
    result = a / b
    if math.isnan(result) or math.isinf(result):
        return None
    return result


def _safe_float(v: Optional[float]) -> Optional[float]:
    """Return None for NaN/Inf — prevents JSON serialization errors."""
    if v is None:
        return None
    if math.isnan(v) or math.isinf(v):
        return None
    return v


def compute_ratios(rows: list[AnnualFinancials]) -> list[AnnualFinancials]:
    """
    Mutate (or replace) rows with computed ratio fields.
    Also computes change_in_nwc using sequential NWC values.
    Rows must be sorted ascending by year before calling.
    """
    rows = sorted(rows, key=lambda r: r.year)

    for i, row in enumerate(rows):
        rev = row.revenue

        # Margins
        row.gross_margin = _div(row.gross_profit, rev)
        row.ebit_margin = _div(row.ebit, rev)
        row.ebitda_margin = _div(row.ebitda, rev)

        # Tax rate: tax_expense / pre-tax income
        if row.ebit is not None and row.interest_expense is not None:
            pretax = row.ebit - row.interest_expense
        elif row.ebit is not None:
            pretax = row.ebit
        else:
            pretax = None
        row.effective_tax_rate = _div(row.tax_expense, pretax)
        # Clamp to [0%, 50%] — distorted years (losses) produce nonsense
        if row.effective_tax_rate is not None:
            row.effective_tax_rate = max(0.0, min(row.effective_tax_rate, 0.50))

        # D&A and Capex as % of revenue
        row.da_pct_revenue = _div(row.da, rev)
        row.capex_pct_revenue = _div(row.capex, rev)

        # NWC % of revenue
        row.nwc_pct_revenue = _div(row.nwc, rev)

        # Revenue growth (year-over-year)
        if i > 0 and rows[i - 1].revenue:
            row.revenue_growth = _safe_float(
                (row.revenue - rows[i - 1].revenue) / rows[i - 1].revenue
                if row.revenue is not None else None
            )
        else:
            row.revenue_growth = None

        # Change in NWC
        if i > 0 and rows[i - 1].nwc is not None and row.nwc is not None:
            row.change_in_nwc = _safe_float(row.nwc - rows[i - 1].nwc)
        else:
            row.change_in_nwc = None

        # Working capital days (approximate using revenue / 365 as daily sales)
        daily_revenue = rev / 365.0 if rev else None
        # DSO = Accounts Receivable / Daily Revenue (we don't store AR separately yet)
        # DIO = Inventory / (COGS / 365)
        # DPO = Accounts Payable / (COGS / 365)
        # These require AR, Inventory, AP, and COGS — stored as optional fields on the row.
        # For now we leave them None; the Yahoo provider can populate if it fetches those lines.
        # They can also be manually overridden via TIKR import.

    return rows


def compute_screening_metrics(rows: list[AnnualFinancials]) -> dict:
    """
    Derive high-level metrics used in screening checks.
    Returns a dict of scalar values.
    """
    if not rows:
        return {}

    rows = sorted(rows, key=lambda r: r.year)
    latest = rows[-1]

    ebitda_margins = [r.ebitda_margin for r in rows if r.ebitda_margin is not None]
    avg_ebitda_margin = sum(ebitda_margins) / len(ebitda_margins) if ebitda_margins else None

    # Interest coverage = EBIT / Interest Expense
    interest_coverage = None
    if latest.ebit and latest.interest_expense and latest.interest_expense > 0:
        interest_coverage = latest.ebit / latest.interest_expense

    years = len(rows)

    return {
        "years_of_history": years,
        "latest_ebitda_margin": latest.ebitda_margin,
        "avg_ebitda_margin": avg_ebitda_margin,
        "net_debt": latest.net_debt,
        "revenue": latest.revenue,
        "interest_coverage": interest_coverage,
    }
