# IC DCF Maker
> Investment Club Discounted Cash Flow Calculator

A production-quality DCF valuation tool for undergraduate investment clubs. Automatically pulls 5+ years of historical financial data, builds bear/base/bull forecasts using defensible assumptions, and outputs a full DCF model with editable parameters.

---

## Architecture

```
IC DCF Maker/
├── backend/                    # Python FastAPI
│   ├── main.py                 # App entry point + CORS
│   ├── api/
│   │   ├── routes.py           # All API endpoints
│   │   └── schemas.py          # Pydantic typed schemas
│   ├── data_providers/
│   │   ├── base_provider.py    # Abstract interface (extensible)
│   │   └── yahoo_provider.py   # Yahoo Finance via yfinance
│   ├── normalization/
│   │   ├── ratio_calculator.py # Derives margins, ratios, δNWC
│   │   └── screening.py        # Investment club screening checks
│   ├── forecast_engine/
│   │   └── auto_assumptions.py # Bear/base/bull assumption engine
│   ├── valuation_engine/
│   │   ├── dcf.py              # UFCF → EV → Equity bridge
│   │   └── sensitivity.py      # 3 sensitivity tables
│   ├── scenario_engine/
│   │   └── scenarios.py        # All 3 scenario runner
│   ├── parsers/
│   │   └── tikr_parser.py      # TIKR CSV / manual override parser
│   └── utils/
│       └── formatting.py       # Currency/pct formatters
│
└── frontend/                   # Next.js 14 + TypeScript + Tailwind
    └── src/
        ├── app/                # App router pages
        ├── components/
        │   ├── layout/         # Header, SearchBar, CompanyHeader, Tabs
        │   ├── ui/             # Card, Button, Badge, KPITile, Spinner
        │   ├── charts/         # Revenue, UFCF, Scenario, EVBridge charts
        │   ├── dcf/            # Overview, Financials, DCFOutput, DataQuality
        │   ├── assumptions/    # Editable assumptions panel
        │   ├── scenarios/      # Scenario comparison
        │   └── sensitivities/  # Sensitivity tables
        ├── lib/                # API client, formatters, utils
        ├── store/              # Zustand global state
        └── types/              # TypeScript types (mirrors backend schemas)
```

---

## DCF Formula Chain

```
Revenue(t)    = Revenue(t-1) × (1 + growth_rate(t))
EBIT(t)       = Revenue(t) × ebit_margin(t)
EBITDA(t)     = EBIT(t) + D&A(t)
NOPAT(t)      = EBIT(t) × (1 − tax_rate(t))
D&A(t)        = Revenue(t) × da_pct(t)
Capex(t)      = Revenue(t) × capex_pct(t)
NWC(t)        = Revenue(t) × nwc_pct
ΔNWC(t)       = NWC(t) − NWC(t-1)

UFCF(t)       = NOPAT(t) + D&A(t) − Capex(t) − ΔNWC(t)

PV(UFCF_t)    = UFCF_t / (1 + WACC)^t

TV_Gordon     = UFCF_n × (1 + g) / (WACC − g)
TV_Exit       = EBITDA_n × Exit_Multiple
TV_avg        = (PV_Gordon + PV_Exit) / 2

EV            = Σ PV(UFCF_t) + TV_avg
Equity Value  = EV − Net Debt
IV/Share      = Equity Value / Diluted Shares
```

---

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- npm or pnpm

### 1. Backend

```bash
cd "IC DCF Maker/backend"
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

API docs available at: http://localhost:8000/docs

### 2. Frontend

```bash
cd "IC DCF Maker/frontend"
npm install
npm run dev
```

Open: http://localhost:3000

---

## Data Sources

| Source | Type | Access |
|--------|------|--------|
| Yahoo Finance | Automatic | Free via yfinance |
| TIKR | Manual override | CSV upload or paste |
| SEC Filings | Future adapter | Pluggable via BaseDataProvider |
| Alpha Vantage | Future adapter | Pluggable via BaseDataProvider |
| FMP | Future adapter | Pluggable via BaseDataProvider |

### TIKR Import Workflow

TIKR does not have a public API. Instead, the app supports:
1. **CSV Upload** — Export from TIKR → drag/drop → auto-maps row labels
2. **JSON Override** — POST to `/api/tikr/import` with field-level overrides
3. **Manual Entry** — Click any cell in the Assumptions tab

Source priority: `User/TIKR > Yahoo Finance > Manual fallback`

---

## Assumption Generation Logic

The auto-assumption engine uses:
1. **Median** of all historical years for each ratio
2. **25th / 75th percentile** for bear / bull splits
3. **Growth fade** — growth rates taper toward GDP-ish levels by year 5
4. **Guardrails** — growth clamped to [-30%, +100%], margins to [-20%, +60%]
5. **Economic consistency** — capex and D&A remain plausible relative to revenue

All assumptions are fully editable. Hit **Recalculate DCF** after any change.

---

## Screening Checks

| Check | Threshold | Notes |
|-------|-----------|-------|
| Years of History | ≥ 5 | Projections less reliable with fewer |
| Positive EBITDA Margin | > 0% | Pre-profitability flagged |
| Interest Coverage | > 2× | Debt service risk |
| Net Debt / Revenue | < 5× | Leverage check |
| Exchange | NYSE / NASDAQ | Resolved at search |

Checks are **indicators only** — the app never blocks a valuation.

---

## Extending the Data Layer

To add a new provider (e.g. Financial Modeling Prep):

```python
# backend/data_providers/fmp_provider.py
from data_providers.base_provider import BaseDataProvider

class FMPProvider(BaseDataProvider):
    def search(self, query: str) -> list[CompanyInfo]: ...
    def get_historicals(self, ticker: str) -> HistoricalData: ...
```

Then swap in the provider in `api/routes.py`.

---

## Next Improvements

1. **WACC Calculator** — CAPM + leverage from balance sheet, auto-compute beta from market data
2. **SEC EDGAR adapter** — parse XBRL filings for more precise historical data
3. **PDF export** — one-page investment memo with charts
4. **Multi-company compare** — side-by-side valuation of peers
5. **Saved models** — persist assumptions to local storage or database
6. **TIKR pasted-table parser** — detect and parse HTML table paste from TIKR web
7. **Comps table** — pull sector EV/EBITDA, P/E multiples for sanity check
8. **Real WACC** — pull 10-year treasury rate automatically, compute CAPM properly
