import { useEffect, useState } from "react";
import { ALL_WORKSPACES_ID, useWorkspace } from "../app/WorkspaceProvider";
import type {
  LineageNodeFixture,
  QualityRuleFixture,
  RefreshRunFixture,
  SchemaColumnFixture,
  SchemaLogFixture,
} from "../fixtures/types";
import { client } from "./client";
import { useAssets, type AssetItem } from "./useAssets";
import { parseLagLabelToMinutes } from "./useFreshnessSla";

const EMPTY_LIVE_ASSET: AssetItem = {
  id: "no-asset",
  name: "No monitored asset selected",
  type: "Lakehouse table",
  icon: "ph-database",
  domain: "General",
  fresh: "—",
  late: false,
  quality: 100,
  status: "healthy",
  owner: "Unassigned",
  healthScore: 100,
  slaMinutes: 60,
  rowCountLabel: "0",
  qualityPass: 0,
  qualityTotal: 0,
};

export function useAsset(assetKey?: string): AssetItem {
  const { rows } = useAssets();
  return (
    rows.find((a) => a.id === assetKey || a.name === assetKey) ??
    rows[0] ?? {
      ...EMPTY_LIVE_ASSET,
      id: assetKey ?? "no-asset",
      name: assetKey ?? "No monitored asset",
    }
  );
}

export function useAssetFreshness(assetKey?: string): {
  runs: RefreshRunFixture[];
  lagPoints: number[];
  lagLabels: string[];
} {
  const { workspaceId, refreshTick } = useWorkspace();
  const asset = useAsset(assetKey);
  const slaMinutes = asset.slaMinutes ?? 60;
  const [liveRuns, setLiveRuns] = useState<RefreshRunFixture[]>([]);
  const [liveLagPoints, setLiveLagPoints] = useState<number[]>([]);
  const [liveLagLabels, setLiveLagLabels] = useState<string[]>([]);

  useEffect(() => {
    if (!workspaceId || !assetKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const isAll = workspaceId === ALL_WORKSPACES_ID;
        const runsQuery = client.data.PubRefreshRun.select([
          "run_id",
          "completed_at",
          "time_label",
          "lag_label",
          "rows_label",
          "result",
          "result_label",
        ]);
        const lagsQuery = client.data.PubAssetLagPoint.select(["ts", "lag_minutes"]);
        const [rows, lags] = await Promise.all([
          isAll
            ? runsQuery.where({ asset_key: { eq: assetKey } }).execute()
            : runsQuery
                .where({ workspace_id: { eq: workspaceId }, asset_key: { eq: assetKey } })
                .execute(),
          isAll
            ? lagsQuery.where({ asset_key: { eq: assetKey } }).execute()
            : lagsQuery
                .where({ workspace_id: { eq: workspaceId }, asset_key: { eq: assetKey } })
                .execute(),
        ]);
        if (cancelled) return;
        if (Array.isArray(rows) && rows.length > 0) {
          setLiveRuns(
            rows.map((r) => {
              const parsedRunLag = parseLagLabelToMinutes(r.lag_label);
              const isBreach =
                parsedRunLag !== null
                  ? parsedRunLag > slaMinutes
                  : r.result === "breach" ||
                    r.result === "Breach" ||
                    r.result === "warn" ||
                    r.result === "err";
              return {
                time: r.time_label || (r.completed_at ? String(r.completed_at).slice(0, 16).replace("T", " ") : "Recent"),
                lag: r.lag_label,
                rows: r.rows_label,
                result: isBreach ? "breach" : "ok",
                label: isBreach ? "SLA Breach" : "On time",
              };
            })
          );
        } else {
          setLiveRuns([]);
        }
        if (Array.isArray(lags) && lags.length > 0) {
          const sorted = [...lags].sort((a, b) =>
            String(a.ts ?? "").localeCompare(String(b.ts ?? ""))
          );
          setLiveLagPoints(sorted.map((lp) => Number(lp.lag_minutes ?? 0)));
          setLiveLagLabels(
            sorted.slice(-6).map((lp, idx, arr) => {
              if (idx === arr.length - 1) return "latest";
              const raw = String(lp.ts ?? "");
              const d = new Date(raw);
              if (!Number.isNaN(d.getTime())) {
                return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
              }
              return raw;
            })
          );
        } else {
          setLiveLagPoints([]);
          setLiveLagLabels([]);
        }
      } catch {
        if (!cancelled) {
          setLiveRuns([]);
          setLiveLagPoints([]);
          setLiveLagLabels([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, assetKey, slaMinutes, refreshTick]);

  return {
    runs: liveRuns,
    lagPoints: liveLagPoints,
    lagLabels: liveLagLabels,
  };
}

export function useAssetQuality(assetKey?: string): QualityRuleFixture[] {
  const { workspaceId, refreshTick } = useWorkspace();
  const [liveRules, setLiveRules] = useState<QualityRuleFixture[]>([]);

  useEffect(() => {
    if (!workspaceId || !assetKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const isAll = workspaceId === ALL_WORKSPACES_ID;
        const baseQuery = client.data.PubQualityResult.select([
          "monitor_key",
          "rule_name",
          "definition",
          "observed_label",
          "result",
        ]);
        const pubPromise = isAll
          ? baseQuery.where({ asset_key: { eq: assetKey } }).execute()
          : baseQuery
              .where({ workspace_id: { eq: workspaceId }, asset_key: { eq: assetKey } })
              .execute();

        const ruleRepo = (client.data as Record<string, any>).QualityRule;
        const customPromise = ruleRepo
          ? ruleRepo
              .select([
                "rule_name",
                "expression",
                "threshold_pct",
                "last_pass_rate",
                "last_passed",
                "is_active",
                "asset_key",
              ])
              .execute()
              .catch(() => [])
          : Promise.resolve([]);

        const [rows, customRows] = await Promise.all([pubPromise, customPromise]);
        if (cancelled) return;
        const merged = new Map<string, QualityRuleFixture>();

        if (Array.isArray(rows)) {
          for (const r of rows) {
            merged.set(r.rule_name, {
              name: r.rule_name,
              detail: r.definition,
              value: r.observed_label,
              result: (r.result as QualityRuleFixture["result"]) ?? "pass",
            });
          }
        }

        if (Array.isArray(customRows)) {
          const shortKey = assetKey.split(".").pop() ?? assetKey;
          for (const cr of customRows) {
            if (cr.is_active === false) continue;
            const crAsset = String(cr.asset_key ?? "");
            if (crAsset !== assetKey && crAsset !== shortKey && crAsset !== "*") continue;
            if (!merged.has(cr.rule_name)) {
              const rate =
                cr.last_pass_rate !== null && cr.last_pass_rate !== undefined
                  ? Number(cr.last_pass_rate)
                  : null;
              const passed =
                cr.last_passed !== null && cr.last_passed !== undefined
                  ? Boolean(cr.last_passed)
                  : rate !== null
                  ? rate >= Number(cr.threshold_pct ?? 100)
                  : true;
              merged.set(String(cr.rule_name), {
                name: String(cr.rule_name),
                detail: String(cr.expression ?? ""),
                value: rate !== null ? `${rate.toFixed(1)}% pass` : "Pending eval",
                result: passed ? "pass" : "fail",
              });
            }
          }
        }

        setLiveRules(Array.from(merged.values()));
      } catch {
        if (!cancelled) setLiveRules([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, assetKey, refreshTick]);

  return liveRules;
}

export interface FailedRowItem {
  id: string;
  assetKey: string;
  ruleName: string;
  ruleDefinition: string;
  primaryKey: string;
  failedColumn: string;
  failedValue: string;
  rowJson: string;
  likelyCause: string;
  suggestedSolution: string;
  sqlFix: string;
  detectedAt: string;
}

export function useAssetFailedRows(assetKey?: string, includeAllAssets = false): FailedRowItem[] {
  const { workspaceId } = useWorkspace();
  const [liveRows, setLiveRows] = useState<FailedRowItem[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void (async () => {
      try {
        const isAllWs = workspaceId === ALL_WORKSPACES_ID;
        const pubFailedRowRepo = (client.data as Record<string, any>).PubQualityFailedRow;
        if (!pubFailedRowRepo) {
          setLiveRows([]);
          return;
        }
        const baseQuery = pubFailedRowRepo.select([
          "id",
          "asset_key",
          "rule_name",
          "rule_definition",
          "primary_key",
          "failed_column",
          "failed_value",
          "row_json",
          "likely_cause",
          "suggested_solution",
          "sql_fix",
          "detected_at",
        ]);
        let rows: any[] = [];
        if (includeAllAssets || !assetKey) {
          rows = isAllWs
            ? await baseQuery.execute()
            : await baseQuery.where({ workspace_id: { eq: workspaceId } }).execute();
        } else {
          rows = isAllWs
            ? await baseQuery.where({ asset_key: { eq: assetKey } }).execute()
            : await baseQuery
                .where({ workspace_id: { eq: workspaceId }, asset_key: { eq: assetKey } })
                .execute();
        }
        if (cancelled) return;
        if (Array.isArray(rows) && rows.length > 0) {
          setLiveRows(
            rows.map((r) => ({
              id: String(r.id),
              assetKey: String(r.asset_key ?? ""),
              ruleName: String(r.rule_name ?? ""),
              ruleDefinition: String(r.rule_definition ?? ""),
              primaryKey: String(r.primary_key ?? ""),
              failedColumn: String(r.failed_column ?? ""),
              failedValue: String(r.failed_value ?? ""),
              rowJson: String(r.row_json ?? "{}"),
              likelyCause: String(r.likely_cause ?? ""),
              suggestedSolution: String(r.suggested_solution ?? ""),
              sqlFix: String(r.sql_fix ?? ""),
              detectedAt: String(r.detected_at ?? ""),
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
  }, [workspaceId, assetKey, includeAllAssets]);

  return liveRows;
}

export function useAssetSchema(assetKey?: string): {
  columns: SchemaColumnFixture[];
  log: SchemaLogFixture[];
} {
  const { workspaceId } = useWorkspace();
  const [liveColumns, setLiveColumns] = useState<SchemaColumnFixture[]>([]);
  const [liveLog, setLiveLog] = useState<SchemaLogFixture[]>([]);

  useEffect(() => {
    if (!workspaceId || !assetKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const isAll = workspaceId === ALL_WORKSPACES_ID;
        const colsQuery = client.data.PubAssetColumn.select([
          "ordinal",
          "column_name",
          "data_type",
          "is_pk",
          "is_fk",
          "change_tag",
        ]);
        const changesQuery = client.data.PubSchemaChange.select([
          "change_kind",
          "column_name",
          "detail",
          "changed_by",
          "changed_at",
        ]);
        const [colRows, changeRows] = await Promise.all([
          isAll
            ? colsQuery.where({ asset_key: { eq: assetKey } }).execute()
            : colsQuery
                .where({ workspace_id: { eq: workspaceId }, asset_key: { eq: assetKey } })
                .execute(),
          isAll
            ? changesQuery.where({ asset_key: { eq: assetKey } }).execute()
            : changesQuery
                .where({ workspace_id: { eq: workspaceId }, asset_key: { eq: assetKey } })
                .execute(),
        ]);
        if (cancelled) return;
        if (Array.isArray(colRows) && colRows.length > 0) {
          const sorted = [...colRows].sort((a, b) => a.ordinal - b.ordinal);
          setLiveColumns(
            sorted.map((c) => ({
              col: c.column_name,
              type: c.data_type,
              flag: (c.is_pk ? "PK" : c.is_fk ? "FK" : "") as "" | "PK" | "FK",
              note: (c.change_tag === "added" || c.change_tag === "changed" ? c.change_tag : "") as
                | ""
                | "added"
                | "changed",
            }))
          );
        } else {
          setLiveColumns([]);
        }
        if (Array.isArray(changeRows) && changeRows.length > 0) {
          setLiveLog(
            changeRows.map((ch) => ({
              text: `${ch.change_kind} ${ch.column_name} (${ch.detail})`,
              time: ch.changed_at ? String(ch.changed_at).slice(0, 16).replace("T", " ") : "Recent",
              by: ch.changed_by || "spark_profiler",
            }))
          );
        } else {
          setLiveLog([]);
        }
      } catch {
        if (!cancelled) {
          setLiveColumns([]);
          setLiveLog([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, assetKey]);

  return { columns: liveColumns, log: liveLog };
}

export function useAssetLineage(assetKey?: string): {
  upstream: LineageNodeFixture[];
  downstream: LineageNodeFixture[];
} {
  const { workspaceId } = useWorkspace();
  const [liveUpstream, setLiveUpstream] = useState<LineageNodeFixture[]>([]);
  const [liveDownstream, setLiveDownstream] = useState<LineageNodeFixture[]>([]);

  useEffect(() => {
    if (!workspaceId || !assetKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const isAll = workspaceId === ALL_WORKSPACES_ID;
        const baseQuery = client.data.PubLineageEdge.select([
          "upstream_asset_key",
          "upstream_name",
          "upstream_type",
          "downstream_asset_key",
          "downstream_name",
          "downstream_type",
          "direction",
          "hops",
        ]);
        const rows = isAll
          ? await baseQuery.execute()
          : await baseQuery.where({ workspace_id: { eq: workspaceId } }).execute();
        if (cancelled) return;
        if (Array.isArray(rows) && rows.length > 0) {
          setLiveUpstream(
            rows
              .filter((r) => r.downstream_asset_key === assetKey)
              .map((r) => ({ name: r.upstream_name, type: r.upstream_type }))
          );
          setLiveDownstream(
            rows
              .filter((r) => r.upstream_asset_key === assetKey)
              .map((r) => ({ name: r.downstream_name, type: r.downstream_type }))
          );
        } else {
          setLiveUpstream([]);
          setLiveDownstream([]);
        }
      } catch {
        if (!cancelled) {
          setLiveUpstream([]);
          setLiveDownstream([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, assetKey]);

  return { upstream: liveUpstream, downstream: liveDownstream };
}
