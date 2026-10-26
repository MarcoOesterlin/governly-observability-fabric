import { css } from '../../lib/css';
import { badge } from './primitives';
import type { SchemaChangeFixture } from '../../fixtures/types';

const scIcon = (k: 'added' | 'changed' | 'dropped') => {
  const c = k === 'added' ? 'var(--ok)' : k === 'dropped' ? 'var(--crit)' : 'var(--info)';
  const b = k === 'added' ? 'var(--okb)' : k === 'dropped' ? 'var(--critb)' : 'var(--infob)';
  return css(`width:26px;height:26px;border-radius:7px;background:${b};color:${c};display:flex;align-items:center;justify-content:center;font-size:14px;flex:0 0 auto;`);
};

export function SchemaChangesCard({ changes }: { changes: SchemaChangeFixture[] }) {
  return (
    <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
      <div style={css('padding:15px 18px;border-bottom:1px solid var(--border,#e7e7ea);font-size:14px;font-weight:600;color:var(--fg,#18181b);')}>
        Recent schema changes
      </div>
      {changes.map((s, idx) => (
        <div key={`${s.col}-${idx}`} style={css('padding:11px 18px;display:flex;gap:11px;align-items:flex-start;border-bottom:1px solid var(--border,#e7e7ea);')}>
          <div style={scIcon(s.kind)}>
            <i className={`ph ${s.icon}`} aria-hidden="true" />
          </div>
          <div style={css('flex:1;min-width:0;')}>
            <div style={css('font-size:12.5px;color:var(--fg,#18181b);')}>
              <b style={css("font-family:'Geist Mono',monospace;font-weight:600;")}>{s.col}</b>{' '}
              <span style={css('color:var(--fgm);')}>{s.detail}</span>
            </div>
            <div style={css('font-size:11px;color:var(--fgs);margin-top:2px;')}>{s.time}</div>
          </div>
          {s.breaking && <span style={badge('var(--crit)', 'var(--critb)')}>Breaking</span>}
        </div>
      ))}
    </div>
  );
}
