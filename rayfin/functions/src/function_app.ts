import {
  AudienceType,
  UserDataFunctions,
  type RayfinContext,
} from '@microsoft/fabric-user-data-functions';

const udf = new UserDataFunctions();

const FABRIC_API = 'https://api.fabric.microsoft.com/v1';
const COMPUTE_NOTEBOOK_NAME = 'nb_governly_compute_publish';

export interface ComputeNotebookResult {
  ok: boolean;
  workspaceId?: string;
  notebookId?: string;
  scheduleEnabled?: boolean;
  intervalMinutes?: number;
  jobStatus?: string;
  workspacesJson?: string;
  jobsJson?: string;
  message: string;
}

interface FabricJobInstance {
  id: string;
  status?: string;
  jobType?: string;
  invokeType?: string;
  startTimeUtc?: string;
  endTimeUtc?: string;
  failureReason?: { errorCode?: string; message?: string } | string | null;
}

function formatLagShort(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))}s`;
  const mins = Math.round(minutes);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 48) return rem > 0 ? `${hours}h ${String(rem).padStart(2, '0')}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
}

function buildFailureDiagnostic(
  itemType: 'Spark notebook' | 'Data pipeline',
  itemName: string,
  errorCode: string,
  errorMsg: string,
  isFailed: boolean,
  lagLabel: string,
  slaLabel: string,
): { whyFailed: string; possibleSolution: string } {
  const msgLower = `${errorCode} ${errorMsg}`.toLowerCase();
  const whyFailed = isFailed
    ? errorMsg
      ? `${itemType} '${itemName}' failed with [${errorCode}]: ${errorMsg}`
      : `${itemType} '${itemName}' execution failed in Fabric Job Scheduler (${errorCode}).`
    : `${itemType} '${itemName}' exceeded its freshness SLA target of <= ${slaLabel} (latest completed run was ${lagLabel} ago).`;

  let possibleSolution: string;
  if (
    msgLower.includes('token') ||
    msgLower.includes('auth') ||
    msgLower.includes('401') ||
    msgLower.includes('403') ||
    msgLower.includes('permission')
  ) {
    possibleSolution =
      `1. Re-authenticate the data source connection or workspace identity used by '${itemName}'.\n` +
      `2. Verify Contributor/ReadWrite access on target Lakehouses and SQL endpoints.\n` +
      `3. Re-run '${itemName}' from Fabric Monitor Hub once credentials are refreshed.`;
  } else if (
    msgLower.includes('timeout') ||
    msgLower.includes('capacity') ||
    msgLower.includes('throttl') ||
    msgLower.includes('429')
  ) {
    possibleSolution =
      `1. Check Fabric Capacity Metrics for CU throttling or paused capacity during the execution window.\n` +
      `2. Stagger overlapping schedules or increase activity timeout in '${itemName}'.\n` +
      `3. Retry the failed run once capacity utilization stabilizes.`;
  } else if (itemType === 'Spark notebook') {
    possibleSolution =
      `1. Open Spark notebook '${itemName}' in Fabric and inspect the failed cell traceback in the Spark session logs.\n` +
      `2. Verify the default Lakehouse attachment, notebook parameters, and OneLake table paths.\n` +
      `3. Re-run the notebook interactively to confirm the fix before the next scheduled trigger.`;
  } else {
    possibleSolution =
      `1. Open Data pipeline '${itemName}' in Fabric Monitor Hub and inspect the failed activity output.\n` +
      `2. Verify source connector health, sink table locks, and activity retry policy.\n` +
      `3. Trigger a manual retry from the failed activity once the upstream dependency is healthy.`;
  }
  return { whyFailed, possibleSolution };
}

async function findComputeNotebook(
  token: string,
  preferredWorkspaceId?: string,
): Promise<{ workspaceId: string; notebookId: string } | null> {
  const headers = { Authorization: `Bearer ${token}` };

  const checkWorkspace = async (wsId: string): Promise<string | null> => {
    if (!wsId || wsId === 'all' || wsId === 'default-workspace') return null;
    const res = await fetch(`${FABRIC_API}/workspaces/${wsId}/items?type=Notebook`, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as { value?: Array<{ id: string; displayName: string }> };
    const found = (data.value ?? []).find((i) => i.displayName === COMPUTE_NOTEBOOK_NAME);
    return found?.id ?? null;
  };

  if (preferredWorkspaceId) {
    const nbId = await checkWorkspace(preferredWorkspaceId);
    if (nbId) return { workspaceId: preferredWorkspaceId, notebookId: nbId };
  }

  const wsRes = await fetch(`${FABRIC_API}/workspaces`, { headers });
  if (!wsRes.ok) return null;
  const wsData = (await wsRes.json()) as { value?: Array<{ id: string }> };
  for (const ws of wsData.value ?? []) {
    if (ws.id === preferredWorkspaceId) continue;
    const nbId = await checkWorkspace(ws.id);
    if (nbId) return { workspaceId: ws.id, notebookId: nbId };
  }
  return null;
}

udf.func(
  'manageComputeNotebook',
  async (
    ctx: RayfinContext<Record<string, any>, AudienceType.Fabric>,
    hostWorkspaceId: string,
    action: string,
    scheduleEnabled: boolean,
    intervalMinutes: number,
  ): Promise<ComputeNotebookResult> => {
    const token = ctx.Tokens.Fabric;
    const target = await findComputeNotebook(token, hostWorkspaceId);
    if (!target) {
      return {
        ok: false,
        message: `Could not locate ${COMPUTE_NOTEBOOK_NAME} in accessible Fabric workspaces.`,
      };
    }

    const { workspaceId, notebookId } = target;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    if (action === 'trigger') {
      const trigRes = await fetch(
        `${FABRIC_API}/workspaces/${workspaceId}/items/${notebookId}/jobs/instances?jobType=RunNotebook`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({}),
        },
      );
      if (!trigRes.ok && trigRes.status !== 202) {
        const errText = await trigRes.text();
        return {
          ok: false,
          workspaceId,
          notebookId,
          message: `Failed to trigger notebook (${trigRes.status}): ${errText.slice(0, 200)}`,
        };
      }
      return {
        ok: true,
        workspaceId,
        notebookId,
        jobStatus: 'InProgress',
        message: 'Compute notebook triggered in Fabric. Initial Spark startup takes ~1–2 minutes.',
      };
    }

    if (action === 'schedule') {
      const clampedInterval = Math.max(1, Math.min(1440, Math.round(intervalMinutes || 36)));
      const now = new Date();
      const startIso = new Date(now.getTime() + clampedInterval * 60_000)
        .toISOString()
        .slice(0, 19);
      const endIso = new Date(now.getTime() + 365 * 86_400_000).toISOString().slice(0, 19);

      const schedPayload = {
        enabled: Boolean(scheduleEnabled),
        configuration: {
          type: 'Cron',
          startDateTime: startIso,
          endDateTime: endIso,
          localTimeZoneId: 'UTC',
          interval: clampedInterval,
        },
      };

      const listRes = await fetch(
        `${FABRIC_API}/workspaces/${workspaceId}/items/${notebookId}/jobs/RunNotebook/schedules`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const listData = listRes.ok
        ? ((await listRes.json()) as { value?: Array<{ id: string }> })
        : { value: [] };
      const existingId = listData.value?.[0]?.id;

      const saveRes = existingId
        ? await fetch(
            `${FABRIC_API}/workspaces/${workspaceId}/items/${notebookId}/jobs/RunNotebook/schedules/${existingId}`,
            {
              method: 'PATCH',
              headers,
              body: JSON.stringify(schedPayload),
            },
          )
        : await fetch(
            `${FABRIC_API}/workspaces/${workspaceId}/items/${notebookId}/jobs/RunNotebook/schedules`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify(schedPayload),
            },
          );

      if (!saveRes.ok) {
        const errText = await saveRes.text();
        return {
          ok: false,
          workspaceId,
          notebookId,
          message: `Failed to update schedule (${saveRes.status}): ${errText.slice(0, 200)}`,
        };
      }

      return {
        ok: true,
        workspaceId,
        notebookId,
        scheduleEnabled: Boolean(scheduleEnabled),
        intervalMinutes: clampedInterval,
        message: scheduleEnabled
          ? `Recurring schedule enabled (every ${clampedInterval}m).`
          : 'Recurring schedule paused.',
      };
    }

    // Default: 'status' or 'jobs'
    const [schedRes, jobsRes, wsListRes] = await Promise.all([
      fetch(
        `${FABRIC_API}/workspaces/${workspaceId}/items/${notebookId}/jobs/RunNotebook/schedules`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
      fetch(
        `${FABRIC_API}/workspaces/${workspaceId}/items/${notebookId}/jobs/instances`,
        { headers: { Authorization: `Bearer ${token}` } },
      ),
      fetch(`${FABRIC_API}/workspaces`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);

    const schedData = schedRes.ok
      ? ((await schedRes.json()) as {
          value?: Array<{
            id: string;
            enabled?: boolean;
            configuration?: { interval?: number };
          }>;
        })
      : { value: [] };
    const jobsData = jobsRes.ok
      ? ((await jobsRes.json()) as {
          value?: Array<FabricJobInstance>;
        })
      : { value: [] };
    const wsListData = wsListRes.ok
      ? ((await wsListRes.json()) as {
          value?: Array<{ id: string; displayName?: string; type?: string; capacityId?: string }>;
        })
      : { value: [] };

    const allCapacityWorkspaces = (wsListData.value ?? []).filter(
      (w) => w.type === 'Workspace' && Boolean(w.capacityId),
    );

    const discoveredWorkspaces = allCapacityWorkspaces
      .filter(
        (w) =>
          w.id !== workspaceId &&
          w.id !== hostWorkspaceId &&
          !(w.displayName ?? '').toLowerCase().startsWith('governly-observability'),
      )
      .map((w) => ({
        workspace_id: w.id,
        display_name: w.displayName || w.id,
        capacity_sku: 'F2',
      }));

    let jobsJson: string | undefined;
    if (action === 'jobs' || action === 'status') {
      const nowMs = Date.now();
      const perWsItems = await Promise.all(
        allCapacityWorkspaces.map(async (ws) => {
          try {
            const itemsRes = await fetch(`${FABRIC_API}/workspaces/${ws.id}/items`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!itemsRes.ok) return [];
            const itemsData = (await itemsRes.json()) as {
              value?: Array<{ id: string; displayName?: string; type?: string }>;
            };
            const runtimeItems = (itemsData.value ?? []).filter(
              (it) => it.type === 'Notebook' || it.type === 'DataPipeline',
            );
            return await Promise.all(
              runtimeItems.map(async (it) => {
                const isNb = it.type === 'Notebook';
                const itemType: 'Spark notebook' | 'Data pipeline' = isNb
                  ? 'Spark notebook'
                  : 'Data pipeline';
                const dispName = it.displayName || it.id;
                const assetKey = isNb
                  ? `notebook.${dispName.toLowerCase().replace(/\s+/g, '_')}`
                  : dispName.toLowerCase().replace(/\s+/g, '_');
                const slaMin = isNb ? 1440 : 360;
                const slaLabel = isNb ? '24h' : '6h';
                const fabricItemUrl = isNb
                  ? `https://app.fabric.microsoft.com/groups/${ws.id}/synapsenotebooks/${it.id}`
                  : `https://app.fabric.microsoft.com/groups/${ws.id}/pipelines/${it.id}`;

                let rawJobs: FabricJobInstance[] = [];
                try {
                  const jRes = await fetch(
                    `${FABRIC_API}/workspaces/${ws.id}/items/${it.id}/jobs/instances`,
                    { headers: { Authorization: `Bearer ${token}` } },
                  );
                  if (jRes.ok) {
                    const jData = (await jRes.json()) as { value?: FabricJobInstance[] };
                    rawJobs = jData.value ?? [];
                  }
                } catch {
                  rawJobs = [];
                }

                const parseTs = (j: FabricJobInstance): number => {
                  const raw = j.endTimeUtc || j.startTimeUtc;
                  if (!raw) return nowMs;
                  const norm = raw.endsWith('Z') || raw.includes('+') ? raw : `${raw}Z`;
                  const parsed = Date.parse(norm);
                  return Number.isNaN(parsed) ? nowMs : parsed;
                };

                const relevantJobs = rawJobs
                  .filter((j) =>
                    ['completed', 'failed', 'cancelled', 'inprogress', 'notstarted', 'deduped'].includes(
                      String(j.status ?? '').toLowerCase(),
                    ),
                  )
                  .sort((a, b) => parseTs(b) - parseTs(a));

                if (relevantJobs.length === 0) {
                  return {
                    workspace_id: ws.id,
                    workspace_name: ws.displayName || ws.id,
                    asset_key: assetKey,
                    name: dispName,
                    asset_type: itemType,
                    status: 'healthy',
                    health_score: 100,
                    freshness_label: 'No runs yet',
                    is_late: false,
                    sla_minutes: slaMin,
                    fabric_item_url: fabricItemUrl,
                    runs: [],
                    lag_points: [],
                    diagnostics: [],
                  };
                }

                const latest = relevantJobs[0];
                const latestStatus = String(latest.status ?? 'Completed').toLowerCase();
                const latestMs = parseTs(latest);
                const lagMin = Math.max(1, Math.round(((nowMs - latestMs) / 60_000) * 10) / 10);
                const failedRecent = latestStatus === 'failed' || latestStatus === 'cancelled';
                const inProgress = latestStatus === 'inprogress' || latestStatus === 'notstarted';
                const isLate = failedRecent || (!inProgress && lagMin > slaMin);
                const freshLabel = failedRecent
                  ? 'Run failed'
                  : inProgress
                    ? 'Running now'
                    : `${formatLagShort(lagMin)} ago`;

                const chron = [...relevantJobs.slice(0, 12)].reverse();
                const runs = relevantJobs.slice(0, 10).map((j, idx) => {
                  const jMs = parseTs(j);
                  const nextOlder = relevantJobs[idx + 1];
                  const stepLag = nextOlder
                    ? Math.max(1, Math.round(((jMs - parseTs(nextOlder)) / 60_000) * 10) / 10)
                    : lagMin;
                  const jStat = String(j.status ?? 'Completed').toLowerCase();
                  const isFail = jStat === 'failed' || jStat === 'cancelled';
                  const isRunning = jStat === 'inprogress' || jStat === 'notstarted';
                  const isBreach = isFail || (!isRunning && stepLag > slaMin);
                  const dtIso = new Date(jMs).toISOString().slice(0, 16).replace('T', ' ');
                  return {
                    run_id: `${assetKey}:${j.id || idx}`,
                    time: dtIso,
                    lag: isRunning ? 'Running' : formatLagShort(stepLag),
                    lag_minutes: stepLag,
                    rows: ws.displayName || itemType,
                    result: isBreach ? 'breach' : 'ok',
                    label: isFail
                      ? 'Run Failed'
                      : isRunning
                        ? 'In progress'
                        : isBreach
                          ? 'SLA Breach'
                          : 'On time',
                  };
                });

                const lagPoints = chron.map((j, idx) => {
                  const jMs = parseTs(j);
                  const prev = idx > 0 ? chron[idx - 1] : undefined;
                  return prev
                    ? Math.max(1, Math.round(((jMs - parseTs(prev)) / 60_000) * 10) / 10)
                    : lagMin;
                });

                const diagnostics = relevantJobs
                  .slice(0, 5)
                  .filter((j, idx) => {
                    const st = String(j.status ?? '').toLowerCase();
                    return st === 'failed' || st === 'cancelled' || (idx === 0 && isLate);
                  })
                  .map((j, idx) => {
                    const st = String(j.status ?? '').toLowerCase();
                    const jFail = st === 'failed' || st === 'cancelled';
                    const fr = j.failureReason;
                    let errCode = jFail ? 'JobExecutionFailed' : 'FreshnessSlaBreach';
                    let errMsg = '';
                    if (fr && typeof fr === 'object') {
                      errCode = String(
                        fr.errorCode || (st === 'cancelled' ? 'JobCancelled' : 'JobExecutionFailed'),
                      );
                      errMsg = String(fr.message || '').trim();
                    } else if (typeof fr === 'string' && fr.trim()) {
                      errMsg = fr.trim();
                    }
                    const { whyFailed, possibleSolution } = buildFailureDiagnostic(
                      itemType,
                      dispName,
                      errCode,
                      errMsg,
                      jFail,
                      formatLagShort(lagMin),
                      slaLabel,
                    );
                    return {
                      id: `${assetKey}:diag:${j.id || idx}`,
                      assetKey,
                      assetType: itemType,
                      runId: String(j.id || `run-${idx + 1}`),
                      statusLabel: (jFail ? 'Run Failed' : 'SLA Breach') as 'Run Failed' | 'SLA Breach',
                      errorCode: errCode,
                      whyFailed,
                      possibleSolution,
                      detectedAt: new Date(parseTs(j)).toISOString().slice(0, 16).replace('T', ' '),
                    };
                  });

                return {
                  workspace_id: ws.id,
                  workspace_name: ws.displayName || ws.id,
                  asset_key: assetKey,
                  name: dispName,
                  asset_type: itemType,
                  status: failedRecent ? 'critical' : isLate ? 'warning' : 'healthy',
                  health_score: failedRecent ? 68 : isLate ? 84 : 100,
                  freshness_label: freshLabel,
                  is_late: isLate,
                  sla_minutes: slaMin,
                  fabric_item_url: fabricItemUrl,
                  runs,
                  lag_points: lagPoints,
                  diagnostics,
                };
              }),
            );
          } catch {
            return [];
          }
        }),
      );
      jobsJson = JSON.stringify(perWsItems.flat());
    }

    const firstSched = schedData.value?.[0];
    const latestJob = jobsData.value?.[0];

    return {
      ok: true,
      workspaceId,
      notebookId,
      scheduleEnabled: Boolean(firstSched?.enabled),
      intervalMinutes: Number(firstSched?.configuration?.interval || 36),
      jobStatus: latestJob?.status ?? 'Idle',
      workspacesJson: JSON.stringify(discoveredWorkspaces),
      jobsJson,
      message: firstSched?.enabled
        ? `Scheduled every ${firstSched.configuration?.interval ?? 36}m`
        : 'Schedule paused (manual mode)',
    };
  },
  [],
);

