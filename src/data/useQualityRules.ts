import { useCallback, useEffect, useState } from 'react';
import { client } from './client';
import { ALL_WORKSPACES_ID, useWorkspace } from '../app/WorkspaceProvider';
import { invalidateQueryCache, updateQueryCache, useCachedQuery } from './queryCache';
import { useCurrentSteward } from './useCurrentSteward';
import type { RuleType } from '../lib/ruleValidator';
import type { SchemaColumnFixture } from '../fixtures/types';

export interface CustomQualityRule {
  id: string;
  workspace_id: string;
  asset_key: string;
  rule_name: string;
  rule_type: RuleType;
  expression: string;
  threshold_pct: number;
  severity: 'Critical' | 'High' | 'Medium';
  is_active: boolean;
  created_by: string;
  created_at: string;
}

export interface DataQualityDimensionTemplate {
  dimension:
    | 'Completeness'
    | 'Uniqueness'
    | 'Validity'
    | 'Accuracy'
    | 'Consistency'
    | 'Timeliness'
    | 'Integrity';
  label: string;
  description: string;
  rule_type: RuleType;
  threshold_pct: number;
  severity: 'Critical' | 'High' | 'Medium';
  buildRule: (cols: SchemaColumnFixture[]) => {
    rule_name: string;
    expression: string;
  };
}

export const DATA_QUALITY_DIMENSIONS: DataQualityDimensionTemplate[] = [
  {
    dimension: 'Completeness',
    label: '1. Completeness',
    description: 'Required identifier and business attributes are populated (non-null).',
    rule_type: 'not_null',
    threshold_pct: 99.5,
    severity: 'High',
    buildRule: (cols) => {
      const pk = cols.find((c) => c.flag === 'PK')?.col ?? cols[0]?.col ?? 'id';
      return {
        rule_name: `Completeness (${pk} NOT NULL)`,
        expression: `${pk} IS NOT NULL`,
      };
    },
  },
  {
    dimension: 'Uniqueness',
    label: '2. Uniqueness',
    description: 'Primary or natural key contains zero duplicate entities.',
    rule_type: 'unique',
    threshold_pct: 100.0,
    severity: 'Critical',
    buildRule: (cols) => {
      const pk = cols.find((c) => c.flag === 'PK')?.col ?? cols[0]?.col ?? 'id';
      return {
        rule_name: `Uniqueness (${pk} distinct key)`,
        expression: `${pk} IS NOT NULL`,
      };
    },
  },
  {
    dimension: 'Validity',
    label: '3. Validity',
    description: 'Text or categorical attributes conform to non-empty domain syntax.',
    rule_type: 'sql_predicate',
    threshold_pct: 99.0,
    severity: 'High',
    buildRule: (cols) => {
      const strCol =
        cols.find((c) => /STRING|VARCHAR|CHAR|TEXT/i.test(c.type))?.col ??
        cols[1]?.col ??
        cols[0]?.col ??
        'id';
      return {
        rule_name: `Validity (${strCol} domain format)`,
        expression: `${strCol} IS NOT NULL AND LENGTH(TRIM(CAST(${strCol} AS STRING))) > 0`,
      };
    },
  },
  {
    dimension: 'Accuracy',
    label: '4. Accuracy',
    description: 'Numeric measures and quantities fall within valid business bounds.',
    rule_type: 'range',
    threshold_pct: 99.5,
    severity: 'High',
    buildRule: (cols) => {
      const numCol =
        cols.find((c) => /INT|DEC|NUM|DOUBLE|FLOAT|LONG|MONEY/i.test(c.type))?.col ??
        cols[0]?.col ??
        'id';
      const isNumeric = cols.some(
        (c) => c.col === numCol && /INT|DEC|NUM|DOUBLE|FLOAT|LONG|MONEY/i.test(c.type),
      );
      return {
        rule_name: `Accuracy (${numCol} business bounds)`,
        expression: isNumeric
          ? `${numCol} IS NOT NULL AND ${numCol} >= 0`
          : `${numCol} IS NOT NULL`,
      };
    },
  },
  {
    dimension: 'Consistency',
    label: '5. Consistency',
    description: 'Cross-attribute relationships within each record hold without contradiction.',
    rule_type: 'sql_predicate',
    threshold_pct: 99.0,
    severity: 'Medium',
    buildRule: (cols) => {
      const first = cols[0]?.col ?? 'id';
      const second = cols[1]?.col ?? first;
      return {
        rule_name:
          second !== first
            ? `Consistency (${first} & ${second} paired)`
            : `Consistency (${first} record state)`,
        expression:
          second !== first
            ? `${first} IS NOT NULL AND ${second} IS NOT NULL`
            : `${first} IS NOT NULL`,
      };
    },
  },
  {
    dimension: 'Timeliness',
    label: '6. Timeliness',
    description: 'Event or transaction timestamps are recorded and within expected recency.',
    rule_type: 'sql_predicate',
    threshold_pct: 98.0,
    severity: 'Medium',
    buildRule: (cols) => {
      const tsCol =
        cols.find(
          (c) =>
            /DATE|TIME|TIMESTAMP/i.test(c.type) ||
            /_at$|_date$|_ts$|timestamp|date/i.test(c.col),
        )?.col ??
        cols[cols.length - 1]?.col ??
        'id';
      return {
        rule_name: `Timeliness (${tsCol} recorded)`,
        expression: `${tsCol} IS NOT NULL`,
      };
    },
  },
  {
    dimension: 'Integrity',
    label: '7. Referential Integrity',
    description: 'Foreign key references resolve to valid parent records without orphans.',
    rule_type: 'not_null',
    threshold_pct: 99.5,
    severity: 'High',
    buildRule: (cols) => {
      const fkCol =
        cols.find((c) => c.flag === 'FK' || /_id$/i.test(c.col))?.col ??
        cols[0]?.col ??
        'id';
      return {
        rule_name: `Integrity (${fkCol} reference valid)`,
        expression: `${fkCol} IS NOT NULL`,
      };
    },
  },
];

export function isSystemQualityRuleRow(r: {
  rule_type?: unknown;
  asset_key?: unknown;
  rule_name?: unknown;
}): boolean {
  const rt = String(r.rule_type ?? '')
    .trim()
    .toLowerCase();
  const ak = String(r.asset_key ?? '')
    .trim()
    .toLowerCase();
  const rn = String(r.rule_name ?? '').trim();
  return (
    rt === 'freshness_sla' ||
    rt === 'compute_config' ||
    rt === 'workspace_monitor' ||
    ak.startsWith('__') ||
    rn === 'Governly Compute Configuration' ||
    rn.startsWith('Monitor Workspace:')
  );
}

const EMPTY_CUSTOM_RULES: CustomQualityRule[] = [];
const OPTIMISTIC_RULES_EVENT = 'governly:quality-rules-optimistic';
const deletedRuleIds = new Set<string>();
const deletedRuleNames = new Set<string>();

export function isQualityRuleDeleted(id?: string, ruleName?: string): boolean {
  if (id && deletedRuleIds.has(id)) return true;
  if (ruleName && deletedRuleNames.has(ruleName)) return true;
  return false;
}

function notifyOptimisticRules(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPTIMISTIC_RULES_EVENT));
  }
}

export function useQualityRules(assetKey?: string) {
  const { workspaceId, workspaces, refreshTick } = useWorkspace();
  const steward = useCurrentSteward();
  const stewardName = steward.entra?.display_name ?? 'Workspace Steward';
  const [loading, setLoading] = useState<boolean>(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [, setOptimisticTick] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onUpdate = () => setOptimisticTick((t) => t + 1);
    window.addEventListener(OPTIMISTIC_RULES_EVENT, onUpdate);
    return () => window.removeEventListener(OPTIMISTIC_RULES_EVENT, onUpdate);
  }, []);

  const showFeedback = useCallback((msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => {
      setActionFeedback((cur) => (cur === msg ? null : cur));
    }, 3500);
  }, []);

  const allRules = useCachedQuery<CustomQualityRule[]>(
    workspaceId ? `quality-rules:${workspaceId}` : null,
    async () => {
      const baseQuery = client.data.QualityRule.select([
        'id',
        'workspace_id',
        'asset_key',
        'rule_name',
        'rule_type',
        'expression',
        'threshold_pct',
        'severity',
        'is_active',
        'created_by',
        'created_at',
      ]);
      const res =
        workspaceId === ALL_WORKSPACES_ID
          ? await baseQuery.first(200).execute()
          : await baseQuery.where({ workspace_id: { eq: workspaceId! } }).first(200).execute();
      const rows = (Array.isArray(res) ? res : []).filter(
        (r) => !isSystemQualityRuleRow(r) && !isQualityRuleDeleted(r.id, r.rule_name),
      );
      return rows.map((r) => ({
        id: r.id,
        workspace_id: r.workspace_id,
        asset_key: r.asset_key,
        rule_name: r.rule_name,
        rule_type: (r.rule_type as RuleType) || 'sql_predicate',
        expression: r.expression,
        threshold_pct: Number(r.threshold_pct ?? 100),
        severity: (r.severity as 'Critical' | 'High' | 'Medium') || 'High',
        is_active: Boolean(r.is_active),
        created_by: r.created_by || stewardName,
        created_at: r.created_at
          ? new Date(r.created_at as unknown as string).toISOString()
          : new Date().toISOString(),
      }));
    },
    EMPTY_CUSTOM_RULES,
    refreshTick,
  );

  const visibleRules = allRules.filter(
    (r) => !isSystemQualityRuleRow(r) && !isQualityRuleDeleted(r.id, r.rule_name),
  );

  const rules =
    assetKey && assetKey !== '*'
      ? visibleRules.filter((r) => r.asset_key === assetKey || r.asset_key === '*')
      : visibleRules;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      invalidateQueryCache('quality-rules:');
      invalidateQueryCache('assets:');
      invalidateQueryCache('asset-quality:');
      notifyOptimisticRules();
    } finally {
      setLoading(false);
    }
  }, []);

  const createRule = useCallback(
    async (input: {
      asset_key: string;
      rule_name: string;
      rule_type: RuleType;
      expression: string;
      threshold_pct: number;
      severity: 'Critical' | 'High' | 'Medium';
    }) => {
      const now = new Date();
      const targetWs =
        workspaceId === ALL_WORKSPACES_ID
          ? (workspaces[0]?.workspace_id ?? ALL_WORKSPACES_ID)
          : (workspaceId ?? '');
      const cleanName = input.rule_name.trim();
      const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      deletedRuleNames.delete(cleanName);

      const optimisticRule: CustomQualityRule = {
        id: tempId,
        workspace_id: targetWs,
        asset_key: input.asset_key,
        rule_name: cleanName,
        rule_type: input.rule_type,
        expression: input.expression.trim(),
        threshold_pct: input.threshold_pct,
        severity: input.severity,
        is_active: true,
        created_by: stewardName,
        created_at: now.toISOString(),
      };

      // Instant optimistic insert (<10ms)
      updateQueryCache<CustomQualityRule[]>('quality-rules:', (prev) => [
        ...(Array.isArray(prev) ? prev.filter((r) => r.rule_name !== cleanName) : []),
        optimisticRule,
      ]);
      notifyOptimisticRules();
      showFeedback(`✓ Added rule "${cleanName}"`);

      try {
        const created = await client.data.QualityRule.create({
          workspace_id: targetWs,
          asset_key: input.asset_key,
          rule_name: cleanName,
          rule_type: input.rule_type,
          expression: input.expression.trim(),
          threshold_pct: input.threshold_pct,
          severity: input.severity,
          is_active: true,
          created_by: stewardName,
          created_at: now,
          updated_at: now,
        });
        if (created && (created as { id?: string }).id) {
          const realId = String((created as { id: string }).id);
          updateQueryCache<CustomQualityRule[]>('quality-rules:', (prev) =>
            (Array.isArray(prev) ? prev : []).map((r) =>
              r.id === tempId ? { ...r, id: realId } : r,
            ),
          );
          notifyOptimisticRules();
        }
        return created;
      } catch {
        return optimisticRule;
      }
    },
    [workspaceId, workspaces, stewardName, showFeedback],
  );

  const toggleRuleActive = useCallback(
    async (id: string, currentActive: boolean) => {
      const target = visibleRules.find((r) => r.id === id);
      const nextActive = !currentActive;
      // Instant optimistic toggle (<10ms)
      updateQueryCache<CustomQualityRule[]>('quality-rules:', (prev) =>
        (Array.isArray(prev) ? prev : []).map((r) =>
          r.id === id ? { ...r, is_active: nextActive } : r,
        ),
      );
      notifyOptimisticRules();
      showFeedback(
        nextActive
          ? `✓ Enabled rule "${target?.rule_name ?? id}"`
          : `✓ Paused rule "${target?.rule_name ?? id}"`,
      );

      if (!id.startsWith('optimistic-')) {
        void client.data.QualityRule.update(
          { id },
          {
            is_active: nextActive,
            updated_at: new Date(),
          },
        ).catch(() => undefined);
      }
    },
    [visibleRules, showFeedback],
  );

  const deleteRule = useCallback(
    async (id: string, ruleNameHint?: string) => {
      const target = visibleRules.find(
        (r) => r.id === id || (ruleNameHint && r.rule_name === ruleNameHint),
      );
      const targetName = target?.rule_name ?? ruleNameHint ?? '';
      deletedRuleIds.add(id);
      if (target?.id) deletedRuleIds.add(target.id);
      if (targetName) deletedRuleNames.add(targetName);

      // Instant optimistic removal (<10ms)
      updateQueryCache<CustomQualityRule[]>('quality-rules:', (prev) =>
        (Array.isArray(prev) ? prev : []).filter(
          (r) => r.id !== id && (!targetName || r.rule_name !== targetName),
        ),
      );
      updateQueryCache<Array<{ name: string }>>('asset-quality:', (prev) =>
        (Array.isArray(prev) ? prev : []).filter((r) => r.name !== targetName),
      );
      notifyOptimisticRules();
      showFeedback(`✓ Deleted rule "${targetName || id}"`);

      // Persist deletion in background across all SQL tables (QualityRules, PubQualityResults, PubQualityFailedRows)
      const realId = target?.id ?? id;
      const targetAssetKey = target?.asset_key ?? assetKey;
      void (async () => {
        try {
          if (realId && !realId.startsWith('optimistic-') && !realId.startsWith('pub-')) {
            await client.data.QualityRule.delete({ id: realId }).catch(() => undefined);
          }
          if (targetName) {
            // Also clean up any matching QualityRule rows by rule_name (e.g. duplicates or when triggered from published table)
            const matchingRules = await client.data.QualityRule.select(['id', 'rule_name', 'asset_key'])
              .where({ rule_name: { eq: targetName } })
              .execute()
              .catch(() => []);
            if (Array.isArray(matchingRules)) {
              for (const row of matchingRules) {
                if (
                  row?.id &&
                  (!targetAssetKey || !row.asset_key || row.asset_key === targetAssetKey)
                ) {
                  await client.data.QualityRule.delete({ id: row.id }).catch(() => undefined);
                }
              }
            }

            // Clean up published check results in dbo.PubQualityResults
            const pubRows = await client.data.PubQualityResult.select(['id', 'rule_name', 'asset_key'])
              .where({ rule_name: { eq: targetName } })
              .execute()
              .catch(() => []);
            if (Array.isArray(pubRows)) {
              for (const row of pubRows) {
                if (
                  row?.id &&
                  (!targetAssetKey || !row.asset_key || row.asset_key === targetAssetKey)
                ) {
                  await client.data.PubQualityResult.delete({ id: row.id }).catch(() => undefined);
                }
              }
            }

            // Clean up published failed row samples in dbo.PubQualityFailedRows
            const failedRows = await client.data.PubQualityFailedRow.select(['id', 'rule_name', 'asset_key'])
              .where({ rule_name: { eq: targetName } })
              .execute()
              .catch(() => []);
            if (Array.isArray(failedRows)) {
              for (const row of failedRows) {
                if (
                  row?.id &&
                  (!targetAssetKey || !row.asset_key || row.asset_key === targetAssetKey)
                ) {
                  await client.data.PubQualityFailedRow.delete({ id: row.id }).catch(() => undefined);
                }
              }
            }
          }
        } catch {
          // background SQL cleanup
        }
      })();
    },
    [visibleRules, showFeedback, assetKey],
  );

  const updateRule = useCallback(
    async (
      id: string,
      input: {
        rule_name: string;
        rule_type: RuleType;
        expression: string;
        threshold_pct: number;
        severity: 'Critical' | 'High' | 'Medium';
      },
    ) => {
      const cleanName = input.rule_name.trim();
      const cleanExpr = input.expression.trim();
      // Instant optimistic update (<10ms)
      updateQueryCache<CustomQualityRule[]>('quality-rules:', (prev) =>
        (Array.isArray(prev) ? prev : []).map((r) =>
          r.id === id
            ? {
                ...r,
                rule_name: cleanName,
                rule_type: input.rule_type,
                expression: cleanExpr,
                threshold_pct: input.threshold_pct,
                severity: input.severity,
              }
            : r,
        ),
      );
      notifyOptimisticRules();
      showFeedback(`✓ Updated rule "${cleanName}"`);

      if (!id.startsWith('optimistic-')) {
        void client.data.QualityRule.update(
          { id },
          {
            rule_name: cleanName,
            rule_type: input.rule_type,
            expression: cleanExpr,
            threshold_pct: input.threshold_pct,
            severity: input.severity,
            updated_at: new Date(),
          },
        ).catch(() => undefined);
      }
    },
    [showFeedback],
  );

  const seedDefaultRules = useCallback(
    async (
      targetAsset: string,
      primaryKeyCol = 'id',
      schemaCols?: SchemaColumnFixture[],
    ) => {
      const effectiveAsset = !targetAsset || targetAsset === '*' ? '*' : targetAsset;
      const cols: SchemaColumnFixture[] =
        schemaCols && schemaCols.length > 0
          ? schemaCols
          : [{ col: primaryKeyCol, type: 'STRING', flag: 'PK', note: '' }];

      for (const dim of DATA_QUALITY_DIMENSIONS) {
        const built = dim.buildRule(cols);
        await createRule({
          asset_key: effectiveAsset,
          rule_name: built.rule_name,
          rule_type: dim.rule_type,
          expression: built.expression,
          threshold_pct: dim.threshold_pct,
          severity: dim.severity,
        });
      }
      showFeedback(
        `✓ Added ${DATA_QUALITY_DIMENSIONS.length} Data Quality Dimension rules (Completeness, Uniqueness, Validity, Accuracy, Consistency, Timeliness, Integrity)`,
      );
    },
    [createRule, showFeedback],
  );

  return {
    rules,
    loading,
    actionFeedback,
    createRule,
    updateRule,
    seedDefaultRules,
    toggleRuleActive,
    deleteRule,
    reload,
  };
}
