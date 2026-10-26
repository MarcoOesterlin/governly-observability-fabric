import { ALL_WORKSPACES_ID, useWorkspace } from "../app/WorkspaceProvider";
import type { AssetFixture } from "../fixtures/types";
import { client } from "./client";
import { toAssetFixture } from "./mappers";
import { useCachedQuery } from "./queryCache";
import type { AssetFilter } from "./queryKeys";
import {
  parseLagLabelToMinutes,
  resolveEffectiveSlaMinutes,
  useFreshnessSlas,
} from "./useFreshnessSla";

export interface AssetItem extends AssetFixture {
  owner?: string;
  healthScore?: number;
  slaMinutes?: number | null;
  rowCountLabel?: string | null;
  qualityPass?: number | null;
  qualityTotal?: number | null;
  fabricItemUrl?: string | null;
}

const EMPTY_ASSETS: AssetItem[] = [];

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
        (ur) => ur.is_active !== false && ur.rule_type !== "freshness_sla"
      );
      const pubQList = Array.isArray(qResults) ? qResults : [];

      return res.map((r) => {
        const base = toAssetFixture(r);
        const aKey = r.asset_key || r.name || base.id;
        const shortName = aKey.includes(".") ? aKey.split(".").pop()! : aKey;
        const assetPubQ = pubQList.filter(
          (q) => q.asset_key === aKey || q.asset_key === shortName
        );
        const assetUserRules = activeUserRules.filter(
          (ur) =>
            ur.asset_key === aKey || ur.asset_key === shortName || ur.asset_key === "*"
        );
        const hasRules = assetPubQ.length > 0 || assetUserRules.length > 0;

        let computedQuality = -1;
        let qPass = 0;
        let qTotal = 0;

        if (assetPubQ.length > 0) {
          qTotal = assetPubQ.length;
          qPass = assetPubQ.filter((q) => q.result === "pass").length;
          const pctSum = assetPubQ.reduce((sum, q) => {
            const m = String(q.observed_label ?? "").match(/(\d+(?:\.\d+)?)\s*%/);
            return sum + (m ? parseFloat(m[1]) : q.result === "pass" ? 100 : 0);
          }, 0);
          computedQuality = Math.round((pctSum / qTotal) * 10) / 10;
        } else if (assetUserRules.length > 0) {
          qTotal = assetUserRules.length;
          qPass = r.quality_pass && r.quality_total ? Math.min(qTotal, Number(r.quality_pass)) : qTotal;
          computedQuality =
            r.quality_score !== null && r.quality_score !== undefined && Number(r.quality_score) >= 0
              ? Number(r.quality_score)
              : 100;
        }

        return {
          ...base,
          id: aKey,
          name: aKey,
          quality: hasRules ? computedQuality : -1,
          owner: r.owner_name ?? "Workspace Steward",
          healthScore: r.health_score ?? 100,
          slaMinutes: r.sla_minutes ?? null,
          rowCountLabel: r.row_count_label ?? null,
          qualityPass: hasRules ? qPass : 0,
          qualityTotal: hasRules ? qTotal : 0,
          fabricItemUrl: r.fabric_item_url ?? null,
        };
      });
    },
    EMPTY_ASSETS,
    refreshTick
  );

  const source: AssetItem[] = liveRows.map((a) => {
    const effSla = resolveEffectiveSlaMinutes(a.id || a.name, a.slaMinutes, slaMap);
    const parsedLag = parseLagLabelToMinutes(a.fresh);
    const hasCustomSla =
      slaMap[a.id || a.name] !== undefined ||
      slaMap[`domain:${(a.id || a.name).split('.')[0]}`] !== undefined ||
      slaMap['*'] !== undefined;
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
  });
  const domains = Array.from(new Set(source.map((a) => a.domain).filter(Boolean)));
  const effectiveDomain = filter.domain ?? selectedDomain;
  const filtered = source.filter((a) => {
    if (effectiveDomain && effectiveDomain !== "All" && a.domain !== effectiveDomain) return false;
    if (filter.status && filter.status !== "All" && a.status !== filter.status) return false;
    if (
      filter.search &&
      !a.name.toLowerCase().includes(filter.search.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  return {
    rows: filtered,
    allRows: source,
    domains,
    hasMore: false,
    loadMore: () => undefined,
  };
}
