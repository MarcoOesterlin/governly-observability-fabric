import type { TimeRange } from "../fixtures/types";

export interface AssetFilter {
  search?: string;
  domain?: string;
  status?: string;
}

export interface IncidentFilter {
  status?: string;
  severity?: string;
}

export const qk = {
  all: (ws: string) => ["ws", ws] as const,
  overview: (ws: string, range: TimeRange) => ["ws", ws, "overview", range] as const,
  assets: (ws: string, f: AssetFilter = {}) => ["ws", ws, "assets", f] as const,
  asset: (ws: string, key: string) => ["ws", ws, "asset", key] as const,
  incidents: (ws: string, f: IncidentFilter = {}) => ["ws", ws, "incidents", f] as const,
  incident: (ws: string, key: string) => ["ws", ws, "incident", key] as const,
  cases: (ws: string) => ["ws", ws, "cases"] as const,
};
