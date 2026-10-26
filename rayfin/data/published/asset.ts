import { entity, uuid, text, int, decimal, boolean, date, authenticated } from '@microsoft/rayfin-core';

@authenticated('read')
@entity()
export class PubAsset {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 128 }) asset_key!: string;
  @text({ max: 128 }) name!: string;
  @text({ max: 32 }) asset_type!: string;
  @text({ max: 64 }) domain_key!: string;
  @text({ max: 64 }) domain_name!: string;
  @text({ max: 36 }) owner_object_id!: string;
  @text({ max: 120 }) owner_name!: string;
  @text({ max: 16 }) status!: string;
  @decimal() health_score!: number;
  @decimal() quality_score!: number;
  @text({ max: 32 }) freshness_label!: string;
  @boolean() is_late!: boolean;
  @date({ optional: true }) last_refresh_at?: Date;
  @int() sla_minutes!: number;
  @text({ max: 24 }) row_count_label!: string;
  @int() quality_pass!: number;
  @int() quality_total!: number;
  @text({ max: 512, optional: true }) fabric_item_url?: string;
  @date() published_at!: Date;
}

@authenticated('read')
@entity()
export class PubAssetLagPoint {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 128 }) asset_key!: string;
  @text({ max: 8 }) range!: string;
  @date() ts!: Date;
  @decimal() lag_minutes!: number;
  @date() published_at!: Date;
}

@authenticated('read')
@entity()
export class PubRefreshRun {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 64 }) run_id!: string;
  @text({ max: 128 }) asset_key!: string;
  @date() completed_at!: Date;
  @text({ max: 16 }) time_label!: string;
  @text({ max: 24 }) lag_label!: string;
  @text({ max: 24 }) rows_label!: string;
  @text({ max: 16 }) result!: string;
  @text({ max: 16 }) result_label!: string;
  @date() published_at!: Date;
}

@authenticated('read')
@entity()
export class PubQualityResult {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 64 }) monitor_key!: string;
  @text({ max: 128 }) asset_key!: string;
  @text({ max: 64 }) rule_name!: string;
  @text({ max: 128 }) definition!: string;
  @text({ max: 32 }) observed_label!: string;
  @text({ max: 8 }) result!: string;
  @date() published_at!: Date;
}

@authenticated('read')
@entity()
export class PubQualityFailedRow {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 128 }) asset_key!: string;
  @text({ max: 64 }) rule_name!: string;
  @text({ max: 128 }) rule_definition!: string;
  @text({ max: 128 }) primary_key!: string;
  @text({ max: 128 }) failed_column!: string;
  @text({ max: 256 }) failed_value!: string;
  @text({ max: 2000 }) row_json!: string;
  @text({ max: 1000 }) likely_cause!: string;
  @text({ max: 1000 }) suggested_solution!: string;
  @text({ max: 1000 }) sql_fix!: string;
  @date() detected_at!: Date;
}

@authenticated('read')
@entity()
export class PubAssetColumn {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 128 }) asset_key!: string;
  @text({ max: 128 }) column_name!: string;
  @text({ max: 48 }) data_type!: string;
  @int() ordinal!: number;
  @boolean() is_pk!: boolean;
  @boolean() is_fk!: boolean;
  @text({ max: 16, optional: true }) change_tag?: string;
  @date() published_at!: Date;
}

@authenticated('read')
@entity()
export class PubSchemaChange {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 64 }) change_id!: string;
  @text({ max: 128 }) asset_key!: string;
  @text({ max: 128 }) column_name!: string;
  @text({ max: 16 }) change_kind!: string;
  @text({ max: 200 }) detail!: string;
  @boolean() is_breaking!: boolean;
  @date() changed_at!: Date;
  @text({ max: 120 }) changed_by!: string;
  @date() published_at!: Date;
}

@authenticated('read')
@entity()
export class PubLineageEdge {
  @uuid() id!: string;
  @text({ max: 36 }) workspace_id!: string;
  @text({ max: 128 }) upstream_asset_key!: string;
  @text({ max: 128 }) upstream_name!: string;
  @text({ max: 32 }) upstream_type!: string;
  @text({ max: 128 }) downstream_asset_key!: string;
  @text({ max: 128 }) downstream_name!: string;
  @text({ max: 32 }) downstream_type!: string;
  @text({ max: 16 }) direction!: string;
  @int() hops!: number;
  @date() published_at!: Date;
}
