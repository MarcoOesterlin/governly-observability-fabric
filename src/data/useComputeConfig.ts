import { useCallback, useEffect, useState } from 'react';
import { useWorkspace, type WorkspaceOption } from '../app/WorkspaceProvider';
import { client, getRuntimeWorkspaceId } from './client';
import { invalidateQueryCache } from './queryCache';
import { useCurrentSteward } from './useCurrentSteward';

export const DEFAULT_COMPUTE_CADENCE_MINUTES = 36;
export const COMPUTE_CONFIG_EVENT = 'governly:compute-config-changed';
const COMPUTE_CONFIG_STORAGE_KEY = 'governly:compute-config:v1';

export const COMPUTE_CADENCE_PRESETS: Array<{ label: string; minutes: number }> = [
  { label: 'Every 15m', minutes: 15 },
  { label: 'Every 30m', minutes: 30 },
  { label: 'Every 36m (Default)', minutes: 36 },
  { label: 'Every 1h', minutes: 60 },
  { label: 'Every 2h', minutes: 120 },
  { label: 'Every 4h', minutes: 240 },
  { label: 'Every 6h', minutes: 360 },
  { label: 'Every 12h', minutes: 720 },
  { label: 'Every 24h (Daily)', minutes: 1440 },
];

export interface NotebookRuntimeParams {
  tenantId: string;
  clientId: string;
  keyVaultUri: string;
  secretName: string;
}

export interface ComputeConfigState {
  scheduleEnabled: boolean;
  intervalMinutes: number;
  excludedWorkspaceIds: string[];
  notebookParams: NotebookRuntimeParams;
}

const DEFAULT_NOTEBOOK_PARAMS: NotebookRuntimeParams = {
  tenantId: '',
  clientId: '',
  keyVaultUri: '',
  secretName: 'governly-graph-sync',
};

const DEFAULT_STATE: ComputeConfigState = {
  scheduleEnabled: false,
  intervalMinutes: DEFAULT_COMPUTE_CADENCE_MINUTES,
  excludedWorkspaceIds: [],
  notebookParams: DEFAULT_NOTEBOOK_PARAMS,
};

export function loadLocalComputeConfig(): ComputeConfigState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(COMPUTE_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<ComputeConfigState>;
    const rawParams = (parsed.notebookParams ?? {}) as Partial<NotebookRuntimeParams>;
    return {
      scheduleEnabled: Boolean(parsed.scheduleEnabled ?? false),
      intervalMinutes:
        typeof parsed.intervalMinutes === 'number' && parsed.intervalMinutes > 0
          ? parsed.intervalMinutes
          : DEFAULT_COMPUTE_CADENCE_MINUTES,
      excludedWorkspaceIds: Array.isArray(parsed.excludedWorkspaceIds)
        ? parsed.excludedWorkspaceIds.map(String)
        : [],
      notebookParams: {
        tenantId: String(rawParams.tenantId ?? ''),
        clientId: String(rawParams.clientId ?? ''),
        keyVaultUri: String(rawParams.keyVaultUri ?? ''),
        secretName: String(rawParams.secretName ?? 'governly-graph-sync'),
      },
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveLocalComputeConfig(next: ComputeConfigState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(COMPUTE_CONFIG_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(COMPUTE_CONFIG_EVENT));
  } catch {
    // ignore storage errors
  }
}

export function useComputeConfig() {
  const { resolveWriteWorkspaceId, refreshData } = useWorkspace();
  const steward = useCurrentSteward();
  const [config, setConfig] = useState<ComputeConfigState>(loadLocalComputeConfig);
  const [allWorkspaces, setAllWorkspaces] = useState<WorkspaceOption[]>([]);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [jobStatus, setJobStatus] = useState<string>('Idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onSync = () => setConfig(loadLocalComputeConfig());
    window.addEventListener(COMPUTE_CONFIG_EVENT, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(COMPUTE_CONFIG_EVENT, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  // Load all discovered workspaces (including unmonitored ones) + persisted QualityRule config
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [wsRows, ruleRows] = await Promise.all([
          client.data.PubWorkspace.select([
            'workspace_id',
            'display_name',
            'capacity_sku',
            'is_monitored',
          ])
            .execute()
            .catch(() => []),
          client.data.QualityRule.select([
            'id',
            'asset_key',
            'rule_type',
            'expression',
            'threshold_pct',
            'is_active',
          ])
            .execute()
            .catch(() => []),
        ]);
        if (cancelled) return;

        if (Array.isArray(wsRows) && wsRows.length > 0) {
          const seen = new Set<string>();
          const list: WorkspaceOption[] = [];
          for (const w of wsRows) {
            if (!w.workspace_id || seen.has(w.workspace_id)) continue;
            seen.add(w.workspace_id);
            list.push({
              workspace_id: w.workspace_id,
              display_name: w.display_name,
              role: 'Admin',
              capacity_sku: w.capacity_sku ?? 'F2',
            });
          }
          setAllWorkspaces(list);
        }

        if (Array.isArray(ruleRows) && ruleRows.length > 0) {
          const current = loadLocalComputeConfig();
          let schedEnabled = current.scheduleEnabled;
          let intervalMin = current.intervalMinutes;
          let nbParams: NotebookRuntimeParams = { ...current.notebookParams };
          const excluded = new Set<string>(current.excludedWorkspaceIds);

          for (const r of ruleRows) {
            if (r.is_active === false) continue;
            if (r.rule_type === 'compute_schedule') {
              schedEnabled = String(r.expression ?? '').toLowerCase() === 'enabled';
              const mins = Number(r.threshold_pct ?? DEFAULT_COMPUTE_CADENCE_MINUTES);
              if (mins > 0) intervalMin = mins;
            } else if (r.rule_type === 'notebook_params' && r.expression) {
              try {
                const parsed = JSON.parse(String(r.expression)) as Partial<NotebookRuntimeParams>;
                nbParams = {
                  tenantId: String(parsed.tenantId ?? ''),
                  clientId: String(parsed.clientId ?? ''),
                  keyVaultUri: String(parsed.keyVaultUri ?? ''),
                  secretName: String(parsed.secretName || 'governly-graph-sync'),
                };
              } catch {
                // ignore malformed json
              }
            } else if (r.rule_type === 'workspace_monitor' && r.asset_key) {
              const isExcluded =
                String(r.expression ?? '').toLowerCase() === 'excluded' ||
                Number(r.threshold_pct ?? 100) <= 0;
              if (isExcluded) {
                excluded.add(String(r.asset_key));
              } else {
                excluded.delete(String(r.asset_key));
              }
            }
          }

          const merged: ComputeConfigState = {
            scheduleEnabled: schedEnabled,
            intervalMinutes: intervalMin,
            excludedWorkspaceIds: Array.from(excluded),
            notebookParams: nbParams,
          };
          saveLocalComputeConfig(merged);
        }
      } catch {
        // ignore offline errors
      }
    })();

    // Also query live Fabric notebook schedule status via Rayfin UDF if available
    void (async () => {
      try {
        const hostWsId = getRuntimeWorkspaceId(resolveWriteWorkspaceId());
        const res = await client.functions.manageComputeNotebook.invoke({
          hostWorkspaceId: hostWsId,
          action: 'status',
          scheduleEnabled: false,
          intervalMinutes: DEFAULT_COMPUTE_CADENCE_MINUTES,
        });
        if (!cancelled && res?.ok) {
          if (res.jobStatus) setJobStatus(res.jobStatus);
          const local = loadLocalComputeConfig();
          const next: ComputeConfigState = {
            ...local,
            scheduleEnabled: Boolean(res.scheduleEnabled),
            intervalMinutes:
              res.intervalMinutes && res.intervalMinutes > 0
                ? res.intervalMinutes
                : local.intervalMinutes || DEFAULT_COMPUTE_CADENCE_MINUTES,
          };
          saveLocalComputeConfig(next);
        }
      } catch {
        // Functions endpoint optional in unit tests / offline mode
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolveWriteWorkspaceId]);

  const upsertConfigRule = useCallback(
    async (params: {
      ruleType: 'compute_schedule' | 'workspace_monitor' | 'notebook_params';
      assetKey: string;
      ruleName: string;
      expression: string;
      thresholdPct: number;
    }) => {
      const targetWs = getRuntimeWorkspaceId(resolveWriteWorkspaceId());
      const stewardName = steward.entra?.display_name ?? 'Marco Österlin';

      const existing = await client.data.QualityRule.select([
        'id',
        'asset_key',
        'rule_type',
      ])
        .where({ asset_key: { eq: params.assetKey } })
        .execute()
        .catch(() => []);

      const matched = (Array.isArray(existing) ? existing : []).find(
        (r) => r.rule_type === params.ruleType,
      );

      if (matched?.id) {
        await client.data.QualityRule.update(
          { id: matched.id },
          {
            rule_name: params.ruleName,
            expression: params.expression,
            threshold_pct: params.thresholdPct,
            is_active: true,
            updated_at: new Date(),
          },
        );
      } else {
        await client.data.QualityRule.create({
          workspace_id: targetWs,
          asset_key: params.assetKey,
          rule_name: params.ruleName,
          rule_type: params.ruleType,
          expression: params.expression,
          threshold_pct: params.thresholdPct,
          severity: 'Low',
          is_active: true,
          created_by: stewardName,
          created_at: new Date(),
          updated_at: new Date(),
        });
      }
    },
    [resolveWriteWorkspaceId, steward.entra],
  );

  const toggleWorkspaceIncluded = useCallback(
    async (workspaceId: string, workspaceName: string, include: boolean) => {
      const current = loadLocalComputeConfig();
      const set = new Set(current.excludedWorkspaceIds);
      if (include) {
        set.delete(workspaceId);
      } else {
        set.add(workspaceId);
      }
      const next: ComputeConfigState = {
        ...current,
        excludedWorkspaceIds: Array.from(set),
      };
      saveLocalComputeConfig(next);

      try {
        await upsertConfigRule({
          ruleType: 'workspace_monitor',
          assetKey: workspaceId,
          ruleName: `Monitor Workspace: ${workspaceName}`,
          expression: include ? 'included' : 'excluded',
          thresholdPct: include ? 100 : 0,
        });
      } catch {
        // local state already updated
      }
    },
    [upsertConfigRule],
  );

  const setAllWorkspacesIncluded = useCallback(
    async (includeAll: boolean) => {
      const current = loadLocalComputeConfig();
      const nextExcluded = includeAll
        ? []
        : allWorkspaces.slice(1).map((w) => w.workspace_id); // Keep at least 1 workspace monitored
      const next: ComputeConfigState = {
        ...current,
        excludedWorkspaceIds: nextExcluded,
      };
      saveLocalComputeConfig(next);

      try {
        await Promise.all(
          allWorkspaces.map((w) => {
            const inc = !nextExcluded.includes(w.workspace_id);
            return upsertConfigRule({
              ruleType: 'workspace_monitor',
              assetKey: w.workspace_id,
              ruleName: `Monitor Workspace: ${w.display_name}`,
              expression: inc ? 'included' : 'excluded',
              thresholdPct: inc ? 100 : 0,
            });
          }),
        );
      } catch {
        // ignore offline errors
      }
    },
    [allWorkspaces, upsertConfigRule],
  );

  const updateSchedule = useCallback(
    async (scheduleEnabled: boolean, intervalMinutes: number) => {
      const clamped = Math.max(1, Math.min(1440, Math.round(intervalMinutes || DEFAULT_COMPUTE_CADENCE_MINUTES)));
      const current = loadLocalComputeConfig();
      const next: ComputeConfigState = {
        ...current,
        scheduleEnabled,
        intervalMinutes: clamped,
      };
      saveLocalComputeConfig(next);
      setSavingSchedule(true);
      setStatusMessage(null);

      try {
        await upsertConfigRule({
          ruleType: 'compute_schedule',
          assetKey: '*',
          ruleName: 'Compute Schedule Cadence',
          expression: scheduleEnabled ? 'enabled' : 'disabled',
          thresholdPct: clamped,
        });

        const hostWsId = getRuntimeWorkspaceId(resolveWriteWorkspaceId());
        const res = await client.functions.manageComputeNotebook.invoke({
          hostWorkspaceId: hostWsId,
          action: 'schedule',
          scheduleEnabled,
          intervalMinutes: clamped,
        });
        setStatusMessage(
          res?.message ||
            (scheduleEnabled
              ? `Recurring compute schedule enabled (every ${clamped}m).`
              : 'Recurring compute schedule paused.'),
        );
      } catch {
        setStatusMessage(
          scheduleEnabled
            ? `Schedule preference saved (every ${clamped}m).`
            : 'Schedule preference saved (paused).',
        );
      } finally {
        setSavingSchedule(false);
      }
    },
    [resolveWriteWorkspaceId, upsertConfigRule],
  );

  const saveNotebookParams = useCallback(
    async (params: NotebookRuntimeParams) => {
      const normalized: NotebookRuntimeParams = {
        tenantId: params.tenantId.trim(),
        clientId: params.clientId.trim(),
        keyVaultUri: params.keyVaultUri.trim(),
        secretName: params.secretName.trim() || 'governly-graph-sync',
      };
      const current = loadLocalComputeConfig();
      const next: ComputeConfigState = {
        ...current,
        notebookParams: normalized,
      };
      saveLocalComputeConfig(next);
      setSavingSchedule(true);
      setStatusMessage(null);
      try {
        await upsertConfigRule({
          ruleType: 'notebook_params',
          assetKey: '*',
          ruleName: 'Notebook Runtime Parameters',
          expression: JSON.stringify(normalized),
          thresholdPct: 100,
        });
        setStatusMessage('Notebook parameters saved to App SQL Database.');
      } catch {
        setStatusMessage('Notebook parameters saved locally.');
      } finally {
        setSavingSchedule(false);
      }
    },
    [upsertConfigRule],
  );

  const triggerComputeNow = useCallback(async () => {
    setTriggering(true);
    setStatusMessage(null);
    try {
      const hostWsId = getRuntimeWorkspaceId(resolveWriteWorkspaceId());
      const res = await client.functions.manageComputeNotebook.invoke({
        hostWorkspaceId: hostWsId,
        action: 'trigger',
        scheduleEnabled: config.scheduleEnabled,
        intervalMinutes: config.intervalMinutes,
      });
      if (res?.ok) {
        setJobStatus('InProgress');
        setStatusMessage(res.message);
        invalidateQueryCache();
        refreshData();
      } else {
        setStatusMessage(res?.message || 'Unable to trigger compute notebook.');
      }
    } catch (err) {
      setStatusMessage(
        `Could not reach Fabric Functions endpoint: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    } finally {
      setTriggering(false);
    }
  }, [config.intervalMinutes, config.scheduleEnabled, refreshData, resolveWriteWorkspaceId]);

  return {
    config,
    allWorkspaces,
    savingSchedule,
    triggering,
    jobStatus,
    statusMessage,
    toggleWorkspaceIncluded,
    setAllWorkspacesIncluded,
    updateSchedule,
    saveNotebookParams,
    triggerComputeNow,
  };
}
