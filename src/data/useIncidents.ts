import { useEffect, useState } from "react";
import { ALL_WORKSPACES_ID, useWorkspace } from "../app/WorkspaceProvider";
import type {
  CaseFixture,
  CommentFixture,
  ImpactFixture,
  IncidentFixture,
  TimelineFixture,
} from "../fixtures/types";
import { client } from "./client";
import { toIncidentFixture } from "./mappers";
import { useCachedQuery } from "./queryCache";
import type { IncidentFilter } from "./queryKeys";
import { CASE_STATUS_EVENT, loadLocalCaseStatuses } from "./useCaseActions";

function buildLiveTimeline(status: IncidentFixture["status"]): TimelineFixture[] {
  const base: TimelineFixture[] = [
    { kind: "Detected", title: "Detected", text: "Alert triggered by scheduled telemetry run", time: "Detected", icon: "ph-warning", color: "var(--crit)", note: "Alert triggered by scheduled telemetry run" },
    { kind: "Notified", title: "Notified", text: "Incident published to Governly", time: "Alerted", icon: "ph-bell", color: "var(--info)", note: "Incident published to Governly" },
  ];
  if (status === "Acknowledged" || status === "Investigating" || status === "Resolved") {
    base.push({ kind: "Acknowledged", title: "Acknowledged", text: "Acknowledged in Governly", time: "Recent", icon: "ph-check", color: "var(--warn)", note: "Acknowledged in Governly" });
  }
  if (status === "Investigating" || status === "Resolved") {
    base.push({ kind: "Investigating", title: "Investigating", text: "Investigation in progress", time: "Recent", icon: "ph-magnifying-glass", color: "var(--info)", note: "Investigation in progress" });
  }
  if (status === "Resolved") {
    base.push({ kind: "Resolved", title: "Resolved", text: "Marked resolved", time: "Recent", icon: "ph-check-circle", color: "var(--ok)", note: "Marked resolved" });
  }
  return base;
}

const EMPTY_INCIDENTS: IncidentFixture[] = [];
const EMPTY_CASES: CaseFixture[] = [];

export function useIncidents(_filter: IncidentFilter = {}): IncidentFixture[] {
  const { workspaceId, refreshTick } = useWorkspace();

  return useCachedQuery<IncidentFixture[]>(
    workspaceId ? `incidents:${workspaceId}` : null,
    async () => {
      const isAll = workspaceId === ALL_WORKSPACES_ID;
      const basePub = client.data.PubIncident.select([
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
      const baseOverlay = client.data.IncidentState.select([
        "incident_key",
        "status",
        "assignee_name",
      ]);
      const baseAssetOwners = client.data.PubAsset.select([
        "asset_key",
        "owner_name",
      ]);
      const [pubRows, overlays, assetOwnerRows, entraUsers] = await Promise.all([
        isAll
          ? basePub.execute()
          : basePub.where({ workspace_id: { eq: workspaceId! } }).execute(),
        (isAll
          ? baseOverlay.execute()
          : baseOverlay.where({ workspace_id: { eq: workspaceId! } }).execute()
        ).catch(() => []),
        (isAll
          ? baseAssetOwners.execute()
          : baseAssetOwners.where({ workspace_id: { eq: workspaceId! } }).execute()
        ).catch(() => []),
        client.data.PubEntraUser.select(["display_name", "is_synthetic"])
          .first(50)
          .execute()
          .catch(() => []),
      ]);
      if (!Array.isArray(pubRows) || pubRows.length === 0) return [];
      const stateByKey = new Map(
        (Array.isArray(overlays) ? overlays : []).map((o) => [o.incident_key, o])
      );
      const ownerByAsset = new Map<string, string>();
      if (Array.isArray(assetOwnerRows)) {
        for (const a of assetOwnerRows) {
          const oname = String(a.owner_name ?? "").trim();
          if (a.asset_key && oname && oname !== "Workspace Steward") {
            ownerByAsset.set(String(a.asset_key), oname);
          }
        }
      }
      const fallbackEntraName =
        (Array.isArray(entraUsers)
          ? entraUsers.find(
              (u) =>
                !u.is_synthetic &&
                u.display_name &&
                u.display_name !== "Workspace Steward"
            )?.display_name ??
            entraUsers.find(
              (u) => u.display_name && u.display_name !== "Workspace Steward"
            )?.display_name
          : undefined) || undefined;

      return pubRows.map((r) => {
        const st = stateByKey.get(r.incident_key);
        const rawOverlayAssignee =
          st?.assignee_name && st.assignee_name !== "Workspace Steward"
            ? st.assignee_name
            : undefined;
        const assigneeName =
          rawOverlayAssignee ||
          ownerByAsset.get(String(r.asset_key)) ||
          fallbackEntraName ||
          "Unassigned";
        const initials =
          assigneeName
            .split(/\s+/)
            .map((p: string) => p[0] ?? "")
            .join("")
            .slice(0, 2)
            .toUpperCase() || "ST";
        return toIncidentFixture(
          {
            ...r,
            initials,
            assignee: assigneeName,
            detected_status: r.auto_resolved_at ? "Resolved" : "Open",
            detected_label: r.detected_at
              ? String(r.detected_at).slice(11, 16) || "Recently"
              : "Recently",
          },
          st
        );
      });
    },
    EMPTY_INCIDENTS,
    refreshTick
  );
}

const EMPTY_LIVE_INCIDENT: IncidentFixture = {
  id: "NONE",
  title: "No active incident",
  asset: "—",
  sev: "Low",
  status: "Resolved",
  age: "—",
  initials: "ST",
  monitor: "Observability",
};

const EMPTY_DETAIL_EXTRA: { comments: CommentFixture[]; impact: ImpactFixture[] } = {
  comments: [],
  impact: [],
};

export function useIncidentDetailData(incidentId?: string): {
  incident: IncidentFixture;
  timeline: TimelineFixture[];
  comments: CommentFixture[];
  impact: ImpactFixture[];
} {
  const { workspaceId, refreshTick } = useWorkspace();
  const incidents = useIncidents();

  const found =
    incidents.find((i) => i.id === incidentId) ??
    incidents[0] ??
    EMPTY_LIVE_INCIDENT;

  const extra = useCachedQuery<{ comments: CommentFixture[]; impact: ImpactFixture[] }>(
    workspaceId && found && found.id !== "NONE"
      ? `incident-detail:${workspaceId}:${found.id}`
      : null,
    async () => {
      const isAll = workspaceId === ALL_WORKSPACES_ID;
      const baseImpact = client.data.PubIncidentImpact.select([
        "hops",
        "impacted_name",
        "impacted_type",
        "impact_severity",
      ]);
      const [impactRows, commentRows] = await Promise.all([
        (isAll
          ? baseImpact.where({ incident_key: { eq: found.id } }).execute()
          : baseImpact
              .where({ workspace_id: { eq: workspaceId! }, incident_key: { eq: found.id } })
              .execute()
        ).catch(() => []),
        client.data.IncidentComment.select(["author_name", "body", "created_at"])
          .where({ incident_key: { eq: found.id } })
          .execute()
          .catch(() => []),
      ]);
      const impact: ImpactFixture[] =
        Array.isArray(impactRows) && impactRows.length > 0
          ? [...impactRows]
              .sort((a, b) => a.hops - b.hops)
              .map((r) => ({
                name: r.impacted_name,
                type: r.impacted_type,
                icon: r.impacted_type.toLowerCase().includes("report")
                  ? "ph-chart-bar"
                  : "ph-table",
                sev: (r.impact_severity as ImpactFixture["sev"]) ?? "Medium",
              }))
          : [];
      const comments: CommentFixture[] =
        Array.isArray(commentRows) && commentRows.length > 0
          ? commentRows.map((c) => ({
              who: c.author_name,
              initials:
                c.author_name
                  .split(/\s+/)
                  .map((p: string) => p[0] ?? "")
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() || "ST",
              time: c.created_at ? String(c.created_at).slice(11, 16) : "Recent",
              text: c.body,
              system: false,
            }))
          : [];
      return { comments, impact };
    },
    EMPTY_DETAIL_EXTRA,
    refreshTick
  );

  return {
    incident: found,
    timeline: found.id === "NONE" ? [] : buildLiveTimeline(found.status),
    comments: extra.comments,
    impact: extra.impact,
  };
}

export function useCases(): CaseFixture[] {
  const { workspaceId, refreshTick } = useWorkspace();
  const [localStatusMap, setLocalStatusMap] = useState<Record<string, CaseFixture["status"]>>(
    () => loadLocalCaseStatuses()
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSync = () => setLocalStatusMap(loadLocalCaseStatuses());
    window.addEventListener(CASE_STATUS_EVENT, onSync);
    window.addEventListener("storage", onSync);
    return () => {
      window.removeEventListener(CASE_STATUS_EVENT, onSync);
      window.removeEventListener("storage", onSync);
    };
  }, []);

  const rows = useCachedQuery<CaseFixture[]>(
    workspaceId ? `cases:${workspaceId}` : null,
    async () => {
      const isAll = workspaceId === ALL_WORKSPACES_ID;
      const baseCases = client.data.StewardCase.select([
        "id",
        "case_key",
        "title",
        "domain_key",
        "priority",
        "status",
        "owner_name",
        "due_date",
      ]);
      const [rows, links, entraUsers] = await Promise.all([
        isAll
          ? baseCases.execute()
          : baseCases.where({ workspace_id: { eq: workspaceId! } }).execute(),
        client.data.CaseIncidentLink.select(["case.id", "incident_key"])
          .execute()
          .catch(() => []),
        client.data.PubEntraUser.select(["display_name", "is_synthetic"])
          .first(50)
          .execute()
          .catch(() => []),
      ]);
      if (!Array.isArray(rows) || rows.length === 0) return [];
      const fallbackEntraName =
        (Array.isArray(entraUsers)
          ? entraUsers.find(
              (u) =>
                !u.is_synthetic &&
                u.display_name &&
                u.display_name !== "Workspace Steward"
            )?.display_name ??
            entraUsers.find(
              (u) => u.display_name && u.display_name !== "Workspace Steward"
            )?.display_name
          : undefined) || "Unassigned";
      const linksByCaseId = new Map<string, string[]>();
      if (Array.isArray(links)) {
        for (const l of links) {
          const cid = String(l.case?.id ?? "");
          if (!cid) continue;
          const list = linksByCaseId.get(cid) ?? [];
          list.push(l.incident_key);
          linksByCaseId.set(cid, list);
        }
      }
      return rows.map((r) => {
        const rawStatus = String(r.status ?? "Open");
        const mappedStatus: CaseFixture["status"] =
          rawStatus.toLowerCase() === "closed" || rawStatus.toLowerCase() === "done"
            ? "Done"
            : rawStatus.toLowerCase() === "in progress"
              ? "In progress"
              : rawStatus.toLowerCase() === "blocked"
                ? "Blocked"
                : "Open";
        const dueInDays = r.due_date
          ? Math.max(
              0,
              Math.ceil((new Date(String(r.due_date)).getTime() - Date.now()) / 86_400_000)
            )
          : 2;
        const ownerName =
          r.owner_name && r.owner_name !== "Workspace Steward"
            ? r.owner_name
            : fallbackEntraName;
        return {
          key: r.case_key,
          title: r.title,
          domain: r.domain_key,
          priority: (r.priority as CaseFixture["priority"]) ?? "Medium",
          status: mappedStatus,
          owner: ownerName,
          ownerInitials:
            ownerName
              .split(/\s+/)
              .map((p: string) => p[0] ?? "")
              .join("")
              .slice(0, 2)
              .toUpperCase() || "ST",
          dueInDays,
          incidentKeys: linksByCaseId.get(String(r.id)) ?? [],
        };
      });
    },
    EMPTY_CASES,
    refreshTick
  );

  return rows.map((c) =>
    localStatusMap[c.key] ? { ...c, status: localStatusMap[c.key] } : c
  );
}
