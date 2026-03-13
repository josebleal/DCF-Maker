"use client";

import { BarChart2 } from "lucide-react";
import { SearchBar } from "@/components/layout/SearchBar";

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-navy-950/90 backdrop-blur-sm">
      <div className="mx-auto max-w-screen-2xl px-6 h-14 flex items-center gap-6">
        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center">
            <BarChart2 className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold text-sm tracking-tight text-slate-100">
            DCF<span className="text-accent"> Maker</span>
          </span>
        </div>

        {/* Search */}
        <div className="flex-1 max-w-xl">
          <SearchBar />
        </div>

        {/* Right slot — could add theme toggle, user info, etc. */}
        <div className="shrink-0 text-xs text-slate-600 font-mono hidden md:block">
          Investment Club · DCF Engine
        </div>
      </div>
    </header>
  );
}
