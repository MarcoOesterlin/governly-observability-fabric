import { Box } from '../Box';
import { useIncidents } from '../../../data/useIncidents';
import { css } from '../../../lib/css';
import { badge, dot, pill } from '../primitives';

export function IncidentsTab({
  assetKey,
  onOpenIncident,
}: {
  assetKey: string;
  onOpenIncident?: (id: string) => void;
}) {
  const allIncidents = useIncidents();
  const resolvedCount = allIncidents.filter((i) => i.asset === assetKey && i.status === 'Resolved').length;
  const assetIncidents = allIncidents
    .filter((i) => i.asset === assetKey && i.status !== 'Resolved')
    .map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      sev: i.sev,
      meta: `Opened ${i.age} · ${i.monitor}`,
    }));

  return (
    <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
      {assetIncidents.map((inc) => (
        <Box
          key={inc.id}
          role="button"
          tabIndex={0}
          onClick={() => onOpenIncident?.(inc.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenIncident?.(inc.id); }}
          style="padding:14px 18px;display:flex;gap:12px;align-items:center;cursor:pointer;border-bottom:1px solid var(--border,#e7e7ea);"
          hover="background:var(--card2)"
        >
          <span style={dot('var(--crit)', false)} />
          <div style={css('flex:1;')}>
            <div style={css('display:flex;align-items:center;gap:8px;')}>
              <span style={css("font-size:11px;font-family:'Geist Mono',monospace;color:var(--fgs);")}>{inc.id}</span>
              <span style={pill('var(--crit)', 'var(--critb)')}>{inc.status}</span>
              <span style={badge('var(--crit)', 'var(--critb)')}>{inc.sev}</span>
            </div>
            <div style={css('font-size:13px;font-weight:600;color:var(--fg);margin-top:3px;')}>{inc.title}</div>
            <div style={css('font-size:11.5px;color:var(--fgm);margin-top:2px;')}>{inc.meta}</div>
          </div>
          <i className="ph ph-caret-right" style={css('font-size:14px;color:var(--fgs);')} aria-hidden="true" />
        </Box>
      ))}
      <div style={css('padding:16px 18px;font-size:12.5px;color:var(--fgm);')}>
        {assetIncidents.length === 0 ? (
          resolvedCount > 0 ? (
            <>
              No active incidents in the last 30 days. <span style={css('color:var(--ok);')}>{resolvedCount} resolved.</span>
            </>
          ) : (
            'No active incidents in the last 30 days.'
          )
        ) : (
          <>
            No other open incidents in the last 30 days.{' '}
            <span style={css('color:var(--ok);')}>{resolvedCount} resolved.</span>
          </>
        )}
      </div>
    </div>
  );
}
