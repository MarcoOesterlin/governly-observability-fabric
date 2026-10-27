import { ALL_WORKSPACES_ID } from "../app/WorkspaceProvider";
import { client } from "./client";
import { fetchSharedQuery, SESSION_CACHE_TTL_MS } from "./queryCache";

export function fetchSharedPubWorkspaces(refreshTick = 0, force = false) {
  return fetchSharedQuery(
    "raw:pub-workspaces",
    async () => {
      const rows = await client.data.PubWorkspace.select([
        "workspace_id",
        "display_name",
        "capacity_sku",
        "is_monitored",
      ]).execute();
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
}

export async function fetchSharedPubAssets(
  workspaceId: string,
  refreshTick = 0,
  force = false
) {
  const allRows = await fetchSharedQuery(
    "raw:pub-assets:all",
    async () => {
      const rows = await client.data.PubAsset.select([
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
        .execute();
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
  if (!workspaceId || workspaceId === ALL_WORKSPACES_ID) return allRows;
  return allRows.filter((r) => r.workspace_id === workspaceId);
}

export async function fetchSharedPubQualityResults(
  workspaceId: string,
  refreshTick = 0,
  force = false
) {
  const allRows = await fetchSharedQuery(
    "raw:pub-quality-results:all",
    async () => {
      const rows = await client.data.PubQualityResult.select([
        "workspace_id",
        "asset_key",
        "monitor_key",
        "rule_name",
        "definition",
        "observed_label",
        "result",
      ])
        .first(500)
        .execute();
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
  if (!workspaceId || workspaceId === ALL_WORKSPACES_ID) return allRows;
  return allRows.filter((r) => r.workspace_id === workspaceId);
}

export function fetchSharedQualityRules(refreshTick = 0, force = false) {
  return fetchSharedQuery(
    "raw:quality-rules:all",
    async () => {
      const rows = await client.data.QualityRule.select([
        "id",
        "workspace_id",
        "asset_key",
        "rule_name",
        "rule_type",
        "expression",
        "threshold_pct",
        "severity",
        "is_active",
        "created_by",
        "created_at",
        "updated_at",
      ])
        .first(300)
        .execute();
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
}

export async function fetchSharedPubIncidents(
  workspaceId: string,
  refreshTick = 0,
  force = false
) {
  const allRows = await fetchSharedQuery(
    "raw:pub-incidents:all",
    async () => {
      const rows = await client.data.PubIncident.select([
        "workspace_id",
        "incident_key",
        "severity",
        "title",
        "asset_key",
        "monitor_type",
        "monitor_label",
        "summary",
        "sla_target_label",
        "observed_label",
        "domain_key",
        "detected_at",
        "auto_resolved_at",
      ])
        .execute()
        .catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
  if (!workspaceId || workspaceId === ALL_WORKSPACES_ID) return allRows;
  return allRows.filter((r) => r.workspace_id === workspaceId);
}

export async function fetchSharedIncidentStates(
  workspaceId: string,
  refreshTick = 0,
  force = false
) {
  const allRows = await fetchSharedQuery(
    "raw:incident-states:all",
    async () => {
      const rows = await client.data.IncidentState.select([
        "workspace_id",
        "incident_key",
        "status",
        "assignee_name",
      ])
        .execute()
        .catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
  if (!workspaceId || workspaceId === ALL_WORKSPACES_ID) return allRows;
  return allRows.filter((r) => r.workspace_id === workspaceId);
}

export async function fetchSharedStewardCases(
  workspaceId: string,
  refreshTick = 0,
  force = false
) {
  const allRows = await fetchSharedQuery(
    "raw:steward-cases:all",
    async () => {
      const rows = await client.data.StewardCase.select([
        "id",
        "workspace_id",
        "case_key",
        "title",
        "domain_key",
        "priority",
        "status",
        "owner_name",
        "due_date",
      ])
        .execute()
        .catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
  if (!workspaceId || workspaceId === ALL_WORKSPACES_ID) return allRows;
  return allRows.filter((r) => r.workspace_id === workspaceId);
}

export function fetchSharedCaseIncidentLinks(refreshTick = 0, force = false) {
  return fetchSharedQuery(
    "raw:case-incident-links",
    async () => {
      const rows = await client.data.CaseIncidentLink.select(["case.id", "incident_key"])
        .execute()
        .catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
}

export function fetchSharedPubEntraUsers(refreshTick = 0, force = false) {
  return fetchSharedQuery(
    "raw:pub-entra-users",
    async () => {
      const rows = await client.data.PubEntraUser.select([
        "object_id",
        "upn",
        "display_name",
        "job_title",
        "department",
        "is_synthetic",
      ])
        .first(200)
        .execute()
        .catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
}

export async function fetchSharedPubHealthBuckets(
  workspaceId: string,
  range: string,
  refreshTick = 0,
  force = false
) {
  const allRows = await fetchSharedQuery(
    "raw:pub-health-buckets:all",
    async () => {
      const rows = await client.data.PubHealthBucket.select([
        "workspace_id",
        "range",
        "bucket_index",
        "bucket_start",
        "height_pct",
        "status",
      ])
        .first(1000)
        .execute()
        .catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
  return allRows.filter(
    (r) =>
      r.range === range &&
      (!workspaceId || workspaceId === ALL_WORKSPACES_ID || r.workspace_id === workspaceId)
  );
}

export async function fetchSharedPubSchemaChanges(
  workspaceId: string,
  refreshTick = 0,
  force = false
) {
  const allRows = await fetchSharedQuery(
    "raw:pub-schema-changes:all",
    async () => {
      const rows = await client.data.PubSchemaChange.select([
        "workspace_id",
        "asset_key",
        "change_kind",
        "column_name",
        "detail",
        "changed_by",
        "changed_at",
        "is_breaking",
      ])
        .first(500)
        .execute()
        .catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
  if (!workspaceId || workspaceId === ALL_WORKSPACES_ID) return allRows;
  return allRows.filter((r) => r.workspace_id === workspaceId);
}

export function fetchSharedPubPublishRuns(refreshTick = 0, force = false) {
  return fetchSharedQuery(
    "raw:pub-publish-runs:all",
    async () => {
      const rows = await client.data.PubPublishRun.select([
        "ended_at",
        "started_at",
        "status",
      ])
        .first(500)
        .execute()
        .catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
}

export async function fetchSharedPubQualityFailedRows(
  workspaceId: string,
  refreshTick = 0,
  force = false
) {
  const allRows = await fetchSharedQuery(
    "raw:pub-quality-failed-rows:all",
    async () => {
      const repo = (client.data as Record<string, any>).PubQualityFailedRow;
      if (!repo) return [];
      const rows = await repo
        .select([
          "id",
          "workspace_id",
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
        ])
        .first(500)
        .execute()
        .catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
  if (!workspaceId || workspaceId === ALL_WORKSPACES_ID) return allRows;
  return allRows.filter((r: any) => !r.workspace_id || r.workspace_id === workspaceId);
}

export async function fetchSharedPubRefreshRuns(
  assetKey?: string,
  refreshTick = 0,
  force = false
) {
  const allRows = await fetchSharedQuery(
    "raw:pub-refresh-runs:all",
    async () => {
      const rows = await client.data.PubRefreshRun.select([
        "workspace_id",
        "asset_key",
        "run_id",
        "completed_at",
        "time_label",
        "lag_label",
        "rows_label",
        "result",
        "result_label",
      ])
        .first(1000)
        .execute()
        .catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
  if (!assetKey) return allRows;
  return allRows.filter((r) => r.asset_key === assetKey);
}

export async function fetchSharedPubAssetLagPoints(
  assetKey?: string,
  refreshTick = 0,
  force = false
) {
  const allRows = await fetchSharedQuery(
    "raw:pub-asset-lag-points:all",
    async () => {
      const rows = await client.data.PubAssetLagPoint.select([
        "workspace_id",
        "asset_key",
        "ts",
        "lag_minutes",
      ])
        .first(1000)
        .execute()
        .catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
  if (!assetKey) return allRows;
  return allRows.filter((r) => r.asset_key === assetKey);
}

export async function fetchSharedPubAssetColumns(
  assetKey?: string,
  workspaceId?: string,
  refreshTick = 0,
  force = false
) {
  const allRows = await fetchSharedQuery(
    "raw:pub-asset-columns:all",
    async () => {
      const rows = await client.data.PubAssetColumn.select([
        "workspace_id",
        "asset_key",
        "ordinal",
        "column_name",
        "data_type",
        "is_pk",
        "is_fk",
        "change_tag",
      ])
        .first(1000)
        .execute()
        .catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick,
    SESSION_CACHE_TTL_MS,
    force
  );
  return allRows.filter(
    (r) =>
      (!assetKey || r.asset_key === assetKey) &&
      (!workspaceId || workspaceId === ALL_WORKSPACES_ID || r.workspace_id === workspaceId)
  );
}

/**
 * Preloads all core shared telemetry tables in parallel so navigating between
 * pages or clicking "Synced ... ago" / "Refresh live telemetry now" updates
 * every screen atomically with zero per-page lag or value jumping.
 */
export async function preloadAllSharedTables(
  refreshTick = 0,
  force = false
): Promise<void> {
  await Promise.allSettled([
    fetchSharedPubWorkspaces(refreshTick, force),
    fetchSharedPubAssets(ALL_WORKSPACES_ID, refreshTick, force),
    fetchSharedPubQualityResults(ALL_WORKSPACES_ID, refreshTick, force),
    fetchSharedQualityRules(refreshTick, force),
    fetchSharedPubIncidents(ALL_WORKSPACES_ID, refreshTick, force),
    fetchSharedIncidentStates(ALL_WORKSPACES_ID, refreshTick, force),
    fetchSharedStewardCases(ALL_WORKSPACES_ID, refreshTick, force),
    fetchSharedCaseIncidentLinks(refreshTick, force),
    fetchSharedPubEntraUsers(refreshTick, force),
    fetchSharedPubHealthBuckets(ALL_WORKSPACES_ID, "24h", refreshTick, force),
    fetchSharedPubSchemaChanges(ALL_WORKSPACES_ID, refreshTick, force),
    fetchSharedPubPublishRuns(refreshTick, force),
    fetchSharedPubQualityFailedRows(ALL_WORKSPACES_ID, refreshTick, force),
    fetchSharedPubRefreshRuns(undefined, refreshTick, force),
    fetchSharedPubAssetLagPoints(undefined, refreshTick, force),
    fetchSharedPubAssetColumns(undefined, ALL_WORKSPACES_ID, refreshTick, force),
  ]);
}
