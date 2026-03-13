"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { fmtCurrency } from "@/lib/format";
import type { ValuationBridge } from "@/types";

interface EVBridgeChartProps {
  bridge: ValuationBridge;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-navy-900 border border-white/10 rounded-lg p-3 shadow-xl text-xs">
      <div className="font-semibold text-slate-200 mb-1">{d.name}</div>
      <div className="font-mono text-slate-100">{fmtCurrency(d.rawValue)}</div>
    </div>
  );
};

export function EVBridgeChart({ bridge }: EVBridgeChartProps) {
  const data = [
    { name: "PV of FCFs", rawValue: bridge.sum_pv_fcff, color: "#1e3a6e" },
    { name: "PV Terminal Value", rawValue: bridge.terminal_value_pv, color: "#162b56" },
    { name: "Enterprise Value", rawValue: bridge.enterprise_value, color: "#3b82f6" },
    { name: "Less Net Debt", rawValue: -bridge.less_net_debt, color: bridge.less_net_debt > 0 ? "#ef4444" : "#22c55e" },
    { name: "Equity Value", rawValue: bridge.equity_value, color: "#22c55e" },
  ].map((d) => ({ ...d, value: Math.abs(d.rawValue) / 1e6 }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}M`} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry, idx) => (
            <Cell key={idx} fill={entry.color} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
