"use client";

import { useDCFStore } from "@/store/dcfStore";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function DataQualityTab() {
  const { historical, screening } = useDCFStore();
  if (!historical) return null;

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Source info */}
      <Card>
        <CardHeader>
          <span className="text-sm font-semibold text-slate-200">Data Source</span>
          <Badge variant="blue">{historical.data_source}</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-slate-500 text-xs mb-1">Ticker</div>
              <div className="font-mono text-slate-200">{historical.ticker}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs mb-1">Currency</div>
              <div className="font-mono text-slate-200">{historical.currency}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs mb-1">Years Available</div>
              <div className="font-mono text-slate-200">{historical.years_available}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs mb-1">Missing Fields</div>
              <div className="font-mono text-slate-200">{historical.missing_fields.length}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      {historical.warnings.length > 0 && (
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-amber-400 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Data Warnings
            </span>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {historical.warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-amber-300/80">
                  <span className="mt-0.5 text-amber-500">⚠</span>
                  {w}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Missing fields */}
      {historical.missing_fields.length > 0 && (
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Info className="h-4 w-4 text-slate-500" /> Missing / Unavailable Fields
            </span>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {historical.missing_fields.map((f) => (
                <span key={f} className="source-badge bg-red-400/10 text-red-400 border border-red-400/20 px-2 py-0.5 rounded-md text-xs">
                  {f}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-3">
              Missing fields default to null in the model. Use the TIKR Import tab or manual override to fill gaps.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Screening checks */}
      {screening && (
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-slate-200">Screening Checks</span>
            <Badge
              variant={
                screening.overall === "pass"
                  ? "positive"
                  : screening.overall === "warning"
                  ? "warning"
                  : "negative"
              }
            >
              {screening.overall.toUpperCase()}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {screening.checks.map((check) => (
                <div
                  key={check.name}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border text-sm",
                    check.passed
                      ? "border-green-400/10 bg-green-400/3"
                      : "border-red-400/10 bg-red-400/3"
                  )}
                >
                  {check.passed ? (
                    <CheckCircle className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1">
                    <div className={cn("font-medium", check.passed ? "text-green-300" : "text-amber-300")}>
                      {check.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{check.note}</div>
                  </div>
                  {check.value != null && (
                    <div className="text-xs font-mono text-slate-400 shrink-0">
                      {check.value}
                      {check.threshold != null && ` / ${check.threshold}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source priority legend */}
      <Card>
        <CardHeader>
          <span className="text-sm font-semibold text-slate-200">Source Priority Logic</span>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            {[
              { priority: "1", label: "User Override / TIKR Import", color: "text-green-400", desc: "Highest priority — overwrites all other sources" },
              { priority: "2", label: "Yahoo Finance (yfinance)", color: "text-blue-400", desc: "Automatic pull — primary source" },
              { priority: "3", label: "Manual Fallback", color: "text-amber-400", desc: "User-entered value when API returns null" },
              { priority: "4", label: "Model Default", color: "text-slate-400", desc: "Industry median used only when flagged as missing" },
            ].map((row) => (
              <div key={row.priority} className="flex items-start gap-3 py-2 border-b border-white/3">
                <div className="h-5 w-5 rounded bg-navy-800 text-xs font-bold text-slate-500 flex items-center justify-center shrink-0">
                  {row.priority}
                </div>
                <div>
                  <div className={cn("font-medium", row.color)}>{row.label}</div>
                  <div className="text-xs text-slate-500">{row.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
