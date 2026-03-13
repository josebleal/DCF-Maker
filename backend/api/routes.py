"""
FastAPI route definitions.
All business logic lives in domain modules — routes are thin.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from api.schemas import (
    AssumptionsOverrideRequest,
    AssumptionsResponse,
    DCFRequest,
    DCFResult,
    HistoricalData,
    ScreeningResult,
    SearchResult,
    SensitivityRequest,
    SensitivityResponse,
    TIKRImportRequest,
    TIKRImportResponse,
)
from data_providers.sec_provider import get_filing_data
from data_providers.yahoo_provider import YahooFinanceProvider
from forecast_engine.auto_assumptions import build_auto_assumptions
from normalization.screening import screen_company
from parsers.tikr_parser import merge_tikr_overrides, parse_tikr_import
from scenario_engine.scenarios import build_all_scenarios
from valuation_engine.dcf import run_dcf
from valuation_engine.sensitivity import run_sensitivity

router = APIRouter()
_yahoo = YahooFinanceProvider()


# ────────────────────────────────────────────
# Search
# ────────────────────────────────────────────

@router.get("/search", response_model=SearchResult)
def search_tickers(q: str):
    """Search NYSE/NASDAQ companies by ticker or name."""
    try:
        results = _yahoo.search(q)
        return SearchResult(results=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ────────────────────────────────────────────
# Historical data ingestion
# ────────────────────────────────────────────

@router.get("/historicals/{ticker}", response_model=HistoricalData)
def get_historicals(ticker: str):
    """
    Pull 5+ years of historical financials from Yahoo Finance.
    Missing fields are flagged — never fabricated.
    """
    try:
        data = _yahoo.get_historicals(ticker.upper())
        return data
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Could not load data for {ticker}: {e}")


# ────────────────────────────────────────────
# Auto assumptions
# ────────────────────────────────────────────

class AssumptionsRequest(BaseModel):
    """Extended request carrying company market data for WACC derivation."""
    historical: HistoricalData
    beta: Optional[float] = None
    market_cap: Optional[float] = None


@router.post("/assumptions", response_model=AssumptionsResponse)
def generate_assumptions(request: AssumptionsRequest):
    """
    From historical data + company market info, derive bear/base/bull assumptions.

    Key improvements:
    - EBITDA-first model (ebitda_margin is primary driver)
    - Recency-weighted (last 2 years = 2x weight)
    - WACC from CAPM + leverage fundamentals
    - Scenario bands: Bear ≤+2%, Base 3-6%, Bull 5-12%
    - SEC EDGAR filing URLs + MD&A guidance snippets in filing_memo
    """
    try:
        return build_auto_assumptions(
            historical=request.historical,
            beta=request.beta,
            market_cap=request.market_cap,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ────────────────────────────────────────────
# DCF valuation
# ────────────────────────────────────────────

@router.post("/dcf", response_model=DCFResult)
def calculate_dcf(request: DCFRequest):
    """Run DCF for a single scenario. Returns forecast, TV, and equity bridge."""
    try:
        return run_dcf(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/dcf/all-scenarios")
def calculate_all_scenarios(request: dict):
    """
    Run DCF for bear/base/bull at once.
    Expects: { ticker, historical, assumptions (AssumptionsResponse), current_price }
    """
    try:
        return build_all_scenarios(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ────────────────────────────────────────────
# SEC filing memo (standalone endpoint)
# ────────────────────────────────────────────

@router.get("/filing-memo/{ticker}")
def get_filing_memo(ticker: str):
    """
    Fetch SEC EDGAR filing metadata + MD&A guidance for a ticker.
    Returns 10-K/10-Q URLs and extracted guidance snippets.
    """
    try:
        data = get_filing_data(ticker.upper())
        return {
            "ticker"               : ticker.upper(),
            "cik"                  : data.get("cik"),
            "entity_name"          : data.get("entity_name"),
            "latest_10k_url"       : data.get("latest_10k_url"),
            "latest_10k_period"    : data.get("latest_10k_period"),
            "latest_10q_url"       : data.get("latest_10q_url"),
            "latest_10q_period"    : data.get("latest_10q_period"),
            "guidance_snippets_10k": data.get("guidance_snippets_10k", []),
            "guidance_snippets_10q": data.get("guidance_snippets_10q", []),
            "mda_preview_10q"      : data.get("mda_text_10q", "")[:800],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ────────────────────────────────────────────
# Sensitivity tables
# ────────────────────────────────────────────

@router.post("/sensitivity", response_model=SensitivityResponse)
def calculate_sensitivity(request: SensitivityRequest):
    """
    Three sensitivity tables:
    - WACC vs terminal growth rate
    - WACC vs exit EV/EBITDA
    - EBITDA margin vs revenue CAGR
    """
    try:
        return run_sensitivity(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ────────────────────────────────────────────
# TIKR / manual import
# ────────────────────────────────────────────

@router.post("/tikr/import", response_model=TIKRImportResponse)
def tikr_json_import(request: TIKRImportRequest):
    """Accept structured TIKR field overrides as JSON."""
    try:
        return merge_tikr_overrides(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/tikr/csv")
async def tikr_csv_upload(file: UploadFile = File(...), ticker: str = ""):
    """Accept a TIKR CSV export and parse into AnnualFinancials."""
    try:
        contents = await file.read()
        return parse_tikr_import(contents.decode("utf-8"), ticker)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"CSV parse error: {e}")


# ────────────────────────────────────────────
# Screening
# ────────────────────────────────────────────

@router.post("/screen", response_model=ScreeningResult)
def screen(historical: HistoricalData):
    """Check if company passes investment club screening criteria."""
    try:
        return screen_company(historical)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
