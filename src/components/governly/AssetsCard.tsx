import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { useAssets } from '../../data/useAssets';
import { Box } from './Box';
import { css } from '../../lib/css';
import { qColor, statusColor } from './primitives';
import type { AssetFixture } from '../../fixtures/types';

export function AssetsCard({ assets, totalCount = 169 }: { assets: AssetFixture[]; totalCount?: number }) {
  const navigate = useNavigate();
  const { selectedDomain, setSelectedDomain } = useWorkspace();
  const { domains: discoveredDomains } = useAssets();
  const domainChoices = Array.from(
    new Set([
      ...discoveredDomains,
      ...assets.map((a) => a.domain).filter(Boolean),
    ])
  );

  return (
    <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
      <div style={css('padding:15px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;border-bottom:1px solid var(--border,#e7e7ea);')}>
        <div style={css('display:flex;align-items:center;gap:10px;flex-wrap:wrap;')}>
          <div style={css('font-size:14px;font-weight:600;color:var(--fg,#18181b);')}>Monitored assets</div>
          {domainChoices.length > 0 && (
            <div style={css('display:flex;align-items:center;gap:5px;flex-wrap:wrap;')}>
              {(['All', ...domainChoices] as string[]).map((dom) => {
                const active = selectedDomain === dom;
                return (
                  <button
                    key={dom}
                    type="button"
                    onClick={() => setSelectedDomain(dom)}
                    style={css(
                      `height:24px;padding:0 9px;border-radius:99px;font-size:11.5px;font-weight:${active ? 600 : 500};border:1px solid ${active ? 'var(--fg,#18181b)' : 'var(--border,#e7e7ea)'};background:${active ? 'var(--fg,#18181b)' : 'var(--card2,#f4f4f5)'};color:${active ? 'var(--bg,#fff)' : 'var(--fgm,#52525b)'};cursor:pointer;`
                    )}
                  >
                    {dom}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div
          role="link"
          tabIndex={0}
          onClick={() => navigate('/assets')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/assets'); }}
          style={css('font-size:12.5px;color:var(--accent,#4f46e5);font-weight:500;cursor:pointer;')}
        >
          View all {totalCount}
        </div>
      </div>
      <div style={css('display:grid;grid-template-columns:2.3fr 1fr 1.1fr 0.95fr 18px;gap:8px;padding:9px 18px;font-size:10.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--fgs,#a1a1aa);border-bottom:1px solid var(--border,#e7e7ea);')}>
        <span>Asset</span>
        <span>Domain</span>
        <span>Freshness</span>
        <span>Quality</span>
        <span />
      </div>
      {assets.map((a) => {
        const na = a.quality < 0;
        const freshColor = a.late ? 'color:var(--crit);' : 'color:var(--fgm);';
        return (
          <Box
            key={a.id}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/assets/${a.name}`)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/assets/${a.name}`); } }}
            style="display:grid;grid-template-columns:2.3fr 1fr 1.1fr 0.95fr 18px;gap:8px;padding:12px 18px;align-items:center;border-bottom:1px solid var(--border,#e7e7ea);cursor:pointer;"
            hover="background:var(--card2)"
          >
            <div style={css('display:flex;align-items:center;gap:11px;min-width:0;')}>
              <div style={css('width:32px;height:32px;border-radius:8px;background:var(--card2,#f4f4f5);display:flex;align-items:center;justify-content:center;color:var(--fgm);font-size:16px;flex:0 0 auto;')}>
                <i className={`ph ${a.icon}`} aria-hidden="true" />
              </div>
              <div style={css('min-width:0;')}>
                <div style={css("font-size:13px;font-weight:600;color:var(--fg,#18181b);font-family:'Geist Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>
                  {a.name}
                </div>
                <div style={css('font-size:11.5px;color:var(--fgm,#52525b);margin-top:1px;')}>{a.type}</div>
              </div>
            </div>
            <span style={css('font-size:12.5px;color:var(--fgm,#52525b);')}>{a.domain}</span>
            <div style={css(`display:flex;align-items:center;gap:6px;font-size:12.5px;${freshColor}`)}>
              <span style={css(`width:7px;height:7px;border-radius:99px;background:${statusColor(a.status)};flex:0 0 auto;`)} />
              <span style={css(freshColor)}>{a.fresh}</span>
            </div>
            <div style={css('display:flex;align-items:center;gap:8px;')}>
              <div style={css('flex:1;height:5px;border-radius:99px;background:var(--card2,#f4f4f5);overflow:hidden;')}>
                <div style={css(`width:${na ? '0%' : `${a.quality}%`};height:100%;background:${qColor(a.quality)};border-radius:99px;`)} />
              </div>
              <span style={css(`font-size:12px;font-family:'Geist Mono',monospace;font-weight:500;color:${na ? 'var(--fgs,#a1a1aa)' : 'var(--fg)'};min-width:28px;text-align:right;`)}>
                {na ? 'N/A' : `${a.quality}%`}
              </span>
            </div>
            <i className="ph ph-caret-right" style={css('font-size:13px;color:var(--fgs);')} aria-hidden="true" />
          </Box>
        );
      })}
    </div>
  );
}
