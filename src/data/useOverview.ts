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
import { byKpiOrder, toKpiFixture } from "./mappers";

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

const LIVE_EMPTY_KPIS: KpiFixture[] = [
  {
    label: "Healthy assets",
    value: "0%",
    sub: "0 of 0 monitored",
    trend: "0%",
    icon: "ph-check-circle",
    trendGood: true,
    trendFlat: true,
  },
  {
    label: "Active incidents",
    value: "0",
    sub: "0 critical · 0 high",
    trend: "0",
    icon: "ph-warning-octagon",
    trendGood: true,
    trendFlat: true,
  },
  {
    label: "Freshness SLA",
    value: "100%",
    sub: "0 late refreshes",
    trend: "0%",
    icon: "ph-timer",
    trendGood: true,
    trendFlat: true,
  },
  {
    label: "Open cases",
    value: "0",
    sub: "Created on drift, breach, or poor quality",
    trend: "0",
    icon: "ph-kanban",
    trendGood: true,
    trendFlat: true,
  },
];

export function useOverviewKpis(range: TimeRange = "24h"): KpiFixture[] {
  const { workspaceId, refreshTick } = useWorkspace();
  const [liveData, setLiveData] = useState<KpiFixture[]>(LIVE_EMPTY_KPIS);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void (async () => {
      try {
        const isAll = workspaceId === ALL_WORKSPACES_ID;
        if (isAll) {
          const [assets, incidents, cases] = await Promise.all([
            client.data.PubAsset.select(["status", "is_late"]).first(500).execute(),
            client.data.PubIncident.select(["severity", "auto_resolved_at"]).execute(),
            client.data.StewardCase.select(["id", "status", "due_date"]).execute(),
          ]);
          if (cancelled) return;
          const assetList = Array.isArray(assets) ? assets : [];
          const totalAssets = assetList.length;
          const healthyCount = assetList.filter((a) => a.status === "healthy").length;
          const lateCount = assetList.filter((a) => Boolean(a.is_late)).length;
          const healthyPct =
            totalAssets > 0 ? Math.round((healthyCount / totalAssets) * 100) : 100;
          const slaPct =
            totalAssets > 0 ? Math.round(((totalAssets - lateCount) / totalAssets) * 100) : 100;

          const incList = (Array.isArray(incidents) ? incidents : []).filter(
            (i) => !i.auto_resolved_at
          );
          const critCount = incList.filter((i) => i.severity === "Critical").length;
          const highCount = incList.filter((i) => i.severity === "High").length;

          const openCases = Array.isArray(cases)
            ? cases.filter((c) => c.status !== "Closed" && c.status !== "Done")
            : [];
          const openCount = openCases.length;
          const dueLabel =
            openCount > 0
              ? `${openCount} active remediation case${openCount === 1 ? "" : "s"}`
              : "No active cases";

          setLiveData([
            {
              label: "Healthy assets",
              value: `${healthyPct}%`,
              sub: `${healthyCount} of ${totalAssets} monitored`,
              trend: "0%",
              icon: "ph-check-circle",
              trendGood: true,
              trendFlat: true,
            },
            {
              label: "Active incidents",
              value: String(incList.length),
              sub: `${critCount} critical · ${highCount} high`,
              trend: "0",
              icon: "ph-warning-octagon",
              trendGood: incList.length === 0,
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
              trendGood: true,
              trendFlat: true,
            },
          ]);
          return;
        }

        const [rows, cases] = await Promise.all([
          client.data.PubOverviewKpi.select([
            "kpi_key",
            "label",
            "value_label",
            "sub_label",
            "trend_label",
            "trend_direction",
          ])
            .where({ workspace_id: { eq: workspaceId }, range: { eq: range } })
            .execute(),
          client.data.StewardCase.select(["id", "status", "due_date"])
            .where({ workspace_id: { eq: workspaceId } })
            .execute(),
        ]);
        if (cancelled) return;
        const openCases = Array.isArray(cases)
          ? cases.filter((c) => c.status !== "Closed" && c.status !== "Done")
          : [];
        const openCount = openCases.length;
        const dueLabel =
          openCount > 0 ? `${openCount} active remediation case${openCount === 1 ? "" : "s"}` : "No active cases";
        if (!Array.isArray(rows) || rows.length === 0) {
          setLiveData(overrideOpenCasesKpi(LIVE_EMPTY_KPIS, openCount, dueLabel));
          return;
        }
        const mapped = [...rows].sort(byKpiOrder).map(toKpiFixture);
        setLiveData(overrideOpenCasesKpi(mapped, openCount, dueLabel));
      } catch {
        if (!cancelled) setLiveData(LIVE_EMPTY_KPIS);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, range, refreshTick]);

  return liveData;
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

export function useHealthStrip(range: TimeRange = "24h"): {
  heights: number[];
  bars: HealthBarFixture[];
  bucketStates?: Array<"ok" | "warn" | "crit">;
  axisLabels?: string[];
  distribution: HealthDistributionFixture;
} {
  const { workspaceId, refreshTick } = useWorkspace();
  const [thresholds] = useSignalThresholds();
  const [liveHeights, setLiveHeights] = useState<number[]>([]);
  const [liveAxisLabels, setLiveAxisLabels] = useState<string[] | undefined>(undefined);
  const [liveDistribution, setLiveDistribution] = useState<HealthDistributionFixture>(
    LIVE_EMPTY_DISTRIBUTION
  );

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void (async () => {
      try {
        const isAll = workspaceId === ALL_WORKSPACES_ID;
        const [rows, distRows] = await Promise.all([
          isAll
            ? client.data.PubHealthBucket.select([
                "bucket_index",
                "bucket_start",
                "height_pct",
                "status",
              ])
                .where({ range: { eq: range } })
                .first(1000)
                .execute()
            : client.data.PubHealthBucket.select([
                "bucket_index",
                "bucket_start",
                "height_pct",
                "status",
              ])
                .where({ workspace_id: { eq: workspaceId }, range: { eq: range } })
                .execute(),
          isAll
            ? client.data.PubHealthDistribution.select([
                "healthy",
                "warning",
                "critical",
                "total",
              ]).execute()
            : client.data.PubHealthDistribution.select([
                "healthy",
                "warning",
                "critical",
                "total",
              ])
                .where({ workspace_id: { eq: workspaceId } })
                .execute(),
        ]);
        if (cancelled) return;
        if (Array.isArray(rows) && rows.length > 0) {
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
          setLiveHeights(sorted.map((r) => Number(r.height_pct)));
          const fmtTime = (raw: unknown) => {
            const d = new Date(String(raw ?? ""));
            if (Number.isNaN(d.getTime())) return "";
            return d.toISOString().slice(11, 16) + " UTC";
          };
          if (sorted.length <= 2) {
            setLiveAxisLabels([
              `${sorted.length} run${sorted.length === 1 ? "" : "s"} recorded`,
              "now (" + fmtTime(sorted[sorted.length - 1]?.bucket_start) + ")",
            ]);
          } else {
            const pickIndices = [
              0,
              Math.floor((sorted.length - 1) * 0.25),
              Math.floor((sorted.length - 1) * 0.5),
              Math.floor((sorted.length - 1) * 0.75),
            ];
            setLiveAxisLabels([
              ...pickIndices.map((idx) => fmtTime(sorted[idx]?.bucket_start)),
              "now",
            ]);
          }
        } else {
          setLiveHeights([]);
          setLiveAxisLabels(undefined);
        }
        if (Array.isArray(distRows) && distRows.length > 0) {
          const totals = distRows.reduce(
            (acc, d) => ({
              healthy: acc.healthy + Number(d.healthy ?? 0),
              warning: acc.warning + Number(d.warning ?? 0),
              critical: acc.critical + Number(d.critical ?? 0),
              total: acc.total + Number(d.total ?? 0),
            }),
            { healthy: 0, warning: 0, critical: 0, total: 0 }
          );
          setLiveDistribution(totals);
        } else {
          setLiveDistribution(LIVE_EMPTY_DISTRIBUTION);
        }
      } catch {
        if (!cancelled) {
          setLiveHeights([]);
          setLiveAxisLabels(undefined);
          setLiveDistribution(LIVE_EMPTY_DISTRIBUTION);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, range, refreshTick]);

  const heights = liveHeights;
  const distribution = liveDistribution;
  const computedStates = evaluateStickStates(heights, thresholds);

  const bars: HealthBarFixture[] = heights.map((h, i) => ({
    height: h,
    status: computedStates[i] ?? "ok",
  }));

  return {
    heights,
    bars,
    bucketStates: computedStates,
    axisLabels: liveAxisLabels,
    distribution,
  };
}

export function useSchemaChanges(limit: number = 10): SchemaChangeFixture[] {
  const { workspaceId, refreshTick } = useWorkspace();
  const [liveChanges, setLiveChanges] = useState<SchemaChangeFixture[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void (async () => {
      try {
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
                .where({ workspace_id: { eq: workspaceId } })
                .first(limit)
                .execute();
        if (cancelled) return;
        if (Array.isArray(rows) && rows.length > 0) {
          setLiveChanges(
            rows.map((r) => ({
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
            }))
          );
        } else {
          setLiveChanges([]);
        }
      } catch {
        if (!cancelled) setLiveChanges([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, limit, refreshTick]);

  return liveChanges;
}

export function useLastPublishRun(): { label: string; shortLabel: string; status: string } {
  const { refreshTick } = useWorkspace();
  const [info, setInfo] = useState<{ label: string; shortLabel: string; status: string }>({
    label: "recently",
    shortLabel: "Live telemetry",
    status: "Succeeded",
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await client.data.PubPublishRun.select([
          "ended_at",
          "started_at",
          "status",
        ])
          .first(10)
          .execute();
        if (cancelled || !Array.isArray(rows) || rows.length === 0) return;
        const sorted = [...rows].sort((a, b) =>
          String(b.ended_at ?? b.started_at ?? "").localeCompare(
            String(a.ended_at ?? a.started_at ?? "")
          )
        );
        const latest = sorted[0];
        const tsRaw = String(latest.ended_at ?? latest.started_at ?? "");
        const dt = new Date(tsRaw);
        if (!Number.isNaN(dt.getTime())) {
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
          setInfo({ label: rel, shortLabel: shortRel, status: String(latest.status ?? "Succeeded") });
        }
      } catch {
        // ignore offline/test errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  return info;
}

