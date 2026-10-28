import type {
  AssetFixture,
  HealthStatus,
  IncidentFixture,
  IncidentStatus,
  KpiFixture,
  SeverityLevel,
} from "../fixtures/types";

const KPI_LABELS: Record<string, { label: string; icon: string }> = {
  healthy_assets: { label: "Healthy assets", icon: "ph-check-circle" },
  health_score: { label: "Healthy assets", icon: "ph-check-circle" },
  active_incidents: { label: "Active incidents", icon: "ph-warning-octagon" },
  freshness_sla: { label: "Freshness SLA", icon: "ph-timer" },
  open_cases: { label: "Open cases", icon: "ph-kanban" },
};

const KPI_ORDER = ["healthy_assets", "health_score", "active_incidents", "freshness_sla", "open_cases"];

const ASSET_ICONS: Record<string, string> = {
  "Warehouse table": "ph-table",
  "Lakehouse table": "ph-database",
  "Semantic model": "ph-cube",
  "Data pipeline": "ph-git-branch",
  Eventstream: "ph-broadcast",
};

export interface PubKpiRow {
  kpi_key: string;
  label?: string;
  value_label: string;
  sub_label: string;
  trend_label: string;
  trend_direction: "up" | "down" | "flat" | string;
  trend_tone?: "good" | "warn" | "bad" | "neutral" | string;
  is_good?: boolean;
}

export function toKpiFixture(row: PubKpiRow): KpiFixture {
  const meta = KPI_LABELS[row.kpi_key] ?? { label: row.label ?? row.kpi_key, icon: "ph-check-circle" };
  const flat = row.trend_direction === "flat" || row.trend_label === "0";
  const good = row.is_good !== undefined ? row.is_good : row.trend_tone === "good" || flat;
  return {
    label: meta.label,
    value: row.value_label,
    sub: row.sub_label,
    trend: row.trend_label,
    icon: meta.icon,
    trendGood: good,
    trendFlat: flat,
  };
}

export function byKpiOrder(a: { kpi_key: string }, b: { kpi_key: string }): number {
  const ia = KPI_ORDER.indexOf(a.kpi_key);
  const ib = KPI_ORDER.indexOf(b.kpi_key);
  return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
}

export interface PubAssetRow {
  asset_key: string;
  display_name?: string;
  name?: string;
  asset_type?: string;
  domain_name?: string;
  domain_key?: string;
  icon?: string;
  lag_label?: string;
  freshness_label?: string;
  is_late?: boolean;
  quality_pct?: number | null;
  quality_score?: number | null;
  status: HealthStatus | string;
}

export function toAssetFixture(row: PubAssetRow): AssetFixture {
  const name = row.display_name ?? row.name ?? row.asset_key;
  const type = (row.asset_type ?? "Lakehouse table") as AssetFixture["type"];
  const domainRaw = row.domain_name ?? row.domain_key ?? "Finance";
  const domain = domainRaw.charAt(0).toUpperCase() + domainRaw.slice(1);
  const rawQuality = row.quality_pct !== undefined ? row.quality_pct : row.quality_score;
  const fresh = row.freshness_label ?? row.lag_label ?? "N/A";
  const late =
    row.is_late !== undefined
      ? row.is_late
      : fresh === "Run failed" || row.status === "warning" || row.status === "critical";
  const idShort = row.asset_key.includes(".") ? row.asset_key.split(".").pop()! : row.asset_key;
  return {
    id: idShort === "ingest_orders_pipeline" ? "ingest_orders" : idShort,
    name,
    type,
    icon: row.icon ?? ASSET_ICONS[type] ?? "ph-table",
    domain,
    fresh,
    late,
    quality: rawQuality === null || rawQuality === undefined ? -1 : rawQuality,
    status: row.status as HealthStatus,
  };
}

export interface PubIncidentRow {
  incident_key: string;
  severity?: SeverityLevel | string;
  title: string;
  asset_key?: string;
  monitor_type?: string;
  monitor_label?: string;
  summary?: string;
  sla_target_label?: string;
  observed_label?: string;
  domain_key?: string;
  detected_label?: string;
  detected_status?: IncidentStatus | string;
  initials?: string;
  assignee?: string;
}

export function normalizeIncidentStatus(raw?: unknown): IncidentStatus {
  const s = String(raw ?? "Open").trim().toLowerCase();
  if (s === "resolved" || s === "done" || s === "closed") return "Resolved";
  if (s === "in progress" || s === "in_progress") return "In progress";
  if (s === "blocked") return "Blocked";
  if (s === "investigating") return "Investigating";
  if (s === "acknowledged") return "Acknowledged";
  return "Open";
}

export function isActiveIncidentStatus(status?: unknown): boolean {
  const norm = normalizeIncidentStatus(status);
  return (
    norm === "Open" ||
    norm === "In progress" ||
    norm === "Blocked" ||
    norm === "Investigating" ||
    norm === "Acknowledged"
  );
}

export function toIncidentFixture(
  row: PubIncidentRow,
  state?: { status?: IncidentStatus | string }
): IncidentFixture {
  const status = normalizeIncidentStatus(state?.status ?? row.detected_status ?? "Open");
  const assetKey = row.asset_key ?? "finance.gl_transactions";
  const rawSev = String(row.severity ?? "Medium").toLowerCase();
  const sev: SeverityLevel =
    rawSev === "critical" || rawSev === "crit"
      ? "Critical"
      : rawSev === "high"
        ? "High"
        : rawSev === "low"
          ? "Low"
          : "Medium";
  const out: IncidentFixture = {
    id: row.incident_key,
    sev,
    title: row.title,
    asset: assetKey,
    monitor: row.monitor_label ?? "Freshness · Finance",
    age: row.detected_label ?? "1h ago",
    initials: row.initials ?? "PN",
    status,
  };
  if (row.summary !== undefined) out.summary = row.summary;
  if (row.monitor_type !== undefined) out.monitorType = row.monitor_type;
  if (row.sla_target_label !== undefined) out.slaTarget = row.sla_target_label;
  if (row.observed_label !== undefined) out.observed = row.observed_label;
  if (row.domain_key !== undefined) {
    out.domain = row.domain_key.charAt(0).toUpperCase() + row.domain_key.slice(1);
  }
  if (row.assignee !== undefined) out.assignee = row.assignee;
  return out;
}
