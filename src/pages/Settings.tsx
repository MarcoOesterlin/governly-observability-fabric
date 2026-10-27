import { useEffect, useState } from 'react';
import { useTheme } from '../app/theme';
import { useWorkspace } from '../app/WorkspaceProvider';
import {
  COMPUTE_CADENCE_PRESETS,
  DEFAULT_COMPUTE_CADENCE_MINUTES,
  type NotebookRuntimeParams,
  useComputeConfig,
} from '../data/useComputeConfig';
import {
  formatSlaMinutes,
  SLA_PRESETS,
  useFreshnessSlas,
} from '../data/useFreshnessSla';
import {
  DEFAULT_SIGNAL_THRESHOLDS,
  useLastPublishRun,
  useSignalThresholds,
} from '../data/useOverview';
import { css } from '../lib/css';

export function Settings() {
  const { theme, toggle } = useTheme();
  const { casesEnabled, setCasesEnabled } = useWorkspace();
  const [thresholds, setThresholds] = useSignalThresholds();
  const { slaMap, setSlaTarget, saving: slaSaving } = useFreshnessSlas();
  const defaultSlaMinutes = slaMap['*'] ?? 720;
  const lastSync = useLastPublishRun();
  const {
    config: computeConfig,
    allWorkspaces,
    savingSchedule,
    savingWorkspaces,
    hasUnsavedWorkspaces,
    triggering,
    jobStatus,
    statusMessage,
    toggleWorkspaceIncluded,
    setAllWorkspacesIncluded,
    applyWorkspacesToSchedule,
    updateSchedule,
    saveNotebookParams,
    triggerComputeNow,
  } = useComputeConfig();

  const [nbParamsDraft, setNbParamsDraft] = useState<NotebookRuntimeParams>(
    computeConfig.notebookParams,
  );
  useEffect(() => {
    setNbParamsDraft(computeConfig.notebookParams);
  }, [
    computeConfig.notebookParams.tenantId,
    computeConfig.notebookParams.clientId,
    computeConfig.notebookParams.keyVaultUri,
    computeConfig.notebookParams.secretName,
  ]);

  const workspaceChoices = allWorkspaces;
  const excludedSet = new Set(computeConfig.excludedWorkspaceIds);
  const includedCount = workspaceChoices.filter((w) => !excludedSet.has(w.workspace_id)).length;

  const updateField = (key: keyof typeof thresholds, raw: string) => {
    const num = Number(raw);
    if (Number.isNaN(num)) return;
    setThresholds({
      ...thresholds,
      [key]: Math.max(0, Math.min(100, num)),
    });
  };

  return (
    <div style={css('padding:24px 28px 40px;max-width:1000px;margin:0 auto;display:flex;flex-direction:column;gap:18px;')}>
      <div>
        <div style={css('font-size:12px;color:var(--fgm,#52525b);margin-bottom:8px;display:flex;align-items:center;gap:6px;')}>
          Governly <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" /> Settings
        </div>
        <div style={css('font-size:22px;font-weight:600;letter-spacing:-0.02em;color:var(--fg,#18181b);')}>Settings</div>
        <div style={css('font-size:13.5px;color:var(--fgm,#52525b);margin-top:4px;')}>
          Monitored workspaces, compute notebook schedule &amp; on-demand execution, SLA policies, and signal thresholds.
        </div>
      </div>

      <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);padding:18px 20px;display:flex;flex-direction:column;gap:16px;')}>
        <div style={css('display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;')}>
          <div>
            <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
              <span style={css('font-size:14px;font-weight:600;color:var(--fg);')}>
                Compute Notebook, Schedule &amp; Monitored Workspaces
              </span>
              <span
                style={css(
                  `font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:${
                    computeConfig.scheduleEnabled ? 'var(--okb,#f0fdf4)' : 'var(--card2,#f4f4f5)'
                  };color:${computeConfig.scheduleEnabled ? 'var(--ok,#16a34a)' : 'var(--fgm,#52525b)'};border:1px solid ${
                    computeConfig.scheduleEnabled ? 'var(--ok,#16a34a)' : 'var(--border,#e7e7ea)'
                  };`,
                )}
              >
                {computeConfig.scheduleEnabled
                  ? `Scheduled · Every ${computeConfig.intervalMinutes}m`
                  : 'Manual Mode (Schedule Off)'}
              </span>
              {jobStatus && jobStatus !== 'Idle' && (
                <span style={css("font-size:11px;font-family:'Geist Mono',monospace;color:var(--accent,#4f46e5);font-weight:600;")}>
                  Job: {jobStatus}
                </span>
              )}
            </div>
            <div style={css('font-size:12px;color:var(--fgm);margin-top:3px;')}>
              The installer does not auto-schedule <code style={css("font-family:'Geist Mono',monospace;font-size:11.5px;")}>nb_governly_compute_publish</code> to avoid unexpected capacity cost. Choose which workspaces to scan, set your recurring cadence (default 36m), or trigger a run manually.
            </div>
          </div>
          <button
            type="button"
            disabled={triggering}
            onClick={() => void triggerComputeNow()}
            style={css(
              `height:36px;padding:0 14px;border-radius:8px;border:1px solid transparent;background:var(--accent,#4f46e5);color:#fff;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;gap:7px;cursor:${
                triggering ? 'wait' : 'pointer'
              };opacity:${triggering ? 0.75 : 1};white-space:nowrap;`,
            )}
          >
            <i className={`ph ${triggering ? 'ph-spinner' : 'ph-play-circle'}`} style={css('font-size:16px;')} aria-hidden="true" />
            {triggering ? 'Triggering Notebook…' : 'Run Compute Notebook Now'}
          </button>
        </div>

        {statusMessage && (
          <div style={css('padding:9px 12px;border-radius:8px;background:var(--card2,#f4f4f5);border:1px solid var(--border,#e7e7ea);font-size:12px;color:var(--fg);display:flex;align-items:center;justify-content:space-between;gap:8px;')}>
            <span>{statusMessage}</span>
          </div>
        )}

        <div style={css('border-top:1px solid var(--border,#e7e7ea);padding-top:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;')}>
          <div>
            <div style={css('font-size:13px;font-weight:600;color:var(--fg);')}>Recurring Schedule Cadence</div>
            <div style={css('font-size:12px;color:var(--fgm);margin-top:2px;')}>
              Default cadence is <b>Every 36m</b>. Enable recurring runs when you want continuous automated telemetry, or keep paused for on-demand runs.
            </div>
          </div>
          <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
            <select
              aria-label="Compute Schedule Cadence"
              disabled={savingSchedule}
              value={
                COMPUTE_CADENCE_PRESETS.some((p) => p.minutes === computeConfig.intervalMinutes)
                  ? computeConfig.intervalMinutes
                  : DEFAULT_COMPUTE_CADENCE_MINUTES
              }
              onChange={(e) =>
                void updateSchedule(computeConfig.scheduleEnabled, Number(e.target.value))
              }
              style={css(
                "height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--border);background:var(--card2);color:var(--fg);font-size:12.5px;font-weight:600;font-family:'Geist Mono Variable','Geist Mono',ui-monospace,monospace;cursor:pointer;",
              )}
            >
              {COMPUTE_CADENCE_PRESETS.map((p) => (
                <option key={p.minutes} value={p.minutes}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={savingSchedule}
              onClick={() =>
                void updateSchedule(!computeConfig.scheduleEnabled, computeConfig.intervalMinutes)
              }
              style={css(
                `height:34px;padding:0 14px;border-radius:8px;border:1px solid ${
                  computeConfig.scheduleEnabled ? 'var(--ok,#16a34a)' : 'var(--border)'
                };background:${
                  computeConfig.scheduleEnabled ? 'var(--okb,#f0fdf4)' : 'var(--card2)'
                };color:${
                  computeConfig.scheduleEnabled ? 'var(--ok,#16a34a)' : 'var(--fg)'
                };font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;`,
              )}
            >
              {savingSchedule
                ? 'Updating Schedule…'
                : computeConfig.scheduleEnabled
                  ? `Schedule: ON · ${includedCount} Workspaces (Click to Pause)`
                  : `Enable Recurring Schedule (${includedCount} Workspaces)`}
            </button>
          </div>
        </div>

        <div style={css('border-top:1px solid var(--border,#e7e7ea);padding-top:14px;display:flex;flex-direction:column;gap:10px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;')}>
            <div>
              <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
                <span style={css('font-size:13px;font-weight:600;color:var(--fg);')}>
                  Monitored Workspaces ({includedCount} of {workspaceChoices.length} included)
                </span>
                <span
                  style={css(
                    `font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:${
                      hasUnsavedWorkspaces
                        ? 'var(--warnb,#fffbeb)'
                        : computeConfig.scheduleEnabled
                          ? 'var(--okb,#f0fdf4)'
                          : 'var(--card2,#f4f4f5)'
                    };color:${
                      hasUnsavedWorkspaces
                        ? 'var(--warn,#d97706)'
                        : computeConfig.scheduleEnabled
                          ? 'var(--ok,#16a34a)'
                          : 'var(--fgm,#52525b)'
                    };border:1px solid ${
                      hasUnsavedWorkspaces
                        ? 'var(--warn,#d97706)'
                        : computeConfig.scheduleEnabled
                          ? 'var(--ok,#16a34a)'
                          : 'var(--border,#e7e7ea)'
                    };`,
                  )}
                >
                  {hasUnsavedWorkspaces
                    ? 'Pending changes · click "Add Workspaces to Recurring" to apply'
                    : computeConfig.scheduleEnabled
                      ? `✓ All ${includedCount} selected workspaces synced to recurring (${computeConfig.intervalMinutes}m)`
                      : `✓ ${includedCount} workspaces saved for next notebook run`}
                </span>
              </div>
              <div style={css('font-size:12px;color:var(--fgm);margin-top:2px;')}>
                Unchecked workspaces are excluded from OneLake Delta table scanning and Data Quality evaluation to reduce Spark compute cost. (Pipeline &amp; Notebook runs remain visible in Pipelines &amp; Freshness.)
              </div>
            </div>
            <div style={css('display:flex;align-items:center;gap:6px;flex-wrap:wrap;')}>
              {workspaceChoices.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => void setAllWorkspacesIncluded(true)}
                    style={css('height:30px;padding:0 10px;border-radius:6px;border:1px solid var(--border);background:var(--card2);color:var(--fg);font-size:11.5px;font-weight:600;cursor:pointer;')}
                  >
                    Include all
                  </button>
                  <button
                    type="button"
                    onClick={() => void setAllWorkspacesIncluded(false)}
                    style={css('height:30px;padding:0 10px;border-radius:6px;border:1px solid var(--border);background:var(--card2);color:var(--fgm);font-size:11.5px;font-weight:500;cursor:pointer;')}
                  >
                    First only
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={savingWorkspaces}
                onClick={() => void applyWorkspacesToSchedule(true, false)}
                style={css(
                  `height:30px;padding:0 12px;border-radius:6px;border:1px solid ${
                    hasUnsavedWorkspaces || !computeConfig.scheduleEnabled
                      ? 'var(--accent,#4f46e5)'
                      : 'var(--ok,#16a34a)'
                  };background:${
                    hasUnsavedWorkspaces || !computeConfig.scheduleEnabled
                      ? 'var(--accent,#4f46e5)'
                      : 'var(--okb,#f0fdf4)'
                  };color:${
                    hasUnsavedWorkspaces || !computeConfig.scheduleEnabled
                      ? '#fff'
                      : 'var(--ok,#16a34a)'
                  };font-size:11.5px;font-weight:600;cursor:pointer;white-space:nowrap;`,
                )}
              >
                {savingWorkspaces
                  ? `Adding ${includedCount} Workspaces to Recurring…`
                  : hasUnsavedWorkspaces
                    ? `Add ${includedCount} Workspaces to Recurring (${computeConfig.intervalMinutes}m)`
                    : computeConfig.scheduleEnabled
                      ? `✓ ${includedCount} Workspaces in Recurring (${computeConfig.intervalMinutes}m)`
                      : `Add ${includedCount} Workspaces to Recurring (${computeConfig.intervalMinutes}m)`}
              </button>
              {hasUnsavedWorkspaces && (
                <button
                  type="button"
                  disabled={savingWorkspaces || triggering}
                  onClick={() => void applyWorkspacesToSchedule(true, true)}
                  style={css(
                    'height:30px;padding:0 12px;border-radius:6px;border:1px solid var(--accent,#4f46e5);background:var(--card,#fff);color:var(--accent,#4f46e5);font-size:11.5px;font-weight:600;cursor:pointer;white-space:nowrap;',
                  )}
                >
                  Add &amp; Run Notebook Now
                </button>
              )}
            </div>
          </div>

          {workspaceChoices.length === 0 ? (
            <div style={css('font-size:12px;color:var(--fgm);padding:8px 0;')}>
              No workspaces discovered yet. Click <b>Run Compute Notebook Now</b> above to discover workspaces.
            </div>
          ) : (
            <div style={css('display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;')}>
              {workspaceChoices.map((ws) => {
                const isIncluded = !excludedSet.has(ws.workspace_id);
                const disableUncheck = isIncluded && includedCount <= 1;
                return (
                  <label
                    key={ws.workspace_id}
                    style={css(
                      `display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-radius:8px;border:1px solid ${
                        isIncluded ? 'var(--accent,#4f46e5)' : 'var(--border,#e7e7ea)'
                      };background:${
                        isIncluded ? 'var(--card,#fff)' : 'var(--card2,#fafafa)'
                      };cursor:${disableUncheck ? 'not-allowed' : 'pointer'};opacity:${isIncluded ? 1 : 0.65};`,
                    )}
                  >
                    <span style={css('display:flex;align-items:center;gap:8px;min-width:0;')}>
                      <input
                        type="checkbox"
                        checked={isIncluded}
                        disabled={disableUncheck}
                        onChange={(e) =>
                          void toggleWorkspaceIncluded(
                            ws.workspace_id,
                            ws.display_name,
                            e.target.checked,
                          )
                        }
                        style={css('accent-color:var(--accent,#4f46e5);cursor:pointer;')}
                      />
                      <span
                        style={css(
                          'font-size:12.5px;font-weight:600;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;',
                        )}
                        title={ws.display_name}
                      >
                        {ws.display_name}
                      </span>
                    </span>
                    <span
                      style={css(
                        "font-size:10.5px;font-family:'Geist Mono',monospace;padding:2px 6px;border-radius:5px;background:var(--card2,#f4f4f5);color:var(--fgm,#52525b);flex:0 0 auto;",
                      )}
                    >
                      {ws.capacity_sku}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div style={css('border-top:1px solid var(--border,#e7e7ea);padding-top:14px;display:flex;flex-direction:column;gap:10px;')}>
          <div style={css('display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;')}>
            <div>
              <div style={css('font-size:13px;font-weight:600;color:var(--fg);')}>
                Notebook Runtime Parameters (Optional Service Principal / Key Vault Override)
              </div>
              <div style={css('font-size:12px;color:var(--fgm);margin-top:2px;')}>
                Leave blank for zero-config delegated mode (uses the notebook owner&apos;s Fabric &amp; OneLake identity). Fill in to override <code style={css("font-family:'Geist Mono',monospace;font-size:11px;")}>TENANT_ID</code>, <code style={css("font-family:'Geist Mono',monospace;font-size:11px;")}>CLIENT_ID</code>, <code style={css("font-family:'Geist Mono',monospace;font-size:11px;")}>KEY_VAULT_URI</code>, and <code style={css("font-family:'Geist Mono',monospace;font-size:11px;")}>SECRET_NAME</code> without editing notebook code.
              </div>
            </div>
            <button
              type="button"
              disabled={savingSchedule}
              onClick={() => void saveNotebookParams(nbParamsDraft)}
              style={css(
                'height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--border);background:var(--card2);color:var(--fg);font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;',
              )}
            >
              {savingSchedule ? 'Saving…' : 'Save Notebook Parameters'}
            </button>
          </div>

          <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;')}>
            <label style={css('display:flex;flex-direction:column;gap:4px;')}>
              <span style={css("font-size:11px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fgm);")}>
                TENANT_ID
              </span>
              <input
                type="text"
                placeholder="Default (Notebook Owner)"
                value={nbParamsDraft.tenantId}
                onChange={(e) =>
                  setNbParamsDraft((prev) => ({ ...prev, tenantId: e.target.value }))
                }
                style={css(
                  "height:32px;padding:0 10px;border-radius:7px;border:1px solid var(--border);background:var(--card,#fff);color:var(--fg);font-size:12px;font-family:'Geist Mono',monospace;",
                )}
              />
            </label>
            <label style={css('display:flex;flex-direction:column;gap:4px;')}>
              <span style={css("font-size:11px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fgm);")}>
                CLIENT_ID
              </span>
              <input
                type="text"
                placeholder="Optional App (Client) ID"
                value={nbParamsDraft.clientId}
                onChange={(e) =>
                  setNbParamsDraft((prev) => ({ ...prev, clientId: e.target.value }))
                }
                style={css(
                  "height:32px;padding:0 10px;border-radius:7px;border:1px solid var(--border);background:var(--card,#fff);color:var(--fg);font-size:12px;font-family:'Geist Mono',monospace;",
                )}
              />
            </label>
            <label style={css('display:flex;flex-direction:column;gap:4px;')}>
              <span style={css("font-size:11px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fgm);")}>
                KEY_VAULT_URI
              </span>
              <input
                type="text"
                placeholder="https://<vault>.vault.azure.net/"
                value={nbParamsDraft.keyVaultUri}
                onChange={(e) =>
                  setNbParamsDraft((prev) => ({ ...prev, keyVaultUri: e.target.value }))
                }
                style={css(
                  "height:32px;padding:0 10px;border-radius:7px;border:1px solid var(--border);background:var(--card,#fff);color:var(--fg);font-size:12px;font-family:'Geist Mono',monospace;",
                )}
              />
            </label>
            <label style={css('display:flex;flex-direction:column;gap:4px;')}>
              <span style={css("font-size:11px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fgm);")}>
                SECRET_NAME
              </span>
              <input
                type="text"
                placeholder="governly-graph-sync"
                value={nbParamsDraft.secretName}
                onChange={(e) =>
                  setNbParamsDraft((prev) => ({ ...prev, secretName: e.target.value }))
                }
                style={css(
                  "height:32px;padding:0 10px;border-radius:7px;border:1px solid var(--border);background:var(--card,#fff);color:var(--fg);font-size:12px;font-family:'Geist Mono',monospace;",
                )}
              />
            </label>
          </div>
        </div>
      </div>

      <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);padding:18px 20px;display:flex;flex-direction:column;gap:16px;')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;')}>
          <div>
            <div style={css('font-size:14px;font-weight:600;color:var(--fg);')}>Freshness &amp; Quality Signal Thresholds (Hybrid Mode)</div>
            <div style={css('font-size:12px;color:var(--fgm);margin-top:2px;')}>
              Each signal bar is colored dynamically using both absolute health % thresholds and stick-to-stick drop comparison.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setThresholds(DEFAULT_SIGNAL_THRESHOLDS)}
            style={css('height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--border);background:var(--card2);color:var(--fg);font-size:12px;font-weight:600;cursor:pointer;')}
          >
            Reset defaults (90% / 83% / 5%)
          </button>
        </div>

        <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;')}>
          <div style={css('padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--card2,#fafafa);')}>
            <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;')}>
              <span style={css('font-size:12.5px;font-weight:600;color:var(--fg);display:flex;align-items:center;gap:6px;')}>
                <span style={css('width:10px;height:10px;border-radius:3px;background:var(--ok,#16a34a);')} />
                Grade 1 · OK (Green)
              </span>
              <span style={css("font-family:'Geist Mono',monospace;font-size:12.5px;font-weight:600;color:var(--ok,#16a34a);")}>
                &ge; {thresholds.degradedBelow}%
              </span>
            </div>
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={thresholds.degradedBelow}
              onChange={(e) => updateField('degradedBelow', e.target.value)}
              style={css('width:100%;height:34px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--card,#fff);color:var(--fg);font-size:13px;')}
            />
            <div style={css('font-size:11.5px;color:var(--fgm);margin-top:6px;')}>
              Healthy grade (<b style={css('color:var(--ok,#16a34a);')}>#16a34a</b>) when signal score is &ge; {thresholds.degradedBelow}% and drop &lt; {thresholds.stickDropWarn}%.
            </div>
          </div>

          <div style={css('padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--card2,#fafafa);')}>
            <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;')}>
              <span style={css('font-size:12.5px;font-weight:600;color:var(--fg);display:flex;align-items:center;gap:6px;')}>
                <span style={css('width:10px;height:10px;border-radius:3px;background:var(--warn,#f59e0b);')} />
                Grade 2 · Degraded (Amber)
              </span>
              <span style={css("font-family:'Geist Mono',monospace;font-size:12.5px;font-weight:600;color:var(--warn,#f59e0b);")}>
                {thresholds.breachBelow}% – {thresholds.degradedBelow - 1}%
              </span>
            </div>
            <input
              type="number"
              min={1}
              max={50}
              step={0.5}
              value={thresholds.stickDropWarn}
              onChange={(e) => updateField('stickDropWarn', e.target.value)}
              style={css('width:100%;height:34px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--card,#fff);color:var(--fg);font-size:13px;')}
            />
            <div style={css('font-size:11.5px;color:var(--fgm);margin-top:6px;')}>
              Amber warning grade (<b style={css('color:var(--warn,#f59e0b);')}>#f59e0b</b>) when score is {thresholds.breachBelow}%–{thresholds.degradedBelow - 1}% or stick-to-stick drop &ge; {thresholds.stickDropWarn}%.
            </div>
          </div>

          <div style={css('padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--card2,#fafafa);')}>
            <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;')}>
              <span style={css('font-size:12.5px;font-weight:600;color:var(--fg);display:flex;align-items:center;gap:6px;')}>
                <span style={css('width:10px;height:10px;border-radius:3px;background:var(--crit,#dc2626);')} />
                Grade 3 · Breach (Red)
              </span>
              <span style={css("font-family:'Geist Mono',monospace;font-size:12.5px;font-weight:600;color:var(--crit,#dc2626);")}>
                &lt; {thresholds.breachBelow}%
              </span>
            </div>
            <input
              type="number"
              min={1}
              max={100}
              step={1}
              value={thresholds.breachBelow}
              onChange={(e) => updateField('breachBelow', e.target.value)}
              style={css('width:100%;height:34px;padding:0 10px;border-radius:8px;border:1px solid var(--border);background:var(--card,#fff);color:var(--fg);font-size:13px;')}
            />
            <div style={css('font-size:11.5px;color:var(--fgm);margin-top:6px;')}>
              Critical breach grade (<b style={css('color:var(--crit,#dc2626);')}>#dc2626</b>) when score is &lt; {thresholds.breachBelow}% or stick-to-stick drop &ge; {thresholds.stickDropWarn * 2}%.
            </div>
          </div>
        </div>
      </div>

      <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);padding:18px 20px;display:flex;flex-direction:column;gap:16px;')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;')}>
          <div>
            <div style={css('font-size:13.5px;font-weight:600;color:var(--fg);')}>Default Freshness SLA Policy</div>
            <div style={css('font-size:12px;color:var(--fgm);margin-top:2px;')}>
              Workspace-wide default freshness target ({formatSlaMinutes(defaultSlaMinutes)}) applied to tables and pipelines without an individual SLA override. You can also set per-asset SLAs directly on the Pipelines &amp; Freshness screen.
            </div>
          </div>
          <select
            aria-label="Default Freshness SLA"
            disabled={slaSaving}
            value={SLA_PRESETS.some((p) => p.minutes === defaultSlaMinutes) ? defaultSlaMinutes : 720}
            onChange={(e) => void setSlaTarget('*', Number(e.target.value))}
            style={css(
              "height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--border);background:var(--card2);color:var(--fg);font-size:12.5px;font-weight:600;font-family:'Geist Mono Variable','Geist Mono',ui-monospace,monospace;cursor:pointer;",
            )}
          >
            {SLA_PRESETS.map((p) => (
              <option key={p.minutes} value={p.minutes}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div style={css('border-top:1px solid var(--border);padding-top:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;')}>
          <div>
            <div style={css('font-size:13.5px;font-weight:600;color:var(--fg);')}>Steward Case Management System</div>
            <div style={css('font-size:12px;color:var(--fgm);margin-top:2px;')}>
              {casesEnabled
                ? 'Enabled — Cases Kanban board and Open Cases KPI are active for schema drift, SLA breaches, and quality failures.'
                : 'Disabled — Cases navigation and KPI cards are hidden across the workspace.'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCasesEnabled(!casesEnabled)}
            style={css(
              `height:34px;padding:0 14px;border-radius:8px;border:1px solid ${casesEnabled ? 'var(--ok,#16a34a)' : 'var(--border)'};background:${casesEnabled ? 'var(--okb,#f0fdf4)' : 'var(--card2)'};color:${casesEnabled ? 'var(--ok,#16a34a)' : 'var(--fg)'};font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;`
            )}
          >
            {casesEnabled ? 'Case System: ON' : 'Case System: OFF'}
          </button>
        </div>
        <div style={css('border-top:1px solid var(--border);padding-top:14px;display:flex;align-items:center;justify-content:space-between;')}>
          <div>
            <div style={css('font-size:13.5px;font-weight:600;color:var(--fg);')}>Appearance</div>
            <div style={css('font-size:12px;color:var(--fgm);margin-top:2px;')}>Current theme: {theme}</div>
          </div>
          <button
            type="button"
            onClick={toggle}
            style={css('height:34px;padding:0 14px;border-radius:8px;border:1px solid var(--border);background:var(--card2);color:var(--fg);font-size:12.5px;font-weight:600;cursor:pointer;')}
          >
            Toggle theme
          </button>
        </div>
        <div style={css('border-top:1px solid var(--border);padding-top:14px;font-size:12.5px;color:var(--fgm);')}>
          Access &amp; telemetry synced <b>{lastSync.label}</b> (status: {lastSync.status}) via Microsoft Graph &amp; Fabric Admin APIs.
        </div>
      </div>
    </div>
  );
}
