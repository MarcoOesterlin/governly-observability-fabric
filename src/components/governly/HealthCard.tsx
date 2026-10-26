import { useState } from 'react';
import { css } from '../../lib/css';
import { useCompact } from './Shell';

const barColor = (i: number): string =>
  i >= 28 && i <= 31
    ? 'var(--crit)'
    : (i >= 24 && i <= 27) || (i >= 32 && i <= 34)
    ? 'var(--warn)'
    : 'var(--ok)';

export type HealthCardProps = {
  healthy?: number;
  warning?: number;
  critical?: number;
  heights?: number[];
  bucketStates?: Array<'ok' | 'warn' | 'crit'>;
  axisLabels?: string[];
};

const DEFAULT_AXIS_LABELS = ['14:30 yest', '20:00', '02:00', '08:00', 'now'];

export function HealthCard({
  healthy = 0,
  warning = 0,
  critical = 0,
  heights,
  bucketStates,
  axisLabels,
}: HealthCardProps) {
  const compact = useCompact();
  const barHeights = (heights ?? []).slice(-40);
  const effectiveStates = bucketStates ? bucketStates.slice(-40) : undefined;
  const labels = axisLabels && axisLabels.length > 0 ? axisLabels : DEFAULT_AXIS_LABELS;
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const activeIdx = hoverIdx ?? (barHeights.length > 0 ? barHeights.length - 1 : null);
  const activeVal = activeIdx !== null ? barHeights[activeIdx] : null;
  const activePrev = activeIdx !== null && activeIdx > 0 ? barHeights[activeIdx - 1] : activeVal;
  const activeDelta =
    activeVal !== null && activePrev !== null ? Number((activeVal - activePrev).toFixed(1)) : 0;
  const activeState = activeIdx !== null ? (effectiveStates?.[activeIdx] ?? 'ok') : 'ok';

  return (
    <div
      style={css(
        `background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;padding:18px 20px;box-shadow:var(--shadow);display:grid;grid-template-columns:${compact ? '1fr' : '300px 1fr'};gap:28px;margin-bottom:16px;`
      )}
    >
      <div style={css(compact ? '' : 'border-right:1px solid var(--border,#e7e7ea);padding-right:24px;')}>
        <div style={css('font-size:13px;font-weight:600;color:var(--fg,#18181b);margin-bottom:14px;')}>Asset health</div>
        <div style={css('display:flex;height:9px;border-radius:99px;overflow:hidden;gap:2px;')}>
          <div style={css(`flex:${healthy};background:var(--ok);`)} />
          <div style={css(`flex:${warning};background:var(--warn);`)} />
          <div style={css(`flex:${critical};background:var(--crit);`)} />
        </div>
        <div style={css('display:flex;flex-direction:column;gap:10px;margin-top:16px;')}>
          <div style={css('display:flex;align-items:center;gap:9px;font-size:12.5px;')}>
            <span style={css('width:8px;height:8px;border-radius:99px;background:var(--ok);')} />
            <span style={css('flex:1;color:var(--fgm);')}>Healthy</span>
            <span style={css("font-family:'Geist Mono',monospace;font-weight:600;color:var(--fg);")}>{healthy}</span>
          </div>
          <div style={css('display:flex;align-items:center;gap:9px;font-size:12.5px;')}>
            <span style={css('width:8px;height:8px;border-radius:99px;background:var(--warn);')} />
            <span style={css('flex:1;color:var(--fgm);')}>Warning</span>
            <span style={css("font-family:'Geist Mono',monospace;font-weight:600;color:var(--fg);")}>{warning}</span>
          </div>
          <div style={css('display:flex;align-items:center;gap:9px;font-size:12.5px;')}>
            <span style={css('width:8px;height:8px;border-radius:99px;background:var(--crit);')} />
            <span style={css('flex:1;color:var(--fgm);')}>Critical</span>
            <span style={css("font-family:'Geist Mono',monospace;font-weight:600;color:var(--fg);")}>{critical}</span>
          </div>
        </div>
      </div>
      <div>
        <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px;')}>
          <div style={css('display:flex;align-items:center;gap:10px;')}>
            <div style={css('font-size:13px;font-weight:600;color:var(--fg,#18181b);')}>Freshness &amp; quality signals · last 24h</div>
            {activeVal !== null && (
              <span
                style={css(
                  `font-family:'Geist Mono',monospace;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:6px;background:var(--card2,#f4f4f5);color:${
                    activeState === 'crit' ? 'var(--crit)' : activeState === 'warn' ? 'var(--warn)' : 'var(--ok)'
                  };`
                )}
              >
                {activeVal}%{activeIdx !== null && activeIdx > 0 ? ` (${activeDelta >= 0 ? '+' : ''}${activeDelta}%)` : ''}
              </span>
            )}
          </div>
          <div style={css('font-size:11.5px;color:var(--fgm);display:flex;align-items:center;gap:14px;')}>
            <span style={css('display:flex;align-items:center;gap:5px;')}>
              <span style={css('width:8px;height:8px;border-radius:2px;background:var(--ok);')} />OK
            </span>
            <span style={css('display:flex;align-items:center;gap:5px;')}>
              <span style={css('width:8px;height:8px;border-radius:2px;background:var(--warn);')} />Degraded
            </span>
            <span style={css('display:flex;align-items:center;gap:5px;')}>
              <span style={css('width:8px;height:8px;border-radius:2px;background:var(--crit);')} />Breach
            </span>
          </div>
        </div>
        <div
          onMouseLeave={() => setHoverIdx(null)}
          style={css('display:flex;align-items:flex-end;gap:3px;height:86px;padding-top:18px;')}
        >
          {barHeights.length > 0 &&
            barHeights.length < 40 &&
            Array.from({ length: 40 - barHeights.length }).map((_, emptyIdx) => (
              <div
                key={`empty-${emptyIdx}`}
                title="No scheduled run recorded in this window"
                style={css(
                  'flex:1;min-width:0;height:14%;background:var(--border,#e4e4e7);border-radius:2px 2px 1px 1px;opacity:0.45;'
                )}
              />
            ))}
          {barHeights.map((h, i) => {
            const state = effectiveStates?.[i];
            const c = state === 'crit' ? 'var(--crit)' : state === 'warn' ? 'var(--warn)' : state === 'ok' ? 'var(--ok)' : barColor(i);
            const prev = i > 0 ? barHeights[i - 1] : h;
            const delta = Number((h - prev).toFixed(1));
            const deltaLabel = i > 0 ? ` (${delta >= 0 ? '+' : ''}${delta}% vs prev)` : '';
            const isHovered = hoverIdx === i;
            return (
              <div
                key={i}
                data-health-bar=""
                onMouseEnter={() => setHoverIdx(i)}
                title={`Run #${i + 1}: ${h}%${deltaLabel} · ${state === 'crit' ? 'Breach' : state === 'warn' ? 'Degraded' : 'OK'}`}
                style={css(
                  `flex:1;min-width:0;height:${h}%;background:${c};border-radius:2px 2px 1px 1px;opacity:${isHovered ? 1 : c === 'var(--ok)' ? 0.85 : 0.95};position:relative;cursor:pointer;`
                )}
              >
                {isHovered && (
                  <span
                    style={css(
                      "position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);font-family:'Geist Mono',monospace;font-size:10px;font-weight:600;padding:1px 5px;border-radius:4px;background:var(--fg,#18181b);color:var(--bg,#fff);white-space:nowrap;pointer-events:none;z-index:2;"
                    )}
                  >
                    {h}%
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div style={css("display:flex;justify-content:space-between;font-size:10.5px;color:var(--fgs);margin-top:8px;font-family:'Geist Mono',monospace;")}>
          {labels.map((lbl, idx) => (
            <span key={idx}>{lbl}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
