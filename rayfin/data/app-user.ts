import { entity, uuid, text, date, authenticated } from '@microsoft/rayfin-core';

@authenticated('*', { policy: (claims, item) => claims.sub.eq(item.user_id) })
@entity()
export class AppUser {
  @uuid() id!: string;
  @text({ max: 128 }) user_id!: string;
  @text({ max: 36, optional: true }) object_id?: string;
  @text({ max: 256 }) upn!: string;
  @text({ max: 120 }) display_name!: string;
  @date() first_seen_at!: Date;
  @date() last_seen_at!: Date;
}
