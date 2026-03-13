"use client";

import { useDCFStore } from "@/store/dcfStore";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { fmtCurrency, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AnnualFinancials } from "@/types";

type Row = { label: string; key: keyof AnnualFinancials; format: "currency" | "pct" | "shares" };

const INCOME_ROWS: Row[] = [
  { label: "Revenue", key: "revenue", format: "currency" },
  { label: "Gross Profit", key: "gross_profit", format: "currency" },
  { label: "EBIT", key: "ebit", format: "currency" },
  { label: "EBITDA", key: "ebitda", format: "currency" },
  { label: "Net Income", key: "net_income", format: "currency" },
];

const MARGIN_ROWS: Row[] = [
  { label: "Revenue Growth", key: "revenue_growth", format: "pct" },
  { label: "Gross Margin", key: "gross_margin", format: "pct" },
  { label: "EBIT Margin", key: "ebit_margin", format: "pct" },
  { label: "EBITDA Margin", key: "ebitda_margin", format: "pct" },
  { label: "Effective Tax Rate", key: "effective_tax_rate", format: "pct" },
];

const CF_ROWS: Row[] = [
  { label: "D&A", key: "da", format: "currency" },
  { label: "Capex", key: "capex", format: "currency" },
  { label: "Change in NWC", key: "change_in_nwc", format: "currency" },
  { label: "D&A % Revenue", key: "da_pct_revenue", format: "pct" },
  { label: "Capex % Revenue", key: "capex_pct_revenue", format: "pct" },
];

const BS_ROWS: Row[] = [
  { label: "Cash", key: "cash", format: "currency" },
  { label: "Total Debt", key: "total_debt", format: "currency" },
  { label: "Net Debt", key: "net_debt", format: "currency" },
  { label: "NWC", key: "nwc", format: "currency" },
  { label: "Diluted Shares", key: "diluted_shares", format: "shares" },
];

function formatCell(val: number | null, format: "currency" | "pct" | "shares"): string {
  if (val == null) return "—";
  if (format === "currency") return fmtCurrency(val);
  if (format === "pct") return fmtPct(val);
  if (format === "shares") return `${(val / 1e6).toFixed(0)}M`;
  return String(val);
}

function FinancialTable({
  title,
  rows,
  years,
  data,
  source,
}: {
  title: string;
  rows: Row[];
  years: number[];
  data: AnnualFinancials[];
  source: string;
}) {
  const yearMap = Object.fromEntries(data.map((r) => [r.year, r]));

  return (
    <Card>
      <CardHeader>
        <span className="text-sm font-semibold text-slate-200">{title}</span>
        <span className="source-badge bg-navy-800 text-slate-500">Source: {source}</span>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/5">
              <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-500 w-48">
                Line Item
              </th>
              {years.map((y) => (
                <th key={y} className="tbl-cell text-xs font-medium text-slate-500">
                  FY{y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.key}
                className={cn(
                  "border-b border-white/3 hover:bg-white/2 transition-colors",
                  i % 2 === 0 ? "" : "bg-white/[0.01]"
                )}
              >
                <td className="px-5 py-2 text-slate-400 text-xs">{row.label}</td>
                {years.map((yr) => {
                  const rowData = yearMap[yr];
                  const val = rowData ? (rowData[row.key] as number | null) : null;
                  const isMissing = val == null;
                  return (
                    <td
                      key={yr}
                      className={cn(
                        "tbl-cell",
                        isMissing ? "text-slate-700" : "text-slate-200"
                      )}
                    >
                      {formatCell(val, row.format)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function FinancialsTab() {
  const { historical } = useDCFStore();
  if (!historical) return null;

  const years = historical.financials.map((r) => r.year);
  const source = historical.data_source;

  return (
    <div className="space-y-4 animate-slide-up">
      <FinancialTable title="Income Statement" rows={INCOME_ROWS} years={years} data={historical.financials} source={source} />
      <FinancialTable title="Margins & Ratios" rows={MARGIN_ROWS} years={years} data={historical.financials} source={source} />
      <FinancialTable title="Cash Flow Items" rows={CF_ROWS} years={years} data={historical.financials} source={source} />
      <FinancialTable title="Balance Sheet & Shares" rows={BS_ROWS} years={years} data={historical.financials} source={source} />
    </div>
  );
}
