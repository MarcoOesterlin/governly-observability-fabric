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
import { normalizeIncidentStatus, toIncidentFixture } from "./mappers";
import { useCachedQuery } from "./queryCache";
import type { IncidentFilter } from "./queryKeys";
import {
  fetchSharedCaseIncidentLinks,
  fetchSharedIncidentStates,
  fetchSharedPubAssets,
  fetchSharedPubEntraUsers,
  fetchSharedPubIncidents,
  fetchSharedStewardCases,
} from "./sharedTables";
import {
  CASE_STATUS_EVENT,
  INCIDENT_STATUS_EVENT,
  isCaseLinkedToIncident,
  loadLocalCaseStatuses,
  loadLocalIncidentStatuses,
} from "./useCaseActions";

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

function formatIncidentAge(detectedAt: unknown): string {
  if (!detectedAt) return "Recently";
  const d =
    detectedAt instanceof Date ? detectedAt : new Date(String(detectedAt));
  if (!Number.isNaN(d.getTime())) {
    const diffMins = Math.max(
      0,
      Math.round((Date.now() - d.getTime()) / 60000)
    );
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hrs < 24) return mins > 0 ? `${hrs}h ${mins}m ago` : `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }
  return "Recently";
}

export function useIncidents(_filter: IncidentFilter = {}): IncidentFixture[] {
  const { workspaceId, refreshTick } = useWorkspace();
  const [localCaseMap, setLocalCaseMap] = useState<Record<string, CaseFixture["status"]>>(
    () => loadLocalCaseStatuses()
  );
  const [localIncMap, setLocalIncMap] = useState<Record<string, IncidentFixture["status"]>>(
    () => loadLocalIncidentStatuses()
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSync = () => {
      setLocalCaseMap(loadLocalCaseStatuses());
      setLocalIncMap(loadLocalIncidentStatuses());
    };
    window.addEventListener(CASE_STATUS_EVENT, onSync);
    window.addEventListener(INCIDENT_STATUS_EVENT, onSync);
    window.addEventListener("storage", onSync);
    return () => {
      window.removeEventListener(CASE_STATUS_EVENT, onSync);
      window.removeEventListener(INCIDENT_STATUS_EVENT, onSync);
      window.removeEventListener("storage", onSync);
    };
  }, []);

  const rows = useCachedQuery<IncidentFixture[]>(
    workspaceId ? `incidents:${workspaceId}` : null,
    async () => {
      const [pubRows, overlays, assetOwnerRows, entraUsers, caseRows, caseLinks] =
        await Promise.all([
          fetchSharedPubIncidents(workspaceId!, refreshTick),
          fetchSharedIncidentStates(workspaceId!, refreshTick),
          fetchSharedPubAssets(workspaceId!, refreshTick),
          fetchSharedPubEntraUsers(refreshTick),
          fetchSharedStewardCases(workspaceId!, refreshTick),
          fetchSharedCaseIncidentLinks(refreshTick),
        ]);
      if (!Array.isArray(pubRows) || pubRows.length === 0) return [];
      const stateByKey = new Map(
        (Array.isArray(overlays) ? overlays : []).map((o) => [o.incident_key, o])
      );
      const linksByCaseId = new Map<string, string[]>();
      if (Array.isArray(caseLinks)) {
        for (const l of caseLinks) {
          const cid = String(l.case?.id ?? "");
          if (!cid) continue;
          const list = linksByCaseId.get(cid) ?? [];
          list.push(l.incident_key);
          linksByCaseId.set(cid, list);
        }
      }
      const latestCaseStatuses = loadLocalCaseStatuses();
      const latestIncStatuses = loadLocalIncidentStatuses();
      const normalizedCases = (Array.isArray(caseRows) ? caseRows : []).map((c) => {
        const rawSt = String(c.status ?? "Open").toLowerCase();
        const dbSt: CaseFixture["status"] =
          rawSt === "closed" || rawSt === "done"
            ? "Done"
            : rawSt === "in progress"
              ? "In progress"
              : rawSt === "blocked"
                ? "Blocked"
                : "Open";
        return {
          key: String(c.case_key ?? ""),
          title: String(c.title ?? ""),
          status: latestCaseStatuses[String(c.case_key ?? "")] ?? dbSt,
          incidentKeys: linksByCaseId.get(String(c.id ?? "")) ?? [],
        };
      });

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
        const baseInc = toIncidentFixture(
          {
            ...r,
            initials,
            assignee: assigneeName,
            detected_status: r.auto_resolved_at ? "Resolved" : "Open",
            detected_label: formatIncidentAge(r.detected_at),
          },
          st
        );
        const linkedCases = normalizedCases.filter((c) =>
          isCaseLinkedToIncident(c, baseInc)
        );
        const anyCaseDone = linkedCases.some((c) => c.status === "Done");
        const anyCaseBlocked = linkedCases.some((c) => c.status === "Blocked");
        const anyCaseInProgress = linkedCases.some(
          (c) => c.status === "In progress"
        );
        const caseDerivedStatus: IncidentFixture["status"] | undefined =
          anyCaseDone
            ? "Resolved"
            : anyCaseBlocked
              ? "Blocked"
              : anyCaseInProgress
                ? "In progress"
                : undefined;
        const effectiveStatus: IncidentFixture["status"] = normalizeIncidentStatus(
          latestIncStatuses[baseInc.id] ?? caseDerivedStatus ?? baseInc.status
        );
        return {
          ...baseInc,
          status: effectiveStatus,
        };
      });
    },
    EMPTY_INCIDENTS,
    refreshTick
  );

  return rows.map((inc) => {
    if (localIncMap[inc.id]) {
      return { ...inc, status: normalizeIncidentStatus(localIncMap[inc.id]) };
    }
    for (const [caseKey, caseStatus] of Object.entries(localCaseMap)) {
      if (isCaseLinkedToIncident({ key: caseKey }, inc)) {
        if (caseStatus === "Done") return { ...inc, status: "Resolved" };
        if (caseStatus === "Blocked") return { ...inc, status: "Blocked" };
        if (caseStatus === "In progress") return { ...inc, status: "In progress" };
      }
    }
    return inc;
  });
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
  const [localIncMap, setLocalIncMap] = useState<Record<string, IncidentFixture["status"]>>(
    () => loadLocalIncidentStatuses()
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSync = () => {
      setLocalStatusMap(loadLocalCaseStatuses());
      setLocalIncMap(loadLocalIncidentStatuses());
    };
    window.addEventListener(CASE_STATUS_EVENT, onSync);
    window.addEventListener(INCIDENT_STATUS_EVENT, onSync);
    window.addEventListener("storage", onSync);
    return () => {
      window.removeEventListener(CASE_STATUS_EVENT, onSync);
      window.removeEventListener(INCIDENT_STATUS_EVENT, onSync);
      window.removeEventListener("storage", onSync);
    };
  }, []);

  const rows = useCachedQuery<CaseFixture[]>(
    workspaceId ? `cases:${workspaceId}` : null,
    async () => {
      const [rows, links, entraUsers, pubIncs, incStates] = await Promise.all([
        fetchSharedStewardCases(workspaceId!, refreshTick),
        fetchSharedCaseIncidentLinks(refreshTick),
        fetchSharedPubEntraUsers(refreshTick),
        fetchSharedPubIncidents(workspaceId!, refreshTick),
        fetchSharedIncidentStates(workspaceId!, refreshTick),
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
      const incStateByKey = new Map<string, string>();
      if (Array.isArray(incStates)) {
        for (const st of incStates) {
          if (st.incident_key && st.status) {
            incStateByKey.set(st.incident_key, st.status);
          }
        }
      }
      const allPubIncs = Array.isArray(pubIncs) ? pubIncs : [];
      const latestIncStatuses = loadLocalIncidentStatuses();

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

        const incSet = new Set<string>(linksByCaseId.get(String(r.id)) ?? []);
        for (const pInc of allPubIncs) {
          const ik = String(pInc.incident_key ?? "");
          if (
            ik &&
            isCaseLinkedToIncident(
              { key: r.case_key, title: r.title, incidentKeys: Array.from(incSet) },
              { id: ik, asset: String(pInc.asset_key ?? "") }
            )
          ) {
            incSet.add(ik);
          }
        }
        const incidentKeys = Array.from(incSet);
        const allIncsResolved =
          incidentKeys.length > 0 &&
          incidentKeys.every((ik) => {
            const pInc = allPubIncs.find((p) => p.incident_key === ik);
            const effSt =
              latestIncStatuses[ik] ??
              incStateByKey.get(ik) ??
              (pInc?.auto_resolved_at ? "Resolved" : "Open");
            return effSt === "Resolved";
          });

        return {
          key: r.case_key,
          title: r.title,
          domain: r.domain_key,
          priority: (r.priority as CaseFixture["priority"]) ?? "Medium",
          status: allIncsResolved ? "Done" : mappedStatus,
          owner: ownerName,
          ownerInitials:
            ownerName
              .split(/\s+/)
              .map((p: string) => p[0] ?? "")
              .join("")
              .slice(0, 2)
              .toUpperCase() || "ST",
          dueInDays,
          incidentKeys,
        };
      });
    },
    EMPTY_CASES,
    refreshTick
  );

  return rows.map((c) => {
    if (localStatusMap[c.key]) {
      return { ...c, status: localStatusMap[c.key] };
    }
    if (
      c.incidentKeys.length > 0 &&
      c.incidentKeys.every((ik) => localIncMap[ik] === "Resolved")
    ) {
      return { ...c, status: "Done" };
    }
    return c;
  });
}
