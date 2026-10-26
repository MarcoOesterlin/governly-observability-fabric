import { Box } from '../Box';
import { css } from '../../../lib/css';
import { badge, dot, pill } from '../primitives';
import { useAsset, useAssetFreshness, useAssetQuality } from '../../../data/useAsset';
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

  const passCount = qualityRules.filter((r) => r.result === 'pass').length;
  const failCount = qualityRules.filter((r) => r.result === 'fail').length;
  const warnCount = qualityRules.filter((r) => r.result === 'warn').length;
  const slaMin = asset.slaMinutes ?? 60;
  const slaLabel = slaMin >= 60 ? `${Math.round(slaMin / 60)}h` : `${slaMin}m`;
  const { points, lastY } = buildLagPolyline(lagPoints, slaMin);
  const dotColor = asset.late ? 'var(--crit)' : 'var(--ok)';
  const activeMonitorNames = Array.from(new Set(['Freshness', 'Schema', ...qualityRules.map((r) => r.name)]));
  const assetIncidents = allIncidents
    .filter((i) => i.asset === assetKey && i.status !== 'Resolved')
    .map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      sub: `${i.sev} · opened ${i.age} · ${i.monitor}`,
    }));

  const healthVal = asset.healthScore ?? Math.round(asset.quality >= 0 ? asset.quality : 100);
  const slaBreached = asset.late;
  const volumeLabel = asset.rowCountLabel ?? (runs[0]?.rows && runs[0].rows !== '—' ? runs[0].rows : '—');
  const healthDeltaPts = Math.round(healthVal - 100);
  const healthSubText =
    healthDeltaPts < 0
      ? `${healthDeltaPts} pts (${failCount} failing${slaBreached ? ', SLA breach' : ''})`
      : `${asset.status} status · 100% nominal`;
  const slaComparisonSub = slaBreached
    ? `${asset.fresh} vs ${slaLabel} target`
    : `last refresh ${asset.fresh} (target ≤ ${slaLabel})`;
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
          <div style={css('font-size:12px;color:var(--fgm);font-weight:500;')}>Quality checks</div>
          <div style={css("font-size:26px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fg);margin-top:8px;")}>
            {passCount}<span style={css('font-size:14px;color:var(--fgs);')}>/{qualityRules.length} pass</span>
          </div>
          <div style={css(`font-size:11.5px;color:${failCount > 0 ? 'var(--crit)' : 'var(--ok)'};margin-top:3px;`)}>
            {failCount} failing · {warnCount} warning
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
            <span style={css('font-size:11.5px;color:var(--fgm);display:flex;align-items:center;gap:6px;')}>
              <span style={css('width:14px;height:0;border-top:2px dashed var(--crit);display:inline-block;')} />
              SLA {slaLabel}
            </span>
          </div>
          <svg viewBox="0 0 680 220" style={css('width:100%;height:210px;display:block;')}>
            <line x1="40" y1="40" x2="680" y2="40" stroke="var(--border)" strokeWidth="1" />
            <line x1="40" y1="90" x2="680" y2="90" stroke="var(--border)" strokeWidth="1" />
            <line x1="40" y1="140" x2="680" y2="140" stroke="var(--crit)" strokeWidth="1.4" strokeDasharray="5 5" />
            <line x1="40" y1="194" x2="680" y2="194" stroke="var(--border)" strokeWidth="1" />
            <text x="6" y="44" fontSize="10" fill="var(--fgs)" fontFamily="Geist Mono">3h</text>
            <text x="6" y="94" fontSize="10" fill="var(--fgs)" fontFamily="Geist Mono">2h</text>
            <text x="6" y="144" fontSize="10" fill="var(--crit)" fontFamily="Geist Mono">{slaLabel}</text>
            <text x="6" y="198" fontSize="10" fill="var(--fgs)" fontFamily="Geist Mono">0</text>
            <polyline points={points} fill="none" stroke="var(--info)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="660" cy={lastY} r="4.5" fill={dotColor} />
            <text x="600" y={Math.max(20, lastY - 10)} fontSize="10.5" fill={dotColor} fontFamily="Geist Mono" fontWeight="600">{asset.fresh}</text>
          </svg>
          {lagLabels.length > 0 && (
            <div style={css("display:flex;justify-content:space-between;font-size:10.5px;color:var(--fgs);font-family:'Geist Mono',monospace;padding-left:36px;")}>
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

      <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
        <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);font-size:14px;font-weight:600;color:var(--fg);')}>
          Quality checks
        </div>
        {qualityRules.map((q) => {
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
        })}
      </div>
    </div>
  );
}
