import { useEffect, useMemo, useState } from 'react';
import { css } from '../../lib/css';
import { badge } from './primitives';
import { useAssetSchema } from '../../data/useAsset';
import { useQualityRules, type CustomQualityRule } from '../../data/useQualityRules';
import { validateQualityRule, type RuleType } from '../../lib/ruleValidator';

const btnPrimary = css(
  'height:32px;padding:0 12px;border:none;border-radius:8px;background:var(--acc,#2563eb);color:#fff;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;gap:6px;cursor:pointer;',
);
const btnSecondary = css(
  'height:32px;padding:0 12px;border:1px solid var(--border,#e7e7ea);border-radius:8px;background:var(--card,#fff);color:var(--fg);font-size:12.5px;font-weight:500;display:inline-flex;align-items:center;gap:6px;cursor:pointer;',
);

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  sql_predicate: 'Spark SQL Predicate',
  not_null: 'Completeness (NOT NULL)',
  range: 'Range / Bounds',
  unique: 'Key Uniqueness',
};

export function QualityRuleStudio({
  assetKey,
  initialEditRuleId,
  onRuleSaved,
}: {
  assetKey: string;
  initialEditRuleId?: string | null;
  onRuleSaved?: () => void;
}) {
  const { columns: schemaColumns } = useAssetSchema(assetKey);
  const {
    rules: customRules,
    createRule,
    updateRule,
    seedDefaultRules,
    toggleRuleActive,
    deleteRule,
  } = useQualityRules(assetKey);

  const [editingRuleId, setEditingRuleId] = useState<string | null>(initialEditRuleId ?? null);
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState<RuleType>('sql_predicate');
  const [severity, setSeverity] = useState<'Critical' | 'High' | 'Medium'>('High');
  const [thresholdPct, setThresholdPct] = useState<number>(99.0);
  const [expression, setExpression] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  const isBlank = ruleName.trim().length === 0 && expression.trim().length === 0;

  useEffect(() => {
    if (!initialEditRuleId) {
      setEditingRuleId(null);
      setRuleName('');
      setExpression('');
      setStatusBanner(null);
    }
  }, [assetKey, initialEditRuleId]);

  const startEditingRule = (r: CustomQualityRule) => {
    setEditingRuleId(r.id);
    setRuleName(r.rule_name);
    setRuleType(r.rule_type);
    setExpression(r.expression);
    setThresholdPct(r.threshold_pct);
    setSeverity(r.severity);
    setStatusBanner(null);
  };

  useEffect(() => {
    if (initialEditRuleId) {
      const target = customRules.find((r) => r.id === initialEditRuleId);
      if (target) startEditingRule(target);
    }
  }, [initialEditRuleId, customRules]);

  const validation = useMemo(
    () =>
      validateQualityRule({
        ruleName,
        ruleType,
        expression,
        thresholdPct,
        assetKey,
        schemaColumns,
      }),
    [ruleName, ruleType, expression, thresholdPct, assetKey, schemaColumns],
  );

  const applyTemplate = (kind: 'not_null' | 'positive' | 'unique' | 'in_set' | 'rlike') => {
    const firstCol = schemaColumns[0]?.col ?? 'id';
    const numCol =
      schemaColumns.find((c) => /INT|DEC|NUM|DOUBLE|FLOAT|LONG/i.test(c.type))?.col ?? firstCol;
    const strCol = schemaColumns.find((c) => /STRING|VARCHAR|CHAR|TEXT/i.test(c.type))?.col ?? firstCol;

    if (kind === 'not_null') {
      setRuleType('not_null');
      setRuleName(`${firstCol} not null`);
      setExpression(`${firstCol} IS NOT NULL`);
      setThresholdPct(100);
    } else if (kind === 'positive') {
      setRuleType('range');
      setRuleName(`${numCol} non-negative`);
      setExpression(`${numCol} >= 0 AND ${numCol} IS NOT NULL`);
      setThresholdPct(99.5);
    } else if (kind === 'unique') {
      setRuleType('unique');
      setRuleName(`${firstCol} unique key`);
      setExpression(`${firstCol} IS NOT NULL`);
      setThresholdPct(100);
    } else if (kind === 'in_set') {
      setRuleType('sql_predicate');
      setRuleName(`${strCol} valid domain values`);
      setExpression(`LENGTH(TRIM(${strCol})) > 0`);
      setThresholdPct(99.0);
    } else if (kind === 'rlike') {
      setRuleType('sql_predicate');
      setRuleName(`${strCol} pattern format`);
      setExpression(`${strCol} RLIKE '^[A-Za-z0-9_-]+$'`);
      setThresholdPct(95.0);
    }
  };

  const insertColumn = (colName: string) => {
    if (!ruleName.trim()) {
      setRuleName(`${colName} not null`);
    }
    setExpression((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return `${colName} IS NOT NULL`;
      return `${trimmed} AND ${colName} IS NOT NULL`;
    });
  };

  const handleSave = async () => {
    if (!validation.valid || saving) return;
    setSaving(true);
    setStatusBanner(null);
    try {
      if (editingRuleId) {
        await updateRule(editingRuleId, {
          rule_name: ruleName,
          rule_type: ruleType,
          expression,
          threshold_pct: thresholdPct,
          severity,
        });
        setStatusBanner(
          `Updated "${ruleName}". nb_governly_compute_publish will evaluate the updated expression on ${assetKey} on the next run.`,
        );
        setEditingRuleId(null);
      } else {
        await createRule({
          asset_key: assetKey,
          rule_name: ruleName,
          rule_type: ruleType,
          expression,
          threshold_pct: thresholdPct,
          severity,
        });
        setStatusBanner(
          `Saved "${ruleName}" to the QualityRules table. nb_governly_compute_publish will evaluate it on ${assetKey} on the next notebook run.`,
        );
      }
      onRuleSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const handleCopyNotebookCode = async () => {
    const snippet = `# Spark DQ evaluation for ${assetKey} (${ruleName})\npassed_rows = df.filter(${JSON.stringify(expression.trim())}).count()\npass_pct = (passed_rows / max(1, df.count())) * 100.0\nassert pass_pct >= ${thresholdPct}, f"Rule ${ruleName} failed: {pass_pct:.2f}% < ${thresholdPct}%"`;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div style={css('display:flex;flex-direction:column;gap:16px;margin-bottom:20px;')}>
      <div
        style={css(
          'background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;',
        )}
      >
        <div
          style={css(
            'padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;',
          )}
        >
          <div style={css('display:flex;align-items:center;gap:8px;')}>
            <i className="ph ph-flask" style={css('font-size:17px;color:var(--acc,#2563eb);')} aria-hidden="true" />
            <span style={css('font-size:14px;font-weight:600;color:var(--fg);')}>
              Rule Authoring & Spark SQL Validator
            </span>
            <span style={badge('var(--acc)', 'var(--accb)')}>{assetKey}</span>
          </div>
          <div style={css('display:flex;align-items:center;gap:6px;flex-wrap:wrap;')}>
            <span style={css('font-size:11.5px;color:var(--fgs);margin-right:4px;')}>Templates:</span>
            {(
              [
                ['not_null', 'NOT NULL'],
                ['positive', '>= 0 Range'],
                ['unique', 'Unique Key'],
                ['in_set', 'Non-empty Text'],
                ['rlike', 'Regex RLIKE'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => applyTemplate(k)}
                style={css(
                  'padding:4px 9px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--bg2,#f4f4f6);font-size:11.5px;font-weight:500;color:var(--fgm);cursor:pointer;',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={css('padding:16px 18px;display:grid;grid-template-columns:1.25fr 1fr;gap:18px;')}>
          {/* Left: Rule Form */}
          <div style={css('display:flex;flex-direction:column;gap:12px;')}>
            <div style={css('display:grid;grid-template-columns:1.3fr 1fr 0.7fr 0.7fr;gap:10px;')}>
              <div>
                <label style={css('display:block;font-size:11px;font-weight:600;color:var(--fgs);margin-bottom:4px;text-transform:uppercase;')}>
                  Rule Name
                </label>
                <input
                  type="text"
                  aria-label="Rule Name"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  placeholder="e.g. Positive invoice total"
                  style={css(
                    'width:100%;height:32px;padding:0 10px;border:1px solid var(--border,#e7e7ea);border-radius:7px;background:var(--card,#fff);color:var(--fg);font-size:12.5px;',
                  )}
                />
              </div>

              <div>
                <label style={css('display:block;font-size:11px;font-weight:600;color:var(--fgs);margin-bottom:4px;text-transform:uppercase;')}>
                  Rule Type
                </label>
                <select
                  aria-label="Rule Type"
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value as RuleType)}
                  style={css(
                    'width:100%;height:32px;padding:0 8px;border:1px solid var(--border,#e7e7ea);border-radius:7px;background:var(--card,#fff);color:var(--fg);font-size:12.5px;',
                  )}
                >
                  {(Object.keys(RULE_TYPE_LABELS) as RuleType[]).map((t) => (
                    <option key={t} value={t}>
                      {RULE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={css('display:block;font-size:11px;font-weight:600;color:var(--fgs);margin-bottom:4px;text-transform:uppercase;')}>
                  Threshold %
                </label>
                <input
                  type="number"
                  aria-label="Threshold %"
                  min={1}
                  max={100}
                  step={0.5}
                  value={thresholdPct}
                  onChange={(e) => setThresholdPct(Number(e.target.value))}
                  style={css(
                    'width:100%;height:32px;padding:0 8px;border:1px solid var(--border,#e7e7ea);border-radius:7px;background:var(--card,#fff);color:var(--fg);font-size:12.5px;',
                  )}
                />
              </div>

              <div>
                <label style={css('display:block;font-size:11px;font-weight:600;color:var(--fgs);margin-bottom:4px;text-transform:uppercase;')}>
                  Severity
                </label>
                <select
                  aria-label="Severity"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as 'Critical' | 'High' | 'Medium')}
                  style={css(
                    'width:100%;height:32px;padding:0 8px;border:1px solid var(--border,#e7e7ea);border-radius:7px;background:var(--card,#fff);color:var(--fg);font-size:12.5px;',
                  )}
                >
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                </select>
              </div>
            </div>

            <div>
              <div style={css('display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;')}>
                <label style={css('font-size:11px;font-weight:600;color:var(--fgs);text-transform:uppercase;')}>
                  Spark SQL Predicate Expression
                </label>
                <span style={css('font-size:11px;color:var(--fgs);')}>
                  Evaluated via <code>df.filter(expr)</code> in <code>nb_governly_compute_publish</code>
                </span>
              </div>
              <textarea
                aria-label="Spark SQL Predicate Expression"
                rows={3}
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                placeholder="e.g. amount >= 0 AND customer_id IS NOT NULL"
                style={css(
                  "width:100%;padding:8px 10px;border:1px solid var(--border,#e7e7ea);border-radius:8px;background:var(--bg,#fafafa);color:var(--fg);font-size:12.5px;font-family:'Geist Mono',monospace;resize:vertical;",
                )}
              />
            </div>

            {schemaColumns.length > 0 && (
              <div>
                <div style={css('font-size:11px;color:var(--fgs);margin-bottom:5px;')}>
                  Click a schema column on <strong>{assetKey}</strong> to append to expression:
                </div>
                <div style={css('display:flex;flex-wrap:wrap;gap:5px;max-height:76px;overflow-y:auto;')}>
                  {schemaColumns.map((col) => (
                    <button
                      key={col.col}
                      type="button"
                      onClick={() => insertColumn(col.col)}
                      style={css(
                        "padding:3px 8px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);font-size:11.5px;font-family:'Geist Mono',monospace;color:var(--fg);cursor:pointer;display:inline-flex;align-items:center;gap:5px;",
                      )}
                    >
                      <span>{col.col}</span>
                      <span style={css('font-size:10px;color:var(--fgs);')}>{col.type}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={css('display:flex;align-items:center;gap:10px;padding-top:4px;flex-wrap:wrap;')}>
              <button
                type="button"
                disabled={!validation.valid || saving}
                onClick={() => void handleSave()}
                style={{
                  ...btnPrimary,
                  opacity: !validation.valid || saving ? 0.55 : 1,
                  cursor: !validation.valid || saving ? 'not-allowed' : 'pointer',
                }}
              >
                <i className={`ph ${editingRuleId ? 'ph-floppy-disk' : 'ph-plus-circle'}`} aria-hidden="true" />
                {saving
                  ? 'Saving rule…'
                  : editingRuleId
                    ? 'Save Changes to Rule'
                    : 'Save Rule to Notebook Queue'}
              </button>
              {editingRuleId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingRuleId(null);
                    setStatusBanner(null);
                  }}
                  style={btnSecondary}
                >
                  Cancel Edit
                </button>
              )}
              {customRules.length === 0 && (
                <button
                  type="button"
                  onClick={() => void seedDefaultRules(assetKey, schemaColumns[0]?.col ?? 'id')}
                  style={btnSecondary}
                >
                  <i className="ph ph-magic-wand" aria-hidden="true" />
                  Add Editable Default Rules
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleCopyNotebookCode()}
                style={btnSecondary}
              >
                <i className="ph ph-code" aria-hidden="true" />
                {copiedSnippet ? 'Copied PySpark snippet!' : 'Copy PySpark Snippet'}
              </button>
            </div>

            {statusBanner && (
              <div
                style={css(
                  'padding:8px 12px;border-radius:8px;background:var(--okb);color:var(--ok);font-size:12px;font-weight:500;',
                )}
              >
                {statusBanner}
              </div>
            )}
          </div>

          {/* Right: Live Rule Validator Panel */}
          <div
            style={css(
              'background:var(--bg,#fafafa);border:1px solid var(--border,#e7e7ea);border-radius:10px;padding:13px 15px;display:flex;flex-direction:column;gap:10px;',
            )}
          >
            <div style={css('display:flex;align-items:center;justify-content:space-between;')}>
              <span style={css('font-size:12px;font-weight:600;color:var(--fg);')}>
                Rule Validator Diagnostics
              </span>
              {isBlank ? (
                <span style={badge('var(--fgm)', 'var(--card2,#f4f4f6)')}>Ready to Validate</span>
              ) : validation.valid ? (
                <span style={badge('var(--ok)', 'var(--okb)')}>Valid Spark SQL Rule</span>
              ) : (
                <span style={badge('var(--crit)', 'var(--critb)')}>Validation Failed</span>
              )}
            </div>

            {isBlank ? (
              <div style={css('font-size:12px;color:var(--fgm);line-height:1.45;')}>
                Enter a rule name and Spark SQL expression, click a schema column pill on the left, or choose a template above to validate against <strong>{assetKey}</strong>.
              </div>
            ) : validation.issues.length === 0 ? (
              <div style={css('font-size:12px;color:var(--ok);display:flex;align-items:center;gap:6px;')}>
                <i className="ph ph-check-circle" aria-hidden="true" />
                Syntax, safety, and column schema checks passed.
              </div>
            ) : (
              <div style={css('display:flex;flex-direction:column;gap:6px;')}>
                {validation.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    style={css(
                      `padding:7px 10px;border-radius:7px;font-size:12px;background:${
                        issue.severity === 'error' ? 'var(--critb)' : 'var(--warnb)'
                      };color:${issue.severity === 'error' ? 'var(--crit)' : 'var(--warn)'};`,
                    )}
                  >
                    <strong>{issue.severity === 'error' ? 'Error: ' : 'Warning: '}</strong>
                    {issue.message}
                  </div>
                ))}
              </div>
            )}

            <div>
              <div style={css('font-size:11px;font-weight:600;color:var(--fgs);text-transform:uppercase;margin-bottom:4px;')}>
                Bound Schema Columns ({validation.boundColumns.length})
              </div>
              {validation.boundColumns.length === 0 ? (
                <div style={css('font-size:12px;color:var(--fgm);')}>No bound columns detected.</div>
              ) : (
                <div style={css('display:flex;flex-wrap:wrap;gap:6px;')}>
                  {validation.boundColumns.map((bc) => (
                    <span
                      key={bc.name}
                      style={css(
                        "padding:2px 8px;border-radius:6px;background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);font-size:11.5px;font-family:'Geist Mono',monospace;color:var(--fg);",
                      )}
                    >
                      {bc.name}: <strong style={css('color:var(--acc);')}>{bc.type}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div style={css('font-size:11px;font-weight:600;color:var(--fgs);text-transform:uppercase;margin-bottom:4px;')}>
                Compiled Notebook PySpark & SQL
              </div>
              <div
                style={css(
                  "padding:8px 10px;border-radius:7px;background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);font-size:11.5px;font-family:'Geist Mono',monospace;color:var(--fgm);overflow-x:auto;",
                )}
              >
                <div>{validation.sparkPreview || '—'}</div>
                <div style={css('margin-top:4px;color:var(--fgs);font-size:11px;')}>
                  {validation.sqlPreview}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Configured Custom Rules Queue */}
        {customRules.length > 0 && (
          <div style={css('border-top:1px solid var(--border,#e7e7ea);padding:12px 18px;background:var(--bg,#fafafa);')}>
            <div style={css('font-size:12px;font-weight:600;color:var(--fg);margin-bottom:8px;')}>
              Notebook Rule Queue for {assetKey} ({customRules.length})
            </div>
            <div style={css('display:flex;flex-direction:column;gap:6px;')}>
              {customRules.map((cr) => (
                <div
                  key={cr.id}
                  style={css(
                    'display:grid;grid-template-columns:1.1fr 1.6fr 95px 90px 130px;gap:10px;align-items:center;padding:8px 12px;border-radius:8px;background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);',
                  )}
                >
                  <div>
                    <div style={css('font-size:12.5px;font-weight:600;color:var(--fg);')}>{cr.rule_name}</div>
                    <div style={css('font-size:11px;color:var(--fgs);')}>{RULE_TYPE_LABELS[cr.rule_type] ?? cr.rule_type}</div>
                  </div>
                  <div style={css("font-size:12px;font-family:'Geist Mono',monospace;color:var(--fgm);")}>
                    {cr.expression}
                  </div>
                  <div style={css("font-size:12px;font-family:'Geist Mono',monospace;color:var(--fg);")}>
                    &ge; {cr.threshold_pct}%
                  </div>
                  <div>
                    <span
                      style={badge(
                        cr.is_active ? 'var(--ok)' : 'var(--fgm)',
                        cr.is_active ? 'var(--okb)' : 'var(--bg2)',
                      )}
                    >
                      {cr.is_active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <div style={css('display:flex;align-items:center;gap:6px;justify-content:flex-end;')}>
                    <button
                      type="button"
                      onClick={() => startEditingRule(cr)}
                      style={css(
                        'padding:3px 8px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);font-size:11.5px;color:#4338ca;font-weight:600;cursor:pointer;',
                      )}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleRuleActive(cr.id, cr.is_active)}
                      style={css(
                        'padding:3px 8px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);font-size:11.5px;color:var(--fgm);cursor:pointer;',
                      )}
                    >
                      {cr.is_active ? 'Pause' : 'Enable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteRule(cr.id)}
                      style={css(
                        'padding:3px 8px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);font-size:11.5px;color:var(--crit);cursor:pointer;',
                      )}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
