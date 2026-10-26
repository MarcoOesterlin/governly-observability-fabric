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
import type { IncidentFilter } from "./queryKeys";

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

export function useIncidents(filter: IncidentFilter = {}): IncidentFixture[] {
  const { workspaceId, refreshTick } = useWorkspace();
  const [liveRows, setLiveRows] = useState<IncidentFixture[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void (async () => {
      try {
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
        const pubRows = isAll
          ? await basePub.execute()
          : await basePub.where({ workspace_id: { eq: workspaceId } }).execute();
        if (cancelled) return;
        if (Array.isArray(pubRows) && pubRows.length > 0) {
          const baseOverlay = client.data.IncidentState.select([
            "incident_key",
            "status",
            "assignee_name",
          ]);
          const baseAssets = client.data.PubAsset.select(["asset_key", "owner_name"]);
          const [overlays, assetOwners] = await Promise.all([
            isAll
              ? baseOverlay.execute()
              : baseOverlay.where({ workspace_id: { eq: workspaceId } }).execute(),
            isAll
              ? baseAssets.first(500).execute()
              : baseAssets.where({ workspace_id: { eq: workspaceId } }).first(200).execute(),
          ]);
          const stateByKey = new Map(
            (Array.isArray(overlays) ? overlays : []).map((o) => [o.incident_key, o])
          );
          const ownerByAsset = new Map(
            (Array.isArray(assetOwners) ? assetOwners : []).map((a) => [
              a.asset_key,
              a.owner_name,
            ])
          );
          if (!cancelled) {
            setLiveRows(
              pubRows.map((r) => {
                const st = stateByKey.get(r.incident_key);
                const assigneeName =
                  st?.assignee_name ||
                  ownerByAsset.get(r.asset_key) ||
                  "Workspace Steward";
                const initials =
                  assigneeName
                    .split(/\s+/)
                    .map((p: string) => p[0] ?? "")
                    .join("")
                    .slice(0, 2)
                    .toUpperCase() || "WS";
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
              })
            );
          }
        } else {
          setLiveRows([]);
        }
      } catch {
        if (!cancelled) setLiveRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, filter.status, filter.severity, refreshTick]);

  return liveRows;
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

export function useIncidentDetailData(incidentId?: string): {
  incident: IncidentFixture;
  timeline: TimelineFixture[];
  comments: CommentFixture[];
  impact: ImpactFixture[];
} {
  const { workspaceId, refreshTick } = useWorkspace();
  const incidents = useIncidents();
  const [liveComments, setLiveComments] = useState<CommentFixture[]>([]);
  const [liveImpact, setLiveImpact] = useState<ImpactFixture[]>([]);

  const found =
    incidents.find((i) => i.id === incidentId) ??
    incidents[0] ??
    EMPTY_LIVE_INCIDENT;

  useEffect(() => {
    if (!workspaceId || !found || found.id === "NONE") return;
    let cancelled = false;
    void (async () => {
      try {
        const isAll = workspaceId === ALL_WORKSPACES_ID;
        const baseImpact = client.data.PubIncidentImpact.select([
          "hops",
          "impacted_name",
          "impacted_type",
          "impact_severity",
        ]);
        const [impactRows, commentRows] = await Promise.all([
          isAll
            ? baseImpact.where({ incident_key: { eq: found.id } }).execute()
            : baseImpact
                .where({ workspace_id: { eq: workspaceId }, incident_key: { eq: found.id } })
                .execute(),
          client.data.IncidentComment.select(["author_name", "body", "created_at"])
            .where({ incident_key: { eq: found.id } })
            .execute(),
        ]);
        if (cancelled) return;
        if (Array.isArray(impactRows) && impactRows.length > 0) {
          const sorted = [...impactRows].sort((a, b) => a.hops - b.hops);
          setLiveImpact(
            sorted.map((r) => ({
              name: r.impacted_name,
              type: r.impacted_type,
              icon: r.impacted_type.toLowerCase().includes("report") ? "ph-chart-bar" : "ph-table",
              sev: (r.impact_severity as ImpactFixture["sev"]) ?? "Medium",
            }))
          );
        } else {
          setLiveImpact([]);
        }
        if (Array.isArray(commentRows) && commentRows.length > 0) {
          setLiveComments(
            commentRows.map((c) => ({
              who: c.author_name,
              initials:
                c.author_name
                  .split(/\s+/)
                  .map((p) => p[0] ?? "")
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() || "ST",
              time: c.created_at ? String(c.created_at).slice(11, 16) : "Recent",
              text: c.body,
              system: false,
            }))
          );
        } else {
          setLiveComments([]);
        }
      } catch {
        if (!cancelled) {
          setLiveImpact([]);
          setLiveComments([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, found, refreshTick]);

  return {
    incident: found,
    timeline: found.id === "NONE" ? [] : buildLiveTimeline(found.status),
    comments: liveComments,
    impact: liveImpact,
  };
}

export function useCases(): CaseFixture[] {
  const { workspaceId, refreshTick } = useWorkspace();
  const [liveCases, setLiveCases] = useState<CaseFixture[]>([]);

  useEffect(() => {
    if (!workspaceId) return;
    let cancelled = false;
    void (async () => {
      try {
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
        const [rows, links] = await Promise.all([
          isAll
            ? baseCases.execute()
            : baseCases.where({ workspace_id: { eq: workspaceId } }).execute(),
          client.data.CaseIncidentLink.select(["case.id", "incident_key"]).execute(),
        ]);
        if (cancelled) return;
        if (Array.isArray(rows) && rows.length > 0) {
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
          setLiveCases(
            rows.map((r) => {
              const mappedStatus: CaseFixture["status"] =
                r.status === "Closed" ? "Done" : ((r.status as CaseFixture["status"]) ?? "Open");
              const dueInDays = r.due_date
                ? Math.max(
                    0,
                    Math.ceil((new Date(String(r.due_date)).getTime() - Date.now()) / 86_400_000)
                  )
                : 2;
              return {
                key: r.case_key,
                title: r.title,
                domain: r.domain_key,
                priority: (r.priority as CaseFixture["priority"]) ?? "Medium",
                status: mappedStatus,
                owner: r.owner_name,
                ownerInitials:
                  r.owner_name
                    .split(/\s+/)
                    .map((p) => p[0] ?? "")
                    .join("")
                    .slice(0, 2)
                    .toUpperCase() || "ST",
                dueInDays,
                incidentKeys: linksByCaseId.get(String(r.id)) ?? [],
              };
            })
          );
        } else {
          setLiveCases([]);
        }
      } catch {
        if (!cancelled) setLiveCases([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, refreshTick]);

  return liveCases;
}
