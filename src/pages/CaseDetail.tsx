import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorkspace } from '../app/WorkspaceProvider';
import { Box } from '../components/governly/Box';
import { badge, sevPair } from '../components/governly/primitives';
import { CommentThread } from '../components/governly/CommentThread';
import { client } from '../data/client';
import { isCaseLinkedToIncident, updateStewardCaseStatus } from '../data/useCaseActions';
import { useCurrentSteward } from '../data/useCurrentSteward';
import { useCases, useIncidents } from '../data/useIncidents';
import type { CaseFixture, CommentFixture } from '../fixtures/types';
import { css } from '../lib/css';

const CASE_STATUSES: Array<CaseFixture['status']> = ['Open', 'In progress', 'Blocked', 'Done'];

export function CaseDetail() {
  const { caseKey = '' } = useParams<{ caseKey: string }>();
  const navigate = useNavigate();
  const { resolveWriteWorkspaceId, refreshData } = useWorkspace();
  const steward = useCurrentSteward();
  const cases = useCases();
  const incidents = useIncidents();
  const [localStatus, setLocalStatus] = useState<CaseFixture['status'] | null>(null);
  const [caseComments, setCaseComments] = useState<CommentFixture[]>([]);

  const c =
    cases.find((item) => item.key === caseKey) ??
    cases[0] ?? {
      key: caseKey || 'CASE-NONE',
      title: 'No active case found',
      domain: 'General',
      owner: 'Unassigned',
      ownerInitials: 'ST',
      status: 'Open' as const,
      priority: 'Low' as const,
      dueInDays: 0,
      incidentKeys: [],
    };
  const effectiveStatus = localStatus ?? c.status;
  const sv = sevPair(c.priority);
  const linked = incidents.filter((i) => isCaseLinkedToIncident(c, i));

  useEffect(() => {
    if (!c.key || c.key === 'CASE-NONE') return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await client.data.IncidentComment.select(['author_name', 'body', 'created_at'])
          .where({ incident_key: { eq: c.key } })
          .execute();
        if (cancelled) return;
        if (Array.isArray(rows)) {
          setCaseComments(
            rows.map((r) => ({
              who: r.author_name,
              initials:
                r.author_name
                  .split(/\s+/)
                  .map((p) => p[0] ?? '')
                  .join('')
                  .slice(0, 2)
                  .toUpperCase() || 'ST',
              time: r.created_at ? String(r.created_at).slice(11, 16) : 'Recent',
              text: r.body,
              system: false,
            }))
          );
        }
      } catch {
        // ignore offline errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [c.key]);

  const handleStatusChange = (nextStatus: CaseFixture['status']) => {
    if (effectiveStatus === nextStatus) return;
    setLocalStatus(nextStatus);
    const who = steward.entra?.display_name ?? 'Workspace Steward';
    const initials = steward.initials ?? 'WS';
    const timeLbl = new Date().toISOString().slice(11, 16);
    const statusNote = `Moved case status to ${nextStatus}.`;
    setCaseComments((prev) => [
      ...prev,
      { who, initials, time: timeLbl, text: statusNote, system: true },
    ]);
    void updateStewardCaseStatus(
      c.key,
      nextStatus,
      refreshData,
      linked.map((i) => i.id)
    );
    void client.data.IncidentComment.create({
      workspace_id: resolveWriteWorkspaceId(),
      incident_key: c.key,
      body: statusNote,
      author_name: who,
      author_user_id: steward.entra?.object_id ?? 'steward',
      author_object_id:
        steward.entra?.object_id ?? '00000000-0000-0000-0000-000000000001',
      created_at: new Date(),
    }).catch(() => undefined);
  };

  return (
    <div style={css('padding:24px 28px 40px;max-width:1320px;margin:0 auto;')}>
      <div style={css('font-size:12px;color:var(--fgm,#52525b);margin-bottom:14px;display:flex;align-items:center;gap:6px;')}>
        <Box as="span" onClick={() => navigate('/')} style="cursor:pointer;" hover="color:var(--fg)">Governly</Box>
        <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" />
        <Box as="span" onClick={() => navigate('/cases')} style="cursor:pointer;" hover="color:var(--fg)">Cases</Box>
        <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" />
        <span style={css("color:var(--fg);font-family:'Geist Mono',monospace;")}>{c.key}</span>
      </div>
      <div style={css('display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px;')}>
        <div style={css('display:flex;align-items:center;gap:10px;')}>
          <span style={badge(sv[0], sv[1])}>{c.priority}</span>
          <span style={css("font-size:12px;font-family:'Geist Mono',monospace;color:var(--fgs);")}>{c.key} · {effectiveStatus}</span>
        </div>
        <div style={css('display:flex;gap:6px;')}>
          {CASE_STATUSES.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => handleStatusChange(st)}
              style={css(
                `height:30px;padding:0 11px;border-radius:7px;font-size:12px;font-weight:${
                  effectiveStatus === st ? 600 : 500
                };cursor:pointer;border:1px solid ${
                  effectiveStatus === st ? 'var(--accent,#4f46e5)' : 'var(--border,#e7e7ea)'
                };background:${
                  effectiveStatus === st ? 'var(--accent,#4f46e5)' : 'var(--card,#fff)'
                };color:${effectiveStatus === st ? '#fff' : 'var(--fg)'};`
              )}
            >
              {st}
            </button>
          ))}
        </div>
      </div>
      <div style={css('font-size:21px;font-weight:600;color:var(--fg);margin-bottom:20px;')}>{c.title}</div>

      <div style={css('display:grid;grid-template-columns:1.7fr 1fr;gap:16px;align-items:start;')}>
        <div style={css('display:flex;flex-direction:column;gap:16px;')}>
          <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
            <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);font-size:14px;font-weight:600;color:var(--fg);')}>
              Linked incidents ({linked.length})
            </div>
            {linked.map((i) => (
              <Box
                key={i.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/incidents/${i.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/incidents/${i.id}`); }}
                style="padding:12px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border,#e7e7ea);cursor:pointer;"
                hover="background:var(--card2)"
              >
                <div>
                  <div style={css("font-size:11px;font-family:'Geist Mono',monospace;color:var(--fgs);")}>{i.id} · {i.status}</div>
                  <div style={css('font-size:13px;font-weight:600;color:var(--fg);margin-top:2px;')}>{i.title}</div>
                </div>
                <span style={css("font-size:12px;font-family:'Geist Mono',monospace;color:var(--fgm);")}>{i.asset}</span>
              </Box>
            ))}
          </div>
          <CommentThread
            comments={caseComments}
            onAddComment={(body) => {
              const who = steward.entra?.display_name ?? 'Workspace Steward';
              const initials = steward.initials ?? 'WS';
              const timeLbl = new Date().toISOString().slice(11, 16);
              setCaseComments((prev) => [
                ...prev,
                { who, initials, time: timeLbl, text: body, system: false },
              ]);
              void client.data.IncidentComment.create({
                workspace_id: resolveWriteWorkspaceId(),
                incident_key: c.key,
                body,
                author_name: who,
                author_user_id: steward.entra?.object_id ?? 'steward',
                author_object_id:
                  steward.entra?.object_id ?? '00000000-0000-0000-0000-000000000001',
                created_at: new Date(),
              }).catch(() => undefined);
            }}
          />
        </div>
        <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);padding:16px;')}>
          <div style={css('font-size:12px;font-weight:600;color:var(--fgs);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:12px;')}>Case details</div>
          <div style={css('display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:12.5px;')}>
            <span style={css('color:var(--fgm);')}>Status</span>
            <span style={css('font-weight:600;color:var(--fg);')}>{effectiveStatus}</span>
          </div>
          <div style={css('display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:12.5px;')}>
            <span style={css('color:var(--fgm);')}>Owner</span>
            <span style={css('font-weight:600;color:var(--fg);')}>{c.owner}</span>
          </div>
          <div style={css('display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:12.5px;')}>
            <span style={css('color:var(--fgm);')}>Domain</span>
            <span style={css('font-weight:600;color:var(--fg);')}>{c.domain}</span>
          </div>
          <div style={css('display:flex;justify-content:space-between;padding:8px 0;font-size:12.5px;')}>
            <span style={css('color:var(--fgm);')}>Due</span>
            <span style={css("font-family:'Geist Mono',monospace;color:var(--fg);")}>in {c.dueInDays} days</span>
          </div>
        </div>
      </div>
    </div>
  );
}
