// ─────────────────────────────────────────────
// Shared TypeScript types — mirroring backend schemas
// EBITDA-first model: ebitda_margin is the primary driver
// ─────────────────────────────────────────────

export interface CompanyInfo {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  industry: string;
  current_price: number | null;
  market_cap: number | null;
  currency: string;
  description?: string | null;
  beta?: number | null;
}

export interface AnnualFinancials {
  year: number;
  revenue: number | null;
  gross_profit: number | null;
  ebit: number | null;
  ebitda: number | null;
  net_income: number | null;
  interest_expense: number | null;
  tax_expense: number | null;
  da: number | null;
  capex: number | null;
  change_in_nwc: number | null;
  nwc: number | null;
  cash: number | null;
  total_debt: number | null;
  net_debt: number | null;
  diluted_shares: number | null;
  // Derived
  revenue_growth: number | null;
  gross_margin: number | null;
  ebit_margin: number | null;
  ebitda_margin: number | null;
  effective_tax_rate: number | null;
  da_pct_revenue: number | null;
  capex_pct_revenue: number | null;
  nwc_pct_revenue: number | null;
  dso: number | null;
  dio: number | null;
  dpo: number | null;
}

export interface HistoricalData {
  ticker: string;
  company_name: string;
  currency: string;
  years_available: number;
  financials: AnnualFinancials[];
  data_source: string;
  missing_fields: string[];
  warnings: string[];
}

// ── WACC Build ────────────────────────────────────────────────────────────────
export interface WACCBuild {
  risk_free_rate: number;
  beta: number;
  equity_risk_premium: number;
  cost_of_equity: number;
  pre_tax_cost_of_debt: number;
  effective_tax_rate: number;
  after_tax_cost_of_debt: number;
  equity_value: number | null;
  debt_value: number | null;
  equity_weight: number;
  debt_weight: number;
  wacc: number;
  beta_source: string;
  rfr_source: string;
  erp_source: string;
}

// ── Filing Memo ───────────────────────────────────────────────────────────────
export interface FilingMemo {
  latest_10k_url: string | null;
  latest_10q_url: string | null;
  latest_10k_period: string | null;
  latest_10q_period: string | null;
  revenue_growth_rationale: string;
  ebitda_margin_rationale: string;
  da_rationale: string;
  capex_rationale: string;
  working_capital_rationale: string;
  tax_rationale: string;
  wacc_rationale: string;
  terminal_growth_rationale: string;
  exit_multiple_rationale: string;
  key_risks: string[];
  key_supporting_points: string[];
  data_sources: string[];
}

// ── Forecast Assumptions ─────────────────────────────────────────────────────
export interface YearAssumption {
  year: number;
  revenue_growth: number;
  ebitda_margin: number;      // PRIMARY driver (replaces ebit_margin)
  tax_rate: number;
  da_pct_revenue: number;     // D&A % of revenue; EBIT = EBITDA - D&A
  capex_pct_revenue: number;
  nwc_pct_revenue?: number | null;
  dso?: number | null;
  dio?: number | null;
  dpo?: number | null;
}

export interface ScenarioAssumptions {
  scenario: "bear" | "base" | "bull";
  years: YearAssumption[];
  terminal_growth_rate: number;
  exit_ev_ebitda: number;
  wacc: number;
  cash: number;
  total_debt: number;
  diluted_shares: number;
}

export interface AssumptionsResponse {
  ticker: string;
  bear: ScenarioAssumptions;
  base: ScenarioAssumptions;
  bull: ScenarioAssumptions;
  historical_summary: Record<string, number | string | null | boolean>;
  wacc_build?: WACCBuild | null;
  filing_memo?: FilingMemo | null;
}

// ── DCF Output ────────────────────────────────────────────────────────────────
export interface ForecastYear {
  year: number;
  revenue: number;
  ebitda: number;
  ebitda_margin: number;    // for display
  da: number;
  ebit: number;
  ebit_margin: number;      // for display (derived = ebitda_margin - da/rev)
  nopat: number;
  capex: number;
  change_in_nwc: number;
  fcff: number;             // Free Cash Flow to Firm (= NOPAT + D&A - Capex - ΔNWC)
  pv_fcff: number;
  discount_factor: number;
}

export interface TerminalValue {
  gordon_growth_tv: number;
  exit_multiple_tv: number;
  pv_gordon_growth: number;
  pv_exit_multiple: number;
  terminal_growth_rate: number;
  exit_ev_ebitda: number;
  wacc: number;
}

export interface ValuationBridge {
  sum_pv_fcff: number;
  terminal_value_pv: number;
  enterprise_value: number;
  less_net_debt: number;
  equity_value: number;
  diluted_shares: number;
  intrinsic_value_per_share: number;
  current_price: number | null;
  upside_pct: number | null;
}

export interface DCFResult {
  ticker: string;
  scenario: string;
  forecast_years: ForecastYear[];
  terminal_value: TerminalValue;
  bridge: ValuationBridge;
  wacc: number;
  assumptions_used: ScenarioAssumptions;
}

export interface SensitivityTable {
  label: string;
  row_label: string;
  col_label: string;
  rows: number[];
  cols: number[];
  values: number[][];
}

export interface SensitivityResponse {
  wacc_vs_terminal_growth: SensitivityTable;
  wacc_vs_exit_multiple: SensitivityTable;
  ebitda_margin_vs_revenue_cagr: SensitivityTable;   // renamed from ebit_margin_vs_revenue_cagr
}

export interface ScreeningCheck {
  name: string;
  passed: boolean;
  value: number | null;
  threshold: number | null;
  note: string;
}

export interface ScreeningResult {
  ticker: string;
  checks: ScreeningCheck[];
  overall: "pass" | "warning" | "fail";
}

export type ScenarioKey = "bear" | "base" | "bull";
