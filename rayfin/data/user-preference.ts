import { entity, uuid, text, authenticated } from '@microsoft/rayfin-core';

@authenticated('*', { policy: (claims, item) => claims.sub.eq(item.user_id) })
@entity()
export class UserPreference {
  @uuid() id!: string;
  @text({ max: 128 }) user_id!: string;
  @text({ max: 8 }) theme!: string;
  @text({ max: 8 }) default_time_range!: string;
  @text({ max: 36, optional: true }) last_workspace_id?: string;
  @text({ max: 500, optional: true }) favorite_domains?: string;
}
