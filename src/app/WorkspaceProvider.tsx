/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { client, getRuntimeWorkspaceId } from "../data/client";
import { COMPUTE_CONFIG_EVENT, loadLocalComputeConfig } from "../data/useComputeConfig";

export interface WorkspaceOption {
  workspace_id: string;
  display_name: string;
  role: string;
  capacity_sku: string;
}

export interface WorkspaceContextValue {
  workspaceId: string | null;
  workspaces: WorkspaceOption[];
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
  const [liveWorkspaces, setLiveWorkspaces] = useState<WorkspaceOption[]>(initialOptions ?? []);
  const [excludedIds, setExcludedIds] = useState<string[]>(
    () => loadLocalComputeConfig().excludedWorkspaceIds
  );
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onSync = () => setExcludedIds(loadLocalComputeConfig().excludedWorkspaceIds);
    window.addEventListener(COMPUTE_CONFIG_EVENT, onSync);
    window.addEventListener("storage", onSync);
    return () => {
      window.removeEventListener(COMPUTE_CONFIG_EVENT, onSync);
      window.removeEventListener("storage", onSync);
    };
  }, []);

  const rawWorkspaces = initialOptions ?? liveWorkspaces;
  const activeWorkspaces = useMemo(() => {
    if (initialOptions !== undefined || excludedIds.length === 0) return rawWorkspaces;
    const ex = new Set(excludedIds);
    const filtered = rawWorkspaces.filter((w) => !ex.has(w.workspace_id));
    return filtered.length > 0 ? filtered : rawWorkspaces;
  }, [rawWorkspaces, excludedIds, initialOptions]);

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
        const saved = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        const next = selectInitialWorkspace(mapped, saved);
        setLiveWorkspaces(mapped);
        setWorkspaceIdState(next.workspaceId);
        setStatus(next.status);
      } catch {
        if (!cancelled) {
          setLiveWorkspaces([]);
          setWorkspaceIdState(null);
          setStatus("none");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialOptions, persistedWorkspaceId, refreshTick]);

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

