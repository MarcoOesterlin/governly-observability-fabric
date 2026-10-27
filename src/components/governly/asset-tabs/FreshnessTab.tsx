import { useState } from 'react';
import { css } from '../../../lib/css';
import { badge } from '../primitives';
import {
  useAsset,
  useAssetFreshness,
  useJobFailureDiagnostics,
  type JobFailureDiagnostic,
} from '../../../data/useAsset';
import {
  formatSlaMinutes,
  SLA_PRESETS,
  useFreshnessSlas,
} from '../../../data/useFreshnessSla';
import { useIncidents } from '../../../data/useIncidents';
import type { RefreshRunFixture } from '../../../fixtures/types';

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
  const asset = useAsset(assetKey);
  const { runs: liveRuns, lagPoints, lagLabels } = useAssetFreshness(assetKey);
  const jobDiagnostics = useJobFailureDiagnostics(assetKey);
  const allIncidents = useIncidents();
  const { setSlaTarget, saving } = useFreshnessSlas();
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const runs = propRuns ?? liveRuns;
  const slaMin = asset.slaMinutes ?? 60;
  const { points, lastY } = buildLagPolyline(lagPoints, slaMin);
  const dotColor = asset.late ? 'var(--crit)' : 'var(--ok)';
  const slaLabel = formatSlaMinutes(slaMin);
  const midAxisLabel = formatSlaMinutes(Math.round(slaMin * 1.5));
  const topAxisLabel = formatSlaMinutes(Math.round(slaMin * 2));

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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
