import { useState } from 'react';
import { AssetsCard } from '../components/governly/AssetsCard';
import { isRuntimeOnlyAssetType, useAssets } from '../data/useAssets';
import type { AssetFixture } from '../fixtures/types';
import { css } from '../lib/css';

export function Assets({ assets: propAssets }: { assets?: AssetFixture[] } = {}) {
  const { rows: liveAssets } = useAssets();
  const baseAssets = (propAssets ?? liveAssets).filter(
    (a) => !isRuntimeOnlyAssetType(a.type) && a.type.toLowerCase() !== 'dataagent'
  );
  const [query, setQuery] = useState('');
  const filtered = baseAssets.filter(
    (a) =>
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.domain.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div style={css('padding:24px 28px 40px;max-width:1400px;margin:0 auto;')}>
      <div style={css('font-size:12px;color:var(--fgm,#52525b);margin-bottom:8px;display:flex;align-items:center;gap:6px;')}>
        Governly <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" /> Assets
      </div>
      <div style={css('display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap;')}>
        <div>
          <div style={css('font-size:22px;font-weight:600;letter-spacing:-0.02em;color:var(--fg,#18181b);')}>Monitored Data Assets</div>
          <div style={css('font-size:13.5px;color:var(--fgm,#52525b);margin-top:4px;')}>
            Catalog of monitored Lakehouse tables, semantic models, and data products. (Pipelines and notebooks are tracked in Pipelines &amp; Freshness.)
          </div>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by asset or domain…"
          style={css('height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--border);background:var(--card);color:var(--fg);font-size:12.5px;min-width:240px;')}
        />
      </div>
      <AssetsCard assets={filtered} totalCount={filtered.length} />
    </div>
  );
}
