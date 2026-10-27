import { ALL_WORKSPACES_ID, useWorkspace } from "../app/WorkspaceProvider";
import type {
  LineageNodeFixture,
  QualityRuleFixture,
  RefreshRunFixture,
  SchemaColumnFixture,
  SchemaLogFixture,
} from "../fixtures/types";
import { client } from "./client";
import { useCachedQuery } from "./queryCache";
import {
  fetchSharedPubAssetColumns,
  fetchSharedPubAssetLagPoints,
  fetchSharedPubQualityFailedRows,
  fetchSharedPubQualityResults,
  fetchSharedPubRefreshRuns,
  fetchSharedPubSchemaChanges,
  fetchSharedQualityRules,
} from "./sharedTables";
import { useAssets, useRuntimeAssets, type AssetItem } from "./useAssets";
import { parseLagLabelToMinutes } from "./useFreshnessSla";
import {
  isDriftOrNullTelemetryRow,
  isQualityRuleDeleted,
  isSystemQualityRuleRow,
} from "./useQualityRules";

const EMPTY_LIVE_ASSET: AssetItem = {
  id: "no-asset",
  name: "No monitored asset selected",
  type: "Lakehouse table",
  icon: "ph-database",
  domain: "General",
  fresh: "—",
  late: false,
  quality: -1,
  status: "healthy",
  owner: "Unassigned",
  healthScore: 100,
  slaMinutes: 60,
  rowCountLabel: "0",
  qualityPass: 0,
  qualityTotal: 0,
};

export function useAsset(assetKey?: string): AssetItem {
  const { rows: dataAssets } = useAssets({ includeRuntime: true });
  const { rows: runtimeAssets } = useRuntimeAssets();
  const matched =
    runtimeAssets.find((a) => a.id === assetKey || a.name === assetKey) ??
    dataAssets.find((a) => a.id === assetKey || a.name === assetKey) ??
    dataAssets[0] ??
    runtimeAssets[0];
  return (
    matched ?? {
      ...EMPTY_LIVE_ASSET,
      id: assetKey ?? "no-asset",
      name: assetKey ?? "No monitored asset",
    }
  );
}

const EMPTY_FRESHNESS: {
  runs: RefreshRunFixture[];
  lagPoints: number[];
  lagLabels: string[];
} = {
  runs: [],
  lagPoints: [],
  lagLabels: [],
};

export function useAssetFreshness(assetKey?: string): {
  runs: RefreshRunFixture[];
  lagPoints: number[];
  lagLabels: string[];
} {
  const { workspaceId, refreshTick } = useWorkspace();
  const asset = useAsset(assetKey);
  const { liveJobs } = useRuntimeAssets();
  const slaMinutes = asset.slaMinutes ?? 60;

  const sqlFreshness = useCachedQuery(
    workspaceId && assetKey ? `asset-freshness:${workspaceId}:${assetKey}:${slaMinutes}` : null,
    async () => {
      // Query across all workspaces for asset_key so runtime notebooks/pipelines in excluded or host workspaces resolve runs
      const [rows, lags] = await Promise.all([
        fetchSharedPubRefreshRuns(assetKey!, refreshTick).catch(() => []),
        fetchSharedPubAssetLagPoints(assetKey!, refreshTick).catch(() => []),
      ]);
      const mappedRuns: RefreshRunFixture[] = Array.isArray(rows)
        ? rows.map((r) => {
            const rawRes = String(r.result ?? "").toLowerCase();
            const rawLbl = String(r.result_label ?? "");
            const isHardFail =
              rawRes === "failed" ||
              rawRes === "err" ||
              rawLbl.toLowerCase().includes("fail");
            const parsedRunLag = parseLagLabelToMinutes(r.lag_label);
            const isBreach =
              isHardFail ||
              (parsedRunLag !== null
                ? parsedRunLag > slaMinutes
                : rawRes === "breach" || rawRes === "warn");
            return {
              time:
                r.time_label ||
                (r.completed_at
                  ? String(r.completed_at).slice(0, 16).replace("T", " ")
                  : "Recent"),
              lag: r.lag_label,
              rows: r.rows_label,
              result: (isBreach ? "breach" : "ok") as "ok" | "breach",
              label: isHardFail ? "Run Failed" : isBreach ? "SLA Breach" : "On time",
            };
          })
        : [];

      let lagPoints: number[] = [];
      let lagLabels: string[] = [];
      if (Array.isArray(lags) && lags.length > 0) {
        const sorted = [...lags].sort((a, b) =>
          String(a.ts ?? "").localeCompare(String(b.ts ?? ""))
        );
        lagPoints = sorted.map((lp) => Number(lp.lag_minutes ?? 0));
        lagLabels = sorted.slice(-6).map((lp, idx, arr) => {
          if (idx === arr.length - 1) return "latest";
          const raw = String(lp.ts ?? "");
          const d = new Date(raw);
          if (!Number.isNaN(d.getTime())) {
            return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
          }
          return raw;
        });
      }
      return { runs: mappedRuns, lagPoints, lagLabels };
    },
    EMPTY_FRESHNESS,
    refreshTick
  );

  const liveJob = liveJobs.find((j) => j.asset_key === assetKey || j.name === assetKey);
  if (liveJob && liveJob.runs.length > 0) {
    const derivedLabels = liveJob.runs
      .slice(0, 6)
      .reverse()
      .map((r, idx, arr) => (idx === arr.length - 1 ? "latest" : r.time));
    return {
      runs: liveJob.runs.map((r) => {
        const isHardFail = r.label.toLowerCase().includes("fail");
        const parsedRunLag = parseLagLabelToMinutes(r.lag);
        const isBreach =
          isHardFail ||
          (parsedRunLag !== null ? parsedRunLag > slaMinutes : r.result === "breach");
        return {
          time: r.time,
          lag: r.lag,
          rows: r.rows,
          result: isBreach ? "breach" : "ok",
          label: isHardFail ? "Run Failed" : isBreach ? "SLA Breach" : "On time",
        };
      }),
      lagPoints: liveJob.lag_points.length > 0 ? liveJob.lag_points : sqlFreshness.lagPoints,
      lagLabels: derivedLabels.length > 0 ? derivedLabels : sqlFreshness.lagLabels,
    };
  }

  return sqlFreshness;
}

const EMPTY_QUALITY_RULES: QualityRuleFixture[] = [];

export function useAssetQuality(assetKey?: string): QualityRuleFixture[] {
  const { workspaceId, refreshTick } = useWorkspace();

  return useCachedQuery(
    workspaceId && assetKey ? `asset-quality:${workspaceId}:${assetKey}` : null,
    async () => {
      const [allPubRows, customRows] = await Promise.all([
        fetchSharedPubQualityResults(workspaceId!, refreshTick).catch(() => []),
        fetchSharedQualityRules(refreshTick).catch(() => []),
      ]);
      const rows = (Array.isArray(allPubRows) ? allPubRows : []).filter(
        (r) => r.asset_key === assetKey
      );
      const merged = new Map<string, QualityRuleFixture>();

      if (Array.isArray(rows)) {
        for (const r of rows) {
          if (isSystemQualityRuleRow(r) || isQualityRuleDeleted(undefined, r.rule_name)) continue;
          merged.set(r.rule_name, {
            name: r.rule_name,
            detail: r.definition,
            value: r.observed_label,
            result: (r.result as QualityRuleFixture["result"]) ?? "pass",
          });
        }
      }

      if (Array.isArray(customRows)) {
        const shortKey = assetKey!.split(".").pop() ?? assetKey!;
        for (const rawCr of customRows) {
          const cr = rawCr as Record<string, any>;
          if (
            cr.is_active === false ||
            isSystemQualityRuleRow(cr) ||
            isQualityRuleDeleted(cr.id, cr.rule_name)
          ) {
            continue;
          }
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

      return Array.from(merged.values());
    },
    EMPTY_QUALITY_RULES,
    refreshTick
  );
}

export function useAssetDriftTelemetry(assetKey?: string): QualityRuleFixture[] {
  const { workspaceId, refreshTick } = useWorkspace();

  return useCachedQuery(
    workspaceId && assetKey ? `asset-drift-telemetry:${workspaceId}:${assetKey}` : null,
    async () => {
      const allPubRows = await fetchSharedPubQualityResults(
        workspaceId!,
        refreshTick
      ).catch(() => []);
      const shortKey = assetKey!.split(".").pop() ?? assetKey!;
      const rows = (Array.isArray(allPubRows) ? allPubRows : []).filter(
        (r) =>
          (r.asset_key === assetKey || r.asset_key === shortKey) &&
          isDriftOrNullTelemetryRow(r)
      );
      return rows.map((r) => ({
        name: r.rule_name,
        detail: r.definition,
        value: r.observed_label,
        result: (r.result as QualityRuleFixture["result"]) ?? "pass",
      }));
    },
    EMPTY_QUALITY_RULES,
    refreshTick
  );
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

const EMPTY_FAILED_ROWS: FailedRowItem[] = [];

export function useAssetFailedRows(assetKey?: string, includeAllAssets = false): FailedRowItem[] {
  const { workspaceId, refreshTick } = useWorkspace();

  return useCachedQuery(
    workspaceId
      ? `asset-failed-rows:${workspaceId}:${includeAllAssets ? "*" : assetKey ?? "*"}`
      : null,
    async () => {
      const wsRows = await fetchSharedPubQualityFailedRows(workspaceId!, refreshTick).catch(
        () => []
      );
      const rows =
        includeAllAssets || !assetKey
          ? wsRows
          : wsRows.filter((r: any) => r.asset_key === assetKey);
      if (!Array.isArray(rows) || rows.length === 0) return [];
      return rows
        .filter((r: any) => !String(r.rule_name ?? "").startsWith("Job Run:"))
        .map((r: any) => ({
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
        }));
    },
    EMPTY_FAILED_ROWS,
    refreshTick
  );
}

export interface JobFailureDiagnostic {
  id: string;
  assetKey: string;
  assetType: string;
  runId: string;
  statusLabel: string;
  errorCode: string;
  whyFailed: string;
  possibleSolution: string;
  detectedAt: string;
}

const EMPTY_JOB_DIAGNOSTICS: JobFailureDiagnostic[] = [];

export function useJobFailureDiagnostics(assetKey?: string): JobFailureDiagnostic[] {
  const { workspaceId, refreshTick } = useWorkspace();
  const { liveJobs } = useRuntimeAssets();

  const sqlDiagnostics = useCachedQuery(
    workspaceId ? `job-failure-diagnostics:${workspaceId}:${assetKey ?? "*"}` : null,
    async () => {
      const allRows = await fetchSharedPubQualityFailedRows(
        ALL_WORKSPACES_ID,
        refreshTick
      ).catch(() => []);
      const rows = !assetKey
        ? allRows
        : allRows.filter((r: any) => r.asset_key === assetKey);
      if (!Array.isArray(rows) || rows.length === 0) return [];
      return rows
        .filter((r: any) => String(r.rule_name ?? "").startsWith("Job Run:"))
        .map((r: any) => ({
          id: String(r.id),
          assetKey: String(r.asset_key ?? ""),
          assetType: String(r.rule_definition ?? "Pipeline / Notebook").split("·")[0].trim(),
          runId: String(r.primary_key ?? "latest"),
          statusLabel: String(r.failed_value ?? "Failed"),
          errorCode: String(r.rule_name ?? "").replace(/^Job Run:\s*/i, "") || "JobExecutionFailed",
          whyFailed: String(r.likely_cause ?? ""),
          possibleSolution: String(r.suggested_solution ?? ""),
          detectedAt: String(r.detected_at ?? ""),
        }));
    },
    EMPTY_JOB_DIAGNOSTICS,
    refreshTick
  );

  const byKey = new Map<string, JobFailureDiagnostic>();
  for (const d of sqlDiagnostics) {
    byKey.set(d.assetKey, d);
  }
  for (const job of liveJobs) {
    if (assetKey && job.asset_key !== assetKey && job.name !== assetKey) continue;
    for (const diag of job.diagnostics ?? []) {
      byKey.set(job.asset_key, {
        id: diag.id || `live-job-${job.asset_key}`,
        assetKey: job.asset_key,
        assetType: job.asset_type,
        runId: diag.runId || "latest",
        statusLabel: diag.statusLabel,
        errorCode: diag.errorCode || "JobExecutionFailed",
        whyFailed: diag.whyFailed,
        possibleSolution: diag.possibleSolution,
        detectedAt: diag.detectedAt || "Latest run",
      });
    }
  }
  return Array.from(byKey.values());
}

const EMPTY_SCHEMA: { columns: SchemaColumnFixture[]; log: SchemaLogFixture[] } = {
  columns: [],
  log: [],
};

export function useAssetSchema(assetKey?: string): {
  columns: SchemaColumnFixture[];
  log: SchemaLogFixture[];
} {
  const { workspaceId, refreshTick } = useWorkspace();

  return useCachedQuery(
    workspaceId && assetKey ? `asset-schema:${workspaceId}:${assetKey}` : null,
    async () => {
      const [colRows, allChanges] = await Promise.all([
        fetchSharedPubAssetColumns(assetKey!, workspaceId!, refreshTick).catch(() => []),
        fetchSharedPubSchemaChanges(workspaceId!, refreshTick).catch(() => []),
      ]);
      const changeRows = (Array.isArray(allChanges) ? allChanges : []).filter(
        (ch) => ch.asset_key === assetKey
      );
      const columns: SchemaColumnFixture[] = Array.isArray(colRows)
        ? [...colRows]
            .sort((a, b) => a.ordinal - b.ordinal)
            .map((c) => ({
              col: c.column_name,
              type: c.data_type,
              flag: (c.is_pk ? "PK" : c.is_fk ? "FK" : "") as "" | "PK" | "FK",
              note: (c.change_tag === "added" || c.change_tag === "changed" ? c.change_tag : "") as
                | ""
                | "added"
                | "changed",
            }))
        : [];
      const log: SchemaLogFixture[] = Array.isArray(changeRows)
        ? changeRows.map((ch) => ({
            text: `${ch.change_kind} ${ch.column_name} (${ch.detail})`,
            time: ch.changed_at ? String(ch.changed_at).slice(0, 16).replace("T", " ") : "Recent",
            by: ch.changed_by || "spark_profiler",
          }))
        : [];
      return { columns, log };
    },
    EMPTY_SCHEMA,
    refreshTick
  );
}

const EMPTY_LINEAGE: { upstream: LineageNodeFixture[]; downstream: LineageNodeFixture[] } = {
  upstream: [],
  downstream: [],
};

export function useAssetLineage(assetKey?: string): {
  upstream: LineageNodeFixture[];
  downstream: LineageNodeFixture[];
} {
  const { workspaceId, refreshTick } = useWorkspace();

  return useCachedQuery(
    workspaceId && assetKey ? `asset-lineage:${workspaceId}:${assetKey}` : null,
    async () => {
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
        : await baseQuery.where({ workspace_id: { eq: workspaceId! } }).execute();
      if (!Array.isArray(rows) || rows.length === 0) return EMPTY_LINEAGE;
      return {
        upstream: rows
          .filter((r) => r.downstream_asset_key === assetKey)
          .map((r) => ({ name: r.upstream_name, type: r.upstream_type })),
        downstream: rows
          .filter((r) => r.upstream_asset_key === assetKey)
          .map((r) => ({ name: r.downstream_name, type: r.downstream_type })),
      };
    },
    EMPTY_LINEAGE,
    refreshTick
  );
}
