import { useCallback, useEffect, useState } from 'react';
import { ALL_WORKSPACES_ID, useWorkspace } from '../app/WorkspaceProvider';
import { client } from './client';
import { useCachedQuery } from './queryCache';
import { useCurrentSteward } from './useCurrentSteward';

const SLA_STORAGE_KEY = 'governly.freshnessSlas';
const SLA_EVENT = 'governly:sla-changed';

export type SlaMap = Record<string, number>;

export const SLA_PRESETS: Array<{ label: string; minutes: number }> = [
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '4h', minutes: 240 },
  { label: '6h', minutes: 360 },
  { label: '12h', minutes: 720 },
  { label: '24h (1d)', minutes: 1440 },
  { label: '3d', minutes: 4320 },
  { label: '7d', minutes: 10080 },
  { label: '30d', minutes: 43200 },
  { label: '180d', minutes: 259200 },
  { label: '365d', minutes: 525600 },
];

export function formatSlaMinutes(slaMin: number): string {
  if (!slaMin || slaMin <= 0) return '1h';
  if (slaMin < 60) return `${Math.round(slaMin)}m`;
  if (slaMin <= 1440) {
    const hrs = slaMin / 60;
    return Number.isInteger(hrs) ? `${hrs}h` : `${hrs.toFixed(1)}h`;
  }
  const days = slaMin / 1440;
  return Number.isInteger(days) ? `${days}d` : `${days.toFixed(1)}d`;
}

export function parseLagLabelToMinutes(raw?: string | null): number | null {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (s.includes('just now') || s.includes('active') || s.includes('no runs')) return 0;
  let total = 0;
  let matched = false;
  const dMatch = s.match(/(\d+(?:\.\d+)?)\s*d/);
  if (dMatch) {
    total += parseFloat(dMatch[1]) * 1440;
    matched = true;
  }
  const hMatch = s.match(/(\d+(?:\.\d+)?)\s*h/);
  if (hMatch) {
    total += parseFloat(hMatch[1]) * 60;
    matched = true;
  }
  const mMatch = s.match(/(\d+(?:\.\d+)?)\s*m(?!s)/);
  if (mMatch) {
    total += parseFloat(mMatch[1]);
    matched = true;
  }
  return matched ? total : null;
}

export function loadLocalSlas(): SlaMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SLA_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as SlaMap) : {};
  } catch {
    return {};
  }
}

function saveLocalSlas(next: SlaMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SLA_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(SLA_EVENT));
  } catch {
    // ignore storage errors
  }
}

export function resolveEffectiveSlaMinutes(
  assetKey: string,
  dbSlaMinutes: number | null | undefined,
  slaMap: SlaMap,
): number {
  if (assetKey && slaMap[assetKey] !== undefined && slaMap[assetKey] > 0) {
    return slaMap[assetKey];
  }
  const prefix = assetKey?.includes('.') ? assetKey.split('.')[0] : '';
  if (prefix && slaMap[`domain:${prefix}`] !== undefined && slaMap[`domain:${prefix}`] > 0) {
    return slaMap[`domain:${prefix}`];
  }
  if (slaMap['*'] !== undefined && slaMap['*'] > 0) {
    return slaMap['*'];
  }
  return dbSlaMinutes && dbSlaMinutes > 0 ? dbSlaMinutes : 60;
}

export function useFreshnessSlas() {
  const { workspaceId, resolveWriteWorkspaceId, refreshTick, refreshData } = useWorkspace();
  const steward = useCurrentSteward();
  const stewardName = steward.entra?.display_name ?? 'Workspace Steward';
  const [slaMap, setSlaMap] = useState<SlaMap>(() => loadLocalSlas());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onSync = () => setSlaMap(loadLocalSlas());
    window.addEventListener(SLA_EVENT, onSync);
    window.addEventListener('storage', onSync);
    return () => {
      window.removeEventListener(SLA_EVENT, onSync);
      window.removeEventListener('storage', onSync);
    };
  }, []);

  const remoteSlas = useCachedQuery<SlaMap>(
    workspaceId ? `freshness-slas:${workspaceId}` : null,
    async () => {
      const baseQuery = client.data.QualityRule.select([
        'id',
        'asset_key',
        'rule_type',
        'threshold_pct',
        'is_active',
      ]);
      const rows =
        workspaceId === ALL_WORKSPACES_ID
          ? await baseQuery.where({ rule_type: { eq: 'freshness_sla' } }).execute()
          : await baseQuery
              .where({ workspace_id: { eq: workspaceId! }, rule_type: { eq: 'freshness_sla' } })
              .execute();
      if (!Array.isArray(rows)) return {};
      const next: SlaMap = { ...loadLocalSlas() };
      for (const r of rows) {
        if (r.is_active && Number(r.threshold_pct) > 0) {
          next[r.asset_key] = Number(r.threshold_pct);
        }
      }
      saveLocalSlas(next);
      return next;
    },
    slaMap,
    refreshTick,
  );

  const effectiveSlaMap = Object.keys(remoteSlas).length > 0 ? { ...remoteSlas, ...slaMap } : slaMap;

  const setSlaTarget = useCallback(
    async (targetKey: string, minutes: number) => {
      const cleanMin = Math.max(1, Math.round(minutes));
      const updated: SlaMap = { ...loadLocalSlas(), [targetKey]: cleanMin };
      setSlaMap(updated);
      saveLocalSlas(updated);
      setSaving(true);
      try {
        const targetWs = resolveWriteWorkspaceId();
        const existing = await client.data.QualityRule.select(['id', 'asset_key', 'rule_type'])
          .where({ asset_key: { eq: targetKey }, rule_type: { eq: 'freshness_sla' } })
          .execute();
        const label = formatSlaMinutes(cleanMin);
        const now = new Date();
        if (Array.isArray(existing) && existing[0]?.id) {
          await client.data.QualityRule.update(
            { id: existing[0].id },
            {
              rule_name: `Freshness SLA (${label})`,
              expression: `lag_minutes <= ${cleanMin}`,
              threshold_pct: cleanMin,
              is_active: true,
              updated_at: now,
            },
          );
        } else {
          await client.data.QualityRule.create({
            workspace_id: targetWs,
            asset_key: targetKey,
            rule_name: `Freshness SLA (${label})`,
            rule_type: 'freshness_sla',
            expression: `lag_minutes <= ${cleanMin}`,
            threshold_pct: cleanMin,
            severity: 'High',
            is_active: true,
            created_by: stewardName,
            created_at: now,
            updated_at: now,
          });
        }
        refreshData();
      } catch {
        // local state is already updated
      } finally {
        setSaving(false);
      }
    },
    [resolveWriteWorkspaceId, stewardName, refreshData],
  );

  return {
    slaMap: effectiveSlaMap,
    saving,
    setSlaTarget,
  };
}
