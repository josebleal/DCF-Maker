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
} from "recharts";
import { fmtCurrency, fmtPct } from "@/lib/format";
import type { AnnualFinancials, ForecastYear } from "@/types";

interface RevenueChartProps {
  historicals: AnnualFinancials[];
  forecast?: ForecastYear[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-navy-900 border border-white/10 rounded-lg p-3 shadow-xl text-xs">
      <div className="font-semibold text-slate-200 mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 text-slate-400">
          <div className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <span className="font-mono text-slate-200">
            {p.name.includes("Margin")
              ? fmtPct(p.value / 100)
              : fmtCurrency(p.value * 1e6)}
          </span>
        </div>
      ))}
    </div>
  );
};

export function RevenueChart({ historicals, forecast }: RevenueChartProps) {
  const histData = historicals
    .filter((r) => r.revenue != null)
    .map((r) => ({
      year: r.year,
      Revenue: r.revenue! / 1e6,
      "EBIT Margin": r.ebit_margin != null ? r.ebit_margin * 100 : null,
      type: "historical",
    }));

  const forecastData =
    forecast?.map((f) => ({
      year: f.year,
      Revenue: f.revenue / 1e6,
      "EBIT Margin": f.ebitda > 0 ? (f.ebit / f.revenue) * 100 : null,
      type: "forecast",
    })) ?? [];

  const data = [...histData, ...forecastData];
  const lastHistYear = histData[histData.length - 1]?.year;

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
          yAxisId="revenue"
          orientation="left"
          tick={{ fill: "#64748b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${v}M`}
        />
        <YAxis
          yAxisId="margin"
          orientation="right"
          tick={{ fill: "#64748b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v.toFixed(0)}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#64748b" }}
          iconType="circle"
          iconSize={8}
        />
        <Bar
          yAxisId="revenue"
          dataKey="Revenue"
          fill="#1e3a6e"
          radius={[3, 3, 0, 0]}
          // Lighter for forecast bars
          label={false}
        />
        <Line
          yAxisId="margin"
          type="monotone"
          dataKey="EBIT Margin"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ r: 3, fill: "#3b82f6" }}
          strokeDasharray="0"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
