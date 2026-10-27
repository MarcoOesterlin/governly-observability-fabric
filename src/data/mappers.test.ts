import { describe, expect, it } from "vitest";
import { ASSETS, KPIS } from "../fixtures/design";
import { toAssetFixture, toIncidentFixture, toKpiFixture } from "./mappers";
import { mapRawPubAssetToItem } from "./useAssets";
import { isDriftOrNullTelemetryRow, isSystemQualityRuleRow } from "./useQualityRules";

describe("mappers reproduce the design fixtures", () => {
  it("maps the healthy-assets KPI", () => {
    const row = {
      kpi_key: "healthy_assets",
      value_label: "84%",
      sub_label: "142 of 169",
      trend_label: "+2.1%",
      trend_direction: "up",
      is_good: true,
    };
    expect(toKpiFixture(row)).toEqual(KPIS[0]);
  });

  it("maps gl_transactions", () => {
    const row = {
      asset_key: "finance.gl_transactions",
      display_name: "finance.gl_transactions",
      asset_type: "Lakehouse table",
      domain_name: "Finance",
      icon: "ph-database",
      lag_label: "2h 14m ago",
      is_late: true,
      quality_pct: 91,
      status: "warning",
    };
    expect(toAssetFixture(row)).toEqual(ASSETS.find((a) => a.name === "finance.gl_transactions"));
  });

  it('maps a failed pipeline to quality -1 and "Run failed"', () => {
    const row = {
      asset_key: "ingest_orders_pipeline",
      lag_label: "Run failed",
      is_late: true,
      quality_pct: null,
      status: "critical",
    };
    expect(toAssetFixture(row)).toMatchObject({ fresh: "Run failed", quality: -1, late: true });
  });

  it("preserves the unicode minus in the volume anomaly title", () => {
    const row = { incident_key: "INC-2043", title: "Volume anomaly (−38%)" };
    expect(toIncidentFixture(row, undefined).title).toBe("Volume anomaly (\u221238%)");
  });

  it("defaults an incident with no state row to Open", () => {
    const row = { incident_key: "INC-2047", title: "Freshness SLA breached", detected_status: "Open" };
    expect(toIncidentFixture(row, undefined).status).toBe("Open");
  });

  it("lets IncidentState override the published status", () => {
    const row = { incident_key: "INC-2047", title: "Freshness SLA breached", detected_status: "Open" };
    expect(toIncidentFixture(row, { status: "Investigating" }).status).toBe("Investigating");
  });

  it("excludes Row count drift and Key Null Rate telemetry from Data Quality so unconfigured tables show N/A (-1)", () => {
    const driftRows = [
      {
        asset_key: "silver.fact_sale",
        monitor_key: "silver.fact_sale:ops_drift",
        rule_name: "Row count drift (before vs after)",
        definition: "APPEND · v142 · Start 10,000 → After 10,500",
        observed_label: "+500 ins · 0 upd",
        result: "pass",
      },
      {
        asset_key: "silver.fact_sale",
        monitor_key: "silver.fact_sale:knull_sale_key",
        rule_name: "Key Null Rate (sale_key)",
        definition: "Daily null rate on key column sale_key",
        observed_label: "0.00% null",
        result: "pass",
      },
      {
        asset_key: "silver.fact_sale",
        monitor_key: "silver.fact_sale:knull_city_key",
        rule_name: "Key Null Rate (city_key)",
        definition: "Daily null rate on key column city_key",
        observed_label: "0.00% null",
        result: "pass",
      },
    ];

    for (const r of driftRows) {
      expect(isDriftOrNullTelemetryRow(r)).toBe(true);
      expect(isSystemQualityRuleRow(r)).toBe(true);
    }

    const mapped = mapRawPubAssetToItem(
      {
        asset_key: "silver.fact_sale",
        display_name: "silver.fact_sale",
        asset_type: "Lakehouse table",
        domain_name: "Sales",
        lag_label: "12m ago",
        is_late: false,
        quality_pct: -1,
        status: "healthy",
        quality_pass: 0,
        quality_total: 0,
      },
      driftRows,
      []
    );
    expect(mapped.quality).toBe(-1);
    expect(mapped.qualityPass).toBe(0);
    expect(mapped.qualityTotal).toBe(0);
  });
});
