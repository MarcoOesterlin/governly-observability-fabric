import { useEffect, useState } from "react";

interface CacheEntry<T> {
  value: T;
  updatedAt: number;
  tick: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inflightMap = new Map<string, Promise<unknown>>();
const keyListeners = new Map<string, Set<() => void>>();

const SESSION_PREFIX = "governly:qcache:v1:";

function readEntry<T>(key: string): CacheEntry<T> | undefined {
  const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (mem) return mem;
  if (typeof window !== "undefined") {
    try {
      const raw = window.sessionStorage.getItem(SESSION_PREFIX + key);
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

function writeEntry<T>(key: string, value: T, tick: number): void {
  const entry: CacheEntry<T> = { value, updatedAt: Date.now(), tick };
  memoryCache.set(key, entry);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(entry));
    } catch {
      // ignore quota errors
    }
  }
  const subs = keyListeners.get(key);
  if (subs) {
    subs.forEach((fn) => fn());
  }
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
          writeEntry(key, res, refreshTick);
          return res;
        })
        .catch((err) => {
          const prior = readEntry<T>(key);
          if (!prior) {
            writeEntry(key, fallback, refreshTick);
          }
          throw err;
        })
        .finally(() => {
          inflightMap.delete(key);
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
