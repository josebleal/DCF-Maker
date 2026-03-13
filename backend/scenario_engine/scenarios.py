"""
Run all three scenarios and return a combined response.
"""

from __future__ import annotations

from api.schemas import DCFRequest, DCFResult
from valuation_engine.dcf import run_dcf


def build_all_scenarios(payload: dict) -> dict:
    """
    Accepts a dict with keys: ticker, historical, assumptions (all 3 scenarios), current_price.
    Returns dict: { bear: DCFResult, base: DCFResult, bull: DCFResult }
    """
    from api.schemas import HistoricalData, AssumptionsResponse

    historical = HistoricalData(**payload["historical"])
    assumptions = AssumptionsResponse(**payload["assumptions"])
    current_price = payload.get("current_price")

    results = {}
    for scenario_name, scenario_assumptions in [
        ("bear", assumptions.bear),
        ("base", assumptions.base),
        ("bull", assumptions.bull),
    ]:
        req = DCFRequest(
            ticker=payload["ticker"],
            historical=historical,
            assumptions=scenario_assumptions,
            current_price=current_price,
        )
        result = run_dcf(req)
        results[scenario_name] = result.model_dump()

    return results
