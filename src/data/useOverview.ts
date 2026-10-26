import { useEffect, useState } from "react";
import { ALL_WORKSPACES_ID, useWorkspace } from "../app/WorkspaceProvider";
import type {
  HealthBarFixture,
  HealthDistributionFixture,
  KpiFixture,
  SchemaChangeFixture,
  TimeRange,
} from "../fixtures/types";
import { client } from "./client";
import { useCachedQuery } from "./queryCache";
import { useAssets } from "./useAssets";
import { useCases, useIncidents } from "./useIncidents";

export function overrideOpenCasesKpi(
  kpis: KpiFixture[],
  openCasesCount: number,
  dueLabel: string = "1 due today"
): KpiFixture[] {
  return kpis.map((k) =>
    k.label === "Open cases"
      ? {
          ...k,
          value: String(openCasesCount),
          sub: dueLabel,
          trend: "0",
          trendGood: true,
          trendFlat: true,
        }
      : k
  );
}

export function useOverviewKpis(_range: TimeRange = "24h"): KpiFixture[] {
  const { allRows: assets } = useAssets();
  const incidents = useIncidents();
  const cases = useCases();

  const totalAssets = assets.length;
  const healthyCount = assets.filter((a) => a.status === "healthy").length;
  const lateCount = assets.filter((a) => Boolean(a.late)).length;
  const healthyPct =
    totalAssets > 0 ? Math.round((healthyCount / totalAssets) * 100) : 100;
  const slaPct =
    totalAssets > 0 ? Math.round(((totalAssets - lateCount) / totalAssets) * 100) : 100;

  const openIncidents = incidents.filter((i) => i.status !== "Resolved");
  const critCount = openIncidents.filter((i) => i.sev === "Critical").length;
  const highCount = openIncidents.filter((i) => i.sev === "High").length;

  const openCases = cases.filter((c) => c.status !== "Done");
  const openCount = openCases.length;
  const dueLabel =
    openCount > 0
      ? `${openCount} active remediation case${openCount === 1 ? "" : "s"}`
      : "Created on drift, breach, or poor quality";

  return [
    {
      label: "Healthy assets",
      value: `${healthyPct}%`,
      sub: `${healthyCount} of ${totalAssets} monitored`,
      trend: "0%",
      icon: "ph-check-circle",
      trendGood: healthyPct >= 90,
      trendFlat: true,
    },
    {
      label: "Active incidents",
      value: String(openIncidents.length),
      sub: `${critCount} critical · ${highCount} high`,
      trend: "0",
      icon: "ph-warning-octagon",
      trendGood: openIncidents.length === 0,
      trendFlat: true,
    },
    {
      label: "Freshness SLA",
      value: `${slaPct}%`,
      sub: `${lateCount} late refresh${lateCount === 1 ? "" : "es"}`,
      trend: "0%",
      icon: "ph-timer",
      trendGood: lateCount === 0,
      trendFlat: true,
    },
    {
      label: "Open cases",
      value: String(openCount),
      sub: dueLabel,
      trend: "0",
      icon: "ph-kanban",
      trendGood: openCount === 0,
      trendFlat: true,
    },
  ];
}

const LIVE_EMPTY_DISTRIBUTION: HealthDistributionFixture = {
  healthy: 0,
  warning: 0,
  critical: 0,
  total: 0,
};

export type SignalThresholds = {
  degradedBelow: number;
  breachBelow: number;
  stickDropWarn: number;
};

export const DEFAULT_SIGNAL_THRESHOLDS: SignalThresholds = {
  degradedBelow: 90,
  breachBelow: 83,
  stickDropWarn: 5,
};

const THRESHOLDS_STORAGE_KEY = "governly.signalThresholds";
const THRESHOLDS_EVENT = "governly:thresholds-changed";

export function loadSignalThresholds(): SignalThresholds {
  try {
    const raw = window.localStorage.getItem(THRESHOLDS_STORAGE_KEY);
    if (!raw) return DEFAULT_SIGNAL_THRESHOLDS;
    const parsed = JSON.parse(raw) as Partial<SignalThresholds>;
    return {
      degradedBelow:
        typeof parsed.degradedBelow === "number"
          ? parsed.degradedBelow
          : DEFAULT_SIGNAL_THRESHOLDS.degradedBelow,
      breachBelow:
        typeof parsed.breachBelow === "number"
          ? parsed.breachBelow
          : DEFAULT_SIGNAL_THRESHOLDS.breachBelow,
      stickDropWarn:
        typeof parsed.stickDropWarn === "number"
          ? parsed.stickDropWarn
          : DEFAULT_SIGNAL_THRESHOLDS.stickDropWarn,
    };
  } catch {
    return DEFAULT_SIGNAL_THRESHOLDS;
  }
}

export function saveSignalThresholds(next: SignalThresholds): void {
  try {
    window.localStorage.setItem(THRESHOLDS_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(THRESHOLDS_EVENT));
  } catch {
    // ignore storage errors
  }
}

export function evaluateStickStates(
  heights: number[],
  thresholds: SignalThresholds
): Array<"ok" | "warn" | "crit"> {
  const critDrop = thresholds.stickDropWarn * 2;
  return heights.map((h, i) => {
    const prev = i > 0 ? heights[i - 1] : h;
    const drop = prev - h;
    if (h < thresholds.breachBelow || drop >= critDrop) return "crit";
    if (h < thresholds.degradedBelow || drop >= thresholds.stickDropWarn) return "warn";
    return "ok";
  });
}

export function useSignalThresholds(): [
  SignalThresholds,
  (next: SignalThresholds) => void
] {
  const [thresholds, setThresholds] = useState<SignalThresholds>(() =>
    loadSignalThresholds()
  );

  useEffect(() => {
    const sync = () => setThresholds(loadSignalThresholds());
    window.addEventListener(THRESHOLDS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(THRESHOLDS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = (next: SignalThresholds) => {
    setThresholds(next);
    saveSignalThresholds(next);
  };

  return [thresholds, update];
}

const EMPTY_STRIP_BUCKETS: { heights: number[]; axisLabels?: string[] } = {
  heights: [],
  axisLabels: undefined,
};

const EMPTY_SCHEMA_CHANGES: SchemaChangeFixture[] = [];

const DEFAULT_PUBLISH_RUN_INFO = {
  label: "recently",
  shortLabel: "Live telemetry",
  status: "Succeeded",
};

export function useHealthStrip(range: TimeRange = "24h"): {
  heights: number[];
  bars: HealthBarFixture[];
  bucketStates?: Array<"ok" | "warn" | "crit">;
  axisLabels?: string[];
  distribution: HealthDistributionFixture;
} {
  const { workspaceId, refreshTick } = useWorkspace();
  const [thresholds] = useSignalThresholds();
  const { allRows: assets } = useAssets();

  const bucketData = useCachedQuery<{ heights: number[]; axisLabels?: string[] }>(
    workspaceId ? `health-buckets:${workspaceId}:${range}` : null,
    async () => {
      const isAll = workspaceId === ALL_WORKSPACES_ID;
      const rows = isAll
        ? await client.data.PubHealthBucket.select([
            "bucket_index",
            "bucket_start",
            "height_pct",
            "status",
          ])
            .where({ range: { eq: range } })
            .first(1000)
            .execute()
        : await client.data.PubHealthBucket.select([
            "bucket_index",
            "bucket_start",
            "height_pct",
            "status",
          ])
            .where({ workspace_id: { eq: workspaceId! }, range: { eq: range } })
            .execute();
      if (!Array.isArray(rows) || rows.length === 0) {
        return EMPTY_STRIP_BUCKETS;
      }
      let sorted: Array<{ bucket_index: number; bucket_start: unknown; height_pct: number }>;
      if (isAll) {
        const byIdx = new Map<
          number,
          { bucket_index: number; bucket_start: unknown; sumHeight: number; count: number }
        >();
        for (const r of rows) {
          const idx = Number(r.bucket_index);
          const h = Number(r.height_pct);
          const prev = byIdx.get(idx);
          if (!prev) {
            byIdx.set(idx, {
              bucket_index: idx,
              bucket_start: r.bucket_start,
              sumHeight: h,
              count: 1,
            });
          } else {
            prev.sumHeight += h;
            prev.count += 1;
          }
        }
        sorted = [...byIdx.values()]
          .sort((a, b) => a.bucket_index - b.bucket_index)
          .slice(-40)
          .map((b) => ({
            bucket_index: b.bucket_index,
            bucket_start: b.bucket_start,
            height_pct: Number((b.sumHeight / b.count).toFixed(1)),
          }));
      } else {
        sorted = [...rows]
          .sort((a, b) => a.bucket_index - b.bucket_index)
          .slice(-40);
      }
      const heights = sorted.map((r) => Number(r.height_pct));
      const fmtTime = (raw: unknown) => {
        const d = new Date(String(raw ?? ""));
        if (Number.isNaN(d.getTime())) return "";
        return d.toISOString().slice(11, 16) + " UTC";
      };
      const axisLabels =
        sorted.length <= 2
          ? [
              `${sorted.length} run${sorted.length === 1 ? "" : "s"} recorded`,
              "now (" + fmtTime(sorted[sorted.length - 1]?.bucket_start) + ")",
            ]
          : [
              ...[
                0,
                Math.floor((sorted.length - 1) * 0.25),
                Math.floor((sorted.length - 1) * 0.5),
                Math.floor((sorted.length - 1) * 0.75),
              ].map((idx) => fmtTime(sorted[idx]?.bucket_start)),
              "now",
            ];
      return { heights, axisLabels };
    },
    EMPTY_STRIP_BUCKETS,
    refreshTick
  );

  const distribution: HealthDistributionFixture =
    assets.length > 0
      ? {
          healthy: assets.filter((a) => a.status === "healthy").length,
          warning: assets.filter((a) => a.status === "warning").length,
          critical: assets.filter((a) => a.status === "critical").length,
          total: assets.length,
        }
      : LIVE_EMPTY_DISTRIBUTION;

  const heights = bucketData.heights;
  const computedStates = evaluateStickStates(heights, thresholds);

  const bars: HealthBarFixture[] = heights.map((h, i) => ({
    height: h,
    status: computedStates[i] ?? "ok",
  }));

  return {
    heights,
    bars,
    bucketStates: computedStates,
    axisLabels: bucketData.axisLabels,
    distribution,
  };
}

export function useSchemaChanges(limit: number = 10): SchemaChangeFixture[] {
  const { workspaceId, refreshTick } = useWorkspace();

  return useCachedQuery<SchemaChangeFixture[]>(
    workspaceId ? `schema-changes:${workspaceId}:${limit}` : null,
    async () => {
      const baseQuery = client.data.PubSchemaChange.select([
        "asset_key",
        "change_kind",
        "column_name",
        "detail",
        "changed_at",
        "is_breaking",
      ]);
      const rows =
        workspaceId === ALL_WORKSPACES_ID
          ? await baseQuery.first(limit).execute()
          : await baseQuery
              .where({ workspace_id: { eq: workspaceId! } })
              .first(limit)
              .execute();
      if (!Array.isArray(rows) || rows.length === 0) return [];
      return rows.map((r) => ({
        kind: (r.change_kind as SchemaChangeFixture["kind"]) ?? "changed",
        icon:
          r.change_kind === "added"
            ? "ph-plus"
            : r.change_kind === "dropped"
              ? "ph-minus"
              : "ph-pencil-simple",
        col: r.column_name,
        detail: r.detail,
        time: r.changed_at ? String(r.changed_at) : "Recently",
        breaking: Boolean(r.is_breaking),
      }));
    },
    EMPTY_SCHEMA_CHANGES,
    refreshTick
  );
}

export function useLastPublishRun(): { label: string; shortLabel: string; status: string } {
  const { refreshTick } = useWorkspace();

  return useCachedQuery<{ label: string; shortLabel: string; status: string }>(
    "last-publish-run",
    async () => {
      const rows = await client.data.PubPublishRun.select([
        "ended_at",
        "started_at",
        "status",
      ])
        .first(10)
        .execute();
      if (!Array.isArray(rows) || rows.length === 0) return DEFAULT_PUBLISH_RUN_INFO;
      const sorted = [...rows].sort((a, b) =>
        String(b.ended_at ?? b.started_at ?? "").localeCompare(
          String(a.ended_at ?? a.started_at ?? "")
        )
      );
      const latest = sorted[0];
      const tsRaw = String(latest.ended_at ?? latest.started_at ?? "");
      const dt = new Date(tsRaw);
      if (Number.isNaN(dt.getTime())) return DEFAULT_PUBLISH_RUN_INFO;
      const diffMin = Math.max(0, Math.round((Date.now() - dt.getTime()) / 60000));
      const rel =
        diffMin < 1
          ? "just now"
          : diffMin < 60
            ? `${diffMin}m ago (${dt.toISOString().slice(11, 16)} UTC)`
            : `${Math.floor(diffMin / 60)}h ${diffMin % 60}m ago (${dt.toISOString().slice(0, 16).replace("T", " ")} UTC)`;
      const shortRel =
        diffMin < 1
          ? "Synced just now"
          : diffMin < 60
            ? `Synced ${diffMin}m ago`
            : `Synced ${Math.floor(diffMin / 60)}h ago`;
      return { label: rel, shortLabel: shortRel, status: String(latest.status ?? "Succeeded") };
    },
    DEFAULT_PUBLISH_RUN_INFO,
    refreshTick
  );
}

