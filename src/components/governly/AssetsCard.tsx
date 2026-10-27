import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box } from './Box';
import { css } from '../../lib/css';
import { qColor, statusColor } from './primitives';
import { isRuntimeOnlyAssetType } from '../../data/useAssets';
import type { AssetFixture } from '../../fixtures/types';

type AssetCategoryFilter = 'all' | 'tables' | 'semantic-models' | 'data-products';
type AssetStatusFilter = 'all' | 'healthy' | 'attention' | 'has-dq';

export function AssetsCard({
  assets,
  totalCount,
  title = 'Monitored assets',
  subtitle = 'Data assets, Lakehouse tables, and Semantic models',
  showFilters = true,
}: {
  assets: AssetFixture[];
  totalCount?: number;
  title?: string;
  subtitle?: string;
  showFilters?: boolean;
}) {
  const navigate = useNavigate();
  const [categoryFilter, setCategoryFilter] = useState<AssetCategoryFilter>('all');
  const [statusFilter, setStatusFilter] = useState<AssetStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Overview & Monitored Assets strictly focus on Data Assets & Semantic Models (runtime jobs live in Pipelines & Freshness)
  const dataAssetsOnly = assets.filter(
    (a) => !isRuntimeOnlyAssetType(a.type) && a.type.toLowerCase() !== 'dataagent',
  );

  const countByCategory = {
    all: dataAssetsOnly.length,
    tables: dataAssetsOnly.filter((a) => a.type === 'Lakehouse table').length,
    'semantic-models': dataAssetsOnly.filter((a) => a.type === 'Semantic model').length,
    'data-products': dataAssetsOnly.filter(
      (a) => a.type !== 'Lakehouse table' && a.type !== 'Semantic model',
    ).length,
  };

  const filteredAssets = dataAssetsOnly.filter((a) => {
    if (categoryFilter === 'tables' && a.type !== 'Lakehouse table') return false;
    if (categoryFilter === 'semantic-models' && a.type !== 'Semantic model') return false;
    if (
      categoryFilter === 'data-products' &&
      (a.type === 'Lakehouse table' || a.type === 'Semantic model')
    ) {
      return false;
    }
    if (statusFilter === 'healthy' && a.status !== 'healthy') return false;
    if (statusFilter === 'attention' && a.status === 'healthy' && !a.late) return false;
    if (statusFilter === 'has-dq' && a.quality < 0) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      if (
        !a.name.toLowerCase().includes(q) &&
        !a.domain.toLowerCase().includes(q) &&
        !a.type.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const resolvedTotal = totalCount ?? dataAssetsOnly.length;

  const pillStyle = (active: boolean) =>
    css(
      `height:26px;padding:0 10px;border-radius:999px;border:1px solid ${
        active ? 'var(--accent,#4f46e5)' : 'var(--border,#e7e7ea)'
      };background:${
        active ? 'var(--accent,#4f46e5)' : 'var(--card2,#f4f4f5)'
      };color:${
        active ? '#fff' : 'var(--fgm,#52525b)'
      };font-size:11.5px;font-weight:${active ? 600 : 500};cursor:pointer;white-space:nowrap;`,
    );

  return (
    <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
      <div style={css('padding:15px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;border-bottom:1px solid var(--border,#e7e7ea);')}>
        <div>
          <div style={css('font-size:14px;font-weight:600;color:var(--fg,#18181b);')}>{title}</div>
          {subtitle && (
            <div style={css('font-size:11.5px;color:var(--fgm,#52525b);margin-top:2px;')}>
              {subtitle}
            </div>
          )}
        </div>
        <div style={css('display:flex;align-items:center;gap:10px;flex-wrap:wrap;')}>
          {showFilters && (
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tables, models, domains…"
              style={css(
                'height:28px;padding:0 10px;border-radius:7px;border:1px solid var(--border,#e7e7ea);background:var(--card2,#f4f4f5);color:var(--fg);font-size:12px;min-width:190px;',
              )}
            />
          )}
          <div
            role="link"
            tabIndex={0}
            onClick={() => navigate('/assets')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') navigate('/assets');
            }}
            style={css('font-size:12.5px;color:var(--accent,#4f46e5);font-weight:500;cursor:pointer;')}
          >
            View all {resolvedTotal}
          </div>
        </div>
      </div>

      {showFilters && (
        <div style={css('padding:10px 18px;border-bottom:1px solid var(--border,#e7e7ea);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;background:var(--card,#fff);')}>
          <div style={css('display:flex;align-items:center;gap:6px;flex-wrap:wrap;')}>
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              style={pillStyle(categoryFilter === 'all')}
            >
              All Data Assets ({countByCategory.all})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('tables')}
              style={pillStyle(categoryFilter === 'tables')}
            >
              Lakehouse Tables ({countByCategory.tables})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('semantic-models')}
              style={pillStyle(categoryFilter === 'semantic-models')}
            >
              Semantic Models ({countByCategory['semantic-models']})
            </button>
            {countByCategory['data-products'] > 0 && (
              <button
                type="button"
                onClick={() => setCategoryFilter('data-products')}
                style={pillStyle(categoryFilter === 'data-products')}
              >
                Data Products / Lakehouses ({countByCategory['data-products']})
              </button>
            )}
          </div>
          <div style={css('display:flex;align-items:center;gap:6px;flex-wrap:wrap;')}>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              style={pillStyle(statusFilter === 'all')}
            >
              All Status
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('attention')}
              style={pillStyle(statusFilter === 'attention')}
            >
              Needs Attention
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('has-dq')}
              style={pillStyle(statusFilter === 'has-dq')}
            >
              Has DQ Rules
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('healthy')}
              style={pillStyle(statusFilter === 'healthy')}
            >
              Healthy
            </button>
          </div>
        </div>
      )}

      <div style={css('display:grid;grid-template-columns:2.3fr 1fr 1.1fr 0.95fr 18px;gap:8px;padding:9px 18px;font-size:10.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--fgs,#a1a1aa);border-bottom:1px solid var(--border,#e7e7ea);')}>
        <span>Asset</span>
        <span>Domain</span>
        <span>Freshness</span>
        <span>Quality</span>
        <span />
      </div>
      {filteredAssets.length === 0 ? (
        <div style={css('padding:18px;font-size:12.5px;color:var(--fgm,#52525b);')}>
          No monitored data assets match the current filter.
        </div>
      ) : (
        filteredAssets.map((a) => {
          const na = a.quality < 0;
          const freshColor = a.late ? 'color:var(--crit);' : 'color:var(--fgm);';
          return (
            <Box
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/assets/${a.name}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/assets/${a.name}`);
                }
              }}
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
        })
      )}
    </div>
  );
}
