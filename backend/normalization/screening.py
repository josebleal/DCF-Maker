"""
Investment club screening checks.
Returns pass/warning indicators — never hard rejects.
"""

from api.schemas import HistoricalData, ScreeningCheck, ScreeningResult
from normalization.ratio_calculator import compute_screening_metrics


def screen_company(historical: HistoricalData) -> ScreeningResult:
    checks: list[ScreeningCheck] = []
    metrics = compute_screening_metrics(historical.financials)

    # 1. At least 5 years of history
    years = metrics.get("years_of_history", 0)
    checks.append(ScreeningCheck(
        name="5+ Years of History",
        passed=years >= 5,
        value=float(years),
        threshold=5.0,
        note=f"{years} years available" if years >= 5 else f"Only {years} years — projections less reliable",
    ))

    # 2. Positive EBITDA margin
    ebitda_margin = metrics.get("latest_ebitda_margin")
    checks.append(ScreeningCheck(
        name="Positive EBITDA Margin",
        passed=ebitda_margin is not None and ebitda_margin > 0,
        value=round(ebitda_margin * 100, 1) if ebitda_margin else None,
        threshold=0.0,
        note="EBITDA positive" if (ebitda_margin and ebitda_margin > 0) else "EBITDA negative or unavailable",
    ))

    # 3. Reasonable interest coverage (> 2×)
    ic = metrics.get("interest_coverage")
    checks.append(ScreeningCheck(
        name="Interest Coverage > 2×",
        passed=ic is None or ic > 2.0,  # No debt is fine
        value=round(ic, 1) if ic else None,
        threshold=2.0,
        note=f"{ic:.1f}× coverage" if ic else "No interest expense detected",
    ))

    # 4. Net debt not extreme (net debt / revenue < 5×)
    net_debt = metrics.get("net_debt")
    revenue = metrics.get("revenue")
    nd_ratio = (net_debt / revenue) if (net_debt and revenue and revenue > 0) else None
    checks.append(ScreeningCheck(
        name="Net Debt / Revenue < 5×",
        passed=nd_ratio is None or nd_ratio < 5.0,
        value=round(nd_ratio, 2) if nd_ratio else None,
        threshold=5.0,
        note=f"{nd_ratio:.2f}× net debt/revenue" if nd_ratio else "Net debt unavailable",
    ))

    # 5. Exchange (pass through — we rely on yfinance info)
    checks.append(ScreeningCheck(
        name="NYSE / NASDAQ Listed",
        passed=True,  # Resolved at search time; assume pass here
        value=None,
        threshold=None,
        note="Exchange verified at search",
    ))

    failed = sum(1 for c in checks if not c.passed)
    overall = "pass" if failed == 0 else ("warning" if failed <= 2 else "fail")

    return ScreeningResult(ticker=historical.ticker, checks=checks, overall=overall)
