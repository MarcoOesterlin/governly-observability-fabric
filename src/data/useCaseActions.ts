import type { CaseFixture, IncidentFixture } from "../fixtures/types";
import { client } from "./client";
import { invalidateQueryCache } from "./queryCache";

const CASE_STATUS_STORAGE_KEY = "governly:case-statuses:v1";
export const CASE_STATUS_EVENT = "governly:case-status-changed";

const INCIDENT_STATUS_STORAGE_KEY = "governly:incident-statuses:v1";
export const INCIDENT_STATUS_EVENT = "governly:incident-status-changed";

export function loadLocalCaseStatuses(): Record<string, CaseFixture["status"]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(CASE_STATUS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, CaseFixture["status"]>)
      : {};
  } catch {
    return {};
  }
}

export function saveLocalCaseStatus(
  caseKey: string,
  status: CaseFixture["status"]
): void {
  if (typeof window === "undefined" || !caseKey) return;
  try {
    const cur = loadLocalCaseStatuses();
    if (cur[caseKey] === status) return;
    const next = { ...cur, [caseKey]: status };
    window.localStorage.setItem(CASE_STATUS_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CASE_STATUS_EVENT));
  } catch {
    // ignore storage errors
  }
}

export function loadLocalIncidentStatuses(): Record<string, IncidentFixture["status"]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(INCIDENT_STATUS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, IncidentFixture["status"]>)
      : {};
  } catch {
    return {};
  }
}

export function saveLocalIncidentStatus(
  incidentKey: string,
  status: IncidentFixture["status"]
): void {
  if (typeof window === "undefined" || !incidentKey) return;
  try {
    const cur = loadLocalIncidentStatuses();
    if (cur[incidentKey] === status) return;
    const next = { ...cur, [incidentKey]: status };
    window.localStorage.setItem(INCIDENT_STATUS_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(INCIDENT_STATUS_EVENT));
  } catch {
    // ignore storage errors
  }
}

export function isCaseLinkedToIncident(
  c: { key?: string; title?: string; incidentKeys?: string[] },
  inc: { id: string; asset: string }
): boolean {
  if (!inc.id || inc.id === "NONE") return false;
  if (Array.isArray(c.incidentKeys) && c.incidentKeys.includes(inc.id)) {
    return true;
  }
  const caseKey = String(c.key ?? "").trim();
  const incSuffix = inc.id.replace(/^INC-/i, "");
  if (caseKey && incSuffix && caseKey.toUpperCase() === `CASE-${incSuffix.toUpperCase()}`) {
    return true;
  }
  const titleLower = String(c.title ?? "").toLowerCase();
  const assetLower = String(inc.asset ?? "").trim().toLowerCase();
  if (assetLower && assetLower !== "—" && titleLower.includes(assetLower)) {
    return true;
  }
  return false;
}

async function upsertIncidentStateRow(
  workspaceId: string,
  incidentKey: string,
  nextStatus: IncidentFixture["status"],
  actorName: string = "Workspace Steward",
  actorOid: string = "00000000-0000-0000-0000-000000000001"
): Promise<void> {
  const existing = await client.data.IncidentState.select(["id"])
    .where({ incident_key: { eq: incidentKey } })
    .execute()
    .catch(() => []);
  const now = new Date();
  if (Array.isArray(existing) && existing.length > 0 && existing[0]?.id) {
    await client.data.IncidentState.update(
      { id: existing[0].id },
      {
        status: nextStatus,
        updated_at: now,
        updated_by_name: actorName,
        updated_by_object_id: actorOid,
      }
    );
  } else {
    await client.data.IncidentState.create({
      workspace_id: workspaceId,
      incident_key: incidentKey,
      domain_key: "general",
      status: nextStatus,
      assignee_name: actorName,
      assignee_object_id: actorOid,
      updated_at: now,
      updated_by_name: actorName,
      updated_by_object_id: actorOid,
    });
  }
}

export async function updateStewardCaseStatus(
  caseKey: string,
  nextStatus: CaseFixture["status"],
  onUpdated?: () => void,
  knownIncidentKeys?: string[]
): Promise<void> {
  if (!caseKey || caseKey === "CASE-NONE") return;
  saveLocalCaseStatus(caseKey, nextStatus);

  const targetIncStatus: IncidentFixture["status"] =
    nextStatus === "Done"
      ? "Resolved"
      : nextStatus === "In progress"
        ? "Investigating"
        : "Open";

  if (Array.isArray(knownIncidentKeys) && knownIncidentKeys.length > 0) {
    for (const ik of knownIncidentKeys) {
      saveLocalIncidentStatus(ik, targetIncStatus);
    }
  }

  invalidateQueryCache("cases:");
  invalidateQueryCache("incidents:");
  onUpdated?.();

  try {
    const [existingCases, links, pubIncidents] = await Promise.all([
      client.data.StewardCase.select(["id", "workspace_id", "case_key", "title"])
        .where({ case_key: { eq: caseKey } })
        .execute()
        .catch(() => []),
      client.data.CaseIncidentLink.select(["case.id", "incident_key"])
        .execute()
        .catch(() => []),
      client.data.PubIncident.select(["workspace_id", "incident_key", "asset_key"])
        .execute()
        .catch(() => []),
    ]);

    const matchedCases = Array.isArray(existingCases) ? existingCases : [];
    const caseIds = new Set(matchedCases.map((r) => String(r.id ?? "")).filter(Boolean));
    const linkedKeys = new Set<string>(knownIncidentKeys ?? []);

    if (Array.isArray(links)) {
      for (const l of links) {
        if (caseIds.has(String(l.case?.id ?? "")) && l.incident_key) {
          linkedKeys.add(String(l.incident_key));
        }
      }
    }
    if (Array.isArray(pubIncidents)) {
      for (const cRow of matchedCases) {
        for (const pInc of pubIncidents) {
          if (
            isCaseLinkedToIncident(
              { key: cRow.case_key, title: cRow.title },
              { id: String(pInc.incident_key ?? ""), asset: String(pInc.asset_key ?? "") }
            )
          ) {
            linkedKeys.add(String(pInc.incident_key));
          }
        }
      }
    }

    for (const ik of linkedKeys) {
      saveLocalIncidentStatus(ik, targetIncStatus);
    }

    const now = new Date();
    const fallbackWs = matchedCases[0]?.workspace_id || "all";
    await Promise.all([
      ...matchedCases
        .filter((row) => row?.id)
        .map((row) =>
          client.data.StewardCase.update(
            { id: row.id },
            { status: nextStatus, updated_at: now }
          )
        ),
      ...Array.from(linkedKeys).map((ik) =>
        upsertIncidentStateRow(fallbackWs, ik, targetIncStatus)
      ),
    ]);
    invalidateQueryCache("cases:");
    invalidateQueryCache("incidents:");
    onUpdated?.();
  } catch {
    // local status override remains active even if SQL is temporarily busy
  }
}

export async function syncCaseStatusFromIncident(params: {
  workspaceId: string;
  incidentKey: string;
  assetKey?: string;
  nextIncidentStatus: IncidentFixture["status"];
  onUpdated?: () => void;
}): Promise<void> {
  const { incidentKey, assetKey, nextIncidentStatus, onUpdated } = params;
  if (!incidentKey || incidentKey === "NONE") return;
  saveLocalIncidentStatus(incidentKey, nextIncidentStatus);

  const targetCaseStatus: CaseFixture["status"] | null =
    nextIncidentStatus === "Resolved"
      ? "Done"
      : nextIncidentStatus === "Investigating"
        ? "In progress"
        : nextIncidentStatus === "Open"
          ? "Open"
          : null;

  invalidateQueryCache("incidents:");
  if (targetCaseStatus) invalidateQueryCache("cases:");
  onUpdated?.();

  if (!targetCaseStatus) return;

  try {
    const [allCases, links] = await Promise.all([
      client.data.StewardCase.select(["id", "case_key", "title", "status"])
        .execute()
        .catch(() => []),
      client.data.CaseIncidentLink.select(["case.id", "incident_key"])
        .execute()
        .catch(() => []),
    ]);
    const linkedCaseIds = new Set<string>();
    if (Array.isArray(links)) {
      for (const l of links) {
        if (l.incident_key === incidentKey && l.case?.id) {
          linkedCaseIds.add(String(l.case.id));
        }
      }
    }
    const matchingCases = (Array.isArray(allCases) ? allCases : []).filter(
      (c) =>
        linkedCaseIds.has(String(c.id ?? "")) ||
        isCaseLinkedToIncident(
          { key: c.case_key, title: c.title },
          { id: incidentKey, asset: assetKey ?? "" }
        )
    );
    if (matchingCases.length === 0) return;

    const now = new Date();
    for (const mc of matchingCases) {
      if (mc.case_key) {
        saveLocalCaseStatus(String(mc.case_key), targetCaseStatus);
      }
    }
    await Promise.all(
      matchingCases
        .filter((mc) => mc.id)
        .map((mc) =>
          client.data.StewardCase.update(
            { id: mc.id },
            { status: targetCaseStatus, updated_at: now }
          )
        )
    );
    invalidateQueryCache("cases:");
    invalidateQueryCache("incidents:");
    onUpdated?.();
  } catch {
    // ignore transient SQL errors
  }
}

export async function createStewardCase(params: {
  canWrite: boolean;
  workspaceId: string;
  caseKey: string;
  title: string;
  domain: string;
  priority: string;
  ownerName: string;
  ownerInitials: string;
  incidentKeys: string[];
  triggerReason?: "schema_drift" | "sla_breach" | "poor_quality";
}): Promise<void> {
  if (!params.canWrite) throw new Error("read-only");
  const hasTrigger =
    params.incidentKeys.length > 0 ||
    params.triggerReason === "schema_drift" ||
    params.triggerReason === "sla_breach" ||
    params.triggerReason === "poor_quality";
  if (!hasTrigger) {
    throw new Error(
      "Cases can only be created when there is schema drift, an SLA breach, or poor data quality."
    );
  }
  const now = new Date();
  await client.data.StewardCase.create({
    workspace_id: params.workspaceId,
    case_key: params.caseKey,
    title: params.title,
    description: "",
    status: "Open",
    priority: params.priority,
    domain_key: params.domain,
    owner_object_id: "00000000-0000-0000-0002-000000000011",
    owner_name: params.ownerName,
    created_at: now,
    updated_at: now,
  });
}
