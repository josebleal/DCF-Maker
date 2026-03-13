"use client";

import { useState } from "react";
import { useDCFStore } from "@/store/dcfStore";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { runAllScenarios } from "@/lib/api";
import { decimalToPct, pctToDecimal, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScenarioKey, YearAssumption, ScenarioAssumptions, FilingMemo, WACCBuild } from "@/types";
import toast from "react-hot-toast";

const SCENARIO_LABELS: Record<ScenarioKey, { label: string; color: string; pill: string }> = {
  bear: { label: "Bear Case", color: "text-red-400",   pill: "bg-red-400/15 text-red-400 border-red-400/30" },
  base: { label: "Base Case", color: "text-blue-400",  pill: "bg-blue-400/15 text-blue-400 border-blue-400/30" },
  bull: { label: "Bull Case", color: "text-green-400", pill: "bg-green-400/15 text-green-400 border-green-400/30" },
};

type AssumptionField = keyof YearAssumption;

// EBITDA-first: ebitda_margin is the primary driver, ebit_margin is derived
const YEAR_FIELDS: { key: AssumptionField; label: string; isPct: boolean; accent?: boolean }[] = [
  { key: "revenue_growth",    label: "Revenue Growth",   isPct: true,  accent: true },
  { key: "ebitda_margin",     label: "EBITDA Margin",    isPct: true,  accent: true },
  { key: "da_pct_revenue",    label: "D&A % Rev",        isPct: true },
  { key: "tax_rate",          label: "Tax Rate",         isPct: true },
  { key: "capex_pct_revenue", label: "Capex % Rev",      isPct: true },
  { key: "dso",               label: "DSO (days)",       isPct: false },
  { key: "dio",               label: "DIO (days)",       isPct: false },
  { key: "dpo",               label: "DPO (days)",       isPct: false },
];

// ── Editable cell ─────────────────────────────────────────────────────────────
interface EditableCellProps {
  value: number | null | undefined;
  isPct: boolean;
  onChange: (newVal: number) => void;
}

function EditableCell({ value, isPct, onChange }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const safeVal = value ?? 0;
  const display = isPct ? `${decimalToPct(safeVal)}%` : safeVal.toFixed(1);

  function startEdit() {
    setDraft(isPct ? decimalToPct(safeVal) : safeVal.toFixed(1));
    setEditing(true);
  }

  function commit() {
    const parsed = parseFloat(draft);
    if (!isNaN(parsed)) onChange(isPct ? pctToDecimal(draft) : parsed);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        step="0.1"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="assumption-input w-20"
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className="assumption-input w-20 text-right hover:bg-navy-700/50 cursor-text"
    >
      {value == null ? <span className="text-slate-600">—</span> : display}
    </button>
  );
}

// ── WACC Build panel ──────────────────────────────────────────────────────────
function WACCBuildPanel({ wb }: { wb: WACCBuild }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs">
      {[
        { label: "Risk-Free Rate",       val: fmtPct(wb.risk_free_rate) },
        { label: "Beta",                 val: wb.beta.toFixed(2) + "×", tag: wb.beta_source },
        { label: "Equity Risk Premium",  val: fmtPct(wb.equity_risk_premium) },
        { label: "Cost of Equity",       val: fmtPct(wb.cost_of_equity),       bold: true },
        { label: "Pre-Tax Cost of Debt", val: fmtPct(wb.pre_tax_cost_of_debt) },
        { label: "After-Tax Cost of Debt", val: fmtPct(wb.after_tax_cost_of_debt) },
        { label: "Equity Weight",        val: fmtPct(wb.equity_weight) },
        { label: "Debt Weight",          val: fmtPct(wb.debt_weight) },
        { label: "WACC",                 val: fmtPct(wb.wacc),                 bold: true },
      ].map((r) => (
        <div key={r.label} className="flex flex-col gap-0.5">
          <span className="text-slate-500">{r.label}</span>
          <span className={cn("font-mono text-slate-200", r.bold && "text-accent-light font-semibold")}>
            {r.val}
            {r.tag && <span className="ml-1 text-[10px] text-slate-600">({r.tag})</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Filing memo rationale panel ───────────────────────────────────────────────
function FilingMemoPanel({ memo }: { memo: FilingMemo }) {
  const [expanded, setExpanded] = useState(false);

  const rationale = [
    { label: "Revenue Growth",    text: memo.revenue_growth_rationale },
    { label: "EBITDA Margin",     text: memo.ebitda_margin_rationale },
    { label: "D&A",               text: memo.da_rationale },
    { label: "Capex",             text: memo.capex_rationale },
    { label: "Working Capital",   text: memo.working_capital_rationale },
    { label: "Tax Rate",          text: memo.tax_rationale },
    { label: "WACC",              text: memo.wacc_rationale },
    { label: "Terminal Growth",   text: memo.terminal_growth_rationale },
    { label: "Exit Multiple",     text: memo.exit_multiple_rationale },
  ];

  return (
    <div className="space-y-4">
      {/* Filing links */}
      <div className="flex flex-wrap gap-3 text-xs">
        {memo.latest_10k_url && (
          <a
            href={memo.latest_10k_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors"
          >
            <span>↗</span>
            <span>SEC 10-K {memo.latest_10k_period && `(${memo.latest_10k_period})`}</span>
          </a>
        )}
        {memo.latest_10q_url && (
          <a
            href={memo.latest_10q_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors"
          >
            <span>↗</span>
            <span>SEC 10-Q {memo.latest_10q_period && `(${memo.latest_10q_period})`}</span>
          </a>
        )}
        {!memo.latest_10k_url && !memo.latest_10q_url && (
          <span className="text-slate-600 italic">SEC filing links not resolved — check edgar.sec.gov directly</span>
        )}
      </div>

      {/* Key risks */}
      {memo.key_risks.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-400 mb-1.5">Key Risks</p>
          <ul className="space-y-1">
            {memo.key_risks.map((r, i) => (
              <li key={i} className="flex gap-2 text-xs text-slate-400">
                <span className="text-red-500 mt-0.5 shrink-0">▸</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Supporting points */}
      {memo.key_supporting_points.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-green-400 mb-1.5">Supporting Points</p>
          <ul className="space-y-1">
            {memo.key_supporting_points.map((r, i) => (
              <li key={i} className="flex gap-2 text-xs text-slate-400">
                <span className="text-green-500 mt-0.5 shrink-0">▸</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-driver rationale (expandable) */}
      <div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
        >
          <span>{expanded ? "▾" : "▸"}</span>
          <span>{expanded ? "Hide" : "Show"} per-driver assumption rationale</span>
        </button>

        {expanded && (
          <div className="mt-3 space-y-3">
            {rationale.map(({ label, text }) => (
              text ? (
                <div key={label} className="border-l-2 border-white/10 pl-3">
                  <p className="text-[11px] font-semibold text-slate-400 mb-0.5">{label}</p>
                  <p className="text-xs text-slate-500 leading-relaxed">{text}</p>
                </div>
              ) : null
            ))}
          </div>
        )}
      </div>

      {/* Data sources footer */}
      <div className="flex flex-wrap gap-2 pt-1">
        {memo.data_sources.map((s, i) => (
          <span key={i} className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-500 font-mono">{s}</span>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function AssumptionsTab() {
  const {
    assumptions,
    historical,
    company,
    updateScenarioAssumptions,
    setDcfResults,
    setLoadingDCF,
  } = useDCFStore();

  const [activeScenario, setActiveScenario] = useState<ScenarioKey>("base");

  if (!assumptions || !historical) return (
    <div className="text-slate-500 text-sm">Load a company to edit assumptions.</div>
  );

  const scenario = assumptions[activeScenario];

  function updateYear(yearIdx: number, field: AssumptionField, value: number) {
    const updated: ScenarioAssumptions = {
      ...scenario,
      years: scenario.years.map((y, i) =>
        i === yearIdx ? { ...y, [field]: value } : y
      ),
    };
    updateScenarioAssumptions(activeScenario, updated);
  }

  function updateScalar(field: keyof ScenarioAssumptions, value: number) {
    updateScenarioAssumptions(activeScenario, { ...scenario, [field]: value } as ScenarioAssumptions);
  }

  async function handleRecalculate() {
    if (!assumptions || !historical) return;
    setLoadingDCF(true);
    try {
      toast.loading("Recalculating…", { id: "dcf" });
      const results = await runAllScenarios({
        ticker: historical.ticker,
        historical,
        assumptions,
        current_price: company?.current_price,
      });
      setDcfResults(results);
      toast.success("DCF updated", { id: "dcf" });
    } catch {
      toast.error("Recalculation failed", { id: "dcf" });
    } finally {
      setLoadingDCF(false);
    }
  }

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Scenario tabs */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["bear", "base", "bull"] as ScenarioKey[]).map((s) => (
            <button
              key={s}
              onClick={() => setActiveScenario(s)}
              className={cn(
                "scenario-pill capitalize transition-all border",
                activeScenario === s
                  ? SCENARIO_LABELS[s].pill
                  : "bg-navy-800 text-slate-500 border-white/5 hover:text-slate-300"
              )}
            >
              {SCENARIO_LABELS[s].label}
            </button>
          ))}
        </div>
        <Button onClick={handleRecalculate} size="sm">↻ Recalculate DCF</Button>
      </div>

      {/* Scenario summary banner */}
      <div className={cn(
        "rounded-lg px-4 py-3 border text-xs",
        activeScenario === "bear" ? "bg-red-400/5 border-red-400/15 text-red-300" :
        activeScenario === "bull" ? "bg-green-400/5 border-green-400/15 text-green-300" :
        "bg-blue-400/5 border-blue-400/15 text-blue-300"
      )}>
        {activeScenario === "bear" && "Bear: Revenue near-flat to slightly negative (max +2%), EBITDA margin compressed ~2.5pp vs base."}
        {activeScenario === "base" && "Base: Revenue grows mid single digits (3–6%), anchored to recency-weighted historical trend. EBITDA margin reflects recent performance."}
        {activeScenario === "bull" && "Bull: Revenue grows mid-high single digits (5–9%); up to double digits if CAGR history supports. Margin expands ~1.5pp vs base."}
      </div>

      {/* Per-year assumptions table */}
      <Card>
        <CardHeader>
          <span className="text-sm font-semibold text-slate-200">Forecast Assumptions — Click any cell to edit</span>
          <span className="text-xs text-slate-500 font-mono">
            FY{scenario.years[0]?.year} – FY{scenario.years[scenario.years.length - 1]?.year}
          </span>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-5 py-2.5 text-left text-xs font-medium text-slate-500 w-36">Assumption</th>
                {scenario.years.map((y) => (
                  <th key={y.year} className="tbl-cell text-xs font-medium text-slate-500">FY{y.year}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {YEAR_FIELDS.map((field, fi) => (
                <tr
                  key={field.key}
                  className={cn(
                    "border-b border-white/3",
                    fi % 2 === 0 ? "" : "bg-white/[0.01]",
                    field.accent && "bg-accent/[0.03]"
                  )}
                >
                  <td className={cn("px-5 py-2 text-xs", field.accent ? "text-slate-200 font-medium" : "text-slate-400")}>
                    {field.label}
                    {field.key === "ebitda_margin" && (
                      <span className="ml-1 text-[9px] text-accent-light font-mono">primary</span>
                    )}
                  </td>
                  {scenario.years.map((y, yi) => (
                    <td key={y.year} className="px-2 py-1.5 text-right">
                      <EditableCell
                        value={y[field.key] as number | null | undefined}
                        isPct={field.isPct}
                        onChange={(v) => updateYear(yi, field.key, v)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Terminal & capital structure */}
      <Card>
        <CardHeader>
          <span className="text-sm font-semibold text-slate-200">Terminal & Capital Structure</span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {[
              { key: "wacc"                as const, label: "WACC",            isPct: true },
              { key: "terminal_growth_rate"as const, label: "Terminal Growth",  isPct: true },
              { key: "exit_ev_ebitda"      as const, label: "Exit EV/EBITDA",   isPct: false },
              { key: "cash"                as const, label: "Cash ($B)",        isPct: false, scale: 1e9 },
              { key: "total_debt"          as const, label: "Total Debt ($B)",  isPct: false, scale: 1e9 },
              { key: "diluted_shares"      as const, label: "Diluted Shares (M)",isPct: false, scale: 1e6 },
            ].map((field) => {
              const raw = scenario[field.key] as number;
              const scale = (field as { scale?: number }).scale ?? 1;
              const display = field.isPct ? (raw * 100).toFixed(2) : (raw / scale).toFixed(2);
              return (
                <div key={field.key} className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">{field.label}</label>
                  <input
                    type="number"
                    step={field.isPct ? "0.1" : "0.01"}
                    defaultValue={display}
                    key={`${activeScenario}-${field.key}`}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) {
                        updateScalar(field.key, field.isPct ? v / 100 : v * scale);
                      }
                    }}
                    className="assumption-input"
                  />
                  {field.isPct && (
                    <span className="text-[10px] text-slate-600 font-mono">Current: {(raw * 100).toFixed(2)}%</span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* WACC Build */}
      {assumptions.wacc_build && (
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-slate-200">WACC Build (CAPM)</span>
            <span className="text-xs text-slate-500">Derived from beta + leverage — override terminal inputs above if needed</span>
          </CardHeader>
          <CardContent>
            <WACCBuildPanel wb={assumptions.wacc_build} />
          </CardContent>
        </Card>
      )}

      {/* Filing Memo / Rationale */}
      {assumptions.filing_memo && (
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-slate-200">Assumption Rationale & SEC Filings</span>
            <span className="text-xs text-slate-500">Data-driven rationale — verify guidance against latest SEC filings</span>
          </CardHeader>
          <CardContent>
            <FilingMemoPanel memo={assumptions.filing_memo} />
          </CardContent>
        </Card>
      )}

      {/* Historical summary */}
      {assumptions.historical_summary && (
        <Card>
          <CardHeader>
            <span className="text-sm font-semibold text-slate-200">Historical Summary</span>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
              {Object.entries(assumptions.historical_summary)
                .filter(([k]) => k !== "note")
                .map(([k, v]) => (
                  <div key={k} className="flex flex-col gap-0.5">
                    <span className="text-xs text-slate-500 capitalize">{k.replace(/_/g, " ")}</span>
                    <span className={cn(
                      "font-mono text-slate-200 text-xs",
                      typeof v === "string" && (v === "accelerating" ? "text-green-400" : v === "decelerating" ? "text-red-400" : ""),
                      typeof v === "boolean" && (v ? "text-green-400" : "text-red-400"),
                    )}>
                      {v === null ? "—" :
                       typeof v === "boolean" ? (v ? "✓" : "✗") :
                       typeof v === "number" ? v.toFixed(1) : String(v)}
                    </span>
                  </div>
                ))}
            </div>
            {assumptions.historical_summary.note && (
              <p className="mt-3 text-xs text-slate-600 italic border-t border-white/5 pt-3">
                {String(assumptions.historical_summary.note)}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
