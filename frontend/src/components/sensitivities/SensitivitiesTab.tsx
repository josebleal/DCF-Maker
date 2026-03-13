"use client";

import { useState } from "react";
import { useDCFStore } from "@/store/dcfStore";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { runSensitivity } from "@/lib/api";
import type { SensitivityTable } from "@/types";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

function SensGrid({ table, currentValue }: { table: SensitivityTable; currentValue?: number }) {
  // Color cells relative to current intrinsic value
  function cellColor(val: number): string {
    if (!currentValue) return "";
    const diff = (val - currentValue) / currentValue;
    if (diff >= 0.3) return "bg-green-400/20 text-green-300";
    if (diff >= 0.1) return "bg-green-400/10 text-green-400/80";
    if (diff <= -0.3) return "bg-red-400/20 text-red-300";
    if (diff <= -0.1) return "bg-red-400/10 text-red-400/80";
    return "bg-blue-400/5 text-blue-300";
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <div className="text-sm font-semibold text-slate-200">{table.label}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            Rows: {table.row_label} · Cols: {table.col_label}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-white/5">
              <th className="px-4 py-2 text-left text-slate-500">{table.row_label} \ {table.col_label}</th>
              {table.cols.map((c) => (
                <th key={c} className="px-3 py-2 text-right text-slate-400">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={row} className="border-b border-white/3">
                <td className="px-4 py-2 text-slate-400 font-semibold">{row}</td>
                {table.values[ri].map((val, ci) => (
                  <td
                    key={ci}
                    className={cn("px-3 py-2 text-right", cellColor(val))}
                  >
                    ${val.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-4 py-2 text-[10px] text-slate-600">
          Values = intrinsic value per share. Color = vs base case intrinsic value.
        </div>
      </CardContent>
    </Card>
  );
}

export function SensitivitiesTab() {
  const { sensitivity, setSensitivity, historical, assumptions, company, setLoadingSensitivity } = useDCFStore();
  const [loading, setLoading] = useState(false);

  async function handleRun() {
    if (!historical || !assumptions) return;
    setLoading(true);
    setLoadingSensitivity(true);
    try {
      toast.loading("Running sensitivity analysis…", { id: "sens" });
      const result = await runSensitivity({
        ticker: historical.ticker,
        historical,
        base_assumptions: assumptions.base,
        current_price: company?.current_price,
      });
      setSensitivity(result);
      toast.success("Sensitivity tables ready", { id: "sens" });
    } catch (e) {
      toast.error("Sensitivity analysis failed", { id: "sens" });
    } finally {
      setLoading(false);
      setLoadingSensitivity(false);
    }
  }

  const baseIntrinsic = company?.current_price ?? undefined;

  return (
    <div className="space-y-5 animate-slide-up">
      {!sensitivity && (
        <div className="flex items-center gap-4">
          <Button onClick={handleRun} loading={loading}>
            Run Sensitivity Analysis
          </Button>
          <span className="text-xs text-slate-500">
            Generates 3 tables: WACC vs TGR, WACC vs Exit Multiple, EBITDA Margin vs Revenue CAGR
          </span>
        </div>
      )}

      {sensitivity && (
        <>
          <div className="flex justify-end">
            <Button onClick={handleRun} loading={loading} size="sm" variant="secondary">
              ↻ Refresh
            </Button>
          </div>
          <SensGrid table={sensitivity.wacc_vs_terminal_growth} currentValue={baseIntrinsic} />
          <SensGrid table={sensitivity.wacc_vs_exit_multiple} currentValue={baseIntrinsic} />
          <SensGrid table={sensitivity.ebitda_margin_vs_revenue_cagr} currentValue={baseIntrinsic} />
        </>
      )}
    </div>
  );
}
