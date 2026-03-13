"""Shared formatting utilities for financial values."""


def fmt_currency(val: float | None, currency: str = "USD", scale: str = "M") -> str:
    """Format a raw value (in base units) to readable string with scale."""
    if val is None:
        return "N/A"
    if scale == "B":
        return f"${val / 1e9:.2f}B"
    if scale == "M":
        return f"${val / 1e6:.1f}M"
    return f"${val:,.0f}"


def fmt_pct(val: float | None, decimals: int = 1) -> str:
    if val is None:
        return "N/A"
    return f"{val * 100:.{decimals}f}%"


def fmt_multiple(val: float | None, decimals: int = 1) -> str:
    if val is None:
        return "N/A"
    return f"{val:.{decimals}f}×"
