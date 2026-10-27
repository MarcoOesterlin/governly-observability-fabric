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
  message: string;
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
        `${FABRIC_API}/workspaces/${workspaceId}/items/${notebookId}/schedules?jobType=RunNotebook`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const listData = listRes.ok
        ? ((await listRes.json()) as { value?: Array<{ id: string }> })
        : { value: [] };
      const existingId = listData.value?.[0]?.id;

      const saveRes = existingId
        ? await fetch(
            `${FABRIC_API}/workspaces/${workspaceId}/items/${notebookId}/schedules/${existingId}?jobType=RunNotebook`,
            {
              method: 'PATCH',
              headers,
              body: JSON.stringify(schedPayload),
            },
          )
        : await fetch(
            `${FABRIC_API}/workspaces/${workspaceId}/items/${notebookId}/schedules?jobType=RunNotebook`,
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

    // Default: 'status'
    const [schedRes, jobsRes, wsListRes] = await Promise.all([
      fetch(
        `${FABRIC_API}/workspaces/${workspaceId}/items/${notebookId}/schedules?jobType=RunNotebook`,
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
          value?: Array<{ id: string; status?: string; startTimeUtc?: string; endTimeUtc?: string }>;
        })
      : { value: [] };
    const wsListData = wsListRes.ok
      ? ((await wsListRes.json()) as {
          value?: Array<{ id: string; displayName?: string; type?: string; capacityId?: string }>;
        })
      : { value: [] };

    const discoveredWorkspaces = (wsListData.value ?? [])
      .filter((w) => w.type === 'Workspace' && Boolean(w.capacityId))
      .map((w) => ({
        workspace_id: w.id,
        display_name: w.displayName || w.id,
        capacity_sku: 'F2',
      }));

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
      message: firstSched?.enabled
        ? `Scheduled every ${firstSched.configuration?.interval ?? 36}m`
        : 'Schedule paused (manual mode)',
    };
  },
  [],
);

