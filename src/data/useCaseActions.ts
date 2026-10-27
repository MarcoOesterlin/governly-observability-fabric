import type { CaseFixture } from "../fixtures/types";
import { client } from "./client";
import { invalidateQueryCache } from "./queryCache";

const CASE_STATUS_STORAGE_KEY = "governly:case-statuses:v1";
export const CASE_STATUS_EVENT = "governly:case-status-changed";

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
    const next = { ...loadLocalCaseStatuses(), [caseKey]: status };
    window.localStorage.setItem(CASE_STATUS_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(CASE_STATUS_EVENT));
  } catch {
    // ignore storage errors
  }
}

export async function updateStewardCaseStatus(
  caseKey: string,
  nextStatus: CaseFixture["status"],
  onUpdated?: () => void
): Promise<void> {
  if (!caseKey || caseKey === "CASE-NONE") return;
  saveLocalCaseStatus(caseKey, nextStatus);
  invalidateQueryCache("cases:");
  onUpdated?.();

  try {
    const existing = await client.data.StewardCase.select(["id"])
      .where({ case_key: { eq: caseKey } })
      .execute();
    if (Array.isArray(existing) && existing.length > 0) {
      const now = new Date();
      await Promise.all(
        existing
          .filter((row) => row?.id)
          .map((row) =>
            client.data.StewardCase.update(
              { id: row.id },
              { status: nextStatus, updated_at: now }
            )
          )
      );
      invalidateQueryCache("cases:");
      onUpdated?.();
    }
  } catch {
    // local status override remains active even if SQL is temporarily busy
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
