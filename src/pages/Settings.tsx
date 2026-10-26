import { useTheme } from '../app/theme';
import { useWorkspace } from '../app/WorkspaceProvider';
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
          Workspace preferences, signal bar coloring thresholds, and identity synchronization status.
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
