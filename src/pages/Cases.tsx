import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../app/WorkspaceProvider';
import { Box } from '../components/governly/Box';
import { badge, sevPair } from '../components/governly/primitives';
import { updateStewardCaseStatus } from '../data/useCaseActions';
import { useCases } from '../data/useIncidents';
import type { CaseFixture } from '../fixtures/types';
import { css } from '../lib/css';

const STATUSES: Array<CaseFixture['status']> = ['Open', 'In progress', 'Blocked', 'Done'];

export function Cases({ cases: propCases }: { cases?: CaseFixture[] } = {}) {
  const { casesEnabled, setCasesEnabled, refreshData } = useWorkspace();
  const liveCases = useCases();
  const baseCases = propCases ?? liveCases;
  const [statusOverrides, setStatusOverrides] = useState<Record<string, CaseFixture['status']>>({});
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<CaseFixture['status'] | null>(null);
  const [view, setView] = useState<'Board' | 'Table'>('Board');
  const navigate = useNavigate();

  const cases = baseCases.map((c) =>
    statusOverrides[c.key] ? { ...c, status: statusOverrides[c.key] } : c,
  );

  const moveCaseToStatus = (caseKey: string, nextStatus: CaseFixture['status']) => {
    const current = cases.find((c) => c.key === caseKey);
    if (!current || current.status === nextStatus) return;
    setStatusOverrides((prev) => ({ ...prev, [caseKey]: nextStatus }));
    void updateStewardCaseStatus(caseKey, nextStatus, refreshData);
  };

  if (!casesEnabled) {
    return (
      <div style={css('padding:24px 28px 40px;max-width:860px;margin:0 auto;')}>
        <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;padding:28px;box-shadow:var(--shadow);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;')}>
          <div>
            <div style={css('font-size:16px;font-weight:600;color:var(--fg);')}>Steward Case System is currently turned off</div>
            <div style={css('font-size:13px;color:var(--fgm);margin-top:4px;')}>
              Enable the Case System to track remediation items for schema drift, SLA breaches, and quality failures.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setCasesEnabled(true)}
            style={css('height:36px;padding:0 16px;border-radius:8px;border:none;background:var(--primary,#18181b);color:var(--pfg,#fff);font-size:13px;font-weight:600;cursor:pointer;')}
          >
            Enable Case System
          </button>
        </div>
      </div>
    );
  }

  const segStyle = (key: 'Board' | 'Table', idx: number) =>
    `padding:6px 12px;font-size:12.5px;${view === key ? 'font-weight:600;background:var(--card2,#f4f4f5);color:var(--fg);' : 'color:var(--fgm);cursor:pointer;'}${idx > 0 ? 'border-left:1px solid var(--border);' : ''}`;

  return (
    <div style={css('padding:24px 28px 40px;max-width:1400px;margin:0 auto;')}>
      <div style={css('font-size:12px;color:var(--fgm,#52525b);margin-bottom:8px;display:flex;align-items:center;gap:6px;')}>
        Governly <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" /> Cases
      </div>
      <div style={css('display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:22px;flex-wrap:wrap;')}>
        <div>
          <div style={css('font-size:22px;font-weight:600;letter-spacing:-0.02em;color:var(--fg,#18181b);')}>Cases</div>
          <div style={css('font-size:13.5px;color:var(--fgm,#52525b);margin-top:4px;')}>
            Steward remediation tracking across domains · {cases.filter((c) => c.status !== 'Done').length} active cases (created on schema drift, SLA breach, or poor quality).
          </div>
        </div>
        <div style={css('display:flex;align-items:center;gap:8px;')}>
          <div style={css('display:flex;border:1px solid var(--border,#e7e7ea);border-radius:8px;overflow:hidden;background:var(--card,#fff);')}>
            {(['Board', 'Table'] as const).map((m, idx) => (
              <div key={m} onClick={() => setView(m)} style={css(segStyle(m, idx))}>
                {m}
              </div>
            ))}
          </div>
        </div>
      </div>

      {view === 'Board' ? (
        <div style={css('display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:start;')}>
          {STATUSES.map((st) => {
            const items = cases.filter((c) => c.status === st);
            const isDropTarget = dragOverStatus === st;
            return (
              <div
                key={st}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverStatus !== st) setDragOverStatus(st);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    setDragOverStatus((prev) => (prev === st ? null : prev));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const droppedKey = e.dataTransfer.getData('text/plain') || draggingKey;
                  setDraggingKey(null);
                  setDragOverStatus(null);
                  if (droppedKey) {
                    moveCaseToStatus(droppedKey, st);
                  }
                }}
                style={css(
                  `background:${isDropTarget ? 'color-mix(in srgb,var(--accent,#4f46e5) 6%,var(--card,#fff))' : 'var(--card,#fff)'};border:${isDropTarget ? '1.5px dashed var(--accent,#4f46e5)' : '1px solid var(--border,#e7e7ea)'};border-radius:12px;padding:16px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:12px;min-height:190px;transition:border-color 0.12s,background 0.12s;`,
                )}
              >
                <div style={css('display:flex;align-items:center;justify-content:space-between;')}>
                  <span style={css('font-size:13px;font-weight:600;color:var(--fg);')}>{st}</span>
                  <span style={css("font-size:11px;font-family:'Geist Mono',monospace;color:var(--fgs);")}>{items.length}</span>
                </div>
                {items.length === 0 && (
                  <div
                    style={css(
                      `flex:1;min-height:110px;border:1px dashed ${isDropTarget ? 'var(--accent,#4f46e5)' : 'var(--border,#e7e7ea)'};border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:12px;color:${isDropTarget ? 'var(--accent,#4f46e5)' : 'var(--fgs,#a1a1aa)'};`,
                    )}
                  >
                    {isDropTarget ? `Drop to move to ${st}` : 'Drag case here'}
                  </div>
                )}
                {items.map((c) => {
                  const sv = sevPair(c.priority);
                  const isDragging = draggingKey === c.key;
                  return (
                    <Box
                      key={c.key}
                      role="button"
                      tabIndex={0}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', c.key);
                        e.dataTransfer.effectAllowed = 'move';
                        setDraggingKey(c.key);
                      }}
                      onDragEnd={() => {
                        setDraggingKey(null);
                        setDragOverStatus(null);
                      }}
                      onClick={() => navigate(`/cases/${c.key}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/cases/${c.key}`); }}
                      style={`border:1px solid var(--border,#e7e7ea);border-radius:10px;padding:12px;background:var(--card,#fff);cursor:grab;display:flex;flex-direction:column;gap:8px;opacity:${isDragging ? 0.5 : 1};transition:opacity 0.12s;`}
                      hover="background:var(--card2)"
                    >
                      <div style={css('display:flex;align-items:center;justify-content:space-between;')}>
                        <span style={css("font-size:11px;font-family:'Geist Mono',monospace;color:var(--fgs);display:inline-flex;align-items:center;gap:5px;")}>
                          <i className="ph ph-dots-six-vertical" style={css('font-size:13px;color:var(--fgs);')} aria-hidden="true" />
                          {c.key}
                        </span>
                        <span style={badge(sv[0], sv[1])}>{c.priority}</span>
                      </div>
                      <div style={css('font-size:13px;font-weight:600;color:var(--fg);')}>{c.title}</div>
                      <div style={css('display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:var(--fgm);')}>
                        <span>{c.domain} · {c.incidentKeys.length} incident</span>
                        <span>Due in {c.dueInDays}d</span>
                      </div>
                    </Box>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
          <div style={css('display:grid;grid-template-columns:100px 2fr 1fr 1fr 1fr 100px;gap:10px;padding:10px 18px;font-size:10.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--fgs);border-bottom:1px solid var(--border,#e7e7ea);')}>
            <span>Case</span>
            <span>Title</span>
            <span>Domain</span>
            <span>Status</span>
            <span>Owner</span>
            <span>Due</span>
          </div>
          {cases.map((c) => {
            const sv = sevPair(c.priority);
            return (
              <Box
                key={c.key}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/cases/${c.key}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/cases/${c.key}`); }}
                style="display:grid;grid-template-columns:100px 2fr 1fr 1fr 1fr 100px;gap:10px;padding:13px 18px;align-items:center;border-bottom:1px solid var(--border,#e7e7ea);cursor:pointer;"
                hover="background:var(--card2)"
              >
                <span style={css("font-size:12px;font-family:'Geist Mono',monospace;color:var(--fgs);")}>{c.key}</span>
                <div style={css('display:flex;align-items:center;gap:8px;')}>
                  <span style={css('font-size:13px;font-weight:600;color:var(--fg);')}>{c.title}</span>
                  <span style={badge(sv[0], sv[1])}>{c.priority}</span>
                </div>
                <span style={css('font-size:12.5px;color:var(--fgm);')}>{c.domain}</span>
                <span style={css('font-size:12.5px;color:var(--fg);')}>{c.status}</span>
                <span style={css('font-size:12.5px;color:var(--fgm);')}>{c.owner}</span>
                <span style={css("font-size:12px;font-family:'Geist Mono',monospace;color:var(--fgm);")}>in {c.dueInDays}d</span>
              </Box>
            );
          })}
        </div>
      )}
    </div>
  );
}
