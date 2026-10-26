import type {
  CommentFixture,
  ImpactFixture,
  IncidentDetailFixture,
  IncidentStatus,
  SeverityLevel,
  TimelineFixture,
} from "../fixtures/types";

export interface PublishedIncidentInput {
  incident_key: string;
  title: string;
  asset_key: string;
  severity: SeverityLevel | string;
  monitor_label: string;
  detected_at: string;
  notified_at?: string;
  detected_label?: string;
  detected_status?: IncidentStatus | string;
  root_cause_hint?: string | null;
}

export interface IncidentStateInput {
  status?: IncidentStatus | string;
  assigned_to_name?: string | null;
  resolution_note?: string | null;
}

export interface IncidentEventInput {
  id: string;
  kind: string;
  actor_name: string;
  detail?: string | null;
  created_at: string;
}

const KIND_DOT: Record<string, string> = {
  detected: "var(--crit)",
  notified: "var(--info)",
  acknowledged: "var(--primary)",
  investigating: "var(--warn)",
  resolved: "var(--ok)",
  reopened: "var(--crit)",
};

export function mergeIncident(
  published: PublishedIncidentInput,
  state: IncidentStateInput | undefined,
  events: IncidentEventInput[],
  comments: CommentFixture[],
  impacts: ImpactFixture[]
): IncidentDetailFixture {
  const status = ((state?.status ?? published.detected_status ?? "Open") as IncidentStatus) || "Open";
  const synthesized: TimelineFixture[] = [
    {
      kind: "detected",
      at: published.detected_at,
      time: published.detected_label ?? published.detected_at,
      title: "Detected",
      text: `Anomaly detected on ${published.asset_key}: ${published.title}`,
      icon: "ph-warning",
      color: KIND_DOT.detected,
    },
    {
      kind: "notified",
      at: published.notified_at ?? published.detected_at,
      time: published.detected_label ?? published.detected_at,
      title: "Notified",
      text: "Teams alert dispatched to #data-stewards",
      icon: "ph-bell",
      color: KIND_DOT.notified,
    },
  ];

  const sortedEvents = [...events].sort((a, b) => {
    const cmp = a.created_at.localeCompare(b.created_at);
    return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
  });

  const mappedEvents: TimelineFixture[] = sortedEvents.map((e) => {
    const note =
      e.kind === "resolved" ? state?.resolution_note ?? e.detail ?? undefined : e.detail ?? undefined;
    return {
      kind: e.kind,
      at: e.created_at,
      time: e.created_at,
      title: e.kind.charAt(0).toUpperCase() + e.kind.slice(1),
      text: e.detail ? `${e.actor_name} · ${e.detail}` : `${e.actor_name} (${e.kind})`,
      icon: "ph-check-circle",
      color: KIND_DOT[e.kind] ?? "var(--primary)",
      note,
    };
  });

  return {
    id: published.incident_key,
    sev: (published.severity as SeverityLevel) || "High",
    title: published.title,
    asset: published.asset_key,
    monitor: published.monitor_label,
    age: published.detected_label ?? "1h ago",
    initials: "PN",
    status,
    detectedAt: published.detected_at,
    monitorDetail: published.root_cause_hint ?? "",
    assignee: state?.assigned_to_name ?? undefined,
    resolutionNote: state?.resolution_note ?? undefined,
    timeline: [...synthesized, ...mappedEvents],
    comments,
    impact: impacts,
  };
}
