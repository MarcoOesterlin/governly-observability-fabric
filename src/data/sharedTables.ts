import { ALL_WORKSPACES_ID } from "../app/WorkspaceProvider";
import { client } from "./client";
import { fetchSharedQuery } from "./queryCache";

export function fetchSharedPubWorkspaces(refreshTick = 0) {
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
    refreshTick
  );
}

export function fetchSharedPubAssets(workspaceId: string, refreshTick = 0) {
  const isAll = workspaceId === ALL_WORKSPACES_ID;
  return fetchSharedQuery(
    `raw:pub-assets:${workspaceId}`,
    async () => {
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
      const rows = isAll
        ? await baseQuery.first(500).execute()
        : await baseQuery.where({ workspace_id: { eq: workspaceId } }).first(200).execute();
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick
  );
}

export function fetchSharedPubQualityResults(workspaceId: string, refreshTick = 0) {
  const isAll = workspaceId === ALL_WORKSPACES_ID;
  return fetchSharedQuery(
    `raw:pub-quality-results:${workspaceId}`,
    async () => {
      const baseQRes = client.data.PubQualityResult.select([
        "workspace_id",
        "asset_key",
        "rule_name",
        "observed_label",
        "result",
      ]);
      const rows = isAll
        ? await baseQRes.first(500).execute()
        : await baseQRes.where({ workspace_id: { eq: workspaceId } }).first(500).execute();
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick
  );
}

export function fetchSharedQualityRules(refreshTick = 0) {
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
    refreshTick
  );
}

export function fetchSharedPubIncidents(workspaceId: string, refreshTick = 0) {
  const isAll = workspaceId === ALL_WORKSPACES_ID;
  return fetchSharedQuery(
    `raw:pub-incidents:${workspaceId}`,
    async () => {
      const basePub = client.data.PubIncident.select([
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
      ]);
      const rows = await (isAll
        ? basePub.execute()
        : basePub.where({ workspace_id: { eq: workspaceId } }).execute()
      ).catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick
  );
}

export function fetchSharedIncidentStates(workspaceId: string, refreshTick = 0) {
  const isAll = workspaceId === ALL_WORKSPACES_ID;
  return fetchSharedQuery(
    `raw:incident-states:${workspaceId}`,
    async () => {
      const baseOverlay = client.data.IncidentState.select([
        "workspace_id",
        "incident_key",
        "status",
        "assignee_name",
      ]);
      const rows = await (isAll
        ? baseOverlay.execute()
        : baseOverlay.where({ workspace_id: { eq: workspaceId } }).execute()
      ).catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick
  );
}

export function fetchSharedStewardCases(workspaceId: string, refreshTick = 0) {
  const isAll = workspaceId === ALL_WORKSPACES_ID;
  return fetchSharedQuery(
    `raw:steward-cases:${workspaceId}`,
    async () => {
      const baseCases = client.data.StewardCase.select([
        "id",
        "workspace_id",
        "case_key",
        "title",
        "domain_key",
        "priority",
        "status",
        "owner_name",
        "due_date",
      ]);
      const rows = await (isAll
        ? baseCases.execute()
        : baseCases.where({ workspace_id: { eq: workspaceId } }).execute()
      ).catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick
  );
}

export function fetchSharedCaseIncidentLinks(refreshTick = 0) {
  return fetchSharedQuery(
    "raw:case-incident-links",
    async () => {
      const rows = await client.data.CaseIncidentLink.select(["case.id", "incident_key"])
        .execute()
        .catch(() => []);
      return Array.isArray(rows) ? rows : [];
    },
    refreshTick
  );
}

export function fetchSharedPubEntraUsers(refreshTick = 0) {
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
    refreshTick
  );
}
