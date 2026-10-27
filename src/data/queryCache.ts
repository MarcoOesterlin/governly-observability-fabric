import { useEffect, useState } from "react";

interface CacheEntry<T> {
  value: T;
  updatedAt: number;
  tick: number;
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
    }, 50);
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
          memoryCache.set(key, parsed);
          return parsed;
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
  const entry: CacheEntry<T> = { value, updatedAt: Date.now(), tick };
  memoryCache.set(key, entry);
  if (typeof window !== "undefined") {
    try {
      const serialized = JSON.stringify(entry);
      window.localStorage.setItem(SESSION_PREFIX + key, serialized);
    } catch {
      // ignore quota errors
    }
  }
  scheduleNotify(key, immediate);
}

export function invalidateQueryCache(prefix?: string): void {
  for (const key of Array.from(memoryCache.keys())) {
    if (!prefix || key.startsWith(prefix)) {
      const cur = memoryCache.get(key);
      if (cur) {
        memoryCache.set(key, { ...cur, updatedAt: 0, tick: -1 });
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
  ttlMs: number = 180_000
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
        existing.tick === refreshTick && Date.now() - existing.updatedAt < ttlMs;
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
