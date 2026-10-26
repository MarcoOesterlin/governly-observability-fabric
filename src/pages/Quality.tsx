import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { QualityTab } from '../components/governly/asset-tabs/QualityTab';
import { QualityRuleStudio } from '../components/governly/QualityRuleStudio';
import { badge } from '../components/governly/primitives';
import { useAssetFailedRows } from '../data/useAsset';
import { useAssets } from '../data/useAssets';
import { useQualityRules } from '../data/useQualityRules';
import { css } from '../lib/css';

type QualitySubview = 'overview' | 'rules' | 'authoring' | 'failed-rows';

const QUALITY_NAV_ITEMS: Array<{
  id: QualitySubview;
  label: string;
  path: string;
  icon: string;
}> = [
  { id: 'overview', label: 'Overview', path: '/quality', icon: 'ph-squares-four' },
  { id: 'rules', label: 'Data Quality Rules', path: '/quality/rules', icon: 'ph-list-checks' },
  {
    id: 'authoring',
    label: 'Data Quality Rule Authoring & Validation',
    path: '/quality/authoring',
    icon: 'ph-flask',
  },
  {
    id: 'failed-rows',
    label: 'Failed Row Inspect & Root Cause Diagnostics',
    path: '/quality/failed-rows',
    icon: 'ph-magnifying-glass-plus',
  },
];

export function Quality() {
  const { subview } = useParams<{ subview?: string }>();
  const navigate = useNavigate();
  const activeView: QualitySubview =
    subview === 'rules' || subview === 'authoring' || subview === 'failed-rows'
      ? subview
      : 'overview';

  const { rows: assets } = useAssets();
  const tableAssets = assets.filter((a) => a.type === 'Lakehouse table');
  const selectableAssets = tableAssets.length > 0 ? tableAssets : assets;
  const { rules: allUserRules } = useQualityRules();
  const allFailedRows = useAssetFailedRows(undefined, true);
  const [selectedAssetKey, setSelectedAssetKey] = useState<string>('*');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const firstWithFailure = selectableAssets.find(
    (a) => (a.qualityPass ?? 0) < (a.qualityTotal ?? 0) || (a.quality >= 0 && a.quality < 100),
  );
  const targetAssetKey =
    selectedAssetKey === '*'
      ? activeView === 'authoring'
        ? (firstWithFailure?.name ?? selectableAssets[0]?.name ?? '')
        : '*'
      : selectedAssetKey && selectableAssets.some((a) => a.name === selectedAssetKey)
        ? selectedAssetKey
        : (firstWithFailure?.name ?? selectableAssets[0]?.name ?? '*');

  const evaluatedAssets = assets.filter((a) => a.quality >= 0);
  const avgQuality =
    evaluatedAssets.length > 0
      ? Math.round(
          (evaluatedAssets.reduce((acc, a) => acc + a.quality, 0) / evaluatedAssets.length) * 10,
        ) / 10
      : null;
  const totalRules = allUserRules.length;
  const totalPass = allUserRules.filter((r) => r.is_active).length;
  const failingRulesCount = Math.max(0, totalRules - totalPass);
  const healthyAssetsCount = evaluatedAssets.filter((a) => a.quality >= 95).length;

  const activeNavMeta = QUALITY_NAV_ITEMS.find((i) => i.id === activeView) ?? QUALITY_NAV_ITEMS[0];

  return (
    <div style={css('padding:24px 28px 40px;max-width:1400px;margin:0 auto;')}>
      <div style={css('font-size:12px;color:var(--fgm,#52525b);margin-bottom:8px;display:flex;align-items:center;gap:6px;')}>
        <span style={css('cursor:pointer;')} onClick={() => navigate('/')}>Governly</span>
        <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" />
        <span style={css('cursor:pointer;')} onClick={() => navigate('/quality')}>Data Quality</span>
        {activeView !== 'overview' && (
          <>
            <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" />
            <span style={css('color:var(--fg);font-weight:500;')}>{activeNavMeta.label}</span>
          </>
        )}
      </div>

      <div style={css('margin-bottom:16px;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;')}>
        <div>
          <div style={css('font-size:22px;font-weight:600;letter-spacing:-0.02em;color:var(--fg,#18181b);')}>
            {activeView === 'overview' ? 'Data Quality Overview' : activeNavMeta.label}
          </div>
          <div style={css('font-size:13.5px;color:var(--fgm,#52525b);margin-top:4px;')}>
            {activeView === 'overview' &&
              'Monitor rule pass rates, table quality scores, and row-level anomalies across workspaces.'}
            {activeView === 'rules' &&
              'Inspect active completeness, uniqueness, freshness, and custom SQL quality rules per table.'}
            {activeView === 'authoring' &&
              'Author, validate, and schedule Spark SQL quality rules across Lakehouse tables.'}
            {activeView === 'failed-rows' &&
              'Inspect captured failing Delta rows, root-cause diagnostics, and ready-to-run Spark SQL fixes.'}
          </div>
        </div>

        {activeView !== 'overview' && selectableAssets.length > 0 && (
          <div style={css('display:flex;align-items:center;gap:8px;')}>
            <label htmlFor="dq-asset-select" style={css('font-size:12px;font-weight:600;color:var(--fgm);')}>
              Target Asset:
            </label>
            <select
              id="dq-asset-select"
              value={targetAssetKey}
              onChange={(e) => setSelectedAssetKey(e.target.value)}
              style={css(
                'height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);color:var(--fg);font-size:13px;font-weight:500;',
              )}
            >
              {activeView !== 'authoring' && (
                <option value="*">All workspace tables ({selectableAssets.length})</option>
              )}
              {selectableAssets.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name} ({a.type})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Data Quality Sub-Navbar */}
      <div
        role="tablist"
        aria-label="Data Quality navigation"
        style={css(
          'display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px;margin-bottom:20px;background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:11px;box-shadow:var(--shadow);',
        )}
      >
        {QUALITY_NAV_ITEMS.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => navigate(item.path)}
              style={css(
                `height:34px;padding:0 13px;border-radius:8px;border:1px solid ${isActive ? '#4f46e5' : 'transparent'};background:${isActive ? '#eef2ff' : 'transparent'};color:${isActive ? '#4338ca' : 'var(--fgm,#52525b)'};font-size:12.5px;font-weight:${isActive ? 600 : 500};display:inline-flex;align-items:center;gap:7px;cursor:pointer;transition:all 0.12s;`,
              )}
            >
              <i className={`ph ${item.icon}`} style={css('font-size:15px;')} aria-hidden="true" />
              <span>{item.label}</span>
              {item.id === 'failed-rows' && allFailedRows.length > 0 && (
                <span style={badge('var(--crit,#dc2626)', 'var(--critb,#fef2f2)')}>
                  {allFailedRows.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeView === 'overview' && (
        <div style={css('display:flex;flex-direction:column;gap:18px;')}>
          {/* Overview KPI Strip */}
          <div style={css('display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;')}>
            <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;padding:16px 18px;box-shadow:var(--shadow);')}>
              <div style={css('font-size:11.5px;font-weight:600;color:var(--fgm);text-transform:uppercase;letter-spacing:0.04em;')}>
                Average Quality Score
              </div>
              <div style={css('display:flex;align-items:baseline;justify-content:space-between;margin-top:8px;')}>
                <div style={css("font-size:26px;font-weight:700;color:var(--fg);font-family:'Geist Mono',monospace;")}>
                  {avgQuality !== null ? `${avgQuality.toFixed(1)}%` : 'N/A'}
                </div>
                <span
                  style={badge(
                    avgQuality === null
                      ? 'var(--fgm)'
                      : avgQuality >= 95
                        ? 'var(--ok)'
                        : avgQuality >= 83
                          ? 'var(--warn)'
                          : 'var(--crit)',
                    avgQuality === null
                      ? 'var(--card2)'
                      : avgQuality >= 95
                        ? 'var(--okb)'
                        : avgQuality >= 83
                          ? 'var(--warnb)'
                          : 'var(--critb)',
                  )}
                >
                  {avgQuality === null ? 'No rules' : avgQuality >= 95 ? 'OK' : avgQuality >= 83 ? 'Degraded' : 'Breach'}
                </span>
              </div>
              <div style={css('font-size:12px;color:var(--fgs);margin-top:4px;')}>
                {evaluatedAssets.length > 0
                  ? `Across ${evaluatedAssets.length} table${evaluatedAssets.length === 1 ? '' : 's'} with active rules`
                  : 'Apply quality rules to calculate score'}
              </div>
            </div>

            <div
              onClick={() => navigate('/quality/rules')}
              style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;padding:16px 18px;box-shadow:var(--shadow);cursor:pointer;')}
            >
              <div style={css('font-size:11.5px;font-weight:600;color:var(--fgm);text-transform:uppercase;letter-spacing:0.04em;display:flex;align-items:center;justify-content:space-between;')}>
                <span>Data Quality Rules</span>
                <i className="ph ph-arrow-up-right" style={css('font-size:14px;color:var(--fgs);')} aria-hidden="true" />
              </div>
              <div style={css('display:flex;align-items:baseline;justify-content:space-between;margin-top:8px;')}>
                <div style={css("font-size:26px;font-weight:700;color:var(--fg);font-family:'Geist Mono',monospace;")}>
                  {totalPass}/{totalRules}
                </div>
                <span
                  style={badge(
                    failingRulesCount === 0 ? 'var(--ok)' : 'var(--warn)',
                    failingRulesCount === 0 ? 'var(--okb)' : 'var(--warnb)',
                  )}
                >
                  {failingRulesCount === 0 ? 'All passing' : `${failingRulesCount} failing`}
                </span>
              </div>
              <div style={css('font-size:12px;color:var(--fgs);margin-top:4px;')}>
                Click to view all quality rules →
              </div>
            </div>

            <div
              onClick={() => navigate('/quality/authoring')}
              style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;padding:16px 18px;box-shadow:var(--shadow);cursor:pointer;')}
            >
              <div style={css('font-size:11.5px;font-weight:600;color:var(--fgm);text-transform:uppercase;letter-spacing:0.04em;display:flex;align-items:center;justify-content:space-between;')}>
                <span>Healthy Tables</span>
                <i className="ph ph-flask" style={css('font-size:14px;color:#4f46e5;')} aria-hidden="true" />
              </div>
              <div style={css('display:flex;align-items:baseline;justify-content:space-between;margin-top:8px;')}>
                <div style={css("font-size:26px;font-weight:700;color:var(--fg);font-family:'Geist Mono',monospace;")}>
                  {healthyAssetsCount}/{assets.length}
                </div>
                <span style={badge('#4338ca', '#eef2ff')}>Rule Studio</span>
              </div>
              <div style={css('font-size:12px;color:var(--fgs);margin-top:4px;')}>
                Author &amp; validate new Spark SQL rules →
              </div>
            </div>

            <div
              onClick={() => navigate('/quality/failed-rows')}
              style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;padding:16px 18px;box-shadow:var(--shadow);cursor:pointer;')}
            >
              <div style={css('font-size:11.5px;font-weight:600;color:var(--fgm);text-transform:uppercase;letter-spacing:0.04em;display:flex;align-items:center;justify-content:space-between;')}>
                <span>Captured Failed Rows</span>
                <i className="ph ph-magnifying-glass-plus" style={css('font-size:14px;color:var(--crit);')} aria-hidden="true" />
              </div>
              <div style={css('display:flex;align-items:baseline;justify-content:space-between;margin-top:8px;')}>
                <div style={css("font-size:26px;font-weight:700;color:var(--fg);font-family:'Geist Mono',monospace;")}>
                  {allFailedRows.length}
                </div>
                <span
                  style={badge(
                    allFailedRows.length === 0 ? 'var(--ok)' : 'var(--crit)',
                    allFailedRows.length === 0 ? 'var(--okb)' : 'var(--critb)',
                  )}
                >
                  {allFailedRows.length === 0 ? 'Clean' : 'Inspect rows'}
                </span>
              </div>
              <div style={css('font-size:12px;color:var(--fgs);margin-top:4px;')}>
                Diagnose root cause &amp; SQL fix →
              </div>
            </div>
          </div>

          {/* Per-Table Data Quality Summary */}
          <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
            <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);display:flex;align-items:center;justify-content:space-between;')}>
              <div>
                <div style={css('font-size:14px;font-weight:600;color:var(--fg);')}>
                  Monitored Assets Quality Summary
                </div>
                <div style={css('font-size:12px;color:var(--fgm);margin-top:2px;')}>
                  Select any asset to view its rules or inspect failed rows and root-cause diagnostics.
                </div>
              </div>
            </div>
            <div style={css('display:grid;grid-template-columns:1.8fr 0.9fr 0.9fr 0.9fr 0.8fr 1.3fr;gap:12px;padding:9px 18px;font-size:10.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--fgs);border-bottom:1px solid var(--border,#e7e7ea);')}>
              <span>Asset</span>
              <span>Domain</span>
              <span>Quality Score</span>
              <span>Rules Passing</span>
              <span>Status</span>
              <span style={css('text-align:right;')}>Actions</span>
            </div>
            {assets.map((a) => {
              const assetFailRows = allFailedRows.filter((fr) => fr.assetKey === a.name).length;
              const assetRules = allUserRules.filter(
                (r) => r.asset_key === a.name || r.asset_key === '*',
              );
              const qPass = assetRules.filter((r) => r.is_active).length;
              const qTot = assetRules.length;
              return (
                <div
                  key={a.id}
                  style={css(
                    'display:grid;grid-template-columns:1.8fr 0.9fr 0.9fr 0.9fr 0.8fr 1.3fr;gap:12px;padding:12px 18px;align-items:center;border-bottom:1px solid var(--border,#e7e7ea);',
                  )}
                >
                  <div style={css('display:flex;align-items:center;gap:9px;min-width:0;')}>
                    <i className={`ph ${a.icon}`} style={css('font-size:16px;color:var(--fgm);')} aria-hidden="true" />
                    <div style={css('min-width:0;')}>
                      <div style={css("font-size:13px;font-weight:600;color:var(--fg);font-family:'Geist Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>
                        {a.name}
                      </div>
                      <div style={css('font-size:11px;color:var(--fgs);')}>{a.type}</div>
                    </div>
                  </div>
                  <span style={css('font-size:12.5px;color:var(--fgm);')}>{a.domain}</span>
                  <span style={css(`font-size:13px;font-weight:600;color:${a.quality < 0 ? 'var(--fgs,#a1a1aa)' : 'var(--fg)'};font-family:'Geist Mono',monospace;`)}>
                    {a.quality < 0 ? 'N/A' : `${a.quality.toFixed(1)}%`}
                  </span>
                  <span style={css("font-size:12.5px;color:var(--fgm);font-family:'Geist Mono',monospace;")}>
                    {qTot === 0 ? '0 rules configured' : `${qPass}/${qTot} active`}
                  </span>
                  <div>
                    <span
                      style={badge(
                        a.status === 'healthy' ? 'var(--ok)' : a.status === 'warning' ? 'var(--warn)' : 'var(--crit)',
                        a.status === 'healthy' ? 'var(--okb)' : a.status === 'warning' ? 'var(--warnb)' : 'var(--critb)',
                      )}
                    >
                      {a.status === 'healthy' ? 'OK' : a.status === 'warning' ? 'Degraded' : 'Breach'}
                    </span>
                  </div>
                  <div style={css('display:flex;align-items:center;justify-content:flex-end;gap:6px;')}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAssetKey(a.name);
                        navigate('/quality/rules');
                      }}
                      style={css(
                        'height:26px;padding:0 9px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);color:var(--fg);font-size:11.5px;font-weight:500;cursor:pointer;',
                      )}
                    >
                      Rules ({qTot})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAssetKey(a.name);
                        navigate('/quality/failed-rows');
                      }}
                      style={css(
                        `height:26px;padding:0 9px;border-radius:6px;border:1px solid ${assetFailRows > 0 ? '#fecaca' : 'var(--border,#e7e7ea)'};background:${assetFailRows > 0 ? '#fef2f2' : 'var(--card,#fff)'};color:${assetFailRows > 0 ? '#dc2626' : 'var(--fgm)'};font-size:11.5px;font-weight:600;cursor:pointer;`,
                      )}
                    >
                      Failed Rows ({assetFailRows})
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeView === 'rules' && (
        <QualityTab
          assetKey={targetAssetKey}
          section="rules"
          onEditRule={(ruleId) => {
            setEditingRuleId(ruleId ?? null);
            navigate('/quality/authoring');
          }}
        />
      )}
      {activeView === 'authoring' && (
        <QualityRuleStudio
          key={`${targetAssetKey}-${editingRuleId ?? 'new'}`}
          assetKey={targetAssetKey}
          initialEditRuleId={editingRuleId}
          onRuleSaved={() => setEditingRuleId(null)}
        />
      )}
      {activeView === 'failed-rows' && <QualityTab assetKey={targetAssetKey} section="failed-rows" />}
    </div>
  );
}
