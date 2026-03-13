"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { DCFResult } from "@/types";

interface ScenarioComparisonChartProps {
  bear: DCFResult;
  base: DCFResult;
  bull: DCFResult;
  currentPrice?: number | null;
}

const SCENARIO_COLORS = {
  Bear: "#ef4444",
  Base: "#3b82f6",
  Bull: "#22c55e",
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-navy-900 border border-white/10 rounded-lg p-3 shadow-xl text-xs">
      <div className="font-semibold text-slate-200 mb-1">{d.scenario}</div>
      <div className="text-slate-400">
        Intrinsic Value: <span className="font-mono text-slate-100">${d.value.toFixed(2)}</span>
      </div>
      {d.upside != null && (
        <div className={d.upside >= 0 ? "text-green-400" : "text-red-400"}>
          Upside: {d.upside >= 0 ? "+" : ""}{d.upside.toFixed(1)}%
        </div>
      )}
    </div>
  );
};

export function ScenarioComparisonChart({
  bear,
  base,
  bull,
  currentPrice,
}: ScenarioComparisonChartProps) {
  const data = [
    { scenario: "Bear", value: bear.bridge.intrinsic_value_per_share, upside: bear.bridge.upside_pct },
    { scenario: "Base", value: base.bridge.intrinsic_value_per_share, upside: base.bridge.upside_pct },
    { scenario: "Bull", value: bull.bridge.intrinsic_value_per_share, upside: bull.bridge.upside_pct },
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="scenario" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
        <Tooltip content={<CustomTooltip />} />
        {currentPrice && (
          <ReferenceLine
            y={currentPrice}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{ value: "Current", position: "right", fill: "#f59e0b", fontSize: 10 }}
          />
        )}
        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.scenario}
              fill={SCENARIO_COLORS[entry.scenario as keyof typeof SCENARIO_COLORS]}
              fillOpacity={0.8}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
