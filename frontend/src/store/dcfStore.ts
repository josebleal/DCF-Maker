/**
 * Global DCF state store using Zustand.
 * Single source of truth for the entire app session.
 */

import { create } from "zustand";
import type {
  CompanyInfo,
  HistoricalData,
  AssumptionsResponse,
  DCFResult,
  SensitivityResponse,
  ScreeningResult,
  ScenarioKey,
  ScenarioAssumptions,
} from "@/types";

interface DCFStore {
  // ── Company / search ──────────────────────────────────────────────
  company: CompanyInfo | null;
  setCompany: (c: CompanyInfo | null) => void;

  // ── Historical data ───────────────────────────────────────────────
  historical: HistoricalData | null;
  setHistorical: (h: HistoricalData | null) => void;

  // ── Assumptions ───────────────────────────────────────────────────
  assumptions: AssumptionsResponse | null;
  setAssumptions: (a: AssumptionsResponse | null) => void;
  updateScenarioAssumptions: (
    scenario: ScenarioKey,
    updated: ScenarioAssumptions
  ) => void;

  // ── DCF Results ───────────────────────────────────────────────────
  dcfResults: { bear: DCFResult; base: DCFResult; bull: DCFResult } | null;
  setDcfResults: (r: { bear: DCFResult; base: DCFResult; bull: DCFResult } | null) => void;

  // ── Sensitivity ───────────────────────────────────────────────────
  sensitivity: SensitivityResponse | null;
  setSensitivity: (s: SensitivityResponse | null) => void;

  // ── Screening ─────────────────────────────────────────────────────
  screening: ScreeningResult | null;
  setScreening: (s: ScreeningResult | null) => void;

  // ── Active scenario (for display) ────────────────────────────────
  activeScenario: ScenarioKey;
  setActiveScenario: (s: ScenarioKey) => void;

  // ── Loading states ────────────────────────────────────────────────
  loadingHistoricals: boolean;
  setLoadingHistoricals: (v: boolean) => void;
  loadingDCF: boolean;
  setLoadingDCF: (v: boolean) => void;
  loadingSensitivity: boolean;
  setLoadingSensitivity: (v: boolean) => void;

  // ── Reset ─────────────────────────────────────────────────────────
  reset: () => void;
}

export const useDCFStore = create<DCFStore>((set) => ({
  company: null,
  setCompany: (c) => set({ company: c }),

  historical: null,
  setHistorical: (h) => set({ historical: h }),

  assumptions: null,
  setAssumptions: (a) => set({ assumptions: a }),
  updateScenarioAssumptions: (scenario, updated) =>
    set((state) => ({
      assumptions: state.assumptions
        ? { ...state.assumptions, [scenario]: updated }
        : null,
    })),

  dcfResults: null,
  setDcfResults: (r) => set({ dcfResults: r }),

  sensitivity: null,
  setSensitivity: (s) => set({ sensitivity: s }),

  screening: null,
  setScreening: (s) => set({ screening: s }),

  activeScenario: "base",
  setActiveScenario: (s) => set({ activeScenario: s }),

  loadingHistoricals: false,
  setLoadingHistoricals: (v) => set({ loadingHistoricals: v }),
  loadingDCF: false,
  setLoadingDCF: (v) => set({ loadingDCF: v }),
  loadingSensitivity: false,
  setLoadingSensitivity: (v) => set({ loadingSensitivity: v }),

  reset: () =>
    set({
      company: null,
      historical: null,
      assumptions: null,
      dcfResults: null,
      sensitivity: null,
      screening: null,
      activeScenario: "base",
    }),
}));
