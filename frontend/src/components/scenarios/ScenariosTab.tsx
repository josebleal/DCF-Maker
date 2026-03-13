"use client";

import { useDCFStore } from "@/store/dcfStore";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { KPITile } from "@/components/ui/KPITile";
import { ScenarioComparisonChart } from "@/components/charts/ScenarioComparisonChart";
import { fmtCurrency, fmtPct, fmtMultiple, fmtUpside } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DCFResult, ScenarioKey } from "@/types";

const SCENARIO_STYLE: Record<ScenarioKey, { border: string; bg: string; text: string }> = {
  bear: { border: "border-red-400/20", bg: "bg-red-400/5", text: "text-red-400" },
  base: { border: "border-blue-400/20", bg: "bg-blue-400/5", text: "text-blue-400" },
  bull: { border: "border-green-400/20", bg: "bg-green-400/5", text: "text-green-400" },
};

function ScenarioCard({ result, scenario }: { result: DCFResult; scenario: ScenarioKey }) {
  const s = SCENARIO_STYLE[scenario];
  const b = result.bridge;
  const upside = b.upside_pct;

  return (
    <div className={cn("card border p-5 space-y-4", s.border)}>
      <div className="flex items-center justify-between">
        <h3 className={cn("text-base font-bold capitalize", s.text)}>{scenario} Case</h3>
        <div className={cn("text-2xl font-bold font-mono", s.text)}>
          ${b.intrinsic_value_per_share.toFixed(2)}
        </div>
      </div>

      {upside != null && (
        <div className={cn("text-sm font-medium", upside >= 0 ? "text-green-400" : "text-red-400")}>
          {upside >= 0 ? "+" : ""}{upside.toFixed(1)}% vs current price
        </div>
      )}

      <div className="space-y-1.5 text-sm">
        {[
          { label: "Enterprise Value", value: fmtCurrency(b.enterprise_value) },
          { label: "Equity Value", value: fmtCurrency(b.equity_value) },
          { label: "WACC", value: fmtPct(result.wacc) },
          { label: "Terminal Growth", value: fmtPct(result.assumptions_used.terminal_growth_rate) },
          { label: "Exit EV/EBITDA", value: fmtMultiple(result.assumptions_used.exit_ev_ebitda) },
          { label: "5Y Rev CAGR", value: (() => {
            const yrs = result.forecast_years;
            const cagr = yrs.length > 1 ? Math.pow(yrs[yrs.length - 1].revenue / yrs[0].revenue, 1 / (yrs.length - 1)) - 1 : null;
            return cagr != null ? fmtPct(cagr) : "N/A";
          })() },
        ].map((r) => (
          <div key={r.label} className="flex justify-between border-b border-white/3 py-1">
            <span className="text-slate-500">{r.label}</span>
            <span className="font-mono text-slate-200">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScenariosTab() {
  const { dcfResults, company } = useDCFStore();

  if (!dcfResults) return <div className="text-slate-500 text-sm">Load a company to see scenarios.</div>;

  const { bear, base, bull } = dcfResults;

  return (
    <div className="space-y-6 animate-slide-up">
      {/* 3-column scenario cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ScenarioCard result={bear} scenario="bear" />
        <ScenarioCard result={base} scenario="base" />
        <ScenarioCard result={bull} scenario="bull" />
      </div>

      {/* Comparison chart */}
      <Card>
        <CardHeader>
          <span className="text-sm font-semibold text-slate-200">Intrinsic Value — Scenario Comparison</span>
        </CardHeader>
        <CardContent>
          <ScenarioComparisonChart bear={bear} base={base} bull={bull} currentPrice={company?.current_price} />
        </CardContent>
      </Card>

      {/* Full assumption comparison table */}
      <Card>
        <CardHeader>
          <span className="text-sm font-semibold text-slate-200">Scenario Assumption Comparison</span>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-500 w-44">Assumption</th>
                {(["bear", "base", "bull"] as ScenarioKey[]).map((s) => (
                  <th key={s} className={cn("tbl-cell text-xs font-medium capitalize", SCENARIO_STYLE[s].text)}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { label: "WACC", get: (r: DCFResult) => fmtPct(r.wacc) },
                { label: "Terminal Growth", get: (r: DCFResult) => fmtPct(r.assumptions_used.terminal_growth_rate) },
                { label: "Exit EV/EBITDA", get: (r: DCFResult) => fmtMultiple(r.assumptions_used.exit_ev_ebitda) },
                { label: "Yr1 Rev Growth", get: (r: DCFResult) => fmtPct(r.assumptions_used.years[0]?.revenue_growth) },
                { label: "Yr5 Rev Growth", get: (r: DCFResult) => fmtPct(r.assumptions_used.years[4]?.revenue_growth) },
                { label: "Yr1 EBITDA Margin", get: (r: DCFResult) => fmtPct(r.assumptions_used.years[0]?.ebitda_margin) },
                { label: "Yr5 EBITDA Margin", get: (r: DCFResult) => fmtPct(r.assumptions_used.years[4]?.ebitda_margin) },
                { label: "Enterprise Value", get: (r: DCFResult) => fmtCurrency(r.bridge.enterprise_value) },
                { label: "Equity Value", get: (r: DCFResult) => fmtCurrency(r.bridge.equity_value) },
                { label: "Value / Share", get: (r: DCFResult) => `$${r.bridge.intrinsic_value_per_share.toFixed(2)}` },
                { label: "Upside %", get: (r: DCFResult) => r.bridge.upside_pct != null ? fmtUpside(r.bridge.upside_pct) : "—" },
              ].map((row, i) => (
                <tr key={row.label} className={cn("border-b border-white/3 hover:bg-white/2", i % 2 === 0 ? "" : "bg-white/[0.01]")}>
                  <td className="px-5 py-2 text-xs text-slate-400">{row.label}</td>
                  {([bear, base, bull] as DCFResult[]).map((r, ri) => (
                    <td key={ri} className="tbl-cell text-slate-200">{row.get(r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
