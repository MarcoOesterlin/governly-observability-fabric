import { entity, uuid, text, date, authenticated } from '@microsoft/rayfin-core';

@authenticated('*')
@entity()
export class IncidentEvent {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 32 }) incident_key!: string;
  @text({ max: 24 }) kind!: string;
  @text({ max: 120 }) title!: string;
  @text({ max: 2000 }) body!: string;
  @text({ max: 120 }) actor_name!: string;
  @text({ max: 36 }) actor_object_id!: string;
  @date() created_at!: Date;
}
