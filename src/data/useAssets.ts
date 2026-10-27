import { ALL_WORKSPACES_ID, useWorkspace } from "../app/WorkspaceProvider";
import type { AssetFixture } from "../fixtures/types";
import { client, isHostWorkspace } from "./client";
import { toAssetFixture } from "./mappers";
import { useCachedQuery } from "./queryCache";
import type { AssetFilter } from "./queryKeys";
import { useLiveRuntimeJobs, type LiveRuntimeJobItem } from "./useComputeConfig";
import { isQualityRuleDeleted, isSystemQualityRuleRow } from "./useQualityRules";
import {
  parseLagLabelToMinutes,
  resolveEffectiveSlaMinutes,
  useFreshnessSlas,
} from "./useFreshnessSla";

export interface AssetItem extends AssetFixture {
  workspaceId?: string;
  owner?: string;
  healthScore?: number;
  slaMinutes?: number | null;
  rowCountLabel?: string | null;
  qualityPass?: number | null;
  qualityTotal?: number | null;
  fabricItemUrl?: string | null;
}

const EMPTY_ASSETS: AssetItem[] = [];

export function isRuntimeOnlyAssetType(assetType: string): boolean {
  const lower = String(assetType ?? "").trim().toLowerCase();
  return (
    lower === "spark notebook" ||
    lower === "notebook" ||
    lower === "data pipeline" ||
    lower === "datapipeline" ||
    lower === "pipeline"
  );
}

function mapRawPubAssetToItem(
  r: Record<string, any>,
  pubQList: Array<Record<string, any>>,
  activeUserRules: Array<Record<string, any>>,
): AssetItem {
  const base = toAssetFixture(r as any);
  const aKey = r.asset_key || r.name || base.id;
  const shortName = aKey.includes(".") ? aKey.split(".").pop()! : aKey;
  const assetPubQ = pubQList.filter(
    (q) => q.asset_key === aKey || q.asset_key === shortName,
  );
  const assetUserRules = activeUserRules.filter(
    (ur) =>
      ur.asset_key === aKey || ur.asset_key === shortName || ur.asset_key === "*",
  );
  const isRuntimeJob = isRuntimeOnlyAssetType(base.type);
  const hasRules = !isRuntimeJob && (assetPubQ.length > 0 || assetUserRules.length > 0);

  let computedQuality = -1;
  let qPass = 0;
  let qTotal = 0;

  if (hasRules && assetPubQ.length > 0) {
    qTotal = assetPubQ.length;
    qPass = assetPubQ.filter((q) => q.result === "pass").length;
    const pctSum = assetPubQ.reduce((sum, q) => {
      const m = String(q.observed_label ?? "").match(/(\d+(?:\.\d+)?)\s*%/);
      return sum + (m ? parseFloat(m[1]) : q.result === "pass" ? 100 : 0);
    }, 0);
    computedQuality = Math.round((pctSum / qTotal) * 10) / 10;
  } else if (hasRules && assetUserRules.length > 0) {
    qTotal = assetUserRules.length;
    qPass =
      r.quality_pass && r.quality_total
        ? Math.min(qTotal, Number(r.quality_pass))
        : qTotal;
    computedQuality =
      r.quality_score !== null &&
      r.quality_score !== undefined &&
      Number(r.quality_score) >= 0
        ? Number(r.quality_score)
        : 100;
  }

  return {
    ...base,
    id: aKey,
    name: aKey,
    workspaceId: r.workspace_id,
    quality: hasRules ? computedQuality : -1,
    owner: r.owner_name ?? "Workspace Steward",
    healthScore: r.health_score ?? 100,
    slaMinutes: r.sla_minutes ?? null,
    rowCountLabel: r.row_count_label ?? null,
    qualityPass: hasRules ? qPass : 0,
    qualityTotal: hasRules ? qTotal : 0,
    fabricItemUrl: r.fabric_item_url ?? null,
  };
}

function applyEffectiveSla(
  a: AssetItem,
  slaMap: Record<string, number>,
): AssetItem {
  const effSla = resolveEffectiveSlaMinutes(a.id || a.name, a.slaMinutes, slaMap);
  const parsedLag = parseLagLabelToMinutes(a.fresh);
  const hasCustomSla =
    slaMap[a.id || a.name] !== undefined ||
    slaMap[`domain:${(a.id || a.name).split(".")[0]}`] !== undefined ||
    slaMap["*"] !== undefined;
  const isLate =
    hasCustomSla && parsedLag !== null ? parsedLag > effSla : a.late;
  const hasQualityScore = a.quality >= 0;
  const nextStatus =
    hasCustomSla && parsedLag !== null
      ? isLate
        ? parsedLag > effSla * 2 || (hasQualityScore && a.quality < 75)
          ? "critical"
          : "warning"
        : hasQualityScore && a.quality < 75
          ? "critical"
          : hasQualityScore && a.quality < 95
            ? "warning"
            : "healthy"
      : a.status;
  return {
    ...a,
    slaMinutes: effSla,
    late: isLate,
    status: nextStatus,
  };
}

export function useAssets(filter: AssetFilter = {}): {
  rows: AssetItem[];
  allRows: AssetItem[];
  domains: string[];
  hasMore: boolean;
  loadMore: () => void;
} {
  const { workspaceId, selectedDomain, refreshTick } = useWorkspace();
  const { slaMap } = useFreshnessSlas();

  const liveRows = useCachedQuery<AssetItem[]>(
    workspaceId ? `assets:${workspaceId}` : null,
    async () => {
      const isAll = workspaceId === ALL_WORKSPACES_ID;
      const baseQuery = client.data.PubAsset.select([
        "workspace_id",
        "asset_key",
        "name",
        "asset_type",
        "domain_key",
        "domain_name",
        "owner_name",
        "freshness_label",
        "is_late",
        "quality_score",
        "health_score",
        "status",
        "sla_minutes",
        "row_count_label",
        "quality_pass",
        "quality_total",
        "fabric_item_url",
      ]);
      const baseQRes = client.data.PubQualityResult.select([
        "asset_key",
        "rule_name",
        "observed_label",
        "result",
      ]);
      const baseRules = client.data.QualityRule.select([
        "asset_key",
        "rule_name",
        "rule_type",
        "threshold_pct",
        "is_active",
      ]);
      const [res, qResults, userRules] = await Promise.all([
        isAll
          ? baseQuery.first(500).execute()
          : baseQuery.where({ workspace_id: { eq: workspaceId! } }).first(200).execute(),
        (isAll
          ? baseQRes.first(500).execute()
          : baseQRes.where({ workspace_id: { eq: workspaceId! } }).first(500).execute()
        ).catch(() => []),
        (isAll
          ? baseRules.first(200).execute()
          : baseRules.where({ workspace_id: { eq: workspaceId! } }).first(200).execute()
        ).catch(() => []),
      ]);
      if (!Array.isArray(res) || res.length === 0) return [];
      const activeUserRules = (Array.isArray(userRules) ? userRules : []).filter(
        (ur) => ur.is_active !== false && !isSystemQualityRuleRow(ur) && !isQualityRuleDeleted(undefined, ur.rule_name),
      );
      const pubQList = (Array.isArray(qResults) ? qResults : []).filter(
        (q) => !isSystemQualityRuleRow(q) && !isQualityRuleDeleted(undefined, q.rule_name),
      );

      const validAssets = res.filter((r) => {
        if (isHostWorkspace(r.workspace_id)) return false;
        const aType = String(r.asset_type ?? "").trim().toLowerCase();
        const aKeyLower = String(r.asset_key ?? r.name ?? "").trim().toLowerCase();
        if (aType === "dataagent" || aKeyLower.startsWith("dataagent.")) return false;
        return true;
      });
      if (validAssets.length === 0) return [];

      return validAssets.map((r) =>
        mapRawPubAssetToItem(r, pubQList, activeUserRules),
      );
    },
    EMPTY_ASSETS,
    refreshTick,
  );

  const baseSource: AssetItem[] = liveRows
    .filter((a) => (filter.includeRuntime ? true : !isRuntimeOnlyAssetType(a.type)))
    .map((a) => applyEffectiveSla(a, slaMap));

  const domains = Array.from(new Set(baseSource.map((a) => a.domain).filter(Boolean)));
  const effectiveDomain = filter.domain ?? selectedDomain;
  const filtered = baseSource.filter((a) => {
    if (effectiveDomain && effectiveDomain !== "All" && a.domain !== effectiveDomain)
      return false;
    if (filter.status && filter.status !== "All" && a.status !== filter.status)
      return false;
    if (filter.assetType && filter.assetType !== "All" && a.type !== filter.assetType)
      return false;
    if (
      filter.search &&
      !a.name.toLowerCase().includes(filter.search.trim().toLowerCase()) &&
      !a.domain.toLowerCase().includes(filter.search.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return {
    rows: filtered,
    allRows: baseSource,
    domains,
    hasMore: false,
    loadMore: () => undefined,
  };
}

function mapLiveJobToAssetItem(job: LiveRuntimeJobItem): AssetItem {
  return {
    id: job.asset_key,
    name: job.asset_key,
    workspaceId: job.workspace_id,
    type: job.asset_type,
    icon: job.asset_type === "Spark notebook" ? "ph-notebook" : "ph-flow-arrow",
    domain: job.workspace_name || "Data Engineering",
    fresh: job.freshness_label,
    late: job.is_late,
    quality: -1,
    status: job.status,
    owner: "Workspace Steward",
    healthScore: job.health_score ?? (job.status === "critical" ? 45 : job.status === "warning" ? 72 : 100),
    slaMinutes: job.sla_minutes,
    rowCountLabel: job.asset_type === "Spark notebook" ? "Spark job" : "Pipeline job",
    qualityPass: 0,
    qualityTotal: 0,
    fabricItemUrl: job.fabric_item_url,
  };
}

export function useRuntimeAssets(): {
  rows: AssetItem[];
  liveJobs: LiveRuntimeJobItem[];
} {
  const { refreshTick } = useWorkspace();
  const { slaMap } = useFreshnessSlas();
  const liveJobs = useLiveRuntimeJobs();

  const allSqlRows = useCachedQuery<AssetItem[]>(
    "runtime-assets:all-workspaces",
    async () => {
      const res: Array<Record<string, any>> = await client.data.PubAsset.select([
        "workspace_id",
        "asset_key",
        "name",
        "asset_type",
        "domain_key",
        "domain_name",
        "owner_name",
        "freshness_label",
        "is_late",
        "quality_score",
        "health_score",
        "status",
        "sla_minutes",
        "row_count_label",
        "quality_pass",
        "quality_total",
        "fabric_item_url",
      ])
        .first(500)
        .execute()
        .catch(() => []);
      if (!Array.isArray(res) || res.length === 0) return [];
      return res
        .filter((r) => {
          const aType = String(r.asset_type ?? "").trim().toLowerCase();
          const aKeyLower = String(r.asset_key ?? r.name ?? "").trim().toLowerCase();
          if (aType === "dataagent" || aKeyLower.startsWith("dataagent.")) return false;
          // Exclude Lakehouse container items from runtime view (keep tables, semantic models, pipelines, notebooks)
          if (aType === "lakehouse") return false;
          // For non-runtime items (tables/models), skip the Governly host workspace; for notebooks/pipelines keep ALL workspaces
          if (isHostWorkspace(r.workspace_id) && !isRuntimeOnlyAssetType(aType)) {
            return false;
          }
          return true;
        })
        .map((r) => mapRawPubAssetToItem(r, [], []));
    },
    EMPTY_ASSETS,
    refreshTick,
  );

  const byKey = new Map<string, AssetItem>();
  for (const row of allSqlRows) {
    byKey.set(row.name, applyEffectiveSla(row, slaMap));
  }
  for (const job of liveJobs) {
    const jobItem = applyEffectiveSla(mapLiveJobToAssetItem(job), slaMap);
    // Live Job Scheduler telemetry takes precedence for notebooks and pipelines across all workspaces
    byKey.set(job.asset_key, jobItem);
  }

  return {
    rows: Array.from(byKey.values()),
    liveJobs,
  };
}

