import { entity, uuid, text, decimal, boolean, date, authenticated } from '@microsoft/rayfin-core';

@authenticated('*')
@entity()
export class QualityRule {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 128 }) asset_key!: string;
  @text({ max: 128 }) rule_name!: string;
  @text({ max: 32 }) rule_type!: string;
  @text({ max: 1000 }) expression!: string;
  @decimal() threshold_pct!: number;
  @text({ max: 16 }) severity!: string;
  @boolean() is_active!: boolean;
  @text({ max: 120 }) created_by!: string;
  @date() created_at!: Date;
  @date() updated_at!: Date;
}
