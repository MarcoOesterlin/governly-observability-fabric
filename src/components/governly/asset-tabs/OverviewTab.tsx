import { Box } from '../Box';
import { css } from '../../../lib/css';
import { badge, dot, pill } from '../primitives';
import { useAsset, useAssetFreshness, useAssetQuality } from '../../../data/useAsset';
import { formatSlaMinutes } from '../../../data/useFreshnessSla';
import { useIncidents } from '../../../data/useIncidents';
import type { QualityRuleFixture } from '../../../fixtures/types';
import { buildLagPolyline } from './FreshnessTab';

const RESULT = {
  pass: ['ph-check-circle', 'var(--ok)', 'var(--okb)', 'Pass'],
  warn: ['ph-warning-circle', 'var(--warn)', 'var(--warnb)', 'Warn'],
  fail: ['ph-x-circle', 'var(--crit)', 'var(--critb)', 'Fail'],
} as const;

export function OverviewTab({
  assetKey,
  qualityRules: propRules,
  onOpenIncident,
}: {
  assetKey: string;
  qualityRules?: QualityRuleFixture[];
  onOpenIncident?: (id: string) => void;
}) {
  const asset = useAsset(assetKey);
  const { runs, lagPoints, lagLabels } = useAssetFreshness(assetKey);
  const liveRules = useAssetQuality(assetKey);
  const allIncidents = useIncidents();
  const qualityRules = propRules ?? liveRules;

  const isTableAsset = asset.type === 'Lakehouse table';
  const passCount = qualityRules.filter((r) => r.result === 'pass').length;
  const failCount = qualityRules.filter((r) => r.result === 'fail').length;
  const warnCount = qualityRules.filter((r) => r.result === 'warn').length;
  const slaMin = asset.slaMinutes ?? 60;
  const slaLabel = formatSlaMinutes(slaMin);
  const midAxisLabel = formatSlaMinutes(Math.round(slaMin * 1.5));
  const topAxisLabel = formatSlaMinutes(Math.round(slaMin * 2));
  const { points, lastY } = buildLagPolyline(lagPoints, slaMin);
  const dotColor = asset.late ? 'var(--crit)' : 'var(--ok)';
  const activeMonitorNames = Array.from(
    new Set(
      isTableAsset
        ? ['Freshness', 'Schema', ...qualityRules.map((r) => r.name)]
        : ['Job Execution', 'Freshness SLA'],
    ),
  );
  const assetIncidents = allIncidents
    .filter((i) => i.asset === assetKey && i.status !== 'Resolved')
    .map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      sub: `${i.sev} · opened ${i.age} · ${i.monitor}`,
    }));

  const slaBreached = asset.late;
  const rawHealth = asset.healthScore ?? Math.round(asset.quality >= 0 ? asset.quality : 100);
  const healthVal = failCount === 0 && !slaBreached && rawHealth >= 98 ? 100 : rawHealth;
  const volumeLabel = asset.rowCountLabel ?? (runs[0]?.rows && runs[0].rows !== '—' ? runs[0].rows : '—');
  const healthDeltaPts = Math.round(healthVal - 100);
  const healthSubText =
    healthDeltaPts < 0 && (failCount > 0 || slaBreached)
      ? `${healthDeltaPts} pts (${failCount} failing${slaBreached ? ', SLA breach' : ''})`
      : 'Healthy · all checks within target';
  const freshNormalized = (asset.fresh || '').trim();
  const isGenericFresh =
    !freshNormalized ||
    freshNormalized.toLowerCase() === 'active' ||
    freshNormalized.toLowerCase() === 'no runs yet';
  const slaComparisonSub = slaBreached
    ? freshNormalized.toLowerCase().includes('failed')
      ? `Latest run failed · SLA target ≤ ${slaLabel}`
      : `Updated ${freshNormalized} · exceeds ${slaLabel} SLA`
    : isGenericFresh
      ? `SLA target ≤ ${slaLabel}`
      : `Updated ${freshNormalized} · SLA target ≤ ${slaLabel}`;
  const volumeSubText =
    runs.length >= 2 && runs[0]?.rows && runs[0].rows !== '—'
      ? `Latest commit ${runs[0].rows} · ${asset.domain} domain`
      : `${asset.type} · ${asset.domain} domain`;

  return (
    <div style={css('display:flex;flex-direction:column;gap:16px;')}>
      <div style={css('display:grid;grid-template-columns:repeat(4,1fr);gap:14px;')}>
        <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;padding:16px;box-shadow:var(--shadow);')}>
          <div style={css('font-size:12px;color:var(--fgm);font-weight:500;')}>Health score</div>
          <div style={css(`font-size:26px;font-weight:600;font-family:'Geist Mono',monospace;color:${healthVal < 85 ? 'var(--warn)' : 'var(--ok)'};margin-top:8px;`)}>
            {healthVal}<span style={css('font-size:14px;color:var(--fgs);')}>/100</span>
          </div>
          <div style={css('font-size:11.5px;color:var(--fgs);margin-top:3px;')}>
            {healthSubText}
          </div>
        </div>
        <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;padding:16px;box-shadow:var(--shadow);')}>
          <div style={css('font-size:12px;color:var(--fgm);font-weight:500;')}>Freshness SLA</div>
          <div style={css(`font-size:26px;font-weight:600;font-family:'Geist Mono',monospace;color:${slaBreached ? 'var(--crit)' : 'var(--ok)'};margin-top:8px;`)}>
            {slaBreached ? 'Breached' : 'On time'}
          </div>
          <div style={css('font-size:11.5px;color:var(--fgs);margin-top:3px;')}>
            {slaComparisonSub}
          </div>
        </div>
        <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;padding:16px;box-shadow:var(--shadow);')}>
          <div style={css('font-size:12px;color:var(--fgm);font-weight:500;')}>
            {isTableAsset ? 'Quality checks' : 'Execution status'}
          </div>
          <div style={css("font-size:26px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fg);margin-top:8px;")}>
            {!isTableAsset ? (
              <span style={css(`color:${slaBreached ? 'var(--crit)' : 'var(--ok)'};`)}>
                {freshNormalized.toLowerCase().includes('failed') ? 'Failed' : slaBreached ? 'Delayed' : 'Passing'}
              </span>
            ) : qualityRules.length > 0 ? (
              <>
                {passCount}<span style={css('font-size:14px;color:var(--fgs);')}>/{qualityRules.length} pass</span>
              </>
            ) : (
              <span style={css('color:var(--fgs);')}>N/A</span>
            )}
          </div>
          <div style={css(`font-size:11.5px;color:${!isTableAsset ? 'var(--fgs)' : qualityRules.length === 0 ? 'var(--fgs)' : failCount > 0 ? 'var(--crit)' : 'var(--ok)'};margin-top:3px;`)}>
            {!isTableAsset
              ? `${runs.length} recorded job run${runs.length === 1 ? '' : 's'}`
              : qualityRules.length === 0
                ? 'No quality rules applied yet'
                : `${failCount} failing · ${warnCount} warning`}
          </div>
        </div>
        <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;padding:16px;box-shadow:var(--shadow);')}>
          <div style={css('font-size:12px;color:var(--fgm);font-weight:500;')}>Volume</div>
          <div style={css("font-size:26px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fg);margin-top:8px;")}>
            {volumeLabel}
          </div>
          <div style={css('font-size:11.5px;color:var(--ok);margin-top:3px;')}>
            {volumeSubText}
          </div>
        </div>
      </div>

      <div style={css('display:grid;grid-template-columns:1.6fr 1fr;gap:16px;align-items:start;')}>
        <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;padding:18px 20px;box-shadow:var(--shadow);')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;')}>
            <div style={css('font-size:14px;font-weight:600;color:var(--fg);')}>
              Refresh lag · commit history
            </div>
            <div style={css('display:flex;align-items:center;gap:12px;')}>
              <span style={css("font-size:11px;font-weight:600;font-family:'Geist Mono Variable','Geist Mono',ui-monospace,monospace;color:var(--fgm);")}>
                Latest: <span style={css(`color:${dotColor};`)}>{asset.fresh}</span>
              </span>
              <span style={css("font-size:11px;font-weight:500;font-family:'Geist Mono Variable','Geist Mono',ui-monospace,monospace;color:var(--fgm);display:flex;align-items:center;gap:6px;")}>
                <span style={css('width:14px;height:0;border-top:2px dashed var(--crit);display:inline-block;')} />
                SLA ≤ {slaLabel}
              </span>
            </div>
          </div>
          <div style={css('display:grid;grid-template-columns:64px 1fr;align-items:stretch;height:210px;')}>
            <div style={css("position:relative;height:210px;font-family:'Geist Mono Variable','Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:1;user-select:none;")}>
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
            <svg viewBox="80 0 600 220" preserveAspectRatio="none" style={css('width:100%;height:210px;display:block;overflow:visible;')}>
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
          <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);font-size:14px;font-weight:600;color:var(--fg);')}>
            Open incidents
          </div>
          {assetIncidents.length === 0 ? (
            <div style={css('padding:16px 18px;font-size:12.5px;color:var(--fgm);')}>
              No active incidents for this asset.
            </div>
          ) : (
            assetIncidents.map((inc) => (
              <Box
                key={inc.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenIncident?.(inc.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenIncident?.(inc.id); }}
                style="padding:14px 18px;display:flex;gap:11px;align-items:flex-start;cursor:pointer;"
                hover="background:var(--card2)"
              >
                <span style={dot('var(--crit)', false)} />
                <div style={css('flex:1;')}>
                  <div style={css('display:flex;align-items:center;gap:8px;')}>
                    <span style={css("font-size:11px;font-family:'Geist Mono',monospace;color:var(--fgs);")}>{inc.id}</span>
                    <span style={pill('var(--crit)', 'var(--critb)')}>{inc.status}</span>
                  </div>
                  <div style={css('font-size:13px;font-weight:600;color:var(--fg);margin-top:3px;')}>{inc.title}</div>
                  <div style={css('font-size:11.5px;color:var(--fgm);margin-top:2px;')}>{inc.sub}</div>
                </div>
                <i className="ph ph-caret-right" style={css('font-size:13px;color:var(--fgs);')} aria-hidden="true" />
              </Box>
            ))
          )}
          <div style={css('padding:14px 18px;border-top:1px solid var(--border,#e7e7ea);font-size:12.5px;color:var(--fgm);')}>
            <b style={css('color:var(--fg);font-weight:600;')}>Monitors:</b> {activeMonitorNames.join(' · ')}
          </div>
        </div>
      </div>

      {isTableAsset && (
        <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
          <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);display:flex;align-items:center;justify-content:space-between;')}>
            <span style={css('font-size:14px;font-weight:600;color:var(--fg);')}>Quality checks</span>
            <span style={css('font-size:12px;color:var(--fgm);')}>
              {qualityRules.length > 0 ? `${passCount} / ${qualityRules.length} passing` : 'N/A · 0 rules configured'}
            </span>
          </div>
          {qualityRules.length === 0 ? (
            <div style={css('padding:16px 18px;font-size:12.5px;color:var(--fgm);')}>
              No data quality rules configured for this table — shows N/A until rules are added.
            </div>
          ) : (
            qualityRules.map((q) => {
              const r = RESULT[q.result];
              return (
                <div key={q.name} style={css('display:grid;grid-template-columns:24px 1.4fr 1.6fr 1fr 80px;gap:12px;padding:12px 18px;align-items:center;border-bottom:1px solid var(--border,#e7e7ea);')}>
                  <div style={css(`color:${r[1]};font-size:17px;display:flex;`)}>
                    <i className={`ph ${r[0]}`} aria-hidden="true" />
                  </div>
                  <span style={css('font-size:13px;font-weight:600;color:var(--fg);')}>{q.name}</span>
                  <span style={css("font-size:12.5px;color:var(--fgm);font-family:'Geist Mono',monospace;")}>{q.detail}</span>
                  <span style={css("font-size:12.5px;color:var(--fg);font-family:'Geist Mono',monospace;")}>{q.value}</span>
                  <span style={badge(r[1], r[2])}>{r[3]}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
