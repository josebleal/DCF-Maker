"""
Pydantic schemas for all API request/response types.
Typed strictly — no Any fields in production paths.

Model standard: EBITDA-first
  Revenue × ebitda_margin = EBITDA
  Revenue × da_pct_revenue = D&A
  EBITDA - D&A = EBIT
  EBIT × (1 - tax) = NOPAT
  FCFF = NOPAT + D&A - Capex - ΔNWC
"""

from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


# ─────────────────────────────────────────────
# Company / Search
# ─────────────────────────────────────────────

class CompanyInfo(BaseModel):
    ticker: str
    name: str
    exchange: str
    sector: str
    industry: str
    current_price: Optional[float]
    market_cap: Optional[float]
    currency: str = "USD"
    description: Optional[str] = None
    beta: Optional[float] = None          # market beta from Yahoo Finance


class SearchResult(BaseModel):
    results: list[CompanyInfo]


# ─────────────────────────────────────────────
# Historical Financials
# ─────────────────────────────────────────────

class AnnualFinancials(BaseModel):
    year: int
    revenue: Optional[float]
    gross_profit: Optional[float]
    ebit: Optional[float]
    ebitda: Optional[float]
    net_income: Optional[float]
    interest_expense: Optional[float]
    tax_expense: Optional[float]
    da: Optional[float]           # depreciation & amortization
    capex: Optional[float]
    change_in_nwc: Optional[float]
    nwc: Optional[float]
    cash: Optional[float]
    total_debt: Optional[float]
    net_debt: Optional[float]
    diluted_shares: Optional[float]
    # Derived ratios (computed server-side)
    revenue_growth: Optional[float] = None
    gross_margin: Optional[float] = None
    ebit_margin: Optional[float] = None
    ebitda_margin: Optional[float] = None
    effective_tax_rate: Optional[float] = None
    da_pct_revenue: Optional[float] = None
    capex_pct_revenue: Optional[float] = None
    nwc_pct_revenue: Optional[float] = None
    # Working capital days
    dso: Optional[float] = None
    dio: Optional[float] = None
    dpo: Optional[float] = None


class HistoricalData(BaseModel):
    ticker: str
    company_name: str
    currency: str
    years_available: int
    financials: list[AnnualFinancials]
    data_source: str
    missing_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


# ─────────────────────────────────────────────
# WACC Build
# ─────────────────────────────────────────────

class WACCBuild(BaseModel):
    """Explicit WACC derivation — every input is traceable."""
    risk_free_rate: float               # 10-yr Treasury yield
    beta: float                         # equity beta (levered)
    equity_risk_premium: float          # Damodaran ERP
    cost_of_equity: float               # rfr + beta × erp
    pre_tax_cost_of_debt: float         # interest_exp / avg total_debt
    effective_tax_rate: float
    after_tax_cost_of_debt: float       # pre_tax × (1 - tax)
    equity_value: Optional[float]       # market cap
    debt_value: Optional[float]         # total debt
    equity_weight: float                # market_cap / (market_cap + debt)
    debt_weight: float
    wacc: float
    # Source flags
    beta_source: str = "yahoo"          # "yahoo" | "manual"
    rfr_source: str = "default"         # "default" | "manual"
    erp_source: str = "damodaran"       # "damodaran" | "manual"


# ─────────────────────────────────────────────
# Filing Memo (SEC-driven assumption rationale)
# ─────────────────────────────────────────────

class FilingMemo(BaseModel):
    """
    Structured assumption rationale — derived from data analysis + SEC filing URLs.
    All rationale text is generated from actual numbers; nothing is invented.
    """
    latest_10k_url: Optional[str] = None
    latest_10q_url: Optional[str] = None
    latest_10k_period: Optional[str] = None    # e.g. "FY2024"
    latest_10q_period: Optional[str] = None    # e.g. "Q3 2024"
    # Per-driver rationale
    revenue_growth_rationale: str
    ebitda_margin_rationale: str
    da_rationale: str
    capex_rationale: str
    working_capital_rationale: str
    tax_rationale: str
    wacc_rationale: str
    terminal_growth_rationale: str
    exit_multiple_rationale: str
    # Synthesis
    key_risks: list[str]
    key_supporting_points: list[str]
    data_sources: list[str]             # e.g. ["Yahoo Finance (historicals)", "SEC EDGAR (10-K URL)"]


# ─────────────────────────────────────────────
# Forecast Assumptions
# ─────────────────────────────────────────────

class YearAssumption(BaseModel):
    year: int
    revenue_growth: float               # decimal, e.g. 0.08 = 8%
    ebitda_margin: float                # PRIMARY operating driver
    tax_rate: float
    da_pct_revenue: float               # D&A as % of revenue; EBIT = EBITDA - D&A
    capex_pct_revenue: float
    nwc_pct_revenue: Optional[float] = None   # used when DSO/DIO/DPO unavailable
    dso: Optional[float] = None
    dio: Optional[float] = None
    dpo: Optional[float] = None


class ScenarioAssumptions(BaseModel):
    scenario: str                       # "bear" | "base" | "bull"
    years: list[YearAssumption]
    terminal_growth_rate: float
    exit_ev_ebitda: float
    wacc: float
    cash: float
    total_debt: float
    diluted_shares: float


class AssumptionsResponse(BaseModel):
    ticker: str
    bear: ScenarioAssumptions
    base: ScenarioAssumptions
    bull: ScenarioAssumptions
    historical_summary: dict            # key stats used to derive assumptions
    wacc_build: Optional[WACCBuild] = None
    filing_memo: Optional[FilingMemo] = None


class AssumptionsOverrideRequest(BaseModel):
    ticker: str
    scenario: str
    assumptions: ScenarioAssumptions


# ─────────────────────────────────────────────
# DCF Output
# ─────────────────────────────────────────────

class ForecastYear(BaseModel):
    year: int
    revenue: float
    ebitda: float                       # Revenue × ebitda_margin
    ebitda_margin: float                # for display
    da: float                           # Revenue × da_pct_revenue
    ebit: float                         # EBITDA - D&A
    ebit_margin: float                  # for display
    nopat: float                        # EBIT × (1 - tax)
    capex: float
    change_in_nwc: float
    fcff: float                         # = NOPAT + D&A - Capex - ΔNWC
    pv_fcff: float                      # present value of FCFF
    discount_factor: float


class TerminalValue(BaseModel):
    gordon_growth_tv: float
    exit_multiple_tv: float
    pv_gordon_growth: float
    pv_exit_multiple: float
    terminal_growth_rate: float
    exit_ev_ebitda: float
    wacc: float


class ValuationBridge(BaseModel):
    sum_pv_fcff: float
    terminal_value_pv: float            # average of two methods
    enterprise_value: float
    less_net_debt: float
    equity_value: float
    diluted_shares: float
    intrinsic_value_per_share: float
    current_price: Optional[float]
    upside_pct: Optional[float]


class DCFResult(BaseModel):
    ticker: str
    scenario: str
    forecast_years: list[ForecastYear]
    terminal_value: TerminalValue
    bridge: ValuationBridge
    wacc: float
    assumptions_used: ScenarioAssumptions


class DCFRequest(BaseModel):
    ticker: str
    historical: HistoricalData
    assumptions: ScenarioAssumptions
    current_price: Optional[float] = None


# ─────────────────────────────────────────────
# Sensitivity
# ─────────────────────────────────────────────

class SensitivityTable(BaseModel):
    label: str
    row_label: str
    col_label: str
    rows: list[float]
    cols: list[float]
    values: list[list[float]]           # intrinsic value per share


class SensitivityRequest(BaseModel):
    ticker: str
    historical: HistoricalData
    base_assumptions: ScenarioAssumptions
    current_price: Optional[float] = None


class SensitivityResponse(BaseModel):
    wacc_vs_terminal_growth: SensitivityTable
    wacc_vs_exit_multiple: SensitivityTable
    ebitda_margin_vs_revenue_cagr: SensitivityTable


# ─────────────────────────────────────────────
# TIKR / Override Import
# ─────────────────────────────────────────────

class TIKRField(BaseModel):
    field_name: str
    value: float
    year: int
    source: str = "tikr_import"


class TIKRImportRequest(BaseModel):
    ticker: str
    fields: list[TIKRField]


class TIKRImportResponse(BaseModel):
    merged_financials: list[AnnualFinancials]
    overridden_fields: list[str]
    source_log: list[dict]


# ─────────────────────────────────────────────
# Screening
# ─────────────────────────────────────────────

class ScreeningCheck(BaseModel):
    name: str
    passed: bool
    value: Optional[float]
    threshold: Optional[float]
    note: str


class ScreeningResult(BaseModel):
    ticker: str
    checks: list[ScreeningCheck]
    overall: str   # "pass" | "warning" | "fail"
