"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { fmtCurrency } from "@/lib/format";
import type { ForecastYear } from "@/types";

interface UFCFChartProps {
  forecast: ForecastYear[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-900 border border-white/10 rounded-lg p-3 shadow-xl text-xs">
      <div className="font-semibold text-slate-200 mb-1">FY{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 text-slate-400">
          <div className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <span className="font-mono text-slate-200">{fmtCurrency(p.value * 1e6)}</span>
        </div>
      ))}
    </div>
  );
};

export function UFCFChart({ forecast }: UFCFChartProps) {
  const data = forecast.map((f) => ({
    year: f.year,
    Revenue: f.revenue / 1e6,
    FCFF: f.fcff / 1e6,
    "PV FCFF": f.pv_fcff / 1e6,
  }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis
          dataKey="year"
          tick={{ fill: "#64748b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v.toFixed(0)}M`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#64748b" }}
          iconType="circle"
          iconSize={8}
        />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
        <Bar dataKey="Revenue" fill="#162b56" radius={[3, 3, 0, 0]} />
        <Line
          type="monotone"
          dataKey="FCFF"
          stroke="#22c55e"
          strokeWidth={2}
          dot={{ r: 3, fill: "#22c55e" }}
        />
        <Line
          type="monotone"
          dataKey="PV FCFF"
          stroke="#3b82f6"
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={{ r: 3, fill: "#3b82f6" }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
