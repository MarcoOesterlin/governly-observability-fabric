import { useCallback, useEffect, useState } from 'react';
import { client } from './client';
import { ALL_WORKSPACES_ID, useWorkspace } from '../app/WorkspaceProvider';
import { useCurrentSteward } from './useCurrentSteward';
import type { RuleType } from '../lib/ruleValidator';

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

export function useQualityRules(assetKey?: string) {
  const { workspaceId, workspaces, refreshTick } = useWorkspace();
  const steward = useCurrentSteward();
  const stewardName = steward.entra?.display_name ?? 'Workspace Steward';
  const [rules, setRules] = useState<CustomQualityRule[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const reload = useCallback(async () => {
    if (!workspaceId) {
      setRules([]);
      return;
    }
    setLoading(true);
    try {
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
          : await baseQuery.where({ workspace_id: { eq: workspaceId } }).first(200).execute();
      const rows = (Array.isArray(res) ? res : []).filter(
        (r) => r.rule_type !== 'freshness_sla',
      );
      const mapped: CustomQualityRule[] = rows.map((r) => ({
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
        created_at: r.created_at ? new Date(r.created_at as unknown as string).toISOString() : new Date().toISOString(),
      }));
      setRules(
        assetKey ? mapped.filter((r) => r.asset_key === assetKey || r.asset_key === '*') : mapped,
      );
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, assetKey, stewardName]);

  useEffect(() => {
    void reload();
  }, [reload, refreshTick]);

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
      const created = await client.data.QualityRule.create({
        workspace_id: targetWs,
        asset_key: input.asset_key,
        rule_name: input.rule_name.trim(),
        rule_type: input.rule_type,
        expression: input.expression.trim(),
        threshold_pct: input.threshold_pct,
        severity: input.severity,
        is_active: true,
        created_by: stewardName,
        created_at: now,
        updated_at: now,
      });
      await reload();
      return created;
    },
    [workspaceId, workspaces, stewardName, reload],
  );

  const toggleRuleActive = useCallback(
    async (id: string, currentActive: boolean) => {
      await client.data.QualityRule.update(
        { id },
        {
          is_active: !currentActive,
          updated_at: new Date(),
        },
      );
      await reload();
    },
    [reload],
  );

  const deleteRule = useCallback(
    async (id: string) => {
      await client.data.QualityRule.delete({ id });
      await reload();
    },
    [reload],
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
      await client.data.QualityRule.update(
        { id },
        {
          rule_name: input.rule_name.trim(),
          rule_type: input.rule_type,
          expression: input.expression.trim(),
          threshold_pct: input.threshold_pct,
          severity: input.severity,
          updated_at: new Date(),
        },
      );
      await reload();
    },
    [reload],
  );

  const seedDefaultRules = useCallback(
    async (targetAsset: string, primaryKeyCol = 'id') => {
      const defaults: Array<{
        rule_name: string;
        rule_type: RuleType;
        expression: string;
        threshold_pct: number;
        severity: 'Critical' | 'High' | 'Medium';
      }> = [
        {
          rule_name: `Completeness (${primaryKeyCol} NOT NULL)`,
          rule_type: 'not_null',
          expression: `${primaryKeyCol} IS NOT NULL`,
          threshold_pct: 99.0,
          severity: 'High',
        },
        {
          rule_name: `Key uniqueness (${primaryKeyCol})`,
          rule_type: 'unique',
          expression: `${primaryKeyCol} IS NOT NULL`,
          threshold_pct: 95.0,
          severity: 'Critical',
        },
      ];
      for (const d of defaults) {
        await createRule({
          asset_key: targetAsset,
          ...d,
        });
      }
    },
    [createRule],
  );

  return {
    rules,
    loading,
    createRule,
    updateRule,
    seedDefaultRules,
    toggleRuleActive,
    deleteRule,
    reload,
  };
}
