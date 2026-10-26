import { entity, uuid, text, int, decimal, date, authenticated } from '@microsoft/rayfin-core';

@authenticated('read')
@entity()
export class PubOverviewKpi {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 8 }) range!: string;
  @text({ max: 32 }) kpi_key!: string;
  @text({ max: 64 }) label!: string;
  @decimal() value_num!: number;
  @text({ max: 32 }) value_label!: string;
  @text({ max: 32 }) trend_label!: string;
  @text({ max: 8 }) trend_direction!: string;
  @text({ max: 64 }) sub_label!: string;
  @date() published_at!: Date;
}

@authenticated('read')
@entity()
export class PubHealthBucket {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 8 }) range!: string;
  @int() bucket_index!: number;
  @date() bucket_start!: Date;
  @text({ max: 16 }) status!: string;
  @decimal() height_pct!: number;
  @date() published_at!: Date;
}

@authenticated('read')
@entity()
export class PubHealthDistribution {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @int() healthy!: number;
  @int() warning!: number;
  @int() critical!: number;
  @int() total!: number;
  @date() published_at!: Date;
}
