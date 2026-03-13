"""
Yahoo Finance data provider via yfinance.
Pulls income statement, balance sheet, cash flow statement, and market data.
Missing fields are flagged — never fabricated.
"""

from __future__ import annotations

import math
import logging
from typing import Optional

import yfinance as yf
import pandas as pd

from api.schemas import AnnualFinancials, CompanyInfo, HistoricalData
from data_providers.base_provider import BaseDataProvider
from normalization.ratio_calculator import compute_ratios

logger = logging.getLogger(__name__)


def _safe(val) -> Optional[float]:
    """Convert pandas/numpy values to Python float safely."""
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) or math.isinf(f) else f
    except (TypeError, ValueError):
        return None


def _get_row(df: pd.DataFrame, *keys: str) -> Optional[pd.Series]:
    """Try multiple possible row label variants; return first match."""
    if df is None or df.empty:
        return None
    for key in keys:
        if key in df.index:
            return df.loc[key]
    return None


class YahooFinanceProvider(BaseDataProvider):

    def search(self, query: str) -> list[CompanyInfo]:
        """
        Resolve a ticker or company name via yfinance.
        Returns a list with one result if found, empty list otherwise.
        """
        results = []
        ticker_sym = query.strip().upper()

        try:
            t = yf.Ticker(ticker_sym)
            info = t.info or {}

            # Must have at minimum a name to be a valid result
            name = info.get("longName") or info.get("shortName")
            if not name:
                return []

            price = _safe(info.get("currentPrice") or info.get("regularMarketPrice"))
            # Fallback to fast_info if price missing
            if price is None:
                try:
                    price = _safe(t.fast_info.get("lastPrice"))
                except Exception:
                    pass

            results.append(
                CompanyInfo(
                    ticker=ticker_sym,
                    name=name,
                    exchange=info.get("exchange", ""),
                    sector=info.get("sector", "N/A"),
                    industry=info.get("industry", "N/A"),
                    current_price=price,
                    market_cap=_safe(info.get("marketCap")),
                    currency=info.get("currency", "USD"),
                    description=info.get("longBusinessSummary", "")[:400] if info.get("longBusinessSummary") else None,
                    beta=_safe(info.get("beta")),
                )
            )
        except Exception as e:
            logger.warning(f"Search failed for {ticker_sym}: {e}")

        return results

    def get_historicals(self, ticker: str) -> HistoricalData:
        t = yf.Ticker(ticker)
        info = t.info or {}

        # ── Fetch financial statements ──────────────────────────────────────
        try:
            income_annual = t.financials          # columns = dates, rows = line items
        except Exception:
            income_annual = pd.DataFrame()

        try:
            balance_annual = t.balance_sheet
        except Exception:
            balance_annual = pd.DataFrame()

        try:
            cashflow_annual = t.cashflow
        except Exception:
            cashflow_annual = pd.DataFrame()

        missing_fields: list[str] = []
        warnings: list[str] = []

        # ── Align years across statements ───────────────────────────────────
        # yfinance returns columns as Timestamps; we use the fiscal year integer
        def year_cols(df: pd.DataFrame) -> dict[int, pd.Timestamp]:
            if df is None or df.empty:
                return {}
            return {col.year: col for col in df.columns}

        income_years = year_cols(income_annual)
        balance_years = year_cols(balance_annual)
        cashflow_years = year_cols(cashflow_annual)

        all_years = sorted(
            set(income_years) | set(balance_years) | set(cashflow_years),
            reverse=True,
        )[:7]  # cap at 7 most recent years

        if not all_years:
            raise ValueError(f"No financial statements found for {ticker}")

        financials: list[AnnualFinancials] = []

        for yr in sorted(all_years):
            i_col = income_years.get(yr)
            b_col = balance_years.get(yr)
            c_col = cashflow_years.get(yr)

            def ig(row: str) -> Optional[float]:
                """Get income statement value."""
                if i_col is None or income_annual.empty:
                    return None
                return _safe(income_annual.at[row, i_col]) if row in income_annual.index else None

            def bg(row: str) -> Optional[float]:
                """Get balance sheet value."""
                if b_col is None or balance_annual.empty:
                    return None
                return _safe(balance_annual.at[row, b_col]) if row in balance_annual.index else None

            def cg(row: str) -> Optional[float]:
                """Get cash flow value."""
                if c_col is None or cashflow_annual.empty:
                    return None
                return _safe(cashflow_annual.at[row, c_col]) if row in cashflow_annual.index else None

            # ── Income Statement ─────────────────────────────────────────────
            revenue = ig("Total Revenue") or ig("Revenue")
            gross_profit = ig("Gross Profit")
            ebit = ig("EBIT") or ig("Operating Income")
            ebitda = ig("EBITDA") or ig("Normalized EBITDA")
            net_income = ig("Net Income") or ig("Net Income Common Stockholders")
            interest_expense = ig("Interest Expense") or ig("Interest Expense Non Operating")
            tax_expense = ig("Tax Provision") or ig("Income Tax Expense")

            # ── Cash Flow ────────────────────────────────────────────────────
            # D&A: prefer CFS line; fall back to income statement
            da = (
                cg("Depreciation And Amortization")
                or cg("Depreciation Amortization Depletion")
                or ig("Reconciled Depreciation")
                or ig("Depreciation & Amortization")
            )
            # Capex: reported as negative in CFS
            capex_raw = cg("Capital Expenditure") or cg("Purchase Of Property Plant And Equipment")
            capex = abs(capex_raw) if capex_raw is not None else None

            # ── Balance Sheet ────────────────────────────────────────────────
            cash = bg("Cash And Cash Equivalents") or bg("Cash Cash Equivalents And Short Term Investments")
            total_debt = (
                bg("Total Debt")
                or bg("Long Term Debt And Capital Lease Obligation")
            )
            # Diluted shares
            diluted_shares = _safe(info.get("sharesOutstanding"))  # fallback
            # Try income statement first (more accurate for historical years)
            shares_line = ig("Diluted Average Shares") or ig("Basic Average Shares")
            if shares_line is not None:
                diluted_shares = shares_line

            # ── Working Capital ──────────────────────────────────────────────
            current_assets = bg("Current Assets") or bg("Total Current Assets")
            current_liabilities = bg("Current Liabilities") or bg("Total Current Liabilities")
            # Exclude cash from current assets, exclude short-term debt from CL
            accounts_receivable = bg("Accounts Receivable") or bg("Net Receivables")
            inventory = bg("Inventory")
            accounts_payable = bg("Accounts Payable") or bg("Payables")

            nwc: Optional[float] = None
            if current_assets is not None and current_liabilities is not None:
                nwc = current_assets - current_liabilities

            net_debt: Optional[float] = None
            if total_debt is not None and cash is not None:
                net_debt = total_debt - cash

            # ── Skip years where core data is entirely absent ─────────────────
            # yfinance sometimes returns a trailing NaN year for the oldest period
            core_values = [revenue, ebit, gross_profit, net_income]
            if all(v is None for v in core_values):
                continue

            # ── Missing field tracking ────────────────────────────────────────
            for field, val in [
                ("revenue", revenue), ("ebit", ebit), ("da", da),
                ("capex", capex), ("net_debt", net_debt), ("diluted_shares", diluted_shares),
            ]:
                if val is None and f"{field}_{yr}" not in missing_fields:
                    missing_fields.append(f"{field}_{yr}")

            row = AnnualFinancials(
                year=yr,
                revenue=revenue,
                gross_profit=gross_profit,
                ebit=ebit,
                ebitda=ebitda,
                net_income=net_income,
                interest_expense=interest_expense,
                tax_expense=tax_expense,
                da=da,
                capex=capex,
                change_in_nwc=None,   # computed in normalization pass
                nwc=nwc,
                cash=cash,
                total_debt=total_debt,
                net_debt=net_debt,
                diluted_shares=diluted_shares,
            )
            financials.append(row)

        # ── Compute derived ratios and change_in_nwc ────────────────────────
        financials = compute_ratios(financials)

        # ── Warnings ────────────────────────────────────────────────────────
        if len(financials) < 5:
            warnings.append(f"Only {len(financials)} years of data available (5 preferred)")

        return HistoricalData(
            ticker=ticker,
            company_name=info.get("longName") or info.get("shortName") or ticker,
            currency=info.get("currency", "USD"),
            years_available=len(financials),
            financials=financials,
            data_source="Yahoo Finance (yfinance)",
            missing_fields=missing_fields,
            warnings=warnings,
        )
