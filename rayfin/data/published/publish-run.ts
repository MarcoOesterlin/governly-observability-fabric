import { entity, uuid, text, date, authenticated } from '@microsoft/rayfin-core';

@authenticated('read')
@entity()
export class PubPublishRun {
  @uuid() id!: string;
  @text({ max: 64 }) run_id!: string;
  @date() started_at!: Date;
  @date() ended_at!: Date;
  @text({ max: 4000 }) rows_by_table!: string;
  @text({ max: 16 }) status!: string;
  @text({ max: 2000, optional: true }) error?: string;
}
