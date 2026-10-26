import type { IncidentStatus } from "../fixtures/types";

export interface IncidentActionStore {
  findOverlayId: (workspaceId: string, incidentKey: string) => Promise<string | null>;
  createOverlay: (row: {
    workspace_id: string;
    incident_key: string;
    status: IncidentStatus;
    resolution_note?: string | null;
  }) => Promise<unknown>;
  updateOverlay: (
    id: string,
    patch: { status: IncidentStatus; resolution_note?: string | null }
  ) => Promise<unknown>;
  appendEvent: (row: {
    workspace_id: string;
    incident_key: string;
    kind: string;
    actor_name: string;
    detail?: string | null;
    created_at: string;
  }) => Promise<unknown>;
}

export async function executeIncidentAction(params: {
  canWrite: boolean;
  workspaceId: string;
  incidentKey: string;
  actorName: string;
  status: IncidentStatus;
  kind: "acknowledged" | "investigating" | "resolved" | "reopened";
  resolutionNote?: string;
  store: IncidentActionStore;
  onOptimistic?: (status: IncidentStatus) => void;
  onRollback?: () => void;
  onToastError?: (msg: string) => void;
}): Promise<void> {
  if (!params.canWrite) {
    throw new Error("read-only");
  }
  if (params.kind === "resolved" && (!params.resolutionNote || !params.resolutionNote.trim())) {
    throw new Error("Resolution note is required");
  }

  params.onOptimistic?.(params.status);
  const nowIso = new Date().toISOString();

  try {
    const existingId = await params.store.findOverlayId(params.workspaceId, params.incidentKey);
    if (existingId) {
      await params.store.updateOverlay(existingId, {
        status: params.status,
        resolution_note: params.kind === "reopened" ? null : params.resolutionNote ?? null,
      });
    } else {
      await params.store.createOverlay({
        workspace_id: params.workspaceId,
        incident_key: params.incidentKey,
        status: params.status,
        resolution_note: params.resolutionNote ?? null,
      });
    }
    await params.store.appendEvent({
      workspace_id: params.workspaceId,
      incident_key: params.incidentKey,
      kind: params.kind,
      actor_name: params.actorName,
      detail: params.resolutionNote ?? `Transitioned to ${params.status}`,
      created_at: nowIso,
    });
  } catch (err) {
    params.onRollback?.();
    params.onToastError?.(err instanceof Error ? err.message : "Failed to update incident");
    throw err;
  }
}
