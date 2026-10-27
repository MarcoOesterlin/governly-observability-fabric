import { useState } from 'react';
import { useInRouterContext, useNavigate } from 'react-router-dom';
import { css } from '../../../lib/css';
import { badge } from '../primitives';
import {
  useAsset,
  useAssetFreshness,
  useAssetLineage,
  useAssetQuality,
  useJobFailureDiagnostics,
  type JobFailureDiagnostic,
} from '../../../data/useAsset';
import { useAssets, useRuntimeAssets, type AssetItem } from '../../../data/useAssets';
import {
  evaluateExpectedLanding,
  formatSlaMinutes,
  LANDING_TIME_PRESETS,
  resolveRowCountDriftAndOps,
  SLA_PRESETS,
  useExpectedLandingTimes,
  useFreshnessSlas,
} from '../../../data/useFreshnessSla';
import { useIncidents } from '../../../data/useIncidents';
import type { LineageNodeFixture, RefreshRunFixture } from '../../../fixtures/types';

export interface AffectedObjectItem {
  name: string;
  type: string;
  icon: string;
  impactLabel: string;
  navigable: boolean;
}

function iconForType(type: string): string {
  const lower = type.toLowerCase();
  if (lower.includes('notebook')) return 'ph-notebook';
  if (lower.includes('pipeline')) return 'ph-flow-arrow';
  if (lower.includes('semantic')) return 'ph-cube';
  if (lower.includes('lakehouse') && !lower.includes('table')) return 'ph-warehouse';
  return 'ph-table';
}

export function resolveActivityImpact(
  activity: { name: string; type: string; domain?: string; workspaceId?: string },
  allCatalog: AssetItem[],
  explicitLineage?: { upstream: LineageNodeFixture[]; downstream: LineageNodeFixture[] },
): {
  upstream: AffectedObjectItem[];
  downstream: AffectedObjectItem[];
} {
  const actName = activity.name || '';
  const actLower = actName.toLowerCase();
  const domainPrefix = actName.includes('.') ? actName.split('.')[0].toLowerCase() : '';
  const actDomain = (activity.domain || '').toLowerCase();

  const sameScope = allCatalog.filter((item) => {
    if (item.name === actName) return false;
    const itemPrefix = item.name.includes('.') ? item.name.split('.')[0].toLowerCase() : '';
    if (activity.workspaceId && item.workspaceId && activity.workspaceId === item.workspaceId) {
      return true;
    }
    if (domainPrefix && itemPrefix === domainPrefix) return true;
    if (actDomain && item.domain.toLowerCase() === actDomain) return true;
    return false;
  });

  const upstreamMap = new Map<string, AffectedObjectItem>();
  const downstreamMap = new Map<string, AffectedObjectItem>();

  if (explicitLineage) {
    for (const u of explicitLineage.upstream) {
      upstreamMap.set(u.name, {
        name: u.name,
        type: u.type,
        icon: iconForType(u.type),
        impactLabel: 'Upstream source',
        navigable: allCatalog.some((a) => a.name === u.name),
      });
    }
    for (const d of explicitLineage.downstream) {
      downstreamMap.set(d.name, {
        name: d.name,
        type: d.type,
        icon: iconForType(d.type),
        impactLabel: 'Downstream broken / stale',
        navigable: allCatalog.some((a) => a.name === d.name),
      });
    }
  }

  // Special case: Governly observability compute or installer notebooks
  if (actLower.includes('nb_governly')) {
    const tablesAndModels = allCatalog.filter(
      (a) => a.type === 'Lakehouse table' || a.type === 'Semantic model',
    );
    for (const src of tablesAndModels.slice(0, 4)) {
      upstreamMap.set(src.name, {
        name: src.name,
        type: src.type,
        icon: iconForType(src.type),
        impactLabel: 'OneLake / Fabric source read',
        navigable: true,
      });
    }
    for (const target of tablesAndModels.slice(0, 6)) {
      downstreamMap.set(target.name, {
        name: target.name,
        type: target.type,
        icon: iconForType(target.type),
        impactLabel: 'Freshness & DQ telemetry stale',
        navigable: true,
      });
    }
    if (downstreamMap.size === 0) {
      downstreamMap.set('governly.PubAssets & PubQualityResults', {
        name: 'governly.PubAssets & PubQualityResults',
        type: 'SQL Telemetry Tables',
        icon: 'ph-database',
        impactLabel: 'Observability metrics not updated',
        navigable: false,
      });
    }
    return {
      upstream: Array.from(upstreamMap.values()),
      downstream: Array.from(downstreamMap.values()),
    };
  }

  const isPipeline = activity.type === 'Data pipeline';
  const isNotebook = activity.type === 'Spark notebook';

  if (isPipeline) {
    // Upstream of a pipeline: Lakehouse / raw sources in the workspace
    const lakehouses = sameScope.filter(
      (a) => a.type === 'Lakehouse' || a.name.toLowerCase().includes('raw') || a.name.toLowerCase().includes('events'),
    );
    for (const lh of lakehouses.slice(0, 3)) {
      upstreamMap.set(lh.name, {
        name: lh.name,
        type: lh.type,
        icon: iconForType(lh.type),
        impactLabel: 'Ingestion source',
        navigable: true,
      });
    }
    if (upstreamMap.size === 0) {
      upstreamMap.set(`${domainPrefix || 'workspace'}.onelake_landing_zone`, {
        name: `${domainPrefix || 'workspace'}.onelake_landing_zone`,
        type: 'OneLake Files / Source',
        icon: 'ph-folder-open',
        impactLabel: 'Upstream source feed',
        navigable: false,
      });
    }

    // Downstream of a pipeline: Spark notebooks, Lakehouse tables, and Semantic models in the workspace
    const notebooks = sameScope.filter((a) => a.type === 'Spark notebook');
    const tables = sameScope.filter((a) => a.type === 'Lakehouse table');
    const models = sameScope.filter((a) => a.type === 'Semantic model');
    for (const nb of notebooks) {
      downstreamMap.set(nb.name, {
        name: nb.name,
        type: nb.type,
        icon: 'ph-notebook',
        impactLabel: 'Blocked transform activity',
        navigable: true,
      });
    }
    for (const tbl of tables.slice(0, 6)) {
      downstreamMap.set(tbl.name, {
        name: tbl.name,
        type: tbl.type,
        icon: 'ph-table',
        impactLabel: 'Table stale / unrefreshed',
        navigable: true,
      });
    }
    for (const sm of models) {
      downstreamMap.set(sm.name, {
        name: sm.name,
        type: sm.type,
        icon: 'ph-cube',
        impactLabel: 'Semantic model / BI stale',
        navigable: true,
      });
    }
  } else if (isNotebook) {
    // Upstream of a notebook: Data pipelines and source tables/lakehouses in the workspace
    const pipelines = sameScope.filter((a) => a.type === 'Data pipeline');
    const lakehouses = sameScope.filter((a) => a.type === 'Lakehouse');
    const tables = sameScope.filter((a) => a.type === 'Lakehouse table');
    for (const pl of pipelines) {
      upstreamMap.set(pl.name, {
        name: pl.name,
        type: pl.type,
        icon: 'ph-flow-arrow',
        impactLabel: 'Orchestrating pipeline',
        navigable: true,
      });
    }
    for (const lh of lakehouses.slice(0, 2)) {
      upstreamMap.set(lh.name, {
        name: lh.name,
        type: lh.type,
        icon: 'ph-warehouse',
        impactLabel: 'Source Lakehouse',
        navigable: true,
      });
    }
    if (upstreamMap.size === 0 && tables.length > 0) {
      const srcTbl = tables[0];
      upstreamMap.set(srcTbl.name, {
        name: srcTbl.name,
        type: srcTbl.type,
        icon: 'ph-table',
        impactLabel: 'Source Delta table',
        navigable: true,
      });
    }

    // Downstream of a notebook: Target Lakehouse tables and Semantic models in the workspace
    const models = sameScope.filter((a) => a.type === 'Semantic model');
    for (const tbl of tables.slice(0, 6)) {
      downstreamMap.set(tbl.name, {
        name: tbl.name,
        type: tbl.type,
        icon: 'ph-table',
        impactLabel: 'Target table possibly broken / stale',
        navigable: true,
      });
    }
    for (const sm of models) {
      downstreamMap.set(sm.name, {
        name: sm.name,
        type: sm.type,
        icon: 'ph-cube',
        impactLabel: 'Semantic model / BI stale',
        navigable: true,
      });
    }
  } else {
    // Table or Semantic model failure/breach
    const jobs = sameScope.filter(
      (a) => a.type === 'Data pipeline' || a.type === 'Spark notebook',
    );
    for (const j of jobs) {
      upstreamMap.set(j.name, {
        name: j.name,
        type: j.type,
        icon: iconForType(j.type),
        impactLabel: 'Upstream producer job',
        navigable: true,
      });
    }
    const models = sameScope.filter(
      (a) => a.type === 'Semantic model' && a.name !== actName,
    );
    for (const sm of models) {
      downstreamMap.set(sm.name, {
        name: sm.name,
        type: sm.type,
        icon: 'ph-cube',
        impactLabel: 'Downstream semantic model impacted',
        navigable: true,
      });
    }
  }

  return {
    upstream: Array.from(upstreamMap.values()),
    downstream: Array.from(downstreamMap.values()),
  };
}

export function buildFallbackJobDiagnostic(
  assetName: string,
  assetType: string,
  freshLabel: string,
  slaLabel: string,
  incidentSummary?: string,
): JobFailureDiagnostic {
  const isHardFail = freshLabel.toLowerCase().includes('fail');
  if (incidentSummary && incidentSummary.includes('Possible solution:')) {
    const [whyPart, solPart] = incidentSummary.split('Possible solution:');
    return {
      id: `fallback-${assetName}`,
      assetKey: assetName,
      assetType,
      runId: 'latest',
      statusLabel: isHardFail ? 'Run Failed' : 'SLA Breach',
      errorCode: isHardFail ? 'JobExecutionFailed' : 'FreshnessSlaBreach',
      whyFailed: whyPart.replace(/^Why it failed:\s*/i, '').trim(),
      possibleSolution: solPart.trim(),
      detectedAt: 'Latest run',
    };
  }
  if (isHardFail) {
    return {
      id: `fallback-${assetName}`,
      assetKey: assetName,
      assetType,
      runId: 'latest',
      statusLabel: 'Run Failed',
      errorCode: 'JobExecutionFailed',
      whyFailed: `${assetType} "${assetName}" terminated with status Failed in the Fabric Job Scheduler (${incidentSummary || 'execution error during scheduled or manual run'}).`,
      possibleSolution:
        assetType === 'Spark notebook'
          ? '1. Check Fabric Monitoring Hub for Spark cell exceptions (AnalysisException, missing column/table, or F-SKU concurrency limit).\n2. Stop any idle interactive Spark sessions if running on F2 capacity, then re-run the notebook.'
          : '1. Inspect the failed activity output in the Fabric Data Pipeline run history.\n2. Verify upstream Lakehouse connection credentials and target table schema, then re-trigger the pipeline.',
      detectedAt: 'Latest run',
    };
  }
  return {
    id: `fallback-${assetName}`,
    assetKey: assetName,
    assetType,
    runId: 'latest',
    statusLabel: 'SLA Breach',
    errorCode: 'SlaWindowExceeded',
    whyFailed: `${assetType} "${assetName}" last completed ${freshLabel}, exceeding its configured SLA target of ${slaLabel}.`,
    possibleSolution:
      '1. Verify that the recurring schedule is enabled for this item in Microsoft Fabric.\n2. Check whether an upstream pipeline or Spark session was queued or throttled on the capacity, or increase the SLA target above if this cadence is expected.',
    detectedAt: 'Latest run',
  };
}

export function buildLagPolyline(
  lagPoints: number[],
  slaMinutes: number,
): { points: string; lastY: number } {
  const safeSla = Math.max(1, slaMinutes);
  const startX = 82;
  const endX = 660;
  const mapValToY = (val: number, maxVal: number) => {
    if (val <= safeSla) {
      return Math.round(194 - (Math.max(0, val) / safeSla) * 54);
    }
    const overRatio = Math.min(1, (val - safeSla) / Math.max(1, maxVal - safeSla));
    return Math.round(140 - overRatio * 96);
  };

  if (!lagPoints.length) {
    return { points: `${startX},185 ${endX},185`, lastY: 185 };
  }
  const maxVal = Math.max(safeSla * 1.6, ...lagPoints, 10);
  if (lagPoints.length === 1) {
    const y = mapValToY(lagPoints[0], maxVal);
    return { points: `${startX},${y} ${endX},${y}`, lastY: y };
  }
  const coords = lagPoints.map((val, idx) => {
    const x = Math.round(startX + (idx / Math.max(1, lagPoints.length - 1)) * (endX - startX));
    const y = mapValToY(val, maxVal);
    return { x, y };
  });
  return {
    points: coords.map((c) => `${c.x},${c.y}`).join(' '),
    lastY: coords[coords.length - 1]?.y ?? 185,
  };
}

export function FreshnessTab({
  assetKey,
  runs: propRuns,
}: {
  assetKey: string;
  runs?: RefreshRunFixture[];
}) {
  const inRouter = useInRouterContext();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const routerNavigate = inRouter ? useNavigate() : null;
  const navigate = (to: string) => {
    if (routerNavigate) routerNavigate(to);
  };
  const asset = useAsset(assetKey);
  const { allRows: dataAssets } = useAssets({ includeRuntime: true });
  const { rows: runtimeAssets } = useRuntimeAssets();
  const explicitLineage = useAssetLineage(assetKey);
  const { runs: liveRuns, lagPoints, lagLabels } = useAssetFreshness(assetKey);
  const qualityChecks = useAssetQuality(assetKey);
  const jobDiagnostics = useJobFailureDiagnostics(assetKey);
  const allIncidents = useIncidents();
  const { setSlaTarget, saving } = useFreshnessSlas();
  const {
    landingMap,
    setExpectedLandingTime,
    saving: landingSaving,
  } = useExpectedLandingTimes();
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const runs = propRuns ?? liveRuns;
  const slaMin = asset.slaMinutes ?? 60;
  const { points, lastY } = buildLagPolyline(lagPoints, slaMin);
  const dotColor = asset.late ? 'var(--crit)' : 'var(--ok)';
  const slaLabel = formatSlaMinutes(slaMin);
  const midAxisLabel = formatSlaMinutes(Math.round(slaMin * 1.5));
  const topAxisLabel = formatSlaMinutes(Math.round(slaMin * 2));

  const landingEval = evaluateExpectedLanding(
    asset.id || asset.name || assetKey,
    runs,
    landingMap,
  );
  const opsDrift = resolveRowCountDriftAndOps(
    asset.id || asset.name || assetKey,
    asset.type,
    asset.rowCountLabel ?? '',
    runs,
    qualityChecks,
  );

  const combinedCatalog = Array.from(
    new Map([...dataAssets, ...runtimeAssets].map((a) => [a.name, a])).values(),
  );
  const impact = resolveActivityImpact(asset, combinedCatalog, explicitLineage);

  const assetIncident = allIncidents.find(
    (i) =>
      (i.asset === assetKey || i.asset === asset.name) &&
      i.status !== 'Resolved' &&
      (i.monitor.toLowerCase().includes('pipeline') ||
        i.monitor.toLowerCase().includes('freshness')),
  );
  const hasFailedOrBreachedRun =
    asset.late ||
    asset.fresh.toLowerCase().includes('fail') ||
    runs.some((r) => r.result === 'breach');

  const activeDiagnostics: JobFailureDiagnostic[] =
    jobDiagnostics.length > 0
      ? jobDiagnostics
      : hasFailedOrBreachedRun
        ? [
            buildFallbackJobDiagnostic(
              asset.name || assetKey,
              asset.type || 'Pipeline / Notebook',
              asset.fresh,
              slaLabel,
              assetIncident?.summary,
            ),
          ]
        : [];

  const handleSlaChange = async (newMin: number, scope: 'asset' | 'default') => {
    const targetKey = scope === 'default' ? '*' : (asset.id || assetKey);
    await setSlaTarget(targetKey, newMin);
    setSavedNotice(
      scope === 'default'
        ? `Default SLA set to ${formatSlaMinutes(newMin)} for all assets`
        : `SLA set to ${formatSlaMinutes(newMin)} for ${asset.name}`,
    );
    setTimeout(() => setSavedNotice(null), 3000);
  };

  return (
    <div style={css('display:flex;flex-direction:column;gap:16px;')}>
      <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;padding:18px 20px;box-shadow:var(--shadow);')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:8px;')}>
          <div style={css('font-size:14px;font-weight:600;color:var(--fg);')}>
            Refresh lag · commit history ({asset.name})
          </div>
          <div style={css('display:flex;align-items:center;gap:10px;flex-wrap:wrap;')}>
            <span style={css('font-size:11.5px;color:var(--fgm);')}>
              Latest: <strong>{asset.fresh}</strong>
            </span>
            <div style={css('display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:8px;background:var(--card2,#f4f4f6);border:1px solid var(--border,#e7e7ea);')}>
              <span style={css('font-size:11px;font-weight:600;color:var(--fgm);')}>SLA Target:</span>
              <select
                aria-label="SLA Target"
                disabled={saving}
                value={SLA_PRESETS.some((p) => p.minutes === slaMin) ? slaMin : 720}
                onChange={(e) => void handleSlaChange(Number(e.target.value), 'asset')}
                style={css(
                  "height:24px;padding:0 6px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);color:var(--fg);font-size:11.5px;font-weight:600;font-family:'Geist Mono Variable','Geist Mono',ui-monospace,monospace;cursor:pointer;",
                )}
              >
                {!SLA_PRESETS.some((p) => p.minutes === slaMin) && (
                  <option value={slaMin}>{slaLabel}</option>
                )}
                {SLA_PRESETS.map((p) => (
                  <option key={p.minutes} value={p.minutes}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSlaChange(slaMin, 'default')}
                title="Apply this SLA as the workspace default for all tables"
                style={css(
                  'height:24px;padding:0 8px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);color:var(--fgm);font-size:11px;font-weight:500;cursor:pointer;',
                )}
              >
                Set as default
              </button>
            </div>
            <div style={css('display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border-radius:8px;background:var(--card2,#f4f4f6);border:1px solid var(--border,#e7e7ea);')}>
              <span style={css('font-size:11px;font-weight:600;color:var(--fgm);')}>
                Expected Landing:
              </span>
              <span
                style={css(
                  `font-size:11.5px;font-weight:600;font-family:'Geist Mono',monospace;color:${
                    landingEval.isLateVsExpected ? 'var(--crit,#dc2626)' : 'var(--fg,#18181b)'
                  };`,
                )}
              >
                {landingEval.expectedTime}
              </span>
              <span style={css('font-size:10.5px;color:var(--fgm);')}>
                ({landingEval.sourceLabel})
              </span>
              <select
                aria-label="Expected Landing Time Override"
                disabled={landingSaving}
                value={
                  landingMap[asset.id || assetKey] &&
                  landingMap[asset.id || assetKey] !== 'auto'
                    ? landingMap[asset.id || assetKey]
                    : 'auto'
                }
                onChange={(e) => {
                  const val = e.target.value;
                  void setExpectedLandingTime(asset.id || assetKey, val);
                  setSavedNotice(
                    val === 'auto'
                      ? `Expected landing set to Auto Average (${landingEval.avgLandingTime ?? '06:00'})`
                      : `Expected landing time set to ${val} for ${asset.name}`,
                  );
                  setTimeout(() => setSavedNotice(null), 3000);
                }}
                style={css(
                  "height:24px;padding:0 6px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);color:var(--fg);font-size:11px;font-weight:600;font-family:'Geist Mono',monospace;cursor:pointer;",
                )}
              >
                {LANDING_TIME_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.value === 'auto' && landingEval.avgLandingTime
                      ? `Auto Avg (${landingEval.avgLandingTime})`
                      : p.label}
                  </option>
                ))}
              </select>
            </div>
            <span
              style={
                landingEval.isLateVsExpected
                  ? badge('var(--crit)', 'var(--critb)')
                  : badge('var(--ok)', 'var(--okb)')
              }
            >
              {landingEval.statusLabel}
            </span>
            {savedNotice && (
              <span style={css('font-size:11px;font-weight:600;color:var(--ok);')}>
                {savedNotice}
              </span>
            )}
          </div>
        </div>
        <div style={css('display:grid;grid-template-columns:64px 1fr;align-items:stretch;height:220px;')}>
          <div style={css("position:relative;height:220px;font-family:'Geist Mono Variable','Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1;user-select:none;")}>
            <span style={css('position:absolute;left:0;top:18.2%;transform:translateY(-50%);color:var(--fgs);')}>
              {topAxisLabel}
            </span>
            <span style={css('position:absolute;left:0;top:40.9%;transform:translateY(-50%);color:var(--fgs);')}>
              {midAxisLabel}
            </span>
            <span style={css('position:absolute;left:0;top:63.6%;transform:translateY(-50%);color:var(--crit);font-weight:600;')}>
              SLA {slaLabel}
            </span>
            <span style={css('position:absolute;left:0;top:88.2%;transform:translateY(-50%);color:var(--fgs);')}>
              0m
            </span>
          </div>
          <svg viewBox="80 0 600 220" preserveAspectRatio="none" style={css('width:100%;height:220px;display:block;overflow:visible;')}>
            <line x1="82" y1="40" x2="676" y2="40" stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="82" y1="90" x2="676" y2="90" stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="82" y1="140" x2="676" y2="140" stroke="var(--crit)" strokeWidth="1.4" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
            <line x1="82" y1="194" x2="676" y2="194" stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <polyline points={points} fill="none" stroke="var(--info)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <circle cx="660" cy={lastY} r="4.5" fill={dotColor} vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        {lagLabels.length > 0 && (
          <div style={css("display:flex;justify-content:space-between;font-size:11px;color:var(--fgs);font-family:'Geist Mono Variable','Geist Mono',ui-monospace,monospace;padding-left:64px;margin-top:4px;")}>
            {lagLabels.map((lbl, idx) => (
              <span key={idx}>{lbl}</span>
            ))}
          </div>
        )}
      </div>

      <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);padding:16px 18px;display:flex;flex-direction:column;gap:14px;')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;')}>
          <div style={css('display:flex;align-items:center;gap:8px;')}>
            <i className="ph ph-arrows-left-right" style={css('font-size:16px;color:var(--accent,#4f46e5);')} aria-hidden="true" />
            <span style={css('font-size:14px;font-weight:600;color:var(--fg);')}>
              Row Count Drift (Start vs. After Processing) &amp; Operational Metadata
            </span>
          </div>
          <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
            <span
              style={css(
                "font-size:11px;font-family:'Geist Mono',monospace;padding:2px 8px;border-radius:6px;background:var(--card2,#f4f4f6);color:var(--fgm);",
              )}
            >
              {opsDrift.operation} · {opsDrift.commitVersionLabel}
            </span>
            <span
              style={
                opsDrift.driftStatus === 'breach'
                  ? badge('var(--crit)', 'var(--critb)')
                  : opsDrift.driftStatus === 'warn'
                    ? badge('var(--warn)', 'var(--warnb)')
                    : badge('var(--ok)', 'var(--okb)')
              }
            >
              Drift {opsDrift.driftPctLabel} ({opsDrift.netDeltaLabel})
            </span>
          </div>
        </div>

        <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;')}>
          <div style={css('padding:11px 13px;border-radius:8px;background:var(--card2,#fafafa);border:1px solid var(--border,#e7e7ea);')}>
            <div style={css('font-size:11px;font-weight:600;color:var(--fgm);text-transform:uppercase;letter-spacing:0.04em;')}>
              Rows at Start (Before Processing)
            </div>
            <div style={css("font-size:15px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fg);margin-top:4px;")}>
              {opsDrift.rowsBeforeLabel}
            </div>
            <div style={css('font-size:11px;color:var(--fgm);margin-top:2px;')}>
              Prior Delta version baseline
            </div>
          </div>

          <div style={css('padding:11px 13px;border-radius:8px;background:var(--card2,#fafafa);border:1px solid var(--border,#e7e7ea);')}>
            <div style={css('font-size:11px;font-weight:600;color:var(--fgm);text-transform:uppercase;letter-spacing:0.04em;')}>
              Rows After Processing
            </div>
            <div style={css("font-size:15px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fg);margin-top:4px;")}>
              {opsDrift.rowsAfterLabel}
            </div>
            <div style={css('font-size:11px;color:var(--fgm);margin-top:2px;')}>
              Latest committed table state
            </div>
          </div>

          <div style={css('padding:11px 13px;border-radius:8px;background:var(--card2,#fafafa);border:1px solid var(--border,#e7e7ea);')}>
            <div style={css('font-size:11px;font-weight:600;color:var(--fgm);text-transform:uppercase;letter-spacing:0.04em;')}>
              Net Row Count Drift
            </div>
            <div
              style={css(
                `font-size:15px;font-weight:600;font-family:'Geist Mono',monospace;color:${
                  opsDrift.driftStatus === 'breach'
                    ? 'var(--crit,#dc2626)'
                    : opsDrift.driftStatus === 'warn'
                      ? 'var(--warn,#d97706)'
                      : 'var(--ok,#16a34a)'
                };margin-top:4px;`,
              )}
            >
              {opsDrift.driftPctLabel} ({opsDrift.netDeltaLabel})
            </div>
            <div style={css("font-size:11px;font-family:'Geist Mono',monospace;color:var(--fgm);margin-top:2px;")}>
              {opsDrift.dmlSummary}
            </div>
          </div>

          <div style={css('padding:11px 13px;border-radius:8px;background:var(--card2,#fafafa);border:1px solid var(--border,#e7e7ea);')}>
            <div style={css('font-size:11px;font-weight:600;color:var(--fgm);text-transform:uppercase;letter-spacing:0.04em;')}>
              Operational Metadata
            </div>
            <div style={css("font-size:13.5px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fg);margin-top:4px;")}>
              Duration {opsDrift.executionDurationLabel} · {opsDrift.storageSizeLabel}
            </div>
            <div style={css('font-size:11px;color:var(--fgm);margin-top:2px;')}>
              Expected Landing: <b>{landingEval.expectedTime}</b> ({landingEval.sourceLabel})
            </div>
          </div>
        </div>
      </div>

      <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
        <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);display:flex;align-items:center;justify-content:space-between;')}>
          <span style={css('font-size:14px;font-weight:600;color:var(--fg);')}>Recent refresh runs</span>
          <span style={css('font-size:12px;color:var(--fgm);')}>{runs.length} recorded commits / runs</span>
        </div>
        {runs.length === 0 ? (
          <div style={css('padding:16px 18px;font-size:12.5px;color:var(--fgm);')}>
            No refresh runs recorded for {assetKey} yet.
          </div>
        ) : (
          runs.map((r, idx) => (
            <div key={`${r.time}-${idx}`} style={css('display:grid;grid-template-columns:1fr 1fr 1fr 110px;gap:12px;padding:12px 18px;align-items:center;border-bottom:1px solid var(--border,#e7e7ea);font-size:12.5px;')}>
              <span style={css("font-family:'Geist Mono',monospace;color:var(--fg);")}>{r.time}</span>
              <span style={css('color:var(--fgm);')}>lag {r.lag}</span>
              <span style={css('color:var(--fgm);')}>
                {r.rows && r.rows !== '—' ? (r.rows.match(/^\d/) ? `${r.rows} rows` : r.rows) : asset.type}
              </span>
              <span style={r.result === 'breach' ? badge('var(--crit)', 'var(--critb)') : badge('var(--ok)', 'var(--okb)')}>
                {r.label}
              </span>
            </div>
          ))
        )}
      </div>

      {activeDiagnostics.length > 0 && (
        <div style={css('background:var(--card,#fff);border:1px solid var(--crit,#dc2626);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
          <div style={css('padding:14px 18px;background:var(--critb,#fef2f2);border-bottom:1px solid var(--border,#e7e7ea);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;')}>
            <div style={css('display:flex;align-items:center;gap:8px;')}>
              <i className="ph ph-warning-octagon" style={css('font-size:17px;color:var(--crit,#dc2626);')} aria-hidden="true" />
              <span style={css('font-size:14px;font-weight:600;color:var(--fg);')}>
                Run Failure Diagnostics &amp; Possible Solution ({asset.name})
              </span>
            </div>
            {asset.fabricItemUrl && (
              <button
                type="button"
                onClick={() => window.open(asset.fabricItemUrl!, '_blank', 'noopener,noreferrer')}
                style={css('height:28px;padding:0 10px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);color:var(--fg);font-size:11.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;')}
              >
                <i className="ph ph-arrow-square-out" aria-hidden="true" />
                Open in Fabric Workspace
              </button>
            )}
          </div>
          {activeDiagnostics.map((diag) => (
            <div key={diag.id} style={css('padding:16px 18px;border-bottom:1px solid var(--border,#e7e7ea);display:flex;flex-direction:column;gap:10px;')}>
              <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
                <span style={badge('var(--crit)', 'var(--critb)')}>{diag.statusLabel}</span>
                <span style={css("font-size:11.5px;font-family:'Geist Mono',monospace;color:var(--fgm);")}>
                  {diag.errorCode} · {diag.assetType}
                </span>
              </div>
              <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:14px;')}>
                <div style={css('padding:12px 14px;border-radius:8px;background:var(--card2,#f4f4f6);border:1px solid var(--border,#e7e7ea);')}>
                  <div style={css('font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--crit,#dc2626);margin-bottom:5px;')}>
                    Why It Failed
                  </div>
                  <div style={css('font-size:12.5px;color:var(--fg);line-height:1.5;')}>
                    {diag.whyFailed}
                  </div>
                </div>
                <div style={css('padding:12px 14px;border-radius:8px;background:var(--card2,#f4f4f6);border:1px solid var(--border,#e7e7ea);')}>
                  <div style={css('font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--ok,#16a34a);margin-bottom:5px;')}>
                    Possible Solution
                  </div>
                  <div style={css('font-size:12.5px;color:var(--fg);line-height:1.5;white-space:pre-line;')}>
                    {diag.possibleSolution}
                  </div>
                </div>
              </div>

              {(impact.upstream.length > 0 || impact.downstream.length > 0) && (
                <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:14px;padding-top:4px;')}>
                  <div style={css('padding:12px 14px;border-radius:8px;background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);')}>
                    <div style={css('font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--fgm,#52525b);margin-bottom:8px;display:flex;align-items:center;gap:6px;')}>
                      <i className="ph ph-arrow-circle-up-left" style={css('font-size:14px;')} aria-hidden="true" />
                      Upstream Sources &amp; Triggers ({impact.upstream.length})
                    </div>
                    {impact.upstream.length === 0 ? (
                      <div style={css('font-size:12px;color:var(--fgs);')}>No upstream dependencies detected.</div>
                    ) : (
                      <div style={css('display:flex;flex-direction:column;gap:6px;')}>
                        {impact.upstream.map((u) => (
                          <div
                            key={u.name}
                            onClick={() => {
                              if (u.navigable) navigate(`/assets/${u.name}`);
                            }}
                            style={css(
                              `display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:6px;background:var(--card2,#f4f4f6);border:1px solid var(--border,#e7e7ea);cursor:${u.navigable ? 'pointer' : 'default'};`,
                            )}
                          >
                            <div style={css('display:flex;align-items:center;gap:7px;min-width:0;')}>
                              <i className={`ph ${u.icon}`} style={css('font-size:14px;color:var(--fgm);')} aria-hidden="true" />
                              <span style={css("font-size:12px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>
                                {u.name}
                              </span>
                            </div>
                            <span style={css('font-size:11px;color:var(--fgm);white-space:nowrap;')}>
                              {u.type} · {u.impactLabel}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={css('padding:12px 14px;border-radius:8px;background:var(--critb,#fef2f2);border:1px solid var(--crit,#dc2626);')}>
                    <div style={css('font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--crit,#dc2626);margin-bottom:8px;display:flex;align-items:center;gap:6px;')}>
                      <i className="ph ph-warning-diamond" style={css('font-size:14px;')} aria-hidden="true" />
                      Downstream Objects Affected &amp; Possibly Broken ({impact.downstream.length})
                    </div>
                    {impact.downstream.length === 0 ? (
                      <div style={css('font-size:12px;color:var(--fgm);')}>No downstream objects detected.</div>
                    ) : (
                      <div style={css('display:flex;flex-direction:column;gap:6px;')}>
                        {impact.downstream.map((d) => (
                          <div
                            key={d.name}
                            onClick={() => {
                              if (d.navigable) navigate(`/assets/${d.name}`);
                            }}
                            style={css(
                              `display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border-radius:6px;background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);cursor:${d.navigable ? 'pointer' : 'default'};`,
                            )}
                          >
                            <div style={css('display:flex;align-items:center;gap:7px;min-width:0;')}>
                              <i className={`ph ${d.icon}`} style={css('font-size:14px;color:var(--crit,#dc2626);')} aria-hidden="true" />
                              <span style={css("font-size:12px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>
                                {d.name}
                              </span>
                            </div>
                            <span style={badge('var(--crit)', 'var(--critb)')}>
                              {d.impactLabel}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
