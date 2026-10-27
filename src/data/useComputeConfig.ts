import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspace, type WorkspaceOption } from '../app/WorkspaceProvider';
import { client, getRuntimeWorkspaceId, isHostWorkspace } from './client';
import { invalidateQueryCache } from './queryCache';
import { useCurrentSteward } from './useCurrentSteward';

export const DEFAULT_COMPUTE_CADENCE_MINUTES = 36;
export const COMPUTE_CONFIG_EVENT = 'governly:compute-config-changed';
export const ALL_WORKSPACES_EVENT = 'governly:all-workspaces-changed';
export const LIVE_RUNTIME_JOBS_EVENT = 'governly:live-runtime-jobs-changed';
const COMPUTE_CONFIG_STORAGE_KEY = 'governly:compute-config:v2';
const SYNCED_EXCLUDED_STORAGE_KEY = 'governly:synced-excluded-ws:v1';
const ALL_WORKSPACES_STORAGE_KEY = 'governly:all-workspaces:v1';
const LIVE_RUNTIME_JOBS_STORAGE_KEY = 'governly:live-runtime-jobs:v1';
const COMPUTE_CONFIG_RULE_ID = '00000000-0000-0000-0000-00000000c001';

export interface LiveRuntimeJobRun {
  run_id: string;
  time: string;
  lag: string;
  lag_minutes: number;
  rows: string;
  result: 'ok' | 'breach';
  label: string;
}

export interface LiveRuntimeJobDiagnostic {
  id: string;
  assetKey: string;
  assetType: string;
  runId: string;
  statusLabel: 'Run Failed' | 'SLA Breach';
  errorCode: string;
  whyFailed: string;
  possibleSolution: string;
  detectedAt: string;
}

export interface LiveRuntimeJobItem {
  workspace_id: string;
  workspace_name: string;
  asset_key: string;
  name: string;
  asset_type: 'Spark notebook' | 'Data pipeline';
  status: 'healthy' | 'warning' | 'critical';
  health_score: number;
  freshness_label: string;
  is_late: boolean;
  sla_minutes: number;
  fabric_item_url: string;
  runs: LiveRuntimeJobRun[];
  lag_points: number[];
  diagnostics: LiveRuntimeJobDiagnostic[];
}

export function loadCachedRuntimeJobs(): LiveRuntimeJobItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LIVE_RUNTIME_JOBS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LiveRuntimeJobItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCachedRuntimeJobs(items: LiveRuntimeJobItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LIVE_RUNTIME_JOBS_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(LIVE_RUNTIME_JOBS_EVENT));
  } catch {
    // ignore storage errors
  }
}

function loadSyncedExcludedIds(fallback: string[]): string[] {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(SYNCED_EXCLUDED_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch {
    return fallback;
  }
}

function saveSyncedExcludedIds(ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = Array.from(new Set(ids.map(String))).sort();
    window.localStorage.setItem(SYNCED_EXCLUDED_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(COMPUTE_CONFIG_EVENT));
  } catch {
    // ignore
  }
}

let localMutationSeq = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

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
  hasCompletedScan: boolean;
  notebookParams: NotebookRuntimeParams;
  updatedAt: number;
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
  hasCompletedScan: false,
  notebookParams: DEFAULT_NOTEBOOK_PARAMS,
  updatedAt: 0,
};

export function normalizeComputeConfig(raw: Partial<ComputeConfigState> | null | undefined): ComputeConfigState {
  if (!raw) return DEFAULT_STATE;
  const rawParams = (raw.notebookParams ?? {}) as Partial<NotebookRuntimeParams>;
  return {
    scheduleEnabled: Boolean(raw.scheduleEnabled ?? false),
    intervalMinutes:
      typeof raw.intervalMinutes === 'number' && raw.intervalMinutes > 0
        ? raw.intervalMinutes
        : DEFAULT_COMPUTE_CADENCE_MINUTES,
    excludedWorkspaceIds: Array.isArray(raw.excludedWorkspaceIds)
      ? Array.from(new Set(raw.excludedWorkspaceIds.map(String)))
      : [],
    hasCompletedScan: Boolean(raw.hasCompletedScan ?? false),
    notebookParams: {
      tenantId: String(rawParams.tenantId ?? ''),
      clientId: String(rawParams.clientId ?? ''),
      keyVaultUri: String(rawParams.keyVaultUri ?? ''),
      secretName: String(rawParams.secretName || 'governly-graph-sync'),
    },
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

export function loadLocalComputeConfig(): ComputeConfigState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw =
      window.localStorage.getItem(COMPUTE_CONFIG_STORAGE_KEY) ??
      window.localStorage.getItem('governly:compute-config:v1');
    if (!raw) return DEFAULT_STATE;
    return normalizeComputeConfig(JSON.parse(raw) as Partial<ComputeConfigState>);
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveLocalComputeConfig(next: ComputeConfigState, isUserAction = false): void {
  if (typeof window === 'undefined') return;
  if (isUserAction) {
    localMutationSeq += 1;
  }
  const normalized: ComputeConfigState = {
    ...normalizeComputeConfig(next),
    updatedAt: isUserAction ? Date.now() : next.updatedAt || 0,
  };
  try {
    window.localStorage.setItem(COMPUTE_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(COMPUTE_CONFIG_EVENT));
  } catch {
    // ignore storage errors
  }
}

export function loadCachedAllWorkspaces(): WorkspaceOption[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ALL_WORKSPACES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkspaceOption[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (w) => Boolean(w?.workspace_id) && !isHostWorkspace(w.workspace_id, w.display_name),
    );
  } catch {
    return [];
  }
}

export function saveCachedAllWorkspaces(
  workspaces: WorkspaceOption[],
  knownHostWorkspaceId?: string | null,
): WorkspaceOption[] {
  const byId = new Map<string, WorkspaceOption>();
  for (const w of loadCachedAllWorkspaces()) {
    if (
      w?.workspace_id &&
      w.workspace_id !== knownHostWorkspaceId &&
      !isHostWorkspace(w.workspace_id, w.display_name)
    ) {
      byId.set(w.workspace_id, w);
    }
  }
  for (const w of workspaces) {
    if (
      !w?.workspace_id ||
      w.workspace_id === knownHostWorkspaceId ||
      isHostWorkspace(w.workspace_id, w.display_name)
    ) {
      continue;
    }
    byId.set(w.workspace_id, {
      workspace_id: w.workspace_id,
      display_name: w.display_name || w.workspace_id,
      role: w.role || 'Admin',
      capacity_sku: w.capacity_sku || 'F2',
    });
  }
  const merged = Array.from(byId.values()).sort((a, b) =>
    a.display_name.localeCompare(b.display_name),
  );
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(ALL_WORKSPACES_STORAGE_KEY, JSON.stringify(merged));
      window.dispatchEvent(new CustomEvent(ALL_WORKSPACES_EVENT));
    } catch {
      // ignore storage errors
    }
  }
  return merged;
}

export function useComputeConfig() {
  const { allWorkspaces, resolveWriteWorkspaceId, refreshData } = useWorkspace();
  const steward = useCurrentSteward();
  const [config, setConfig] = useState<ComputeConfigState>(loadLocalComputeConfig);
  const [syncedExcludedIds, setSyncedExcludedIds] = useState<string[]>(() =>
    loadSyncedExcludedIds(loadLocalComputeConfig().excludedWorkspaceIds),
  );
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [savingWorkspaces, setSavingWorkspaces] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [jobStatus, setJobStatus] = useState<string>('Idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const stewardRef = useRef(steward);
  stewardRef.current = steward;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onSync = () => {
      const latest = loadLocalComputeConfig();
      setConfig(latest);
      setSyncedExcludedIds(loadSyncedExcludedIds(latest.excludedWorkspaceIds));
    };
    window.addEventListener(COMPUTE_CONFIG_EVENT, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(COMPUTE_CONFIG_EVENT, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  const persistConfigToSql = useCallback(
    async (stateToPersist: ComputeConfigState) => {
      const targetWs = getRuntimeWorkspaceId(resolveWriteWorkspaceId());
      const stewardName = stewardRef.current.entra?.display_name ?? 'Marco Österlin';
      const payloadStr = JSON.stringify(stateToPersist);
      const now = new Date();

      const existing = await client.data.QualityRule.select(['id', 'rule_type'])
        .where({ rule_type: { eq: 'compute_config' } })
        .execute()
        .catch(() => []);

      const matched = Array.isArray(existing) ? existing[0] : undefined;
      if (matched?.id) {
        await client.data.QualityRule.update(
          { id: matched.id },
          {
            rule_name: 'Governly Compute Configuration',
            expression: payloadStr,
            threshold_pct: stateToPersist.intervalMinutes,
            is_active: true,
            updated_at: now,
          },
        );
      } else {
        await client.data.QualityRule.create({
          id: COMPUTE_CONFIG_RULE_ID,
          workspace_id: targetWs,
          asset_key: '*',
          rule_name: 'Governly Compute Configuration',
          rule_type: 'compute_config',
          expression: payloadStr,
          threshold_pct: stateToPersist.intervalMinutes,
          severity: 'Low',
          is_active: true,
          created_by: stewardName,
          created_at: now,
          updated_at: now,
        });
      }
    },
    [resolveWriteWorkspaceId],
  );

  const scheduleSqlPersist = useCallback(
    (nextState: ComputeConfigState) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void persistConfigToSql(nextState).catch(() => {
          // localStorage already has the authoritative state
        });
      }, 350);
    },
    [persistConfigToSql],
  );

  // Load persisted compute_config from SQL + live Fabric UDF status without ever overwriting newer local edits
  useEffect(() => {
    let cancelled = false;
    const seqAtStart = localMutationSeq;

    void (async () => {
      try {
        const ruleRows = await client.data.QualityRule.select([
          'id',
          'asset_key',
          'rule_type',
          'expression',
          'threshold_pct',
          'is_active',
        ])
          .execute()
          .catch(
            () =>
              [] as Array<{
                id?: string;
                asset_key?: string;
                rule_type?: string;
                expression?: string;
                threshold_pct?: number;
                is_active?: boolean;
              }>,
          );

        if (cancelled || localMutationSeq !== seqAtStart) return;
        if (!Array.isArray(ruleRows) || ruleRows.length === 0) return;

        const local = loadLocalComputeConfig();
        const unifiedRow = ruleRows.find(
          (r) => r.is_active !== false && r.rule_type === 'compute_config' && r.expression,
        );

        if (unifiedRow?.expression) {
          try {
            const parsed = normalizeComputeConfig(
              JSON.parse(String(unifiedRow.expression)) as Partial<ComputeConfigState>,
            );
            if (parsed.updatedAt >= local.updatedAt) {
              saveLocalComputeConfig(parsed, false);
              saveSyncedExcludedIds(parsed.excludedWorkspaceIds);
            }
            return;
          } catch {
            // fallback to legacy rows below
          }
        }

        // Only hydrate from legacy rows if user has never saved locally
        if (local.updatedAt > 0) return;
        let schedEnabled = local.scheduleEnabled;
        let intervalMin = local.intervalMinutes;
        let nbParams: NotebookRuntimeParams = { ...local.notebookParams };
        const excluded = new Set<string>(local.excludedWorkspaceIds);

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
              // ignore
            }
          } else if (r.rule_type === 'workspace_monitor' && r.asset_key) {
            const isExcluded =
              String(r.expression ?? '').toLowerCase() === 'excluded' ||
              Number(r.threshold_pct ?? 100) <= 0;
            if (isExcluded) excluded.add(String(r.asset_key));
          }
        }

        saveLocalComputeConfig(
          {
            ...local,
            scheduleEnabled: schedEnabled,
            intervalMinutes: intervalMin,
            excludedWorkspaceIds: Array.from(excluded),
            notebookParams: nbParams,
          },
          false,
        );
      } catch {
        // ignore offline errors
      }
    })();

    void (async () => {
      try {
        const hostWsId = getRuntimeWorkspaceId(resolveWriteWorkspaceId());
        const res = await client.functions.manageComputeNotebook.invoke({
          hostWorkspaceId: hostWsId,
          action: 'status',
          scheduleEnabled: false,
          intervalMinutes: DEFAULT_COMPUTE_CADENCE_MINUTES,
        });
        if (cancelled) return;
        if (res?.ok) {
          if (res.jobStatus) setJobStatus(res.jobStatus);
          if (res.workspacesJson) {
            try {
              const discovered = JSON.parse(res.workspacesJson) as WorkspaceOption[];
              if (Array.isArray(discovered) && discovered.length > 0) {
                saveCachedAllWorkspaces(discovered, res.workspaceId);
              }
            } catch {
              // ignore
            }
          }
          const rawJobsJson = (res as unknown as { jobsJson?: string }).jobsJson;
          if (rawJobsJson) {
            try {
              const parsedJobs = JSON.parse(rawJobsJson) as LiveRuntimeJobItem[];
              if (Array.isArray(parsedJobs)) {
                saveCachedRuntimeJobs(parsedJobs);
              }
            } catch {
              // ignore
            }
          }
          if (localMutationSeq === seqAtStart) {
            const local = loadLocalComputeConfig();
            saveLocalComputeConfig(
              {
                ...local,
                scheduleEnabled: Boolean(res.scheduleEnabled),
                intervalMinutes:
                  res.intervalMinutes && res.intervalMinutes > 0
                    ? res.intervalMinutes
                    : local.intervalMinutes || DEFAULT_COMPUTE_CADENCE_MINUTES,
              },
              false,
            );
          }
        }
      } catch {
        // Functions endpoint optional in unit tests / offline mode
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resolveWriteWorkspaceId]);

  const toggleWorkspaceIncluded = useCallback(
    async (workspaceId: string, _workspaceName: string, include: boolean) => {
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
        updatedAt: Date.now(),
      };
      saveLocalComputeConfig(next, true);
      scheduleSqlPersist(next);
    },
    [scheduleSqlPersist],
  );

  const setAllWorkspacesIncluded = useCallback(
    async (includeAll: boolean) => {
      const current = loadLocalComputeConfig();
      const sourceList = allWorkspaces.length > 0 ? allWorkspaces : loadCachedAllWorkspaces();
      const nextExcluded = includeAll
        ? []
        : sourceList.slice(1).map((w) => w.workspace_id);
      const next: ComputeConfigState = {
        ...current,
        excludedWorkspaceIds: nextExcluded,
        updatedAt: Date.now(),
      };
      saveLocalComputeConfig(next, true);
      scheduleSqlPersist(next);
    },
    [allWorkspaces, scheduleSqlPersist],
  );

  const updateSchedule = useCallback(
    async (scheduleEnabled: boolean, intervalMinutes: number) => {
      const clamped = Math.max(
        1,
        Math.min(1440, Math.round(intervalMinutes || DEFAULT_COMPUTE_CADENCE_MINUTES)),
      );
      const current = loadLocalComputeConfig();
      const next: ComputeConfigState = {
        ...current,
        scheduleEnabled,
        intervalMinutes: clamped,
        updatedAt: Date.now(),
      };
      saveLocalComputeConfig(next, true);
      setSavingSchedule(true);
      setStatusMessage(null);

      try {
        await persistConfigToSql(next);
        saveSyncedExcludedIds(next.excludedWorkspaceIds);
        const hostWsId = getRuntimeWorkspaceId(resolveWriteWorkspaceId());
        await client.functions.manageComputeNotebook.invoke({
          hostWorkspaceId: hostWsId,
          action: 'schedule',
          scheduleEnabled,
          intervalMinutes: clamped,
        });
        const sourceList = allWorkspaces.length > 0 ? allWorkspaces : loadCachedAllWorkspaces();
        const exSet = new Set(next.excludedWorkspaceIds);
        const incCount = sourceList.filter((w) => !exSet.has(w.workspace_id)).length;
        setStatusMessage(
          scheduleEnabled
            ? `✓ Recurring schedule active (every ${clamped}m) across ${incCount || sourceList.length} monitored workspace(s).`
            : 'Recurring compute schedule paused.',
        );
      } catch {
        saveSyncedExcludedIds(next.excludedWorkspaceIds);
        setStatusMessage(
          scheduleEnabled
            ? `Schedule preference saved (every ${clamped}m).`
            : 'Schedule preference saved (paused).',
        );
      } finally {
        setSavingSchedule(false);
      }
    },
    [allWorkspaces, persistConfigToSql, resolveWriteWorkspaceId],
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
        updatedAt: Date.now(),
      };
      saveLocalComputeConfig(next, true);
      setSavingSchedule(true);
      setStatusMessage(null);
      try {
        await persistConfigToSql(next);
        setStatusMessage('Notebook parameters saved to App SQL Database.');
      } catch {
        setStatusMessage('Notebook parameters saved locally.');
      } finally {
        setSavingSchedule(false);
      }
    },
    [persistConfigToSql],
  );

  const triggerComputeNow = useCallback(async () => {
    setTriggering(true);
    setStatusMessage(null);
    try {
      const current = loadLocalComputeConfig();
      const next: ComputeConfigState = {
        ...current,
        hasCompletedScan: true,
        updatedAt: Date.now(),
      };
      saveLocalComputeConfig(next, true);
      saveSyncedExcludedIds(next.excludedWorkspaceIds);
      await persistConfigToSql(next).catch(() => undefined);

      const hostWsId = getRuntimeWorkspaceId(resolveWriteWorkspaceId());
      const res = await client.functions.manageComputeNotebook.invoke({
        hostWorkspaceId: hostWsId,
        action: 'trigger',
        scheduleEnabled: next.scheduleEnabled,
        intervalMinutes: next.intervalMinutes,
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
  }, [persistConfigToSql, refreshData, resolveWriteWorkspaceId]);

  const applyWorkspacesToSchedule = useCallback(
    async (enableRecurring = true, runNow = false) => {
      const current = loadLocalComputeConfig();
      const nextScheduleEnabled = enableRecurring ? true : current.scheduleEnabled;
      const next: ComputeConfigState = {
        ...current,
        scheduleEnabled: nextScheduleEnabled,
        hasCompletedScan: runNow ? true : current.hasCompletedScan,
        updatedAt: Date.now(),
      };
      saveLocalComputeConfig(next, true);
      setSavingWorkspaces(true);
      setStatusMessage(null);

      const sourceList = allWorkspaces.length > 0 ? allWorkspaces : loadCachedAllWorkspaces();
      const exSet = new Set(next.excludedWorkspaceIds);
      const incCount = sourceList.filter((w) => !exSet.has(w.workspace_id)).length;
      const totalCount = sourceList.length || incCount;

      try {
        await persistConfigToSql(next);
        saveSyncedExcludedIds(next.excludedWorkspaceIds);
        const hostWsId = getRuntimeWorkspaceId(resolveWriteWorkspaceId());
        if (nextScheduleEnabled) {
          await client.functions.manageComputeNotebook
            .invoke({
              hostWorkspaceId: hostWsId,
              action: 'schedule',
              scheduleEnabled: true,
              intervalMinutes: next.intervalMinutes,
            })
            .catch(() => undefined);
        }
        if (runNow) {
          const trigRes = await client.functions.manageComputeNotebook.invoke({
            hostWorkspaceId: hostWsId,
            action: 'trigger',
            scheduleEnabled: nextScheduleEnabled,
            intervalMinutes: next.intervalMinutes,
          });
          if (trigRes?.ok) {
            setJobStatus('InProgress');
          }
          setStatusMessage(
            `✓ Added ${incCount} of ${totalCount} workspaces to recurring schedule (every ${next.intervalMinutes}m) and triggered compute notebook run now.`,
          );
        } else {
          setStatusMessage(
            nextScheduleEnabled
              ? `✓ Added ${incCount} of ${totalCount} workspaces to recurring schedule (every ${next.intervalMinutes}m). Next scheduled notebook run will scan all ${incCount} workspaces.`
              : `✓ Saved ${incCount} of ${totalCount} monitored workspaces to nb_governly_compute_publish.`,
          );
        }
        invalidateQueryCache();
        refreshData();
      } catch {
        saveSyncedExcludedIds(next.excludedWorkspaceIds);
        setStatusMessage(
          `✓ Saved ${incCount} of ${totalCount} monitored workspaces for recurring notebook runs.`,
        );
      } finally {
        setSavingWorkspaces(false);
      }
    },
    [allWorkspaces, persistConfigToSql, refreshData, resolveWriteWorkspaceId],
  );

  const currentExSorted = [...config.excludedWorkspaceIds].sort().join(',');
  const syncedExSorted = [...syncedExcludedIds].sort().join(',');
  const hasUnsavedWorkspaces = currentExSorted !== syncedExSorted;

  return {
    config,
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
  };
}

export function useLiveRuntimeJobs(): LiveRuntimeJobItem[] {
  const { resolveWriteWorkspaceId, refreshTick } = useWorkspace();
  const [jobs, setJobs] = useState<LiveRuntimeJobItem[]>(loadCachedRuntimeJobs);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onUpdate = () => setJobs(loadCachedRuntimeJobs());
    window.addEventListener(LIVE_RUNTIME_JOBS_EVENT, onUpdate);
    window.addEventListener('storage', onUpdate);
    return () => {
      window.removeEventListener(LIVE_RUNTIME_JOBS_EVENT, onUpdate);
      window.removeEventListener('storage', onUpdate);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const hostWsId = getRuntimeWorkspaceId(resolveWriteWorkspaceId());
        const res = await client.functions.manageComputeNotebook.invoke({
          hostWorkspaceId: hostWsId,
          action: 'jobs',
          scheduleEnabled: false,
          intervalMinutes: DEFAULT_COMPUTE_CADENCE_MINUTES,
        });
        if (cancelled || !res?.ok) return;
        const rawJson = (res as unknown as { jobsJson?: string }).jobsJson;
        if (rawJson) {
          const parsed = JSON.parse(rawJson) as LiveRuntimeJobItem[];
          if (Array.isArray(parsed)) {
            saveCachedRuntimeJobs(parsed);
          }
        }
      } catch {
        // Optional in unit tests / offline mode
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolveWriteWorkspaceId, refreshTick]);

  return jobs;
}
