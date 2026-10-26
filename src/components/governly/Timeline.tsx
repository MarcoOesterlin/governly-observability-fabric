import { css } from '../../lib/css';
import type { TimelineFixture } from '../../fixtures/types';

const tdot = (c: string) =>
  css(`width:24px;height:24px;border-radius:99px;background:${c};color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto;`);

export function Timeline({ events }: { events: TimelineFixture[] }) {
  return (
    <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
      <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);font-size:14px;font-weight:600;color:var(--fg);')}>
        Timeline
      </div>
      <div style={css('padding:4px 20px 18px;')}>
        {events.map((e, idx) => (
          <div key={`${e.title}-${idx}`} style={css('display:flex;gap:14px;padding-top:16px;')}>
            <div style={css('display:flex;flex-direction:column;align-items:center;')}>
              <div style={tdot(e.color)}>
                <i className={`ph ${e.icon}`} style={css('font-size:12px;')} aria-hidden="true" />
              </div>
              <span style={css('flex:1;width:1.5px;background:var(--border);margin-top:4px;')} />
            </div>
            <div style={css('padding-bottom:2px;flex:1;')}>
              <div style={css('display:flex;align-items:center;gap:10px;')}>
                <span style={css('font-size:13px;font-weight:600;color:var(--fg);')}>{e.title}</span>
                <span style={css("font-size:11px;color:var(--fgs);font-family:'Geist Mono',monospace;")}>{e.time}</span>
              </div>
              <div style={css('font-size:12.5px;color:var(--fgm);margin-top:3px;line-height:1.5;')}>{e.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
