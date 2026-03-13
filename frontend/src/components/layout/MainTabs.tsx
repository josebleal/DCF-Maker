"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useDCFStore } from "@/store/dcfStore";
import { OverviewTab } from "@/components/dcf/OverviewTab";
import { FinancialsTab } from "@/components/dcf/FinancialsTab";
import { AssumptionsTab } from "@/components/assumptions/AssumptionsTab";
import { DCFOutputTab } from "@/components/dcf/DCFOutputTab";
import { ScenariosTab } from "@/components/scenarios/ScenariosTab";
import { SensitivitiesTab } from "@/components/sensitivities/SensitivitiesTab";
import { DataQualityTab } from "@/components/dcf/DataQualityTab";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "financials", label: "Financials" },
  { id: "assumptions", label: "Assumptions" },
  { id: "dcf", label: "DCF Output" },
  { id: "scenarios", label: "Scenarios" },
  { id: "sensitivities", label: "Sensitivities" },
  { id: "quality", label: "Data Quality" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function MainTabs() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const { historical, loadingHistoricals } = useDCFStore();

  if (loadingHistoricals) {
    return <LoadingSpinner />;
  }

  if (!historical) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="h-16 w-16 rounded-2xl bg-navy-800 border border-white/5 flex items-center justify-center">
          <span className="text-3xl">📊</span>
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-slate-300">No company loaded</h2>
          <p className="text-sm text-slate-500 mt-1">
            Search for a ticker above and click <strong className="text-slate-400">Load Model</strong> to begin
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Tab bar */}
      <div className="border-b border-white/5 bg-navy-900/30">
        <div className="mx-auto max-w-screen-2xl px-6">
          <div className="flex gap-0 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-all",
                  activeTab === tab.id
                    ? "border-accent text-accent-light"
                    : "border-transparent text-slate-500 hover:text-slate-300 hover:border-white/20"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="mx-auto max-w-screen-2xl px-6 py-6">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "financials" && <FinancialsTab />}
        {activeTab === "assumptions" && <AssumptionsTab />}
        {activeTab === "dcf" && <DCFOutputTab />}
        {activeTab === "scenarios" && <ScenariosTab />}
        {activeTab === "sensitivities" && <SensitivitiesTab />}
        {activeTab === "quality" && <DataQualityTab />}
      </div>
    </div>
  );
}
