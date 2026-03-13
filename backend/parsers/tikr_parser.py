"""
TIKR / manual CSV import parser.

TIKR exports typically look like:
  Fiscal Year,2019,2020,2021,2022,2023
  Revenue,5000,5500,6100,6800,7500
  EBIT,800,850,950,1050,1200
  ...

We parse this flexible format, map known row labels to our schema fields,
and produce a merge log showing source priority.
"""

from __future__ import annotations

import csv
import io
from typing import Optional

from api.schemas import (
    AnnualFinancials,
    TIKRField,
    TIKRImportRequest,
    TIKRImportResponse,
)

# Map of TIKR / common export row labels → our schema field names
TIKR_FIELD_MAP: dict[str, str] = {
    # Revenue
    "revenue": "revenue",
    "total revenue": "revenue",
    "net revenue": "revenue",
    "sales": "revenue",
    # Gross Profit
    "gross profit": "gross_profit",
    "gross income": "gross_profit",
    # EBIT
    "ebit": "ebit",
    "operating income": "ebit",
    "operating profit": "ebit",
    # EBITDA
    "ebitda": "ebitda",
    "normalized ebitda": "ebitda",
    # Net Income
    "net income": "net_income",
    "net profit": "net_income",
    # Interest
    "interest expense": "interest_expense",
    # Tax
    "income tax": "tax_expense",
    "tax provision": "tax_expense",
    # D&A
    "depreciation & amortization": "da",
    "d&a": "da",
    "depreciation and amortization": "da",
    # Capex
    "capital expenditure": "capex",
    "capex": "capex",
    "purchases of property": "capex",
    # Balance sheet
    "cash": "cash",
    "cash and equivalents": "cash",
    "total debt": "total_debt",
    "long term debt": "total_debt",
    # Shares
    "diluted shares": "diluted_shares",
    "diluted weighted average shares": "diluted_shares",
    "shares outstanding": "diluted_shares",
}


def _parse_number(s: str) -> Optional[float]:
    """Parse a potentially formatted number string."""
    if not s or s.strip() in ("", "-", "N/A", "n/a", "NaN"):
        return None
    s = s.replace(",", "").replace("$", "").replace("(", "-").replace(")", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def parse_tikr_import(csv_content: str, ticker: str) -> dict:
    """
    Parse TIKR/manual CSV content.
    Returns: { merged: list[AnnualFinancials dict], source_log: [...] }
    """
    reader = csv.reader(io.StringIO(csv_content))
    rows = list(reader)

    if not rows:
        return {"merged": [], "source_log": [], "overridden_fields": []}

    # Detect header row (first row with years)
    # Try to find a row where values look like years (2018-2030)
    year_row_idx = 0
    years: list[int] = []
    for i, row in enumerate(rows):
        candidate_years = []
        for cell in row[1:]:
            cell = cell.strip()
            if cell.isdigit() and 2010 <= int(cell) <= 2035:
                candidate_years.append(int(cell))
        if len(candidate_years) >= 2:
            year_row_idx = i
            years = candidate_years
            break

    if not years:
        raise ValueError("Could not detect year columns in CSV")

    # Build per-year data dict
    year_data: dict[int, dict[str, float]] = {yr: {} for yr in years}

    # Parse data rows
    for row in rows[year_row_idx + 1:]:
        if not row:
            continue
        label = row[0].strip().lower()
        field_name = TIKR_FIELD_MAP.get(label)
        if not field_name:
            continue

        for i, yr in enumerate(years):
            if i + 1 < len(row):
                val = _parse_number(row[i + 1])
                if val is not None:
                    year_data[yr][field_name] = val

    # Convert to AnnualFinancials
    merged: list[AnnualFinancials] = []
    source_log = []

    for yr in sorted(years):
        d = year_data[yr]
        entry = AnnualFinancials(
            year=yr,
            revenue=d.get("revenue"),
            gross_profit=d.get("gross_profit"),
            ebit=d.get("ebit"),
            ebitda=d.get("ebitda"),
            net_income=d.get("net_income"),
            interest_expense=d.get("interest_expense"),
            tax_expense=d.get("tax_expense"),
            da=d.get("da"),
            capex=d.get("capex"),
            change_in_nwc=None,
            nwc=None,
            cash=d.get("cash"),
            total_debt=d.get("total_debt"),
            net_debt=None,
            diluted_shares=d.get("diluted_shares"),
        )
        merged.append(entry)
        source_log.append({"year": yr, "fields_from_tikr": list(d.keys()), "source": "tikr_csv"})

    return {
        "merged": [m.model_dump() for m in merged],
        "source_log": source_log,
        "overridden_fields": list({f for d in year_data.values() for f in d}),
    }


def merge_tikr_overrides(request: TIKRImportRequest) -> TIKRImportResponse:
    """
    Apply individual field overrides from TIKR or manual entry.
    Returns the merged list and an audit log.
    """
    # Group by year
    by_year: dict[int, dict[str, float]] = {}
    for field in request.fields:
        by_year.setdefault(field.year, {})[field.field_name] = field.value

    merged: list[AnnualFinancials] = []
    source_log = []
    overridden: list[str] = []

    for yr in sorted(by_year):
        d = by_year[yr]
        entry = AnnualFinancials(year=yr, **{k: v for k, v in d.items() if k != "year"})  # type: ignore[arg-type]
        merged.append(entry)
        overridden.extend(list(d.keys()))
        source_log.append({"year": yr, "fields": list(d.keys()), "source": "tikr_manual"})

    return TIKRImportResponse(
        merged_financials=merged,
        overridden_fields=list(set(overridden)),
        source_log=source_log,
    )
