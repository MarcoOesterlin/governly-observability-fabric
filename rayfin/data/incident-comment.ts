import { entity, uuid, text, date, authenticated } from '@microsoft/rayfin-core';

@authenticated(['read', 'create'])
@authenticated(['update', 'delete'], {
  policy: (claims, item) => claims.sub.eq(item.author_user_id),
})
@entity()
export class IncidentComment {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 32 }) incident_key!: string;
  @text({ max: 4000 }) body!: string;
  @text({ max: 120 }) author_name!: string;
  @text({ max: 128 }) author_user_id!: string;
  @text({ max: 36 }) author_object_id!: string;
  @date() created_at!: Date;
}
