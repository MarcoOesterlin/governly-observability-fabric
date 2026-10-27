import { useEffect, useState } from "react";

interface CacheEntry<T> {
  value: T;
  updatedAt: number;
  tick: number;
  liveSession?: boolean;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflightMap = new Map<string, Promise<unknown>>();
const keyListeners = new Map<string, Set<() => void>>();
const pendingNotifyKeys = new Set<string>();
let coalesceTimer: ReturnType<typeof setTimeout> | null = null;

const SESSION_PREFIX = "governly:qcache:v3:";

function flushNotifications(): void {
  if (coalesceTimer !== null) {
    clearTimeout(coalesceTimer);
    coalesceTimer = null;
  }
  if (pendingNotifyKeys.size === 0) return;
  const keys = Array.from(pendingNotifyKeys);
  pendingNotifyKeys.clear();
  for (const k of keys) {
    const subs = keyListeners.get(k);
    if (subs) {
      subs.forEach((fn) => fn());
    }
  }
}

function scheduleNotify(key: string, immediate = false): void {
  pendingNotifyKeys.add(key);
  if (immediate || inflightMap.size === 0) {
    flushNotifications();
    return;
  }
  if (coalesceTimer === null) {
    coalesceTimer = setTimeout(() => {
      flushNotifications();
    }, 80);
  }
}

function readEntry<T>(key: string): CacheEntry<T> | undefined {
  const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (mem) return mem;
  if (typeof window !== "undefined") {
    try {
      const raw =
        window.localStorage.getItem(SESSION_PREFIX + key) ??
        window.sessionStorage.getItem(SESSION_PREFIX + key);
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry<T>;
        if (parsed && "value" in parsed) {
          // Mark hydrated storage entries with liveSession: false so we render immediately (0ms)
          // AND always revalidate in the background on a fresh page load.
          const hydrated: CacheEntry<T> = { ...parsed, liveSession: false };
          memoryCache.set(key, hydrated);
          return hydrated;
        }
      }
    } catch {
      // ignore storage errors
    }
  }
  return undefined;
}

function writeEntry<T>(
  key: string,
  value: T,
  tick: number,
  immediate = false
): void {
  const entry: CacheEntry<T> = {
    value,
    updatedAt: Date.now(),
    tick,
    liveSession: true,
  };
  memoryCache.set(key, entry);
  if (typeof window !== "undefined") {
    try {
      const serialized = JSON.stringify({
        value,
        updatedAt: entry.updatedAt,
        tick,
      });
      window.localStorage.setItem(SESSION_PREFIX + key, serialized);
    } catch {
      // ignore quota errors
    }
  }
  scheduleNotify(key, immediate);
}

/**
 * Shared promise/memory cache for underlying SQL table queries so multiple hooks
 * mounted simultaneously reuse a single network request per table.
 */
export function fetchSharedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  refreshTick: number = 0,
  ttlMs: number = 25_000
): Promise<T> {
  const existing = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (
    existing &&
    existing.liveSession &&
    existing.tick === refreshTick &&
    Date.now() - existing.updatedAt < ttlMs
  ) {
    return Promise.resolve(existing.value);
  }
  const inflight = inflightMap.get(key) as Promise<T> | undefined;
  if (inflight) return inflight;

  const p = fetcher()
    .then((res) => {
      inflightMap.delete(key);
      memoryCache.set(key, {
        value: res,
        updatedAt: Date.now(),
        tick: refreshTick,
        liveSession: true,
      });
      if (inflightMap.size === 0 && pendingNotifyKeys.size > 0) {
        flushNotifications();
      }
      return res;
    })
    .catch((err) => {
      inflightMap.delete(key);
      if (inflightMap.size === 0 && pendingNotifyKeys.size > 0) {
        flushNotifications();
      }
      throw err;
    });
  inflightMap.set(key, p);
  return p;
}

export function invalidateQueryCache(prefix?: string): void {
  for (const key of Array.from(memoryCache.keys())) {
    if (!prefix || key.startsWith(prefix)) {
      const cur = memoryCache.get(key);
      if (cur) {
        memoryCache.set(key, { ...cur, updatedAt: 0, tick: -1, liveSession: false });
      }
    }
  }
}

export function updateQueryCache<T>(
  prefix: string,
  updater: (prev: T) => T
): void {
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(prefix)) {
      const cur = memoryCache.get(key) as CacheEntry<T> | undefined;
      if (cur) {
        const nextVal = updater(cur.value);
        writeEntry(key, nextVal, cur.tick, true);
      }
    }
  }
}

export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  fallback: T,
  refreshTick: number = 0,
  ttlMs: number = 30_000
): T {
  const [state, setState] = useState<T>(() => {
    if (!key) return fallback;
    const hit = readEntry<T>(key);
    return hit ? hit.value : fallback;
  });

  useEffect(() => {
    if (!key) {
      setState(fallback);
      return;
    }

    const syncFromCache = () => {
      const latest = readEntry<T>(key);
      if (latest) {
        setState(latest.value);
      }
    };

    let subs = keyListeners.get(key);
    if (!subs) {
      subs = new Set();
      keyListeners.set(key, subs);
    }
    subs.add(syncFromCache);

    const existing = readEntry<T>(key);
    if (existing) {
      setState(existing.value);
      const isFresh =
        Boolean(existing.liveSession) &&
        existing.tick === refreshTick &&
        Date.now() - existing.updatedAt < ttlMs;
      if (isFresh) {
        return () => {
          subs?.delete(syncFromCache);
        };
      }
    }

    let pending = inflightMap.get(key) as Promise<T> | undefined;
    if (!pending) {
      pending = fetcher()
        .then((res) => {
          inflightMap.delete(key);
          writeEntry(key, res, refreshTick);
          return res;
        })
        .catch((err) => {
          inflightMap.delete(key);
          const prior = readEntry<T>(key);
          if (!prior) {
            writeEntry(key, fallback, refreshTick);
          } else if (inflightMap.size === 0 && pendingNotifyKeys.size > 0) {
            flushNotifications();
          }
          throw err;
        });
      inflightMap.set(key, pending);
    }

    void pending.catch(() => {
      // handled above; preserve cached state on transient errors
    });

    return () => {
      subs?.delete(syncFromCache);
    };
  }, [key, refreshTick, ttlMs]);

  return state;
}
