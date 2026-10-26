import { css } from '../../../lib/css';
import { useAssetLineage } from '../../../data/useAsset';
import type { LineageNodeFixture } from '../../../fixtures/types';

export function LineageTab({
  assetKey,
  upstream: propUpstream,
  downstream: propDownstream,
}: {
  assetKey: string;
  upstream?: LineageNodeFixture[];
  downstream?: LineageNodeFixture[];
}) {
  const live = useAssetLineage(assetKey);
  const upstream = propUpstream ?? live.upstream;
  const downstream = propDownstream ?? live.downstream;
  return (
    <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);padding:24px;')}>
      <div style={css('display:grid;grid-template-columns:1fr 40px 1fr 40px 1fr;align-items:center;gap:0;')}>
        <div>
          <div style={css('font-size:10.5px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:var(--fgs);margin-bottom:12px;text-align:center;')}>
            Upstream
          </div>
          <div style={css('display:flex;flex-direction:column;gap:10px;')}>
            {upstream.map((u) => (
              <div key={u.name} style={css('border:1px solid var(--border,#e7e7ea);border-radius:9px;padding:11px 13px;background:var(--card2,#f4f4f5);')}>
                <div style={css("font-size:12.5px;font-weight:600;color:var(--fg);font-family:'Geist Mono',monospace;")}>{u.name}</div>
                <div style={css('font-size:11px;color:var(--fgm);margin-top:2px;')}>{u.type}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={css('display:flex;justify-content:center;color:var(--fgs);font-size:20px;')}>
          <i className="ph ph-arrow-right" aria-hidden="true" />
        </div>
        <div style={css('border:1.5px solid var(--warn);border-radius:11px;padding:16px;background:var(--warnb);text-align:center;')}>
          <i className="ph ph-database" style={css('font-size:24px;color:var(--warn);')} aria-hidden="true" />
          <div style={css("font-size:13px;font-weight:600;color:var(--fg);font-family:'Geist Mono',monospace;margin-top:8px;")}>
            {assetKey.includes('.') ? (
              <>
                {assetKey.split('.')[0]}.<br />
                {assetKey.split('.').slice(1).join('.')}
              </>
            ) : (
              assetKey
            )}
          </div>
          <div style={css('font-size:11px;color:var(--warn);margin-top:4px;font-weight:600;')}>Monitored · this asset</div>
        </div>
        <div style={css('display:flex;justify-content:center;color:var(--fgs);font-size:20px;')}>
          <i className="ph ph-arrow-right" aria-hidden="true" />
        </div>
        <div>
          <div style={css('font-size:10.5px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:var(--fgs);margin-bottom:12px;text-align:center;')}>
            Downstream impact
          </div>
          <div style={css('display:flex;flex-direction:column;gap:10px;')}>
            {downstream.map((d) => (
              <div key={d.name} style={css('border:1px solid var(--border,#e7e7ea);border-radius:9px;padding:11px 13px;background:var(--card2,#f4f4f5);')}>
                <div style={css("font-size:12.5px;font-weight:600;color:var(--fg);font-family:'Geist Mono',monospace;")}>{d.name}</div>
                <div style={css('font-size:11px;color:var(--fgm);margin-top:2px;')}>{d.type}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
