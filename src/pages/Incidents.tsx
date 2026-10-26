import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box } from '../components/governly/Box';
import { badge, pill, sevPair, statusPair } from '../components/governly/primitives';
import { useIncidents } from '../data/useIncidents';
import type { IncidentFixture } from '../fixtures/types';
import { css } from '../lib/css';

export function Incidents({ incidents: propIncidents }: { incidents?: IncidentFixture[] } = {}) {
  const liveIncidents = useIncidents();
  const incidents = propIncidents ?? liveIncidents;
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'All' | 'Open' | 'Resolved'>('All');

  const filtered = incidents.filter((i) => {
    if (filter === 'Open') return i.status !== 'Resolved';
    if (filter === 'Resolved') return i.status === 'Resolved';
    return true;
  });

  const segStyle = (key: 'Open' | 'All' | 'Resolved', idx: number) =>
    `padding:6px 12px;${filter === key ? 'font-weight:600;background:var(--card2,#f4f4f5);color:var(--fg);' : 'color:var(--fgm);cursor:pointer;'}${idx > 0 ? 'border-left:1px solid var(--border);' : ''}`;

  return (
    <div style={css('padding:24px 28px 40px;max-width:1300px;margin:0 auto;')}>
      <div style={css('font-size:12px;color:var(--fgm,#52525b);margin-bottom:8px;display:flex;align-items:center;gap:6px;')}>
        Governly <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" /> Incidents
      </div>
      <div style={css('display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap;')}>
        <div>
          <div style={css('font-size:22px;font-weight:600;letter-spacing:-0.02em;color:var(--fg,#18181b);')}>Incidents</div>
          <div style={css('font-size:13.5px;color:var(--fgm,#52525b);margin-top:4px;')}>
            {incidents.filter((i) => i.status !== 'Resolved').length} open · {incidents.filter((i) => i.sev === 'Critical' && i.status !== 'Resolved').length} critical · active observability alerts.
          </div>
        </div>
        <div style={css('display:flex;gap:8px;')}>
          <div style={css('display:flex;border:1px solid var(--border,#e7e7ea);border-radius:8px;overflow:hidden;background:var(--card,#fff);font-size:12.5px;')}>
            {(['Open', 'All', 'Resolved'] as const).map((tab, idx) => (
              <div key={tab} onClick={() => setFilter(tab)} style={css(segStyle(tab, idx))}>
                {tab}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
        <div style={css('display:grid;grid-template-columns:80px 2fr 1.2fr 1fr 1.1fr 18px;gap:10px;padding:10px 18px;font-size:10.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--fgs,#a1a1aa);border-bottom:1px solid var(--border,#e7e7ea);')}>
          <span>Severity</span>
          <span>Incident</span>
          <span>Asset</span>
          <span>Status</span>
          <span>Assignee</span>
          <span />
        </div>
        {filtered.map((i) => {
          const sv = sevPair(i.sev);
          const sp = statusPair(i.status);
          return (
            <Box
              key={i.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/incidents/${i.id}`)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/incidents/${i.id}`); } }}
              style="display:grid;grid-template-columns:80px 2fr 1.2fr 1fr 1.1fr 18px;gap:10px;padding:13px 18px;align-items:center;border-bottom:1px solid var(--border,#e7e7ea);cursor:pointer;"
              hover="background:var(--card2)"
            >
              <span style={badge(sv[0], sv[1])}>{i.sev}</span>
              <div style={css('min-width:0;')}>
                <div style={css('font-size:13px;font-weight:600;color:var(--fg,#18181b);')}>{i.title}</div>
                <div style={css("font-size:11px;color:var(--fgs);font-family:'Geist Mono',monospace;margin-top:2px;")}>
                  {i.id} · {i.monitor}
                </div>
              </div>
              <span style={css("font-size:12px;font-family:'Geist Mono',monospace;color:var(--fgm);")}>{i.asset}</span>
              <span style={pill(sp[0], sp[1])}>{i.status}</span>
              <div style={css('display:flex;align-items:center;gap:8px;')}>
                <span style={css('width:24px;height:24px;border-radius:99px;background:var(--card2,#f4f4f5);color:var(--fgm);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;')}>
                  {i.initials}
                </span>
                <span style={css('font-size:12px;color:var(--fgm);')}>{i.age}</span>
              </div>
              <i className="ph ph-caret-right" style={css('font-size:13px;color:var(--fgs);')} aria-hidden="true" />
            </Box>
          );
        })}
      </div>
    </div>
  );
}
