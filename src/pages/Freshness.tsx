import { useState } from 'react';
import { AssetsCard } from '../components/governly/AssetsCard';
import { FreshnessTab } from '../components/governly/asset-tabs/FreshnessTab';
import { useAssets } from '../data/useAssets';
import { css } from '../lib/css';

export function Freshness() {
  const { rows: assets } = useAssets();
  const [selectedAssetKey, setSelectedAssetKey] = useState<string>('');
  const targetAssetKey =
    selectedAssetKey && assets.some((a) => a.name === selectedAssetKey)
      ? selectedAssetKey
      : (assets[0]?.name ?? '');

  const onTimeCount = assets.filter((a) => !a.late).length;
  const slaPct = assets.length > 0 ? ((onTimeCount / assets.length) * 100).toFixed(1) : '100.0';

  return (
    <div style={css('padding:24px 28px 40px;max-width:1400px;margin:0 auto;display:flex;flex-direction:column;gap:20px;')}>
      <div>
        <div style={css('font-size:12px;color:var(--fgm,#52525b);margin-bottom:8px;display:flex;align-items:center;gap:6px;')}>
          Governly <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" /> Pipelines &amp; Freshness
        </div>
        <div style={css('display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;')}>
          <div>
            <div style={css('font-size:22px;font-weight:600;letter-spacing:-0.02em;color:var(--fg,#18181b);')}>Pipelines &amp; Freshness</div>
            <div style={css('font-size:13.5px;color:var(--fgm,#52525b);margin-top:4px;')}>
              {slaPct}% SLA compliance across {assets.length} monitored pipelines and tables ({onTimeCount} on time).
            </div>
          </div>
          {assets.length > 0 && (
            <div style={css('display:flex;align-items:center;gap:8px;')}>
              <label htmlFor="freshness-asset-select" style={css('font-size:12px;font-weight:600;color:var(--fgm);')}>
                Inspect Runs for Asset:
              </label>
              <select
                id="freshness-asset-select"
                value={targetAssetKey}
                onChange={(e) => setSelectedAssetKey(e.target.value)}
                style={css(
                  'height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);color:var(--fg);font-size:13px;font-weight:500;',
                )}
              >
                {assets.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name} ({a.fresh})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <FreshnessTab assetKey={targetAssetKey} />

      <AssetsCard assets={assets} totalCount={assets.length} />
    </div>
  );
}
