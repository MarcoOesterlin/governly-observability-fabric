import { entity, uuid, text, date, authenticated } from '@microsoft/rayfin-core';

@authenticated('*')
@entity()
export class IncidentState {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 32 }) incident_key!: string;
  @text({ max: 64 }) domain_key!: string;
  @text({ max: 24 }) status!: string;
  @text({ max: 36, optional: true }) assignee_object_id?: string;
  @text({ max: 120, optional: true }) assignee_name?: string;
  @date({ optional: true }) snoozed_until?: Date;
  @text({ max: 2000, optional: true }) resolution_note?: string;
  @date() updated_at!: Date;
  @text({ max: 36 }) updated_by_object_id!: string;
  @text({ max: 120 }) updated_by_name!: string;
}
