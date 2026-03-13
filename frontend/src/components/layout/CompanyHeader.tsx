"use client";

import { useDCFStore } from "@/store/dcfStore";
import { Badge } from "@/components/ui/Badge";
import { fmtCurrency } from "@/lib/format";
import { Building2, TrendingUp, TrendingDown } from "lucide-react";

export function CompanyHeader() {
  const { company, screening } = useDCFStore();

  if (!company) return null;

  const overallVariant =
    screening?.overall === "pass"
      ? "positive"
      : screening?.overall === "warning"
      ? "warning"
      : "negative";

  return (
    <div className="border-b border-white/5 bg-navy-900/50">
      <div className="mx-auto max-w-screen-2xl px-6 py-4 flex flex-wrap items-start gap-4">
        {/* Company logo placeholder */}
        <div className="h-12 w-12 rounded-xl bg-navy-800 border border-white/10 flex items-center justify-center shrink-0">
          <Building2 className="h-5 w-5 text-slate-500" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold text-slate-100 leading-tight">
              {company.name}
            </h1>
            <Badge variant="blue">{company.ticker}</Badge>
            <Badge variant="neutral">{company.exchange}</Badge>
            {screening && (
              <Badge variant={overallVariant}>
                {screening.overall === "pass" ? "✓ Screens OK" :
                 screening.overall === "warning" ? "⚠ Review" : "✗ Flags"}
              </Badge>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {company.sector} · {company.industry}
          </div>
          {company.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-2 max-w-2xl">
              {company.description}
            </p>
          )}
        </div>

        {/* Price + Market Cap */}
        <div className="flex gap-6 shrink-0">
          <div className="text-right">
            <div className="text-2xl font-bold font-mono text-slate-100">
              {company.current_price ? `$${company.current_price.toFixed(2)}` : "N/A"}
            </div>
            <div className="text-xs text-slate-500">Current Price</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold font-mono text-slate-300">
              {fmtCurrency(company.market_cap)}
            </div>
            <div className="text-xs text-slate-500">Market Cap</div>
          </div>
        </div>
      </div>
    </div>
  );
}
