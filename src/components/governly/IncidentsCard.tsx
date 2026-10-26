import { useNavigate } from 'react-router-dom';
import { Box } from './Box';
import { css } from '../../lib/css';
import { dot, pill, sevPair, statusPair } from './primitives';
import type { IncidentFixture } from '../../fixtures/types';

export function IncidentsCard({ incidents, openCount = 0 }: { incidents: IncidentFixture[]; openCount?: number }) {
  const navigate = useNavigate();

  return (
    <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
      <div style={css('padding:15px 18px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border,#e7e7ea);')}>
        <div style={css('font-size:14px;font-weight:600;color:var(--fg,#18181b);')}>Active incidents</div>
        <span style={pill('var(--crit)', 'var(--critb)')}>{openCount} open</span>
      </div>
      {incidents.map((i) => {
        const sp = statusPair(i.status);
        const sv = sevPair(i.sev);
        return (
          <Box
            key={i.id}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/incidents/${i.id}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/incidents/${i.id}`); } }}
            style="padding:12px 18px;display:flex;gap:11px;align-items:flex-start;border-bottom:1px solid var(--border,#e7e7ea);cursor:pointer;"
            hover="background:var(--card2)"
          >
            <span style={dot(sv[0], i.sev === 'Critical')} />
            <div style={css('flex:1;min-width:0;')}>
              <div style={css('display:flex;align-items:center;gap:8px;')}>
                <span style={css("font-size:11px;font-family:'Geist Mono',monospace;color:var(--fgs);")}>{i.id}</span>
                <span style={pill(sp[0], sp[1])}>{i.status}</span>
              </div>
              <div style={css('font-size:13px;font-weight:600;color:var(--fg,#18181b);margin-top:3px;')}>{i.title}</div>
              <div style={css("font-size:11.5px;color:var(--fgm,#52525b);margin-top:2px;font-family:'Geist Mono',monospace;")}>
                {i.asset} · {i.age}
              </div>
            </div>
          </Box>
        );
      })}
    </div>
  );
}
