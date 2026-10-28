import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorkspace } from '../app/WorkspaceProvider';
import { Box } from '../components/governly/Box';
import { badge, pill, sevPair, statusPair } from '../components/governly/primitives';
import { Timeline } from '../components/governly/Timeline';
import { CommentThread } from '../components/governly/CommentThread';
import { client } from '../data/client';
import { invalidateQueryCache } from '../data/queryCache';
import { syncCaseStatusFromIncident } from '../data/useCaseActions';
import { useCurrentSteward } from '../data/useCurrentSteward';
import { useIncidentDetailData } from '../data/useIncidents';
import type {
  CommentFixture,
  ImpactFixture,
  IncidentFixture,
  TimelineFixture,
} from '../fixtures/types';
import { css } from '../lib/css';

const TIMELINE_ORDER: Record<IncidentFixture['status'], number> = {
  Open: 0,
  Acknowledged: 1,
  Blocked: 1,
  Investigating: 2,
  'In progress': 2,
  Resolved: 3,
};

function buildTimeline(inc: IncidentFixture, status: IncidentFixture['status']): TimelineFixture[] {
  const level = TIMELINE_ORDER[status];
  const timeLabel = inc.age || 'Recent';
  const detectedText =
    inc.summary ||
    `${inc.monitorType ?? 'Freshness'} monitor triggered for ${inc.asset} (${inc.observed ?? 'threshold exceeded'}).`;
  const domainLabel = inc.domain ?? 'General';
  const stewardName = inc.assignee ?? 'Workspace Steward';
  const events: TimelineFixture[] = [
    { time: timeLabel, title: 'Detected', text: detectedText, icon: 'ph-warning', color: 'var(--crit)' },
    {
      time: timeLabel,
      title: 'Notified',
      text: `Steward (${stewardName}) and domain "${domainLabel}" notified.`,
      icon: 'ph-bell',
      color: 'var(--info)',
    },
  ];
  if (level >= 1)
    events.push({
      time: 'Updated',
      title: 'Acknowledged',
      text: `${stewardName} acknowledged the incident and took ownership.`,
      icon: 'ph-check',
      color: 'var(--warn)',
    });
  if (level >= 2)
    events.push({
      time: 'Updated',
      title: 'Investigating',
      text: `Investigation started for ${inc.asset} (${inc.monitorType ?? 'Freshness'}).`,
      icon: 'ph-magnifying-glass',
      color: 'var(--info)',
    });
  if (level >= 3)
    events.push({
      time: 'Updated',
      title: 'Resolved',
      text: `Incident marked resolved for ${inc.asset}.`,
      icon: 'ph-check-circle',
      color: 'var(--ok)',
    });
  return events;
}

const primaryBtn =
  'height:38px;border-radius:9px;border:1px solid transparent;background:var(--accent);color:#fff;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;width:100%';
const secBtn =
  'height:38px;border-radius:9px;border:1px solid var(--border);background:var(--card);color:var(--fg);font-size:13px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;width:100%';

export type IncidentDetailProps = {
  incident?: IncidentFixture;
  impact?: ImpactFixture[];
  comments?: CommentFixture[];
  timeline?: TimelineFixture[];
  onTransition?: (next: IncidentFixture['status']) => void;
  onAssignToMe?: () => void;
  onAddToCase?: () => void;
  onSnooze?: () => void;
  onAddComment?: (body: string) => void;
};

export function IncidentDetail({
  incident: propIncident,
  impact: propImpact,
  comments: propComments,
  timeline: propTimeline,
  onTransition,
  onAssignToMe,
  onAddToCase,
  onSnooze,
  onAddComment,
}: IncidentDetailProps = {}) {
  const { incidentKey = '' } = useParams<{ incidentKey: string }>();
  const navigate = useNavigate();
  const { resolveWriteWorkspaceId, casesEnabled, refreshData } = useWorkspace();
  const steward = useCurrentSteward();

  const live = useIncidentDetailData(incidentKey);
  const baseInc = propIncident ?? live.incident;
  const impact = propImpact ?? live.impact;
  const [localStatus, setLocalStatus] = useState<IncidentFixture['status'] | null>(null);
  const [localAssignee, setLocalAssignee] = useState<string | null>(null);
  const [localComments, setLocalComments] = useState<CommentFixture[]>([]);
  const [actionToast, setActionToast] = useState<string | null>(null);

  const incStatus = propIncident ? (localStatus ?? propIncident.status) : (localStatus ?? baseInc.status);
  const cleanBaseAssignee =
    baseInc.assignee && baseInc.assignee !== 'Workspace Steward' && baseInc.assignee !== 'Unassigned'
      ? baseInc.assignee
      : undefined;
  const effectiveAssignee =
    localAssignee ?? cleanBaseAssignee ?? steward.entra?.display_name ?? baseInc.assignee ?? 'Unassigned';
  const effectiveInitials =
    effectiveAssignee
      .split(/\s+/)
      .map((p) => p[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'WS';
  const sp = statusPair(incStatus);
  const statusPill = pill(sp[0], sp[1]);
  const statusPillLg = { ...statusPill, padding: '3px 12px', fontSize: '12px' };
  const highBadge = badge('var(--crit)', 'var(--critb)');

  const events = propTimeline ?? buildTimeline({ ...baseInc, assignee: effectiveAssignee }, incStatus);
  const activeComments = propComments ?? [...live.comments, ...localComments];

  const persistIncidentOverlay = async (
    nextStatus: IncidentFixture['status'],
    nextAssignee?: string,
    snoozedUntil?: Date
  ) => {
    if (propIncident) return;
    try {
      const targetWs = resolveWriteWorkspaceId();
      const existing = await client.data.IncidentState.select(['id'])
        .where({ incident_key: { eq: baseInc.id } })
        .execute();
      const actorName = steward.entra?.display_name ?? 'Workspace Steward';
      const actorOid = steward.entra?.object_id ?? '00000000-0000-0000-0000-000000000001';
      if (Array.isArray(existing) && existing.length > 0 && existing[0]?.id) {
        await client.data.IncidentState.update(
          { id: existing[0].id },
          {
            status: nextStatus,
            ...(nextAssignee ? { assignee_name: nextAssignee, assignee_object_id: actorOid } : {}),
            ...(snoozedUntil ? { snoozed_until: snoozedUntil } : {}),
            updated_at: new Date(),
            updated_by_name: actorName,
            updated_by_object_id: actorOid,
          }
        );
      } else {
        await client.data.IncidentState.create({
          workspace_id: targetWs,
          incident_key: baseInc.id,
          domain_key: (baseInc.domain ?? 'general').toLowerCase(),
          status: nextStatus,
          assignee_name: nextAssignee ?? effectiveAssignee,
          assignee_object_id: actorOid,
          ...(snoozedUntil ? { snoozed_until: snoozedUntil } : {}),
          updated_at: new Date(),
          updated_by_name: actorName,
          updated_by_object_id: actorOid,
        });
      }
      const eventRepo = (client.data as Record<string, any>).IncidentEvent;
      if (eventRepo) {
        await eventRepo.create({
          workspace_id: targetWs,
          incident_key: baseInc.id,
          kind: snoozedUntil ? 'Snoozed' : nextAssignee ? 'Assigned' : nextStatus,
          actor_name: actorName,
          actor_user_id: actorOid,
          actor_object_id: actorOid,
          detail: snoozedUntil
            ? `Snoozed until ${snoozedUntil.toISOString().slice(11, 16)} UTC`
            : nextAssignee
            ? `Assigned to ${nextAssignee}`
            : `Status transitioned to ${nextStatus}`,
          created_at: new Date(),
        });
      }
      invalidateQueryCache('incidents:');
      refreshData();
    } catch {
      // ignore offline/test environment errors
    }
  };

  const advanceStatus = (next: IncidentFixture['status']) => {
    setLocalStatus(next);
    onTransition?.(next);
    if (!propIncident) {
      const targetWs = resolveWriteWorkspaceId();
      void syncCaseStatusFromIncident({
        workspaceId: targetWs,
        incidentKey: baseInc.id,
        assetKey: baseInc.asset,
        nextIncidentStatus: next,
        onUpdated: refreshData,
      });
    }
    if (next === 'Resolved') {
      setActionToast('Incident resolved & linked case moved to Done');
    } else if (next === 'Open') {
      setActionToast('Incident & linked case reopened');
    }
    void persistIncidentOverlay(next);
  };

  const handleAssignToMe = () => {
    const myName = steward.entra?.display_name ?? 'Workspace Steward';
    setLocalAssignee(myName);
    onAssignToMe?.();
    setActionToast(`Assigned to ${myName}`);
    void persistIncidentOverlay(incStatus, myName);
  };

  const handleSnooze = () => {
    onSnooze?.();
    const snoozedUntil = new Date(Date.now() + 60 * 60 * 1000);
    setActionToast(`Snoozed for 1h (until ${snoozedUntil.toISOString().slice(11, 16)} UTC)`);
    void persistIncidentOverlay(incStatus, undefined, snoozedUntil);
  };

  const handleAddToCase = () => {
    onAddToCase?.();
    if (propIncident) return;
    const targetWs = resolveWriteWorkspaceId();
    const actorName = steward.entra?.display_name ?? 'Workspace Steward';
    const actorOid = steward.entra?.object_id ?? '00000000-0000-0000-0000-000000000001';
    const caseKey = `CASE-${baseInc.id.replace('INC-', '')}`;
    setActionToast(`Linked to ${caseKey}`);
    void (async () => {
      try {
        const existing = await client.data.StewardCase.select(['id', 'case_key'])
          .where({ case_key: { eq: caseKey } })
          .execute();
        let caseId = Array.isArray(existing) && existing[0]?.id ? String(existing[0].id) : '';
        if (!caseId) {
          const created = await client.data.StewardCase.create({
            workspace_id: targetWs,
            case_key: caseKey,
            title: `Remediate ${baseInc.title}`,
            domain_key: (baseInc.domain ?? 'General').toLowerCase(),
            priority: baseInc.sev,
            status: 'Open',
            owner_name: actorName,
            owner_object_id: actorOid,
            due_date: new Date(Date.now() + 2 * 86_400_000),
            created_at: new Date(),
            updated_at: new Date(),
          });
          caseId = String((created as any)?.id ?? '');
        }
        if (caseId) {
          await client.data.CaseIncidentLink.create({
            workspace_id: targetWs,
            case: { id: caseId },
            incident_key: baseInc.id,
            linked_at: new Date(),
            linked_by: actorName,
          }).catch(() => undefined);
        }
        refreshData();
      } catch {
        // ignore offline errors
      }
    })();
  };

  const primaryAction =
    incStatus === 'Open'
      ? { label: 'Acknowledge', icon: 'ph-check', next: 'Acknowledged' as const }
      : incStatus === 'Acknowledged'
      ? { label: 'Start investigating', icon: 'ph-magnifying-glass', next: 'Investigating' as const }
      : incStatus === 'Investigating'
      ? { label: 'Resolve incident', icon: 'ph-check-circle', next: 'Resolved' as const }
      : { label: 'Reopen incident', icon: 'ph-arrow-counter-clockwise', next: 'Open' as const };

  return (
    <div style={css('padding:24px 28px 40px;max-width:1320px;margin:0 auto;')}>
      <div style={css('font-size:12px;color:var(--fgm,#52525b);margin-bottom:14px;display:flex;align-items:center;gap:6px;')}>
        <Box as="span" onClick={() => navigate('/')} style="cursor:pointer;" hover="color:var(--fg)">
          Governly
        </Box>
        <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" />
        <Box as="span" onClick={() => navigate('/incidents')} style="cursor:pointer;" hover="color:var(--fg)">
          Incidents
        </Box>
        <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" />
        <span style={css("color:var(--fg);font-family:'Geist Mono',monospace;")}>{baseInc.id}</span>
      </div>

      <div style={css('display:flex;align-items:flex-start;gap:14px;margin-bottom:22px;')}>
        <div style={css('width:42px;height:42px;border-radius:10px;background:var(--critb);color:var(--crit);display:flex;align-items:center;justify-content:center;font-size:21px;flex:0 0 auto;')}>
          <i className="ph ph-warning" aria-hidden="true" />
        </div>
        <div style={css('flex:1;')}>
          <div style={css('display:flex;align-items:center;gap:10px;flex-wrap:wrap;')}>
            <span style={highBadge}>{baseInc.sev}</span>
            <span style={statusPillLg}>{incStatus}</span>
            <span style={css("font-size:11.5px;color:var(--fgs);font-family:'Geist Mono',monospace;")}>
              {baseInc.id} · opened {baseInc.age}
            </span>
          </div>
          <div style={css('font-size:21px;font-weight:600;letter-spacing:-0.01em;color:var(--fg,#18181b);margin-top:8px;')}>
            <span>{baseInc.title}</span> · <span style={css("font-family:'Geist Mono',monospace;")}>{baseInc.asset}</span>
          </div>
        </div>
      </div>

      <div style={css('display:grid;grid-template-columns:1.7fr 1fr;gap:16px;align-items:start;')}>
        <div style={css('display:flex;flex-direction:column;gap:16px;')}>
          <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;padding:18px 20px;box-shadow:var(--shadow);')}>
            <div style={css('font-size:13.5px;color:var(--fg);line-height:1.6;')}>
              {baseInc.summary || (
                <>
                  The <b>{baseInc.monitorType ?? 'Freshness'}</b> monitor for{' '}
                  <span style={css("font-family:'Geist Mono',monospace;")}>{baseInc.asset}</span> detected an issue (
                  <b style={css('color:var(--crit);')}>{baseInc.observed ?? 'threshold exceeded'}</b> vs target{' '}
                  <b>{baseInc.slaTarget ?? '1h 00m'}</b>).
                </>
              )}
              {impact.length > 0 && (
                <>
                  {' '}
                  Downstream impact detected across <b>{impact.length}</b> dependent item{impact.length === 1 ? '' : 's'} ({impact.map((m) => m.name).join(', ')}).
                </>
              )}
            </div>
            <div style={css('display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:18px;padding-top:16px;border-top:1px solid var(--border,#e7e7ea);')}>
              <div>
                <div style={css('font-size:11px;color:var(--fgs);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;')}>SLA target</div>
                <div style={css("font-size:14px;font-weight:600;color:var(--fg);font-family:'Geist Mono',monospace;margin-top:4px;")}>
                  {baseInc.slaTarget ?? '1h 00m'}
                </div>
              </div>
              <div>
                <div style={css('font-size:11px;color:var(--fgs);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;')}>Current lag</div>
                <div style={css("font-size:14px;font-weight:600;color:var(--crit);font-family:'Geist Mono',monospace;margin-top:4px;")}>
                  {baseInc.observed ?? 'N/A'}
                </div>
              </div>
              <div>
                <div style={css('font-size:11px;color:var(--fgs);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;')}>Monitor</div>
                <div style={css('font-size:14px;font-weight:600;color:var(--fg);margin-top:4px;')}>
                  {baseInc.monitorType ?? 'Freshness'}
                </div>
              </div>
              <div>
                <div style={css('font-size:11px;color:var(--fgs);text-transform:uppercase;letter-spacing:0.04em;font-weight:600;')}>First detected</div>
                <div style={css("font-size:14px;font-weight:600;color:var(--fg);font-family:'Geist Mono',monospace;margin-top:4px;")}>
                  {baseInc.age}
                </div>
              </div>
            </div>
          </div>

          <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
            <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);display:flex;align-items:center;justify-content:space-between;')}>
              <div style={css('font-size:14px;font-weight:600;color:var(--fg);')}>Downstream impact</div>
              <span style={css('font-size:12px;color:var(--fgm);')}>
                {impact.length} affected
              </span>
            </div>
            {impact.length === 0 && (
              <div style={css('padding:16px 18px;font-size:12.5px;color:var(--fgm);')}>
                No downstream assets impacted in this workspace.
              </div>
            )}
            {impact.map((m) => {
              const p = sevPair(m.sev);
              return (
                <div key={m.name} style={css('display:flex;align-items:center;gap:11px;padding:12px 18px;border-bottom:1px solid var(--border,#e7e7ea);')}>
                  <div style={css('width:30px;height:30px;border-radius:8px;background:var(--card2,#f4f4f5);display:flex;align-items:center;justify-content:center;color:var(--fgm);font-size:15px;')}>
                    <i className={`ph ${m.icon}`} aria-hidden="true" />
                  </div>
                  <div style={css('flex:1;')}>
                    <div style={css('font-size:13px;font-weight:600;color:var(--fg);')}>{m.name}</div>
                    <div style={css('font-size:11.5px;color:var(--fgm);')}>{m.type}</div>
                  </div>
                  <span style={badge(p[0], p[1])}>{m.sev} impact</span>
                </div>
              );
            })}
          </div>

          <Timeline events={events} />

          <CommentThread
            comments={activeComments}
            onAddComment={(body) => {
              const who = steward.entra?.display_name ?? 'Workspace Steward';
              const initials =
                who
                  .split(/\s+/)
                  .map((p) => p[0] ?? '')
                  .join('')
                  .slice(0, 2)
                  .toUpperCase() || 'WS';
              const timeLbl = new Date().toISOString().slice(11, 16);
              setLocalComments((prev) => [
                ...prev,
                { who, initials, time: timeLbl, text: body, system: false },
              ]);
              onAddComment?.(body);
              if (!propComments) {
                const targetWs = resolveWriteWorkspaceId();
                void client.data.IncidentComment.create({
                  workspace_id: targetWs,
                  incident_key: baseInc.id,
                  body,
                  author_name: who,
                  author_user_id: steward.entra?.object_id ?? 'steward',
                  author_object_id:
                    steward.entra?.object_id ?? '00000000-0000-0000-0000-000000000001',
                  created_at: new Date(),
                }).catch(() => undefined);
              }
            }}
          />
        </div>

        <div style={css('display:flex;flex-direction:column;gap:16px;')}>
          <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);padding:16px;')}>
            <div style={css('font-size:12px;font-weight:600;color:var(--fgs);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:12px;')}>Actions</div>
            {actionToast && (
              <div style={css('margin-bottom:10px;padding:7px 10px;border-radius:7px;background:var(--okb,#ecfdf5);color:var(--ok,#059669);font-size:11.5px;font-weight:600;')}>
                {actionToast}
              </div>
            )}
            <div style={css('display:flex;flex-direction:column;gap:8px;')}>
              <button type="button" onClick={() => advanceStatus(primaryAction.next)} style={css(primaryBtn)}>
                <i className={`ph ${primaryAction.icon}`} style={css('font-size:16px;')} aria-hidden="true" />
                {primaryAction.label}
              </button>
              {incStatus !== 'Resolved' && primaryAction.next !== 'Resolved' && (
                <button
                  type="button"
                  onClick={() => advanceStatus('Resolved')}
                  style={css(
                    'height:38px;border-radius:9px;border:1px solid var(--ok,#059669);background:var(--okb,#ecfdf5);color:var(--ok,#059669);font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;width:100%'
                  )}
                >
                  <i className="ph ph-check-circle" style={css('font-size:16px;')} aria-hidden="true" />
                  Resolve incident & close case
                </button>
              )}
              <button type="button" onClick={handleAssignToMe} style={css(secBtn)}>
                <i className="ph ph-user-plus" style={css('font-size:16px;')} aria-hidden="true" />
                Assign to me
              </button>
              {casesEnabled && (
                <button type="button" onClick={handleAddToCase} style={css(secBtn)}>
                  <i className="ph ph-kanban" style={css('font-size:16px;')} aria-hidden="true" />
                  Add to case
                </button>
              )}
              <button type="button" onClick={handleSnooze} style={css(secBtn)}>
                <i className="ph ph-clock-countdown" style={css('font-size:16px;')} aria-hidden="true" />
                Snooze 1h
              </button>
            </div>
          </div>
          <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
            <div style={css('padding:13px 16px;border-bottom:1px solid var(--border,#e7e7ea);font-size:12px;font-weight:600;color:var(--fgs);text-transform:uppercase;letter-spacing:0.04em;')}>
              Details
            </div>
            <div style={css('padding:6px 16px 12px;')}>
              <div style={css('display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border,#e7e7ea);')}>
                <span style={css('font-size:12.5px;color:var(--fgm);')}>Status</span>
                <span style={statusPill}>{incStatus}</span>
              </div>
              <div style={css('display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border,#e7e7ea);')}>
                <span style={css('font-size:12.5px;color:var(--fgm);')}>Severity</span>
                <span style={highBadge}>{baseInc.sev}</span>
              </div>
              <div style={css('display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border,#e7e7ea);')}>
                <span style={css('font-size:12.5px;color:var(--fgm);')}>Assignee</span>
                <span style={css('font-size:12.5px;font-weight:600;color:var(--fg);display:flex;align-items:center;gap:7px;')}>
                  <span style={css('width:20px;height:20px;border-radius:99px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;')}>
                    {effectiveInitials}
                  </span>
                  {effectiveAssignee}
                </span>
              </div>
              <div style={css('display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border,#e7e7ea);')}>
                <span style={css('font-size:12.5px;color:var(--fgm);')}>Domain</span>
                <span style={css('font-size:12.5px;font-weight:600;color:var(--fg);')}>{baseInc.domain ?? 'General'}</span>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/assets/${baseInc.asset}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/assets/${baseInc.asset}`); }}
                style={css('display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border,#e7e7ea);cursor:pointer;')}
              >
                <span style={css('font-size:12.5px;color:var(--fgm);')}>Asset</span>
                <span style={css("font-size:12px;font-weight:600;color:var(--accent);font-family:'Geist Mono',monospace;")}>
                  {baseInc.asset.split('.').pop() || baseInc.asset} ↗
                </span>
              </div>
              <div style={css('display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border,#e7e7ea);')}>
                <span style={css('font-size:12.5px;color:var(--fgm);')}>Monitor</span>
                <span style={css('font-size:12.5px;font-weight:600;color:var(--fg);')}>{baseInc.monitorType ?? 'Freshness'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
