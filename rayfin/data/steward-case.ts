import { entity, uuid, text, date, authenticated } from '@microsoft/rayfin-core';

@authenticated('*')
@entity()
export class StewardCase {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 32 }) case_key!: string;
  @text({ max: 200 }) title!: string;
  @text({ max: 4000, optional: true }) description?: string;
  @text({ max: 24 }) status!: string;
  @text({ max: 16 }) priority!: string;
  @text({ max: 120 }) owner_name!: string;
  @text({ max: 36 }) owner_object_id!: string;
  @text({ max: 64 }) domain_key!: string;
  @date({ optional: true }) due_date?: Date;
  @date() created_at!: Date;
  @date() updated_at!: Date;
}
