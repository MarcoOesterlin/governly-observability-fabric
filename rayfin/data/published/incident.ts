import { entity, uuid, text, int, date, authenticated } from '@microsoft/rayfin-core';

@authenticated('read')
@entity()
export class PubIncident {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 32 }) incident_key!: string;
  @text({ max: 128 }) asset_key!: string;
  @text({ max: 128 }) asset_name!: string;
  @text({ max: 32 }) monitor_type!: string;
  @text({ max: 64 }) monitor_label!: string;
  @text({ max: 16 }) severity!: string;
  @text({ max: 200 }) title!: string;
  @text({ max: 2000 }) summary!: string;
  @date() detected_at!: Date;
  @text({ max: 48 }) sla_target_label!: string;
  @text({ max: 48 }) observed_label!: string;
  @text({ max: 64 }) domain_key!: string;
  @date({ optional: true }) auto_resolved_at?: Date;
  @date() published_at!: Date;
}

@authenticated('read')
@entity()
export class PubIncidentImpact {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 32 }) incident_key!: string;
  @text({ max: 128 }) impacted_asset_key!: string;
  @text({ max: 128 }) impacted_name!: string;
  @text({ max: 32 }) impacted_type!: string;
  @text({ max: 16 }) impact_severity!: string;
  @int() hops!: number;
  @date() published_at!: Date;
}
