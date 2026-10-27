export type HealthStatus = "healthy" | "warning" | "critical";
export type SeverityLevel = "Critical" | "High" | "Medium" | "Low";
export type IncidentStatus =
  | "Open"
  | "In progress"
  | "Blocked"
  | "Acknowledged"
  | "Investigating"
  | "Resolved";
export type CaseStatus = "Open" | "In progress" | "Blocked" | "Done";
export type TimeRange = "24h" | "7d" | "30d";

export type KpiFixture = {
  label: string;
  value: string;
  sub: string;
  trend: string;
  icon: string;
  trendGood: boolean;
  trendFlat: boolean;
};

export type AssetFixture = {
  id: string;
  name: string;
  type: string;
  icon: string;
  domain: string;
  fresh: string;
  late: boolean;
  quality: number;
  status: "healthy" | "warning" | "critical";
};

export type IncidentFixture = {
  id: string;
  title: string;
  asset: string;
  sev: "Critical" | "High" | "Medium" | "Low";
  status: IncidentStatus;
  age: string;
  initials: string;
  monitor: string;
  summary?: string;
  monitorType?: string;
  slaTarget?: string;
  observed?: string;
  domain?: string;
  assignee?: string;
};

export type SchemaChangeFixture = {
  kind: "added" | "changed" | "dropped";
  icon: string;
  col: string;
  detail: string;
  time: string;
  breaking: boolean;
};

export type QualityRuleFixture = {
  name: string;
  detail: string;
  value: string;
  result: "pass" | "warn" | "fail";
};

export type SchemaColumnFixture = {
  col: string;
  type: string;
  flag: "" | "PK" | "FK";
  note: "" | "added" | "changed";
};

export type SchemaLogFixture = {
  text: string;
  time: string;
  by: string;
};

export type RefreshRunFixture = {
  time: string;
  lag: string;
  rows: string;
  result: "ok" | "breach";
  label: string;
};

export type LineageNodeFixture = {
  name: string;
  type: string;
};

export type ImpactFixture = {
  name: string;
  type: string;
  icon: string;
  sev: "Critical" | "High" | "Medium" | "Low";
};

export type CommentFixture = {
  who: string;
  initials: string;
  time: string;
  text: string;
  system: boolean;
};

export type NavItemFixture = {
  label: string;
  icon: string;
  path: string;
  badge?: string;
};

export type CaseFixture = {
  key: string;
  title: string;
  domain: string;
  owner: string;
  ownerInitials: string;
  status: "Open" | "In progress" | "Blocked" | "Done";
  priority: "Critical" | "High" | "Medium" | "Low";
  dueInDays: number;
  incidentKeys: string[];
};

export type TimelineFixture = {
  time: string;
  title: string;
  text: string;
  icon: string;
  color: string;
  kind?: string;
  at?: string;
  note?: string;
};

export type HealthBarFixture = { height: number; status: "ok" | "warn" | "crit" };
export type HealthDistributionFixture = { healthy: number; warning: number; critical: number; total: number };
export type LagPointFixture = { ts: string; lagMinutes: number; breach: boolean };
export type AssetDetailFixture = AssetFixture & {
  slaMinutes: number;
  lagLabel: string;
  rowCountLabel: string;
  owner: string;
  ownerInitials: string;
  description: string;
  qualityPass: number;
  qualityTotal: number;
};
export type IncidentDetailFixture = IncidentFixture & {
  detectedAt: string;
  monitorDetail: string;
  assignee?: string;
  timeline: TimelineFixture[];
  comments: CommentFixture[];
  impact: ImpactFixture[];
  resolutionNote?: string;
};
