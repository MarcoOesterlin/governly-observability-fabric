import { entity, uuid, text, boolean, date, authenticated } from '@microsoft/rayfin-core';

@authenticated('read')
@entity()
export class PubWorkspace {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 200 }) display_name!: string;
  @text({ max: 32 }) capacity_sku!: string;  // descriptive label in the workspace switcher only — no metric is derived from it
  @boolean() is_monitored!: boolean;
  @date() published_at!: Date;
}

@authenticated('read')
@entity()
export class PubUserWorkspaceAccess {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 36 }) object_id!: string;
  @text({ max: 24 }) effective_role!: string;
  @text({ max: 80 }) via!: string;
  @date() published_at!: Date;
}

@authenticated('read')
@entity()
export class PubEntraUser {
  @uuid() id!: string;
  @text({ max: 36 }) object_id!: string;
  @text({ max: 256 }) upn!: string;
  @text({ max: 120 }) display_name!: string;
  @text({ max: 120, optional: true }) job_title?: string;
  @text({ max: 120, optional: true }) department?: string;
  @boolean() is_active!: boolean;
  @boolean() is_synthetic!: boolean;
  @date() published_at!: Date;
}

@authenticated('read')
@entity()
export class PubUserRole {
  @uuid() id!: string;
  @text({ max: 36 }) object_id!: string;
  @text({ max: 16 }) role!: string;
  @text({ max: 64, optional: true }) domain_key?: string;
  @date() published_at!: Date;
}

@authenticated('read')
@entity()
export class PubDomain {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 64 }) domain_key!: string;
  @text({ max: 120 }) name!: string;
  @text({ max: 36 }) lead_steward_object_id!: string;
  @date() published_at!: Date;
}
