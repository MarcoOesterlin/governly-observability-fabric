import { client } from "./client";

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
