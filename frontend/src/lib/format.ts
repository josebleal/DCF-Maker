/**
 * Financial formatting helpers used across all components.
 */

export function fmtCurrency(
  val: number | null | undefined,
  decimals = 1,
  compact = true
): string {
  if (val == null || isNaN(val)) return "N/A";
  const abs = Math.abs(val);
  const sign = val < 0 ? "-" : "";
  if (compact) {
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(decimals)}T`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(decimals)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(decimals)}M`;
    if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(decimals)}K`;
  }
  return `${sign}$${abs.toFixed(decimals)}`;
}

export function fmtPct(
  val: number | null | undefined,
  decimals = 1,
  showSign = false
): string {
  if (val == null || isNaN(val)) return "N/A";
  const pct = val * 100;
  const sign = showSign && val > 0 ? "+" : "";
  return `${sign}${pct.toFixed(decimals)}%`;
}

export function fmtNumber(val: number | null | undefined, decimals = 1): string {
  if (val == null || isNaN(val)) return "N/A";
  return val.toFixed(decimals);
}

export function fmtMultiple(val: number | null | undefined, decimals = 1): string {
  if (val == null || isNaN(val)) return "N/A";
  return `${val.toFixed(decimals)}×`;
}

export function fmtUpside(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "N/A";
  const sign = val >= 0 ? "+" : "";
  return `${sign}${val.toFixed(1)}%`;
}

export function upsideColor(val: number | null | undefined): string {
  if (val == null) return "text-neutral";
  if (val >= 0) return "text-positive";
  return "text-negative";
}

/** Format a decimal as a readable percentage for input fields. */
export function decimalToPct(val: number): string {
  return (val * 100).toFixed(2);
}

/** Parse a percentage string back to decimal. */
export function pctToDecimal(s: string): number {
  return parseFloat(s) / 100;
}
