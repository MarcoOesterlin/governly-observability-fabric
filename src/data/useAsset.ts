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
  const slaMinutes = asset.slaMinutes ?? 60;

  return useCachedQuery(
    workspaceId && assetKey ? `asset-freshness:${workspaceId}:${assetKey}:${slaMinutes}` : null,
    async () => {
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
        (isAll
          ? runsQuery.where({ asset_key: { eq: assetKey! } }).execute()
          : runsQuery
              .where({ workspace_id: { eq: workspaceId! }, asset_key: { eq: assetKey! } })
              .execute()
        ).catch(() => []),
        (isAll
          ? lagsQuery.where({ asset_key: { eq: assetKey! } }).execute()
          : lagsQuery
              .where({ workspace_id: { eq: workspaceId! }, asset_key: { eq: assetKey! } })
              .execute()
        ).catch(() => []),
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
}

const EMPTY_QUALITY_RULES: QualityRuleFixture[] = [];

export function useAssetQuality(assetKey?: string): QualityRuleFixture[] {
  const { workspaceId, refreshTick } = useWorkspace();

  return useCachedQuery(
    workspaceId && assetKey ? `asset-quality:${workspaceId}:${assetKey}` : null,
    async () => {
      const isAll = workspaceId === ALL_WORKSPACES_ID;
      const baseQuery = client.data.PubQualityResult.select([
        "monitor_key",
        "rule_name",
        "definition",
        "observed_label",
        "result",
      ]);
      const pubPromise = (
        isAll
          ? baseQuery.where({ asset_key: { eq: assetKey! } }).execute()
          : baseQuery
              .where({ workspace_id: { eq: workspaceId! }, asset_key: { eq: assetKey! } })
              .execute()
      ).catch(() => []);

      const ruleRepo = (client.data as Record<string, any>).QualityRule;
      const customPromise = ruleRepo
        ? ruleRepo
            .select([
              "rule_name",
              "rule_type",
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
        const shortKey = assetKey!.split(".").pop() ?? assetKey!;
        for (const cr of customRows) {
          if (cr.is_active === false || cr.rule_type === "freshness_sla") continue;
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
      const isAllWs = workspaceId === ALL_WORKSPACES_ID;
      const pubFailedRowRepo = (client.data as Record<string, any>).PubQualityFailedRow;
      if (!pubFailedRowRepo) return [];
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
      const rows =
        includeAllAssets || !assetKey
          ? isAllWs
            ? await baseQuery.execute()
            : await baseQuery.where({ workspace_id: { eq: workspaceId! } }).execute()
          : isAllWs
          ? await baseQuery.where({ asset_key: { eq: assetKey } }).execute()
          : await baseQuery
              .where({ workspace_id: { eq: workspaceId! }, asset_key: { eq: assetKey } })
              .execute();
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

  return useCachedQuery(
    workspaceId ? `job-failure-diagnostics:${workspaceId}:${assetKey ?? "*"}` : null,
    async () => {
      const isAllWs = workspaceId === ALL_WORKSPACES_ID;
      const pubFailedRowRepo = (client.data as Record<string, any>).PubQualityFailedRow;
      if (!pubFailedRowRepo) return [];
      const baseQuery = pubFailedRowRepo.select([
        "id",
        "asset_key",
        "rule_name",
        "rule_definition",
        "primary_key",
        "failed_value",
        "likely_cause",
        "suggested_solution",
        "detected_at",
      ]);
      const rows = !assetKey
        ? isAllWs
          ? await baseQuery.execute()
          : await baseQuery.where({ workspace_id: { eq: workspaceId! } }).execute()
        : isAllWs
          ? await baseQuery.where({ asset_key: { eq: assetKey } }).execute()
          : await baseQuery
              .where({ workspace_id: { eq: workspaceId! }, asset_key: { eq: assetKey } })
              .execute();
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
        (isAll
          ? colsQuery.where({ asset_key: { eq: assetKey! } }).execute()
          : colsQuery
              .where({ workspace_id: { eq: workspaceId! }, asset_key: { eq: assetKey! } })
              .execute()
        ).catch(() => []),
        (isAll
          ? changesQuery.where({ asset_key: { eq: assetKey! } }).execute()
          : changesQuery
              .where({ workspace_id: { eq: workspaceId! }, asset_key: { eq: assetKey! } })
              .execute()
        ).catch(() => []),
      ]);
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
