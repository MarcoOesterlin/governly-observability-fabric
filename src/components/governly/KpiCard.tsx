import { css } from '../../lib/css';
import type { KpiFixture } from '../../fixtures/types';

const trendStyle = (good: boolean, flat: boolean) =>
  `font-size:11.5px;font-weight:600;color:${flat ? 'var(--fgs)' : good ? 'var(--ok)' : 'var(--crit)'}`;

export function KpiCard({ kpi }: { kpi: KpiFixture }) {
  return (
    <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;padding:16px;box-shadow:var(--shadow);')}>
      <div style={css('display:flex;align-items:center;justify-content:space-between;')}>
        <span style={css('font-size:12.5px;color:var(--fgm,#52525b);font-weight:500;')}>{kpi.label}</span>
        <div style={css('width:28px;height:28px;border-radius:8px;background:var(--card2,#f4f4f5);display:flex;align-items:center;justify-content:center;color:var(--fgm);font-size:15px;')}>
          <i className={`ph ${kpi.icon}`} aria-hidden="true" />
        </div>
      </div>
      <div style={css("font-size:27px;font-weight:600;letter-spacing:-0.02em;margin-top:12px;font-family:'Geist Mono',monospace;color:var(--fg,#18181b);")}>
        {kpi.value}
      </div>
      <div style={css('display:flex;align-items:center;gap:7px;margin-top:5px;')}>
        <span style={css(trendStyle(kpi.trendGood, kpi.trendFlat))}>{kpi.trend}</span>
        <span style={css('font-size:11.5px;color:var(--fgs,#a1a1aa);')}>{kpi.sub}</span>
      </div>
    </div>
  );
}
