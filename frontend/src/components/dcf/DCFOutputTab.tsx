"use client";

import { useDCFStore } from "@/store/dcfStore";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { UFCFChart } from "@/components/charts/UFCFChart";
import { fmtCurrency, fmtPct, fmtMultiple } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DCFOutputTab() {
  const { dcfResults, activeScenario, setActiveScenario } = useDCFStore();

  if (!dcfResults) return <div className="text-slate-500 text-sm">Load a company to see DCF output.</div>;

  const result = dcfResults[activeScenario];

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Scenario selector */}
      <div className="flex gap-2">
        {(["bear", "base", "bull"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setActiveScenario(s)}
            className={cn(
              "scenario-pill capitalize transition-all border",
              activeScenario === s
                ? s === "bear"
                  ? "bg-red-400/15 text-red-400 border-red-400/30"
                  : s === "base"
                  ? "bg-blue-400/15 text-blue-400 border-blue-400/30"
                  : "bg-green-400/15 text-green-400 border-green-400/30"
                : "bg-navy-800 text-slate-500 border-white/5 hover:text-slate-300"
            )}
          >
            {s} Case
          </button>
        ))}
      </div>

      {/* FCFF Forecast Chart */}
      <Card>
        <CardHeader>
          <span className="text-sm font-semibold text-slate-200 capitalize">
            {activeScenario} Case — Projected Revenue & FCFF
          </span>
        </CardHeader>
        <CardContent>
          <UFCFChart forecast={result.forecast_years} />
        </CardContent>
      </Card>

      {/* 5-year forecast table — EBITDA-first ordering */}
      <Card>
        <CardHeader>
          <span className="text-sm font-semibold text-slate-200">5-Year Forecast (Free Cash Flow to Firm)</span>
          <span className="text-[11px] text-slate-500 font-mono">Values in $M  ·  EBITDA-first model: EBIT = EBITDA − D&A</span>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-500 w-48">Line Item</th>
                {result.forecast_years.map((y) => (
                  <th key={y.year} className="tbl-cell text-xs font-medium text-slate-500">FY{y.year}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "Revenue",          key: "revenue"        as const, indent: false, bold: false },
                { label: "EBITDA",           key: "ebitda"         as const, indent: false, bold: false, accent: true },
                { label: "  EBITDA Margin",  key: "ebitda_margin"  as const, indent: true,  bold: false, pct: true, dim: true },
                { label: "  – D&A",          key: "da"             as const, indent: true,  bold: false, neg: true },
                { label: "EBIT",             key: "ebit"           as const, indent: false, bold: false },
                { label: "  EBIT Margin",    key: "ebit_margin"    as const, indent: true,  bold: false, pct: true, dim: true },
                { label: "  – Taxes (NOPAT)",key: "nopat"          as const, indent: true,  bold: false },
                { label: "  – Capex",        key: "capex"          as const, indent: true,  bold: false, neg: true },
                { label: "  – Δ NWC",        key: "change_in_nwc"  as const, indent: true,  bold: false },
                { label: "FCFF",             key: "fcff"           as const, indent: false, bold: true,  highlight: true },
                { label: "Discount Factor",  key: "discount_factor"as const, indent: true,  bold: false, raw: true, dim: true },
                { label: "PV of FCFF",       key: "pv_fcff"        as const, indent: true,  bold: false },
              ].map((row, i) => (
                <tr
                  key={row.key}
                  className={cn(
                    "border-b border-white/3 hover:bg-white/[0.02]",
                    row.highlight ? "bg-accent/5" : i % 2 === 0 ? "" : "bg-white/[0.01]",
                  )}
                >
                  <td className={cn(
                    "px-5 py-2 text-xs",
                    row.indent && "pl-8",
                    row.highlight ? "text-accent-light font-semibold" :
                    row.bold ? "text-slate-100 font-medium" :
                    row.dim ? "text-slate-600" :
                    row.accent ? "text-blue-300 font-medium" : "text-slate-400",
                  )}>
                    {row.label}
                  </td>
                  {result.forecast_years.map((y) => {
                    const val = y[row.key as keyof typeof y] as number;
                    let display: string;
                    if (row.raw)      display = val.toFixed(4);
                    else if (row.pct) display = `${(val * 100).toFixed(1)}%`;
                    else              display = fmtCurrency(val);

                    return (
                      <td
                        key={y.year}
                        className={cn(
                          "tbl-cell",
                          row.highlight ? "text-accent-light font-bold" :
                          row.bold ? "text-slate-100 font-semibold" :
                          row.dim ? "text-slate-600" :
                          row.neg ? "text-slate-400" : "text-slate-200",
                        )}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Terminal Value + Equity Bridge */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-slate-200">Terminal Value</span>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {[
                { label: "Gordon Growth TV",   value: fmtCurrency(result.terminal_value.gordon_growth_tv) },
                { label: "Exit Multiple TV",   value: fmtCurrency(result.terminal_value.exit_multiple_tv) },
                { label: "PV Gordon Growth",   value: fmtCurrency(result.terminal_value.pv_gordon_growth) },
                { label: "PV Exit Multiple",   value: fmtCurrency(result.terminal_value.pv_exit_multiple) },
                { label: "Terminal Growth Rate", value: fmtPct(result.terminal_value.terminal_growth_rate) },
                { label: "Exit EV/EBITDA",     value: fmtMultiple(result.terminal_value.exit_ev_ebitda) },
                { label: "WACC Used",          value: fmtPct(result.terminal_value.wacc) },
              ].map((r) => (
                <div key={r.label} className="flex justify-between py-1 border-b border-white/3">
                  <span className="text-slate-400">{r.label}</span>
                  <span className="font-mono text-slate-200">{r.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-slate-200">Equity Value Bridge</span>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 text-sm">
              {[
                { label: "Sum PV of FCFFs",    value: fmtCurrency(result.bridge.sum_pv_fcff) },
                { label: "PV of Terminal Value", value: fmtCurrency(result.bridge.terminal_value_pv) },
                { label: "Enterprise Value",   value: fmtCurrency(result.bridge.enterprise_value),          bold: true },
                { label: "Less: Net Debt",     value: `(${fmtCurrency(result.bridge.less_net_debt)})`,      red: true },
                { label: "Equity Value",       value: fmtCurrency(result.bridge.equity_value),              bold: true },
                { label: "Diluted Shares",     value: `${(result.bridge.diluted_shares / 1e6).toFixed(0)}M` },
                {
                  label: "Intrinsic Value / Share",
                  value: `$${result.bridge.intrinsic_value_per_share.toFixed(2)}`,
                  bold: true, accent: true,
                },
                {
                  label: "Current Price",
                  value: result.bridge.current_price ? `$${result.bridge.current_price.toFixed(2)}` : "—",
                },
                {
                  label: "Implied Upside",
                  value: result.bridge.upside_pct != null
                    ? `${result.bridge.upside_pct >= 0 ? "+" : ""}${result.bridge.upside_pct.toFixed(1)}%`
                    : "—",
                  upside: result.bridge.upside_pct,
                },
              ].map((r) => (
                <div
                  key={r.label}
                  className={cn(
                    "flex justify-between py-1.5 px-3 rounded-lg border-b border-white/3",
                    r.accent ? "bg-accent/5" : "",
                  )}
                >
                  <span className={cn("text-slate-400", r.bold && "text-slate-200 font-medium")}>{r.label}</span>
                  <span className={cn(
                    "font-mono",
                    r.accent ? "text-accent-light font-bold text-base" :
                    r.bold   ? "text-slate-100 font-semibold" : "text-slate-300",
                    r.red    && "text-red-400",
                    "upside" in r && r.upside != null && (r.upside >= 0 ? "text-green-400" : "text-red-400"),
                  )}>
                    {r.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
