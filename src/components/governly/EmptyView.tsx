import { useNavigate } from 'react-router-dom';
import { css } from '../../lib/css';

export function EmptyView({ label }: { label: string }) {
  const navigate = useNavigate();
  return (
    <div style={css('display:flex;align-items:center;justify-content:center;height:100%;padding:40px;')}>
      <div style={css('text-align:center;max-width:380px;')}>
        <div style={css('width:56px;height:56px;border-radius:14px;background:var(--card2,#f4f4f5);display:flex;align-items:center;justify-content:center;color:var(--fgm);font-size:26px;margin:0 auto 16px;')}>
          <i className="ph ph-squares-four" aria-hidden="true" />
        </div>
        <div style={css('font-size:17px;font-weight:600;color:var(--fg,#18181b);')}>{label}</div>
        <div style={css('font-size:13px;color:var(--fgm,#52525b);margin-top:6px;line-height:1.5;')}>
          This section is part of the Governly workspace. The Overview, Incidents, asset detail and case views are fully interactive.
        </div>
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate('/')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/'); }}
          style={css('display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 16px;border-radius:9px;background:var(--primary);color:var(--pfg);font-size:13px;font-weight:600;cursor:pointer;margin-top:18px;')}
        >
          <i className="ph ph-arrow-left" style={css('font-size:15px;')} aria-hidden="true" />
          Back to Overview
        </div>
      </div>
    </div>
  );
}
