/**
 * Typed API client — all backend calls go through here.
 * Base URL proxied through Next.js rewrites to FastAPI.
 */

import axios from "axios";
import type {
  CompanyInfo,
  HistoricalData,
  AssumptionsResponse,
  DCFResult,
  SensitivityResponse,
  ScreeningResult,
  ScenarioAssumptions,
} from "@/types";

const api = axios.create({ baseURL: "/api" });

export async function searchTicker(q: string): Promise<CompanyInfo[]> {
  const res = await api.get("/search", { params: { q } });
  return res.data.results;
}

export async function fetchHistoricals(ticker: string): Promise<HistoricalData> {
  const res = await api.get(`/historicals/${ticker}`);
  return res.data;
}

export async function generateAssumptions(
  historical: HistoricalData,
  company?: CompanyInfo | null,
): Promise<AssumptionsResponse> {
  // Pass beta and market_cap for WACC derivation from fundamentals
  const res = await api.post("/assumptions", {
    historical,
    beta: company?.beta ?? null,
    market_cap: company?.market_cap ?? null,
  });
  return res.data;
}

export async function runDCF(payload: {
  ticker: string;
  historical: HistoricalData;
  assumptions: ScenarioAssumptions;
  current_price?: number | null;
}): Promise<DCFResult> {
  const res = await api.post("/dcf", payload);
  return res.data;
}

export async function runAllScenarios(payload: {
  ticker: string;
  historical: HistoricalData;
  assumptions: AssumptionsResponse;
  current_price?: number | null;
}): Promise<{ bear: DCFResult; base: DCFResult; bull: DCFResult }> {
  const res = await api.post("/dcf/all-scenarios", payload);
  return res.data;
}

export async function runSensitivity(payload: {
  ticker: string;
  historical: HistoricalData;
  base_assumptions: ScenarioAssumptions;
  current_price?: number | null;
}): Promise<SensitivityResponse> {
  const res = await api.post("/sensitivity", payload);
  return res.data;
}

export async function screenCompany(
  historical: HistoricalData,
): Promise<ScreeningResult> {
  const res = await api.post("/screen", historical);
  return res.data;
}

export async function getFilingMemo(ticker: string): Promise<{
  ticker: string;
  cik: number | null;
  entity_name: string | null;
  latest_10k_url: string | null;
  latest_10k_period: string | null;
  latest_10q_url: string | null;
  latest_10q_period: string | null;
  guidance_snippets_10k: string[];
  guidance_snippets_10q: string[];
  mda_preview_10q: string;
}> {
  const res = await api.get(`/filing-memo/${ticker}`);
  return res.data;
}
