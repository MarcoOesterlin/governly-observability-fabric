import { useState } from 'react';
import { AssetsCard } from '../components/governly/AssetsCard';
import {
  buildFallbackJobDiagnostic,
  FreshnessTab,
} from '../components/governly/asset-tabs/FreshnessTab';
import { badge } from '../components/governly/primitives';
import { useJobFailureDiagnostics } from '../data/useAsset';
import { useAssets } from '../data/useAssets';
import { formatSlaMinutes } from '../data/useFreshnessSla';
import { useIncidents } from '../data/useIncidents';
import { css } from '../lib/css';

export function Freshness() {
  const { rows: assets } = useAssets();
  const allJobDiagnostics = useJobFailureDiagnostics();
  const allIncidents = useIncidents();
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
              {slaPct}% SLA compliance across {assets.length} monitored pipelines, notebooks, and tables ({onTimeCount} on time).
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
                    {a.name} ({a.type} · {a.fresh})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {pipelineAndNotebookAssets.length > 0 && (
        <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
          <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);display:flex;align-items:center;justify-content:space-between;')}>
            <div>
              <div style={css('font-size:14px;font-weight:600;color:var(--fg);')}>
                Data Pipelines &amp; Spark Notebooks Execution Health
              </div>
              <div style={css('font-size:12px;color:var(--fgm);margin-top:2px;')}>
                Track Fabric Job Scheduler runs across pipelines and notebooks, including why a run failed and suggested solutions.
              </div>
            </div>
            <span style={badge('#4338ca', '#eef2ff')}>
              {pipelineAndNotebookAssets.length} jobs monitored
            </span>
          </div>
          <div style={css('display:grid;grid-template-columns:1.5fr 0.7fr 0.7fr 1.8fr 0.8fr;gap:12px;padding:9px 18px;font-size:10.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--fgs);border-bottom:1px solid var(--border,#e7e7ea);')}>
            <span>Pipeline / Notebook</span>
            <span>Type</span>
            <span>Latest Run</span>
            <span>Failure Reason &amp; Possible Solution</span>
            <span style={css('text-align:right;')}>Action</span>
          </div>
          {pipelineAndNotebookAssets.map((item) => {
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

            return (
              <div
                key={item.id}
                style={css(
                  'display:grid;grid-template-columns:1.5fr 0.7fr 0.7fr 1.8fr 0.8fr;gap:12px;padding:12px 18px;align-items:center;border-bottom:1px solid var(--border,#e7e7ea);',
                )}
              >
                <div style={css('display:flex;align-items:center;gap:8px;min-width:0;')}>
                  <i className={`ph ${item.icon}`} style={css('font-size:16px;color:var(--fgm);')} aria-hidden="true" />
                  <span style={css("font-size:13px;font-weight:600;color:var(--fg);font-family:'Geist Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>
                    {item.name}
                  </span>
                </div>
                <span style={css('font-size:12px;color:var(--fgm);')}>{item.type}</span>
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
                    <div>
                      <div style={css('color:var(--crit);font-weight:600;')}>
                        Why: {matchedDiag.whyFailed}
                      </div>
                      <div style={css('color:var(--fgm);margin-top:2px;')}>
                        Solution: {matchedDiag.possibleSolution.split('\n')[0]}
                      </div>
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

      <AssetsCard assets={assets} totalCount={assets.length} />
    </div>
  );
}
