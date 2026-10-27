/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getRuntimeWorkspaceId, isHostWorkspace } from "../data/client";
import { invalidateQueryCache } from "../data/queryCache";
import { fetchSharedPubWorkspaces, preloadAllSharedTables } from "../data/sharedTables";
import {
  ALL_WORKSPACES_EVENT,
  COMPUTE_CONFIG_EVENT,
  loadCachedAllWorkspaces,
  loadLocalComputeConfig,
  refreshLiveRuntimeJobs,
  saveCachedAllWorkspaces,
  saveLocalComputeConfig,
} from "../data/useComputeConfig";

export interface WorkspaceOption {
  workspace_id: string;
  display_name: string;
  role: string;
  capacity_sku: string;
}

export interface WorkspaceContextValue {
  workspaceId: string | null;
  workspaces: WorkspaceOption[];
  allWorkspaces: WorkspaceOption[];
  hasCompletedScan: boolean;
  setWorkspaceId: (id: string) => void;
  status: "loading" | "ready" | "none";
  selectedDomain: string;
  setSelectedDomain: (domain: string) => void;
  casesEnabled: boolean;
  setCasesEnabled: (enabled: boolean) => void;
  refreshTick: number;
  refreshData: () => void;
  refreshLiveTelemetry: () => Promise<void>;
  isRefreshingTelemetry: boolean;
  resolveWriteWorkspaceId: () => string;
}

export const ALL_WORKSPACES_ID = "all";

export function selectInitialWorkspace(
  options: WorkspaceOption[],
  persistedId?: string | null
): { workspaceId: string | null; status: "ready" | "none" } {
  if (options.length === 0) {
    return { workspaceId: null, status: "none" };
  }
  if (!persistedId || persistedId === ALL_WORKSPACES_ID) {
    return { workspaceId: ALL_WORKSPACES_ID, status: "ready" };
  }
  const sorted = [...options].sort((a, b) => a.display_name.localeCompare(b.display_name));
  if (options.some((w) => w.workspace_id === persistedId)) {
    return { workspaceId: persistedId, status: "ready" };
  }
  return { workspaceId: sorted[0].workspace_id, status: "ready" };
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspaceId: ALL_WORKSPACES_ID,
  workspaces: [],
  allWorkspaces: [],
  hasCompletedScan: true,
  setWorkspaceId: () => undefined,
  status: "ready",
  selectedDomain: "All",
  setSelectedDomain: () => undefined,
  casesEnabled: true,
  setCasesEnabled: () => undefined,
  refreshTick: 0,
  refreshData: () => undefined,
  refreshLiveTelemetry: async () => undefined,
  isRefreshingTelemetry: false,
  resolveWriteWorkspaceId: () => getRuntimeWorkspaceId(),
});

const STORAGE_KEY = "governly-workspace-id-v2";
const DOMAIN_STORAGE_KEY = "governly-selected-domain";
const CASES_STORAGE_KEY = "governly-cases-enabled";

export function WorkspaceProvider({
  children,
  initialOptions,
  persistedWorkspaceId,
  onPersist,
}: {
  children: ReactNode;
  initialOptions?: WorkspaceOption[];
  persistedWorkspaceId?: string | null;
  onPersist?: (id: string) => void;
}) {
  const [liveWorkspaces, setLiveWorkspaces] = useState<WorkspaceOption[]>(
    () => initialOptions ?? loadCachedAllWorkspaces()
  );
  const [excludedIds, setExcludedIds] = useState<string[]>(
    () => loadLocalComputeConfig().excludedWorkspaceIds
  );
  const [localHasScan, setLocalHasScan] = useState<boolean>(() => {
    if (initialOptions !== undefined) return true;
    const cfg = loadLocalComputeConfig();
    return cfg.hasCompletedScan || cfg.scheduleEnabled || loadCachedAllWorkspaces().length > 0;
  });
  const [dbHasScan, setDbHasScan] = useState<boolean>(
    () => initialOptions !== undefined || loadCachedAllWorkspaces().length > 0
  );
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSync = () => {
      const cfg = loadLocalComputeConfig();
      setExcludedIds((prev) => {
        const nextKey = cfg.excludedWorkspaceIds.join(",");
        return prev.join(",") === nextKey ? prev : cfg.excludedWorkspaceIds;
      });
      if (cfg.hasCompletedScan || cfg.scheduleEnabled) {
        setLocalHasScan((prev) => (prev ? prev : true));
      }
    };
    const onAllWs = () => {
      if (initialOptions === undefined) {
        const cached = loadCachedAllWorkspaces();
        if (cached.length > 0) {
          setLiveWorkspaces((prev) => {
            const prevSig = prev.map((w) => `${w.workspace_id}:${w.display_name}`).join("|");
            const nextSig = cached.map((w) => `${w.workspace_id}:${w.display_name}`).join("|");
            return prevSig === nextSig ? prev : cached;
          });
          setDbHasScan((prev) => (prev ? prev : true));
        }
      }
    };
    window.addEventListener(COMPUTE_CONFIG_EVENT, onSync);
    window.addEventListener(ALL_WORKSPACES_EVENT, onAllWs);
    window.addEventListener("storage", onSync);
    return () => {
      window.removeEventListener(COMPUTE_CONFIG_EVENT, onSync);
      window.removeEventListener(ALL_WORKSPACES_EVENT, onAllWs);
      window.removeEventListener("storage", onSync);
    };
  }, [initialOptions]);

  const rawWorkspaces = initialOptions ?? liveWorkspaces;
  const activeWorkspaces = useMemo(() => {
    if (initialOptions !== undefined || excludedIds.length === 0) return rawWorkspaces;
    const ex = new Set(excludedIds);
    const filtered = rawWorkspaces.filter((w) => !ex.has(w.workspace_id));
    return filtered.length > 0 ? filtered : rawWorkspaces;
  }, [rawWorkspaces, excludedIds, initialOptions]);

  const hasCompletedScan =
    initialOptions !== undefined || localHasScan || dbHasScan || activeWorkspaces.length > 0;

  const refreshTickRef = useRef<number>(0);
  refreshTickRef.current = refreshTick;
  const [isRefreshingTelemetry, setIsRefreshingTelemetry] = useState(false);

  const refreshData = useCallback(() => {
    invalidateQueryCache("raw:");
    setRefreshTick((t) => {
      const next = t + 1;
      refreshTickRef.current = next;
      return next;
    });
  }, []);

  const initial = useMemo(
    () =>
      selectInitialWorkspace(
        activeWorkspaces,
        persistedWorkspaceId !== undefined
          ? persistedWorkspaceId
          : typeof window !== "undefined"
            ? window.localStorage.getItem(STORAGE_KEY)
            : null
      ),
    [activeWorkspaces, persistedWorkspaceId]
  );
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(() => {
    if (initialOptions !== undefined) return initial.workspaceId;
    if (initial.workspaceId) return initial.workspaceId;
    if (typeof window !== "undefined") {
      return window.localStorage.getItem(STORAGE_KEY) || ALL_WORKSPACES_ID;
    }
    return ALL_WORKSPACES_ID;
  });
  const [selectedDomain, setSelectedDomainState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem(DOMAIN_STORAGE_KEY) || "All";
    }
    return "All";
  });
  const setSelectedDomain = useCallback((domain: string) => {
    const next = domain || "All";
    setSelectedDomainState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DOMAIN_STORAGE_KEY, next);
    }
  }, []);
  const [casesEnabled, setCasesEnabledState] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(CASES_STORAGE_KEY);
      if (raw === "false") return false;
    }
    return true;
  });
  const [status, setStatus] = useState<"loading" | "ready" | "none">(
    initialOptions !== undefined ? initial.status : "loading"
  );

  useEffect(() => {
    if (initialOptions !== undefined) {
      const saved =
        persistedWorkspaceId !== undefined
          ? persistedWorkspaceId
          : typeof window !== "undefined"
            ? window.localStorage.getItem(STORAGE_KEY)
            : null;
      const next = selectInitialWorkspace(initialOptions, saved);
      setLiveWorkspaces(initialOptions);
      setWorkspaceIdState(next.workspaceId);
      setStatus(next.status);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    void (async () => {
      try {
        const wsRows = await fetchSharedPubWorkspaces(refreshTick);
        if (cancelled) return;
        const mapped: WorkspaceOption[] = (Array.isArray(wsRows) ? wsRows : [])
          .filter((w) => !isHostWorkspace(w.workspace_id, w.display_name))
          .map((w) => ({
            workspace_id: w.workspace_id,
            display_name: w.display_name,
            role: "Admin",
            capacity_sku: w.capacity_sku ?? "F2",
          }));
        const mergedAll = mapped.length > 0 ? saveCachedAllWorkspaces(mapped) : loadCachedAllWorkspaces();
        if (mapped.length > 0) {
          setDbHasScan(true);
          setLocalHasScan(true);
          const curCfg = loadLocalComputeConfig();
          if (!curCfg.hasCompletedScan) {
            saveLocalComputeConfig({ ...curCfg, hasCompletedScan: true }, false);
          }
        }
        const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        const next = selectInitialWorkspace(mergedAll, saved);
        setLiveWorkspaces(mergedAll);
        setWorkspaceIdState(next.workspaceId);
        setStatus(next.status);
      } catch {
        if (!cancelled) {
          const fallback = loadCachedAllWorkspaces();
          setLiveWorkspaces(fallback);
          setWorkspaceIdState(fallback.length > 0 ? ALL_WORKSPACES_ID : null);
          setStatus(fallback.length > 0 ? "ready" : "none");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialOptions, persistedWorkspaceId, refreshTick]);

  // Keep workspaceId valid if user excludes the currently selected workspace
  useEffect(() => {
    if (initialOptions !== undefined || !workspaceId || workspaceId === ALL_WORKSPACES_ID) return;
    if (activeWorkspaces.length > 0 && !activeWorkspaces.some((w) => w.workspace_id === workspaceId)) {
      setWorkspaceIdState(ALL_WORKSPACES_ID);
    }
  }, [activeWorkspaces, initialOptions, workspaceId]);

  const setWorkspaceId = (id: string) => {
    setWorkspaceIdState(id);
    setSelectedDomain("All");
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    onPersist?.(id);
  };

  const setCasesEnabled = (enabled: boolean) => {
    setCasesEnabledState(enabled);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CASES_STORAGE_KEY, enabled ? "true" : "false");
    }
  };

  const firstActiveWorkspaceId = activeWorkspaces[0]?.workspace_id ?? "";
  const resolveWriteWorkspaceId = useCallback((): string => {
    if (workspaceId && workspaceId !== ALL_WORKSPACES_ID) {
      return workspaceId;
    }
    if (firstActiveWorkspaceId) {
      return firstActiveWorkspaceId;
    }
    return getRuntimeWorkspaceId(workspaceId);
  }, [workspaceId, firstActiveWorkspaceId]);

  const refreshLiveTelemetry = useCallback(async () => {
    setIsRefreshingTelemetry(true);
    const nextTick = refreshTickRef.current + 1;
    try {
      const hostWsId = getRuntimeWorkspaceId(resolveWriteWorkspaceId());
      await Promise.all([
        preloadAllSharedTables(nextTick, true),
        Promise.race([
          refreshLiveRuntimeJobs(hostWsId),
          new Promise<void>((resolve) => setTimeout(resolve, 2500)),
        ]),
      ]);
      refreshTickRef.current = nextTick;
      setRefreshTick(nextTick);
    } finally {
      setIsRefreshingTelemetry(false);
    }
  }, [resolveWriteWorkspaceId]);

  return (
    <WorkspaceContext.Provider
      value={{
        workspaceId,
        workspaces: activeWorkspaces,
        allWorkspaces: rawWorkspaces,
        hasCompletedScan,
        setWorkspaceId,
        status,
        selectedDomain,
        setSelectedDomain,
        casesEnabled,
        setCasesEnabled,
        refreshTick,
        refreshData,
        refreshLiveTelemetry,
        isRefreshingTelemetry,
        resolveWriteWorkspaceId,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}

