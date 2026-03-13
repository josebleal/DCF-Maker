"use client";

import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { searchTicker, fetchHistoricals, generateAssumptions, runAllScenarios, screenCompany } from "@/lib/api";
import { useDCFStore } from "@/store/dcfStore";
import { cn } from "@/lib/utils";
import type { CompanyInfo } from "@/types";
import toast from "react-hot-toast";
import { fmtCurrency } from "@/lib/format";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanyInfo[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    setCompany,
    setHistorical,
    setAssumptions,
    setDcfResults,
    setScreening,
    setLoadingHistoricals,
    setLoadingDCF,
    company: selectedCompany,
    reset,
  } = useDCFStore();

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchTicker(query.trim());
        setResults(res);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [query]);

  async function handleSelect(co: CompanyInfo) {
    setOpen(false);
    setQuery(co.ticker);
    setCompany(co);
  }

  async function handleLoadHistoricals() {
    if (!selectedCompany) return;
    setLoadingHistoricals(true);
    try {
      toast.loading("Fetching historicals…", { id: "hist" });
      const hist = await fetchHistoricals(selectedCompany.ticker);
      setHistorical(hist);

      toast.loading("Generating assumptions…", { id: "hist" });
      const assump = await generateAssumptions(hist, selectedCompany);
      setAssumptions(assump);

      toast.loading("Running DCF…", { id: "hist" });
      const results = await runAllScenarios({
        ticker: selectedCompany.ticker,
        historical: hist,
        assumptions: assump,
        current_price: selectedCompany.current_price,
      });
      setDcfResults(results);

      const screen = await screenCompany(hist);
      setScreening(screen);

      toast.success("Model built successfully", { id: "hist" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load data";
      toast.error(msg, { id: "hist" });
    } finally {
      setLoadingHistoricals(false);
    }
  }

  return (
    <div className="relative w-full">
      <div className="flex gap-2">
        {/* Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Search ticker or company (e.g. AAPL, Microsoft)"
            className={cn(
              "w-full pl-9 pr-8 py-2 text-sm rounded-lg bg-navy-800 border border-white/10",
              "text-slate-200 placeholder:text-slate-600",
              "focus:outline-none focus:border-accent/40 focus:ring-1 focus:ring-accent/20",
              "transition-all"
            )}
          />
          {query && (
            <button
              onClick={() => { setQuery(""); reset(); setResults([]); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Load historicals button */}
        {selectedCompany && (
          <button
            onClick={handleLoadHistoricals}
            className="shrink-0 px-3 py-2 text-xs font-medium rounded-lg bg-accent hover:bg-accent-dark text-white transition-colors"
          >
            Load Model
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 w-full z-50 bg-navy-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {results.map((co) => (
            <button
              key={co.ticker}
              onClick={() => handleSelect(co)}
              className="w-full px-4 py-2.5 flex items-start gap-3 hover:bg-white/5 transition-colors text-left"
            >
              <div className="h-8 w-8 rounded-lg bg-navy-800 border border-white/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-accent-light">{co.ticker.slice(0, 2)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-100">{co.ticker}</span>
                  <span className="text-xs text-slate-500">{co.exchange}</span>
                </div>
                <div className="text-xs text-slate-400 truncate">{co.name}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-mono text-slate-200">
                  {co.current_price ? `$${co.current_price.toFixed(2)}` : "—"}
                </div>
                <div className="text-xs text-slate-500">
                  {co.market_cap ? fmtCurrency(co.market_cap) : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
