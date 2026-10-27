/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { client, getRuntimeWorkspaceId } from "../data/client";
import {
  ALL_WORKSPACES_EVENT,
  COMPUTE_CONFIG_EVENT,
  loadCachedAllWorkspaces,
  loadLocalComputeConfig,
  saveCachedAllWorkspaces,
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
  const [localHasScan, setLocalHasScan] = useState<boolean>(
    () => initialOptions !== undefined || loadLocalComputeConfig().hasCompletedScan
  );
  const [dbHasScan, setDbHasScan] = useState<boolean>(initialOptions !== undefined);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSync = () => {
      const cfg = loadLocalComputeConfig();
      setExcludedIds(cfg.excludedWorkspaceIds);
      if (cfg.hasCompletedScan) setLocalHasScan(true);
    };
    const onAllWs = () => {
      if (initialOptions === undefined) {
        const cached = loadCachedAllWorkspaces();
        if (cached.length > 0) setLiveWorkspaces(cached);
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

  const hasCompletedScan = initialOptions !== undefined || localHasScan || dbHasScan;

  const refreshData = useCallback(() => {
    setRefreshTick((t) => t + 1);
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
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(initial.workspaceId);
  const [selectedDomain, setSelectedDomainState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem(DOMAIN_STORAGE_KEY) || "All";
    }
    return "All";
  });
  const setSelectedDomain = (domain: string) => {
    const next = domain || "All";
    setSelectedDomainState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DOMAIN_STORAGE_KEY, next);
    }
  };
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
        const wsRows = await client.data.PubWorkspace.select([
          "workspace_id",
          "display_name",
          "capacity_sku",
          "is_monitored",
        ]).execute();
        if (cancelled) return;
        const mapped: WorkspaceOption[] = (Array.isArray(wsRows) ? wsRows : []).map((w) => ({
          workspace_id: w.workspace_id,
          display_name: w.display_name,
          role: "Admin",
          capacity_sku: w.capacity_sku ?? "F2",
        }));
        const mergedAll = mapped.length > 0 ? saveCachedAllWorkspaces(mapped) : loadCachedAllWorkspaces();
        if (mapped.length > 0) {
          setDbHasScan(true);
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

  const resolveWriteWorkspaceId = useCallback((): string => {
    if (workspaceId && workspaceId !== ALL_WORKSPACES_ID) {
      return workspaceId;
    }
    if (activeWorkspaces.length > 0 && activeWorkspaces[0].workspace_id) {
      return activeWorkspaces[0].workspace_id;
    }
    return getRuntimeWorkspaceId(workspaceId);
  }, [workspaceId, activeWorkspaces]);

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

