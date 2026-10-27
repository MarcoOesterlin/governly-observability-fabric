import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  buildFallbackJobDiagnostic,
  cleanFailureMessage,
  FreshnessTab,
  resolveActivityImpact,
} from '../components/governly/asset-tabs/FreshnessTab';
import { Box } from '../components/governly/Box';
import { badge, statusColor } from '../components/governly/primitives';
import { useJobFailureDiagnostics } from '../data/useAsset';
import { useAssets, useRuntimeAssets } from '../data/useAssets';
import {
  evaluateExpectedLanding,
  formatSlaMinutes,
  useExpectedLandingTimes,
} from '../data/useFreshnessSla';
import { useIncidents } from '../data/useIncidents';
import { css } from '../lib/css';

type RuntimeTypeFilter = 'workloads' | 'notebooks' | 'pipelines' | 'tables' | 'models' | 'all';
type RuntimeStatusFilter = 'all' | 'breach' | 'healthy';

export function Freshness() {
  const navigate = useNavigate();
  const { allRows: dataAssets } = useAssets({ includeRuntime: true });
  const { rows: assets, liveJobs } = useRuntimeAssets();
  const { landingMap } = useExpectedLandingTimes();
  const combinedCatalog = Array.from(
    new Map([...dataAssets, ...assets].map((a) => [a.name, a])).values(),
  );
  const allJobDiagnostics = useJobFailureDiagnostics();
  const allIncidents = useIncidents();

  const [typeFilter, setTypeFilter] = useState<RuntimeTypeFilter>('workloads');
  const [statusFilter, setStatusFilter] = useState<RuntimeStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedJobIds, setExpandedJobIds] = useState<Record<string, boolean>>({});

  const toggleJobExpand = (jobId: string) => {
    setExpandedJobIds((prev) => ({ ...prev, [jobId]: !prev[jobId] }));
  };

  const pipelineAndNotebookAssets = assets.filter(
    (a) => a.type === 'Data pipeline' || a.type === 'Spark notebook',
  );
  const isWorkloadScope =
    typeFilter === 'workloads' || typeFilter === 'notebooks' || typeFilter === 'pipelines';
  const inspectableItems =
    isWorkloadScope && pipelineAndNotebookAssets.length > 0
      ? pipelineAndNotebookAssets
      : assets;

  const firstFailingAsset =
    inspectableItems.find(
      (a) => a.late || a.fresh.toLowerCase().includes('fail'),
    ) ??
    pipelineAndNotebookAssets[0] ??
    assets[0];

  const [selectedAssetKey, setSelectedAssetKey] = useState<string>('');
  const targetAssetKey =
    selectedAssetKey && inspectableItems.some((a) => a.name === selectedAssetKey)
      ? selectedAssetKey
      : (firstFailingAsset?.name ?? '');

  const kpiScopeItems =
    pipelineAndNotebookAssets.length > 0 ? pipelineAndNotebookAssets : assets;
  const onTimeCount = kpiScopeItems.filter(
    (a) => !a.late && !a.fresh.toLowerCase().includes('fail'),
  ).length;
  const slaPct =
    kpiScopeItems.length > 0
      ? ((onTimeCount / kpiScopeItems.length) * 100).toFixed(1)
      : '100.0';

  const counts = {
    workloads: pipelineAndNotebookAssets.length,
    notebooks: assets.filter((a) => a.type === 'Spark notebook').length,
    pipelines: assets.filter((a) => a.type === 'Data pipeline').length,
    tables: assets.filter((a) => a.type === 'Lakehouse table').length,
    models: assets.filter((a) => a.type === 'Semantic model').length,
    all: assets.length,
  };

  const filteredRuntime = assets.filter((a) => {
    if (
      typeFilter === 'workloads' &&
      a.type !== 'Spark notebook' &&
      a.type !== 'Data pipeline'
    ) {
      return false;
    }
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
              {slaPct}% SLA compliance across {kpiScopeItems.length} runtime workloads — Spark notebooks &amp; data pipelines ({onTimeCount} healthy).
            </div>
          </div>
          {inspectableItems.length > 0 && (
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
                {inspectableItems.map((a) => (
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
              onClick={() => setTypeFilter('workloads')}
              style={pillStyle(typeFilter === 'workloads')}
            >
              Notebooks &amp; Pipelines ({counts.workloads})
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
            <span style={css('width:1px;height:18px;background:var(--border,#e7e7ea);margin:0 4px;')} aria-hidden="true" />
            <button
              type="button"
              onClick={() => setTypeFilter('tables')}
              style={pillStyle(typeFilter === 'tables')}
              title="Inspect table landing freshness (Data Assets)"
            >
              Lakehouse Tables ({counts.tables})
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('models')}
              style={pillStyle(typeFilter === 'models')}
              title="Inspect semantic model refresh freshness (Data Assets)"
            >
              Semantic Models ({counts.models})
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
                Click any failed or late row to expand its failure root cause, suggested fix, and upstream/downstream blast radius.
              </div>
            </div>
            <span style={badge('#4338ca', '#eef2ff')}>
              {filteredJobs.length} runtime workloads
            </span>
          </div>
          <div style={css('display:grid;grid-template-columns:1.55fr 0.75fr 0.7fr 1.65fr 0.95fr;gap:12px;padding:9px 18px;font-size:10.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--fgs);border-bottom:1px solid var(--border,#e7e7ea);')}>
            <span>Pipeline / Notebook</span>
            <span>Type &amp; Workspace</span>
            <span>Latest Run</span>
            <span>Execution Status &amp; Summary</span>
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
            const hasDetails = Boolean(matchedDiag);
            const isExpanded = Boolean(expandedJobIds[item.id]);
            const cleanedWhy = matchedDiag ? cleanFailureMessage(matchedDiag.whyFailed) : '';
            const totalAffected =
              (rowImpact?.upstream.length ?? 0) + (rowImpact?.downstream.length ?? 0);

            return (
              <div key={item.id} style={css('border-bottom:1px solid var(--border,#e7e7ea);')}>
                <div
                  role={hasDetails ? 'button' : undefined}
                  tabIndex={hasDetails ? 0 : undefined}
                  onClick={() => {
                    if (hasDetails) toggleJobExpand(item.id);
                  }}
                  onKeyDown={(e) => {
                    if (hasDetails && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      toggleJobExpand(item.id);
                    }
                  }}
                  style={css(
                    `display:grid;grid-template-columns:1.55fr 0.75fr 0.7fr 1.65fr 0.95fr;gap:12px;padding:11px 18px;align-items:center;cursor:${
                      hasDetails ? 'pointer' : 'default'
                    };background:${isExpanded ? 'var(--card2,#fafafa)' : 'transparent'};`,
                  )}
                >
                  <div style={css('display:flex;align-items:center;gap:8px;min-width:0;')}>
                    <i
                      className={`ph ${
                        hasDetails
                          ? isExpanded
                            ? 'ph-caret-down'
                            : 'ph-caret-right'
                          : 'ph-check-circle'
                      }`}
                      style={css(
                        `font-size:13px;color:${
                          hasDetails ? 'var(--crit,#dc2626)' : 'var(--ok,#16a34a)'
                        };flex:0 0 auto;`,
                      )}
                      aria-hidden="true"
                    />
                    <i className={`ph ${item.icon}`} style={css('font-size:16px;color:var(--fgm);flex:0 0 auto;')} aria-hidden="true" />
                    <span style={css("font-size:13px;font-weight:600;color:var(--fg);font-family:'Geist Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>
                      {item.name}
                    </span>
                  </div>
                  <div style={css('font-size:12px;color:var(--fgm);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>
                    <span>{item.type}</span>
                    <span style={css('font-size:11px;color:var(--fgs);margin-left:6px;')}>· {item.domain}</span>
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
                  <div style={css('font-size:12px;color:var(--fgm);min-width:0;display:flex;align-items:center;gap:8px;')}>
                    {matchedDiag ? (
                      <>
                        <span
                          style={css(
                            'color:var(--crit);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;',
                          )}
                        >
                          {cleanedWhy}
                        </span>
                        {totalAffected > 0 && (
                          <span
                            style={css(
                              "font-size:10.5px;padding:1px 6px;border-radius:4px;background:var(--critb,#fef2f2);color:var(--crit,#dc2626);font-family:'Geist Mono',monospace;font-weight:600;white-space:nowrap;flex:0 0 auto;",
                            )}
                          >
                            {rowImpact?.downstream.length ?? 0} affected
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={css('color:var(--ok);')}>All recent runs succeeded within SLA</span>
                    )}
                  </div>
                  <div
                    style={css('display:flex;align-items:center;justify-content:flex-end;gap:6px;')}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {hasDetails && (
                      <button
                        type="button"
                        onClick={() => toggleJobExpand(item.id)}
                        style={css(
                          `height:27px;padding:0 9px;border-radius:6px;border:1px solid ${
                            isExpanded ? 'var(--crit,#dc2626)' : 'var(--border,#e7e7ea)'
                          };background:${
                            isExpanded ? 'var(--critb,#fef2f2)' : 'var(--card,#fff)'
                          };color:${
                            isExpanded ? 'var(--crit,#dc2626)' : 'var(--fg)'
                          };font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;`,
                        )}
                      >
                        <i className={`ph ${isExpanded ? 'ph-caret-up' : 'ph-caret-down'}`} aria-hidden="true" />
                        {isExpanded ? 'Hide Failure' : 'Failure Details'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedAssetKey(item.name)}
                      style={css(
                        'height:27px;padding:0 9px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);color:var(--fg);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;',
                      )}
                    >
                      Inspect Runs
                    </button>
                  </div>
                </div>

                {hasDetails && isExpanded && matchedDiag && (
                  <div
                    style={css(
                      'padding:12px 18px 14px 40px;background:var(--card2,#fafafa);border-top:1px dashed var(--border,#e7e7ea);display:flex;flex-direction:column;gap:10px;',
                    )}
                  >
                    <div style={css('display:grid;grid-template-columns:1fr 1fr;gap:12px;')}>
                      <div style={css('padding:10px 12px;border-radius:8px;background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);')}>
                        <div style={css('font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--crit,#dc2626);margin-bottom:4px;')}>
                          Why It Failed ({matchedDiag.errorCode})
                        </div>
                        <div style={css('font-size:12px;color:var(--fg);line-height:1.5;')}>
                          {cleanedWhy}
                        </div>
                      </div>
                      <div style={css('padding:10px 12px;border-radius:8px;background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);')}>
                        <div style={css('font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--ok,#16a34a);margin-bottom:4px;')}>
                          Suggested Solution
                        </div>
                        <div style={css('font-size:12px;color:var(--fg);line-height:1.5;white-space:pre-line;')}>
                          {matchedDiag.possibleSolution}
                        </div>
                      </div>
                    </div>

                    {rowImpact && (rowImpact.upstream.length > 0 || rowImpact.downstream.length > 0) && (
                      <div style={css('display:flex;flex-wrap:wrap;gap:6px;align-items:center;')}>
                        <span style={css('font-size:11px;font-weight:600;color:var(--fgm);margin-right:4px;')}>
                          Blast Radius:
                        </span>
                        {rowImpact.upstream.map((u) => (
                          <span
                            key={`up-${u.name}`}
                            onClick={() => {
                              if (u.navigable) navigate(`/assets/${u.name}`);
                            }}
                            style={css(
                              `font-size:11px;padding:2px 7px;border-radius:5px;background:var(--card,#fff);color:var(--fgm);border:1px solid var(--border,#e7e7ea);font-family:'Geist Mono',monospace;cursor:${u.navigable ? 'pointer' : 'default'};`,
                            )}
                          >
                            ↑ Upstream: {u.name}
                          </span>
                        ))}
                        {rowImpact.downstream.map((d) => (
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
                )}
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
        <div style={css('display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1.1fr 90px;gap:8px;padding:9px 18px;font-size:10.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--fgs,#a1a1aa);border-bottom:1px solid var(--border,#e7e7ea);')}>
          <span>Runtime Item / Asset</span>
          <span>Type</span>
          <span>Workspace / Domain</span>
          <span>Latest Run / Freshness</span>
          <span>Expected Landing</span>
          <span style={css('text-align:right;')}>SLA Target</span>
        </div>
        {filteredRuntime.map((a) => {
          const isFailed = a.fresh.toLowerCase().includes('fail');
          const freshColor = a.late || isFailed ? 'color:var(--crit);' : 'color:var(--fgm);';
          const matchedJob = liveJobs.find(
            (j) => j.asset_key === a.name || j.name === a.name,
          );
          const landingEval = evaluateExpectedLanding(
            a.name,
            matchedJob?.runs ?? [],
            landingMap,
          );
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
              style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1.1fr 90px;gap:8px;padding:12px 18px;align-items:center;border-bottom:1px solid var(--border,#e7e7ea);cursor:pointer;"
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
              <div style={css("display:flex;align-items:center;gap:6px;font-size:12px;font-family:'Geist Mono',monospace;")}>
                <span style={css('font-weight:600;color:var(--fg);')}>
                  {landingEval.expectedTime}
                </span>
                <span style={css('font-size:10.5px;color:var(--fgm);')}>
                  {landingEval.mode === 'custom'
                    ? '(Custom)'
                    : landingEval.runCount >= 2
                      ? `(Avg · ${landingEval.runCount}r)`
                      : '(Auto)'}
                </span>
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
