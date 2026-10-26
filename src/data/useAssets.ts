import { useEffect, useState } from "react";
import { ALL_WORKSPACES_ID, useWorkspace } from "../app/WorkspaceProvider";
import type { AssetFixture } from "../fixtures/types";
import { client } from "./client";
import { toAssetFixture } from "./mappers";
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

export function useAssets(filter: AssetFilter = {}): {
  rows: AssetItem[];
  allRows: AssetItem[];
  domains: string[];
  hasMore: boolean;
  loadMore: () => void;
} {
  const { workspaceId, selectedDomain, refreshTick } = useWorkspace();
  const { slaMap } = useFreshnessSlas();
  const [liveRows, setLiveRows] = useState<AssetItem[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void (async () => {
      try {
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
        const res =
          workspaceId === ALL_WORKSPACES_ID
            ? await baseQuery.first(500).execute()
            : await baseQuery.where({ workspace_id: { eq: workspaceId } }).first(200).execute();
        if (cancelled) return;
        if (Array.isArray(res) && res.length > 0) {
          setLiveRows(
            res.map((r) => ({
              ...toAssetFixture(r),
              id: r.asset_key,
              name: r.asset_key || r.name,
              owner: r.owner_name ?? "Workspace Steward",
              healthScore: r.health_score ?? 100,
              slaMinutes: r.sla_minutes ?? null,
              rowCountLabel: r.row_count_label ?? null,
              qualityPass: r.quality_pass ?? null,
              qualityTotal: r.quality_total ?? null,
              fabricItemUrl: r.fabric_item_url ?? null,
            }))
          );
        } else {
          setLiveRows([]);
        }
      } catch {
        if (!cancelled) setLiveRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, refreshTick]);

  const source: AssetItem[] = liveRows.map((a) => {
    const effSla = resolveEffectiveSlaMinutes(a.id || a.name, a.slaMinutes, slaMap);
    const parsedLag = parseLagLabelToMinutes(a.fresh);
    const hasCustomSla =
      slaMap[a.id || a.name] !== undefined ||
      slaMap[`domain:${(a.id || a.name).split('.')[0]}`] !== undefined ||
      slaMap['*'] !== undefined;
    const isLate =
      hasCustomSla && parsedLag !== null ? parsedLag > effSla : a.late;
    const nextStatus =
      hasCustomSla && parsedLag !== null
        ? isLate
          ? parsedLag > effSla * 2 || a.quality < 75
            ? "critical"
            : "warning"
          : a.quality < 75
          ? "critical"
          : a.quality < 95
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
