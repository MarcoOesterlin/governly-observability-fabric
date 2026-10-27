import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  buildFallbackJobDiagnostic,
  FreshnessTab,
  resolveActivityImpact,
} from '../components/governly/asset-tabs/FreshnessTab';
import { Box } from '../components/governly/Box';
import { badge, statusColor } from '../components/governly/primitives';
import { useJobFailureDiagnostics } from '../data/useAsset';
import { useAssets, useRuntimeAssets } from '../data/useAssets';
import { formatSlaMinutes } from '../data/useFreshnessSla';
import { useIncidents } from '../data/useIncidents';
import { css } from '../lib/css';

type RuntimeTypeFilter = 'all' | 'notebooks' | 'pipelines' | 'models' | 'tables';
type RuntimeStatusFilter = 'all' | 'breach' | 'healthy';

export function Freshness() {
  const navigate = useNavigate();
  const { allRows: dataAssets } = useAssets({ includeRuntime: true });
  const { rows: assets } = useRuntimeAssets();
  const combinedCatalog = Array.from(
    new Map([...dataAssets, ...assets].map((a) => [a.name, a])).values(),
  );
  const allJobDiagnostics = useJobFailureDiagnostics();
  const allIncidents = useIncidents();

  const [typeFilter, setTypeFilter] = useState<RuntimeTypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<RuntimeStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const pipelineAndNotebookAssets = assets.filter(
    (a) => a.type === 'Data pipeline' || a.type === 'Spark notebook',
  );
  const firstFailingAsset =
    pipelineAndNotebookAssets.find(
      (a) => a.late || a.fresh.toLowerCase().includes('fail'),
    ) ??
    assets.find((a) => a.late || a.fresh.toLowerCase().includes('fail')) ??
    pipelineAndNotebookAssets[0] ??
    assets[0];

  const [selectedAssetKey, setSelectedAssetKey] = useState<string>('');
  const targetAssetKey =
    selectedAssetKey && assets.some((a) => a.name === selectedAssetKey)
      ? selectedAssetKey
      : (firstFailingAsset?.name ?? '');

  const onTimeCount = assets.filter(
    (a) => !a.late && !a.fresh.toLowerCase().includes('fail'),
  ).length;
  const slaPct =
    assets.length > 0 ? ((onTimeCount / assets.length) * 100).toFixed(1) : '100.0';

  const counts = {
    all: assets.length,
    notebooks: assets.filter((a) => a.type === 'Spark notebook').length,
    pipelines: assets.filter((a) => a.type === 'Data pipeline').length,
    models: assets.filter((a) => a.type === 'Semantic model').length,
    tables: assets.filter((a) => a.type === 'Lakehouse table').length,
  };

  const filteredRuntime = assets.filter((a) => {
    if (typeFilter === 'notebooks' && a.type !== 'Spark notebook') return false;
    if (typeFilter === 'pipelines' && a.type !== 'Data pipeline') return false;
    if (typeFilter === 'models' && a.type !== 'Semantic model') return false;
    if (typeFilter === 'tables' && a.type !== 'Lakehouse table') return false;
    const isBreach = a.late || a.fresh.toLowerCase().includes('fail');
    if (statusFilter === 'breach' && !isBreach) return false;
    if (statusFilter === 'healthy' && isBreach) return false;
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

  const filteredJobs = pipelineAndNotebookAssets.filter((a) => {
    if (typeFilter === 'notebooks' && a.type !== 'Spark notebook') return false;
    if (typeFilter === 'pipelines' && a.type !== 'Data pipeline') return false;
    const isBreach = a.late || a.fresh.toLowerCase().includes('fail');
    if (statusFilter === 'breach' && !isBreach) return false;
    if (statusFilter === 'healthy' && isBreach) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      if (
        !a.name.toLowerCase().includes(q) &&
        !a.domain.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const pillStyle = (active: boolean) =>
    css(
      `height:28px;padding:0 11px;border-radius:999px;border:1px solid ${
        active ? 'var(--accent,#4f46e5)' : 'var(--border,#e7e7ea)'
      };background:${
        active ? 'var(--accent,#4f46e5)' : 'var(--card,#fff)'
      };color:${
        active ? '#fff' : 'var(--fgm,#52525b)'
      };font-size:12px;font-weight:${active ? 600 : 500};cursor:pointer;white-space:nowrap;`,
    );

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
              {slaPct}% SLA compliance across {assets.length} runtime jobs, notebooks, pipelines, and tables across all workspaces ({onTimeCount} on time).
            </div>
          </div>
          {assets.length > 0 && (
            <div style={css('display:flex;align-items:center;gap:8px;')}>
              <label htmlFor="freshness-asset-select" style={css('font-size:12px;font-weight:600;color:var(--fgm);')}>
                Inspect Runs for Item:
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
                    {a.name} ({a.type} · {a.fresh})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={css('margin-top:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;')}>
          <div style={css('display:flex;align-items:center;gap:6px;flex-wrap:wrap;')}>
            <button
              type="button"
              onClick={() => setTypeFilter('all')}
              style={pillStyle(typeFilter === 'all')}
            >
              All Runtime ({counts.all})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('notebooks')}
              style={pillStyle(typeFilter === 'notebooks')}
            >
              Spark Notebooks ({counts.notebooks})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('pipelines')}
              style={pillStyle(typeFilter === 'pipelines')}
            >
              Data Pipelines ({counts.pipelines})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('models')}
              style={pillStyle(typeFilter === 'models')}
            >
              Semantic Models ({counts.models})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('tables')}
              style={pillStyle(typeFilter === 'tables')}
            >
              Lakehouse Tables ({counts.tables})
            </button>
          </div>
          <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              style={pillStyle(statusFilter === 'all')}
            >
              All Status
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('breach')}
              style={pillStyle(statusFilter === 'breach')}
            >
              Failed / Late Only
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('healthy')}
              style={pillStyle(statusFilter === 'healthy')}
            >
              On Time
            </button>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notebooks, pipelines, workspaces…"
              style={css(
                'height:30px;padding:0 10px;border-radius:8px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);color:var(--fg);font-size:12px;min-width:220px;',
              )}
            />
          </div>
        </div>
      </div>

      {filteredJobs.length > 0 && typeFilter !== 'models' && typeFilter !== 'tables' && (
        <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
          <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;')}>
            <div>
              <div style={css('font-size:14px;font-weight:600;color:var(--fg);')}>
                Data Pipelines &amp; Spark Notebooks Execution Health (All Workspaces)
              </div>
              <div style={css('font-size:12px;color:var(--fgm);margin-top:2px;')}>
                Includes all notebooks and pipelines across every workspace (including Governly host and excluded workspaces), with failure root cause and suggested solutions.
              </div>
            </div>
            <span style={badge('#4338ca', '#eef2ff')}>
              {filteredJobs.length} runtime jobs
            </span>
          </div>
          <div style={css('display:grid;grid-template-columns:1.55fr 0.7fr 0.75fr 1.8fr 0.75fr;gap:12px;padding:9px 18px;font-size:10.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--fgs);border-bottom:1px solid var(--border,#e7e7ea);')}>
            <span>Pipeline / Notebook</span>
            <span>Type &amp; Domain</span>
            <span>Latest Run</span>
            <span>Failure Reason &amp; Possible Solution</span>
            <span style={css('text-align:right;')}>Action</span>
          </div>
          {filteredJobs.map((item) => {
            const isFailed = item.fresh.toLowerCase().includes('fail');
            const isBreach = isFailed || item.late;
            const matchedDiag =
              allJobDiagnostics.find((d) => d.assetKey === item.name) ??
              (isBreach
                ? buildFallbackJobDiagnostic(
                    item.name,
                    item.type,
                    item.fresh,
                    formatSlaMinutes(item.slaMinutes ?? 1440),
                    allIncidents.find((i) => i.asset === item.name)?.summary,
                  )
                : null);
            const rowImpact = isBreach ? resolveActivityImpact(item, combinedCatalog) : null;

            return (
              <div
                key={item.id}
                style={css(
                  'display:grid;grid-template-columns:1.55fr 0.7fr 0.75fr 1.8fr 0.75fr;gap:12px;padding:12px 18px;align-items:center;border-bottom:1px solid var(--border,#e7e7ea);',
                )}
              >
                <div style={css('display:flex;align-items:center;gap:8px;min-width:0;')}>
                  <i className={`ph ${item.icon}`} style={css('font-size:16px;color:var(--fgm);')} aria-hidden="true" />
                  <span style={css("font-size:13px;font-weight:600;color:var(--fg);font-family:'Geist Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>
                    {item.name}
                  </span>
                </div>
                <div style={css('font-size:12px;color:var(--fgm);')}>
                  <div>{item.type}</div>
                  <div style={css('font-size:11px;color:var(--fgs);')}>{item.domain}</div>
                </div>
                <div>
                  <span
                    style={
                      isBreach
                        ? badge('var(--crit)', 'var(--critb)')
                        : badge('var(--ok)', 'var(--okb)')
                    }
                  >
                    {isFailed ? 'Run Failed' : item.late ? `Late (${item.fresh})` : item.fresh}
                  </span>
                </div>
                <div style={css('font-size:12px;color:var(--fgm);line-height:1.4;')}>
                  {matchedDiag ? (
                    <div style={css('display:flex;flex-direction:column;gap:4px;')}>
                      <div style={css('color:var(--crit);font-weight:600;')}>
                        Why: {matchedDiag.whyFailed}
                      </div>
                      <div style={css('color:var(--fgm);')}>
                        Solution: {matchedDiag.possibleSolution.split('\n')[0]}
                      </div>
                      {rowImpact && (rowImpact.upstream.length > 0 || rowImpact.downstream.length > 0) && (
                        <div style={css('display:flex;flex-wrap:wrap;gap:5px;margin-top:3px;')}>
                          {rowImpact.upstream.slice(0, 2).map((u) => (
                            <span
                              key={`up-${u.name}`}
                              onClick={() => {
                                if (u.navigable) navigate(`/assets/${u.name}`);
                              }}
                              style={css(
                                `font-size:11px;padding:2px 7px;border-radius:5px;background:var(--card2,#f4f4f6);color:var(--fgm);border:1px solid var(--border,#e7e7ea);font-family:'Geist Mono',monospace;cursor:${u.navigable ? 'pointer' : 'default'};`,
                              )}
                            >
                              ↑ Upstream: {u.name}
                            </span>
                          ))}
                          {rowImpact.downstream.slice(0, 4).map((d) => (
                            <span
                              key={`dn-${d.name}`}
                              onClick={() => {
                                if (d.navigable) navigate(`/assets/${d.name}`);
                              }}
                              style={css(
                                `font-size:11px;padding:2px 7px;border-radius:5px;background:var(--critb,#fef2f2);color:var(--crit,#dc2626);border:1px solid var(--crit,#dc2626);font-family:'Geist Mono',monospace;font-weight:600;cursor:${d.navigable ? 'pointer' : 'default'};`,
                              )}
                            >
                              ↓ Affects / Breaks: {d.name} ({d.type})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span style={css('color:var(--ok);')}>All recent runs succeeded within SLA</span>
                  )}
                </div>
                <div style={css('text-align:right;')}>
                  <button
                    type="button"
                    onClick={() => setSelectedAssetKey(item.name)}
                    style={css(
                      'height:28px;padding:0 10px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);color:var(--fg);font-size:11.5px;font-weight:600;cursor:pointer;',
                    )}
                  >
                    Inspect Runs
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FreshnessTab assetKey={targetAssetKey} />

      <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
        <div style={css('padding:15px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;border-bottom:1px solid var(--border,#e7e7ea);')}>
          <div>
            <div style={css('font-size:14px;font-weight:600;color:var(--fg,#18181b);')}>
              Runtime &amp; Freshness Inventory ({filteredRuntime.length})
            </div>
            <div style={css('font-size:11.5px;color:var(--fgm,#52525b);margin-top:2px;')}>
              Click any notebook, pipeline, semantic model, or table to inspect its run history or open its detail view.
            </div>
          </div>
        </div>
        <div style={css('display:grid;grid-template-columns:2.2fr 1fr 1fr 1fr 90px;gap:8px;padding:9px 18px;font-size:10.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--fgs,#a1a1aa);border-bottom:1px solid var(--border,#e7e7ea);')}>
          <span>Runtime Item / Asset</span>
          <span>Type</span>
          <span>Workspace / Domain</span>
          <span>Latest Run / Freshness</span>
          <span style={css('text-align:right;')}>SLA Target</span>
        </div>
        {filteredRuntime.map((a) => {
          const isFailed = a.fresh.toLowerCase().includes('fail');
          const freshColor = a.late || isFailed ? 'color:var(--crit);' : 'color:var(--fgm);';
          return (
            <Box
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedAssetKey(a.name);
                navigate(`/assets/${a.name}`);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedAssetKey(a.name);
                  navigate(`/assets/${a.name}`);
                }
              }}
              style="display:grid;grid-template-columns:2.2fr 1fr 1fr 1fr 90px;gap:8px;padding:12px 18px;align-items:center;border-bottom:1px solid var(--border,#e7e7ea);cursor:pointer;"
              hover="background:var(--card2)"
            >
              <div style={css('display:flex;align-items:center;gap:11px;min-width:0;')}>
                <div style={css('width:32px;height:32px;border-radius:8px;background:var(--card2,#f4f4f5);display:flex;align-items:center;justify-content:center;color:var(--fgm);font-size:16px;flex:0 0 auto;')}>
                  <i className={`ph ${a.icon}`} aria-hidden="true" />
                </div>
                <div style={css("font-size:13px;font-weight:600;color:var(--fg,#18181b);font-family:'Geist Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>
                  {a.name}
                </div>
              </div>
              <span style={css('font-size:12.5px;color:var(--fgm,#52525b);')}>{a.type}</span>
              <span style={css('font-size:12.5px;color:var(--fgm,#52525b);')}>{a.domain}</span>
              <div style={css(`display:flex;align-items:center;gap:6px;font-size:12.5px;${freshColor}`)}>
                <span style={css(`width:7px;height:7px;border-radius:99px;background:${statusColor(a.status)};flex:0 0 auto;`)} />
                <span style={css(freshColor)}>{a.fresh}</span>
              </div>
              <span style={css("font-size:12px;font-family:'Geist Mono Variable','Geist Mono',monospace;color:var(--fgm);text-align:right;")}>
                {formatSlaMinutes(a.slaMinutes ?? 1440)}
              </span>
            </Box>
          );
        })}
      </div>
    </div>
  );
}
