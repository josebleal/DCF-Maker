"use client";

import { useDCFStore } from "@/store/dcfStore";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { KPITile } from "@/components/ui/KPITile";
import { ScenarioComparisonChart } from "@/components/charts/ScenarioComparisonChart";
import { RevenueChart } from "@/components/charts/RevenueChart";
import { EVBridgeChart } from "@/components/charts/EVBridgeChart";
import { fmtCurrency, fmtPct, fmtMultiple, fmtUpside, upsideColor } from "@/lib/format";
import { cn } from "@/lib/utils";

export function OverviewTab() {
  const { dcfResults, historical, company, assumptions } = useDCFStore();

  if (!dcfResults || !historical) return <div className="text-slate-500 text-sm">Run DCF to see results.</div>;

  const base = dcfResults.base;
  const bear = dcfResults.bear;
  const bull = dcfResults.bull;

  const intrinsic = base.bridge.intrinsic_value_per_share;
  const upside = base.bridge.upside_pct;

  // Forecast revenue CAGR
  const firstForecastRev = base.forecast_years[0]?.revenue;
  const lastForecastRev = base.forecast_years[base.forecast_years.length - 1]?.revenue;
  const years = base.forecast_years.length;
  const revCagr = firstForecastRev && lastForecastRev
    ? Math.pow(lastForecastRev / firstForecastRev, 1 / (years - 1)) - 1
    : null;

  const lastHistorical = historical.financials[historical.financials.length - 1];
  const avgEbitMargin = base.forecast_years.reduce((s, y) => s + (y.ebit / y.revenue), 0) / years;

  return (
    <div className="space-y-6 animate-slide-up">
      {/* KPI tiles — valuation summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KPITile
          label="Intrinsic Value (Base)"
          value={intrinsic ? `$${intrinsic.toFixed(2)}` : "N/A"}
          sub={upside != null ? `${fmtUpside(upside)} upside` : undefined}
          trend={upside != null ? (upside >= 0 ? "up" : "down") : "neutral"}
          accent
        />
        <KPITile
          label="Enterprise Value"
          value={fmtCurrency(base.bridge.enterprise_value)}
        />
        <KPITile
          label="Equity Value"
          value={fmtCurrency(base.bridge.equity_value)}
        />
        <KPITile
          label="WACC"
          value={fmtPct(base.wacc)}
        />
        <KPITile
          label="Net Debt"
          value={fmtCurrency(base.bridge.less_net_debt)}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPITile
          label="Bear Case"
          value={`$${bear.bridge.intrinsic_value_per_share.toFixed(2)}`}
          sub={bear.bridge.upside_pct != null ? fmtUpside(bear.bridge.upside_pct) : undefined}
          trend={bear.bridge.upside_pct != null ? (bear.bridge.upside_pct >= 0 ? "up" : "down") : "neutral"}
        />
        <KPITile
          label="Bull Case"
          value={`$${bull.bridge.intrinsic_value_per_share.toFixed(2)}`}
          sub={bull.bridge.upside_pct != null ? fmtUpside(bull.bridge.upside_pct) : undefined}
          trend={bull.bridge.upside_pct != null ? (bull.bridge.upside_pct >= 0 ? "up" : "down") : "neutral"}
        />
        <KPITile
          label="Fwd Revenue CAGR"
          value={revCagr != null ? fmtPct(revCagr) : "N/A"}
        />
        <KPITile
          label="Avg EBIT Margin"
          value={fmtPct(avgEbitMargin)}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-slate-200">Revenue & EBIT Margin</span>
            <span className="text-xs text-slate-500">Historical + Base Forecast</span>
          </CardHeader>
          <CardContent>
            <RevenueChart
              historicals={historical.financials}
              forecast={base.forecast_years}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-slate-200">Bull / Base / Bear</span>
            <span className="text-xs text-slate-500">Intrinsic Value per Share</span>
          </CardHeader>
          <CardContent>
            <ScenarioComparisonChart
              bear={bear}
              base={base}
              bull={bull}
              currentPrice={company?.current_price}
            />
          </CardContent>
        </Card>
      </div>

      {/* EV Bridge */}
      <Card>
        <CardHeader>
          <span className="text-sm font-semibold text-slate-200">Valuation Bridge (Base)</span>
          <span className="text-xs text-slate-500">EV → Equity Value</span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
            <EVBridgeChart bridge={base.bridge} />
            <div className="space-y-2">
              {[
                { label: "Sum of PV FCFs", value: fmtCurrency(base.bridge.sum_pv_fcff) },
                { label: "PV Terminal Value", value: fmtCurrency(base.bridge.terminal_value_pv) },
                { label: "Enterprise Value", value: fmtCurrency(base.bridge.enterprise_value), bold: true },
                { label: "Less: Net Debt", value: fmtCurrency(base.bridge.less_net_debt), negative: true },
                { label: "Equity Value", value: fmtCurrency(base.bridge.equity_value), bold: true, accent: true },
                { label: "Diluted Shares (M)", value: (base.bridge.diluted_shares / 1e6).toFixed(0) + "M" },
                {
                  label: "Intrinsic Value / Share",
                  value: `$${base.bridge.intrinsic_value_per_share.toFixed(2)}`,
                  bold: true,
                  accent: true,
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className={cn(
                    "flex justify-between items-center py-1.5 px-3 rounded-lg text-sm",
                    row.accent ? "bg-accent/5 border border-accent/10" : "hover:bg-white/2"
                  )}
                >
                  <span className={cn("text-slate-400", row.bold && "text-slate-200 font-medium")}>
                    {row.label}
                  </span>
                  <span
                    className={cn(
                      "font-mono",
                      row.accent ? "text-accent-light font-bold" : row.bold ? "text-slate-100 font-semibold" : "text-slate-300",
                      row.negative && "text-red-400"
                    )}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
