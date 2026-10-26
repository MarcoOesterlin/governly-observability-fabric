import { useEffect, useState } from 'react';
import { css } from '../../../lib/css';
import { badge } from '../primitives';
import {
  useAssetFailedRows,
  useAssetQuality,
  useAssetSchema,
  type FailedRowItem,
} from '../../../data/useAsset';
import { useQualityRules } from '../../../data/useQualityRules';
import { QualityRuleStudio } from '../QualityRuleStudio';
import type { QualityRuleFixture } from '../../../fixtures/types';

const btnSecondary = css(
  'height:28px;padding:0 10px;border:1px solid var(--border,#e7e7ea);border-radius:7px;background:var(--card,#fff);color:var(--fg);font-size:12px;font-weight:500;display:inline-flex;align-items:center;gap:5px;cursor:pointer;',
);

const RESULT = {
  pass: ['ph-check-circle', 'var(--ok)', 'var(--okb)', 'Pass'],
  warn: ['ph-warning-circle', 'var(--warn)', 'var(--warnb)', 'Warn'],
  fail: ['ph-x-circle', 'var(--crit)', 'var(--critb)', 'Fail'],
} as const;

function parseRowColumns(rowJson: string): Array<[string, unknown]> {
  try {
    const parsed = JSON.parse(rowJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.entries(parsed as Record<string, unknown>);
    }
  } catch {
    // ignore malformed json
  }
  return [];
}

export function QualityTab({
  assetKey,
  rules: propRules,
  section = 'all',
  onEditRule,
}: {
  assetKey: string;
  rules?: QualityRuleFixture[];
  section?: 'all' | 'rules' | 'failed-rows';
  onEditRule?: (ruleId?: string) => void;
}) {
  const isAllTables = !assetKey || assetKey === '*';
  const { columns: schemaCols } = useAssetSchema(isAllTables ? undefined : assetKey);
  const {
    rules: userRules,
    seedDefaultRules,
    toggleRuleActive,
    deleteRule,
  } = useQualityRules(isAllTables ? undefined : assetKey);
  const livePubResults = useAssetQuality(isAllTables ? undefined : assetKey);

  const [showStudio, setShowStudio] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  const displayRules: Array<
    QualityRuleFixture & {
      id?: string;
      assetKey?: string;
      isActive?: boolean;
      thresholdPct?: number;
      editable?: boolean;
    }
  > =
    propRules !== undefined
      ? propRules
      : userRules.length > 0
      ? userRules.map((ur) => {
          const match = livePubResults.find((pr) => pr.name === ur.rule_name);
          return {
            id: ur.id,
            assetKey: ur.asset_key,
            name: ur.rule_name,
            detail: isAllTables && ur.asset_key && ur.asset_key !== '*'
              ? `[${ur.asset_key}] ${ur.expression}`
              : ur.expression,
            value: !ur.is_active
              ? 'Paused'
              : (match?.value ?? `Threshold >= ${ur.threshold_pct}% (pending run)`),
            result: !ur.is_active ? 'warn' : (match?.result ?? 'pass'),
            isActive: ur.is_active,
            thresholdPct: ur.threshold_pct,
            editable: true,
          };
        })
      : !isAllTables
      ? livePubResults
      : [];

  const passCount = displayRules.filter((r) => r.result !== 'fail').length;

  const assetFailedRows = useAssetFailedRows(isAllTables ? undefined : assetKey, isAllTables);
  const allWorkspaceFailedRows = useAssetFailedRows(isAllTables ? undefined : assetKey, true);
  const [scopeAllTables, setScopeAllTables] = useState(isAllTables);
  const [ruleFilter, setRuleFilter] = useState<string>('ALL');
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const effectiveAllScope =
    isAllTables || scopeAllTables || (assetFailedRows.length === 0 && allWorkspaceFailedRows.length > 0);
  const activeRows: FailedRowItem[] = effectiveAllScope ? allWorkspaceFailedRows : assetFailedRows;

  const distinctRules = Array.from(new Set(activeRows.map((r) => r.ruleName)));
  const filteredRows =
    ruleFilter === 'ALL' ? activeRows : activeRows.filter((r) => r.ruleName === ruleFilter);

  const selectedRow =
    filteredRows.find((r) => r.id === selectedRowId) ?? filteredRows[0] ?? null;

  useEffect(() => {
    setRuleFilter('ALL');
  }, [assetKey]);

  const handleCopySql = (sqlText: string) => {
    void navigator.clipboard?.writeText(sqlText);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 1800);
  };

  const showRulesCard = section === 'all' || section === 'rules';
  const showFailedRowsCard = section === 'all' || section === 'failed-rows';

  return (
    <div style={css('display:flex;flex-direction:column;gap:18px;')}>
      {showStudio && (
        <QualityRuleStudio
          assetKey={assetKey}
          initialEditRuleId={editingRuleId}
          onRuleSaved={() => {
            setEditingRuleId(null);
            setShowStudio(false);
          }}
        />
      )}
      {showRulesCard && (
        <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
          <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;')}>
            <div style={css('font-size:14px;font-weight:600;color:var(--fg);')}>Quality rules</div>
            <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
              <span style={css('font-size:12.5px;color:var(--fgm);')}>
                {passCount} of {displayRules.length} passing
              </span>
              {propRules === undefined && displayRules.length === 0 && (
                <button
                  type="button"
                  onClick={() => void seedDefaultRules(assetKey, schemaCols[0]?.col ?? 'id')}
                  style={{ ...btnSecondary, height: 28, padding: '0 10px', fontSize: 12 }}
                >
                  <i className="ph ph-magic-wand" aria-hidden="true" />
                  Add Default Rules (Editable)
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (onEditRule) {
                    onEditRule(undefined);
                  } else {
                    setEditingRuleId(null);
                    setShowStudio((s) => !s);
                  }
                }}
                style={{ ...btnSecondary, height: 28, padding: '0 10px', fontSize: 12 }}
              >
                <i className="ph ph-flask" aria-hidden="true" />
                {showStudio ? 'Hide Rule Studio' : 'Author Rule'}
              </button>
            </div>
          </div>

          {displayRules.length === 0 ? (
            <div style={css('padding:32px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;')}>
              <div style={css('font-size:13.5px;font-weight:600;color:var(--fg);')}>
                No quality rules configured for <span style={css("font-family:'Geist Mono',monospace;")}>{assetKey}</span> yet
              </div>
              <div style={css('font-size:12.5px;color:var(--fgm);max-width:520px;')}>
                Create your own Spark SQL rules from scratch or load editable default rules (Completeness &amp; Key Uniqueness) that you can customize or delete anytime.
              </div>
              <div style={css('display:flex;align-items:center;gap:10px;margin-top:4px;')}>
                <button
                  type="button"
                  onClick={() => {
                    if (onEditRule) {
                      onEditRule(undefined);
                    } else {
                      setEditingRuleId(null);
                      setShowStudio(true);
                    }
                  }}
                  style={css(
                    'height:32px;padding:0 13px;border:none;border-radius:8px;background:var(--acc,#2563eb);color:#fff;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;gap:6px;cursor:pointer;',
                  )}
                >
                  <i className="ph ph-plus-circle" aria-hidden="true" />
                  Create Custom Rule
                </button>
                <button
                  type="button"
                  onClick={() => void seedDefaultRules(assetKey, schemaCols[0]?.col ?? 'id')}
                  style={{ ...btnSecondary, height: 32, padding: '0 12px', fontSize: 12.5 }}
                >
                  <i className="ph ph-magic-wand" aria-hidden="true" />
                  Load Default Rules (Editable)
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={css('display:grid;grid-template-columns:24px 1.2fr 1.6fr 1fr 80px auto;gap:12px;padding:9px 18px;font-size:10.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--fgs);border-bottom:1px solid var(--border,#e7e7ea);')}>
                <span />
                <span>Rule</span>
                <span>Definition</span>
                <span>Current</span>
                <span>Result</span>
                <span style={css('text-align:right;')}>Actions</span>
              </div>
              {displayRules.map((q) => {
                const r = RESULT[q.result];
                const isFilteredRule = ruleFilter === q.name;
                return (
                  <div
                    key={q.id ?? q.name}
                    onClick={() => {
                      if (distinctRules.includes(q.name)) {
                        setRuleFilter((prev) => (prev === q.name ? 'ALL' : q.name));
                      }
                    }}
                    style={css(
                      `display:grid;grid-template-columns:24px 1.2fr 1.6fr 1fr 80px auto;gap:12px;padding:12px 18px;align-items:center;border-bottom:1px solid var(--border,#e7e7ea);cursor:${distinctRules.includes(q.name) ? 'pointer' : 'default'};background:${isFilteredRule ? '#eef2ff' : 'transparent'};`,
                    )}
                  >
                    <div style={css(`color:${r[1]};font-size:17px;display:flex;`)}>
                      <i className={`ph ${r[0]}`} aria-hidden="true" />
                    </div>
                    <span style={css('font-size:13px;font-weight:600;color:var(--fg);')}>{q.name}</span>
                    <span style={css("font-size:12.5px;color:var(--fgm);font-family:'Geist Mono',monospace;")}>{q.detail}</span>
                    <span style={css("font-size:12.5px;color:var(--fg);font-family:'Geist Mono',monospace;")}>{q.value}</span>
                    <span style={badge(r[1], r[2])}>{r[3]}</span>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={css('display:flex;align-items:center;justify-content:flex-end;gap:6px;')}
                    >
                      {q.editable && q.id && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              if (onEditRule) {
                                onEditRule(q.id);
                              } else {
                                setEditingRuleId(q.id ?? null);
                                setShowStudio(true);
                              }
                            }}
                            style={css(
                              'padding:3px 8px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);font-size:11.5px;font-weight:600;color:#4338ca;cursor:pointer;',
                            )}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleRuleActive(q.id!, q.isActive ?? true)}
                            style={css(
                              'padding:3px 8px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);font-size:11.5px;color:var(--fgm);cursor:pointer;',
                            )}
                          >
                            {q.isActive ? 'Pause' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteRule(q.id!)}
                            style={css(
                              'padding:3px 8px;border-radius:6px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);font-size:11.5px;color:var(--crit);cursor:pointer;',
                            )}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Failed Rows Inspector + Click-to-Diagnose Root Cause & Suggested Solution */}
      {showFailedRowsCard && (
      <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
        <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;')}>
          <div style={css('display:flex;align-items:center;gap:10px;')}>
            <div style={css('width:28px;height:28px;border-radius:7px;background:var(--critb,#fef2f2);color:var(--crit,#dc2626);display:flex;align-items:center;justify-content:center;font-size:15px;')}>
              <i className="ph ph-magnifying-glass-plus" aria-hidden="true" />
            </div>
            <div>
              <div style={css('font-size:14px;font-weight:600;color:var(--fg);display:flex;align-items:center;gap:8px;')}>
                Failed Rows Inspector &amp; Root-Cause Diagnostics
                <span style={badge('var(--crit,#dc2626)', 'var(--critb,#fef2f2)')}>
                  {filteredRows.length} {filteredRows.length === 1 ? 'row' : 'rows'}
                </span>
              </div>
              <div style={css('font-size:12px;color:var(--fgm);margin-top:1px;')}>
                Click any failed row below to inspect its column values, likely cause, and suggested remediation SQL.
              </div>
            </div>
          </div>

          {!isAllTables && (
            <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
              <button
                type="button"
                onClick={() => setScopeAllTables(false)}
                style={css(
                  `height:28px;padding:0 10px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid ${!effectiveAllScope ? '#4f46e5' : 'var(--border,#e7e7ea)'};background:${!effectiveAllScope ? '#eef2ff' : 'var(--card,#fff)'};color:${!effectiveAllScope ? '#4338ca' : 'var(--fgm)'};`,
                )}
              >
                {assetKey} ({assetFailedRows.length})
              </button>
              <button
                type="button"
                onClick={() => setScopeAllTables(true)}
                style={css(
                  `height:28px;padding:0 10px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid ${effectiveAllScope ? '#4f46e5' : 'var(--border,#e7e7ea)'};background:${effectiveAllScope ? '#eef2ff' : 'var(--card,#fff)'};color:${effectiveAllScope ? '#4338ca' : 'var(--fgm)'};`,
                )}
              >
                All workspace tables ({allWorkspaceFailedRows.length})
              </button>
            </div>
          )}
        </div>

        {distinctRules.length > 1 && (
          <div style={css('padding:9px 18px;border-bottom:1px solid var(--border,#e7e7ea);background:#fafafa;display:flex;align-items:center;gap:6px;flex-wrap:wrap;')}>
            <span style={css('font-size:11px;font-weight:600;color:var(--fgs);text-transform:uppercase;letter-spacing:0.04em;margin-right:4px;')}>
              Filter by rule:
            </span>
            <button
              type="button"
              onClick={() => setRuleFilter('ALL')}
              style={css(
                `height:24px;padding:0 9px;border-radius:999px;font-size:11.5px;font-weight:600;cursor:pointer;border:1px solid ${ruleFilter === 'ALL' ? '#18181b' : '#e4e4e7'};background:${ruleFilter === 'ALL' ? '#18181b' : '#fff'};color:${ruleFilter === 'ALL' ? '#fff' : '#52525b'};`,
              )}
            >
              All ({activeRows.length})
            </button>
            {distinctRules.map((rn) => (
              <button
                key={rn}
                type="button"
                onClick={() => setRuleFilter(rn)}
                style={css(
                  `height:24px;padding:0 9px;border-radius:999px;font-size:11.5px;font-weight:600;cursor:pointer;border:1px solid ${ruleFilter === rn ? '#4f46e5' : '#e4e4e7'};background:${ruleFilter === rn ? '#eef2ff' : '#fff'};color:${ruleFilter === rn ? '#4338ca' : '#52525b'};`,
                )}
              >
                {rn} ({activeRows.filter((r) => r.ruleName === rn).length})
              </button>
            ))}
          </div>
        )}

        {filteredRows.length === 0 ? (
          <div style={css('padding:28px 18px;text-align:center;color:var(--fgm);font-size:13px;')}>
            {isAllTables ? (
              'No failed rows detected across workspace tables.'
            ) : (
              <>
                No failed rows detected for <strong>{assetKey}</strong>.
              </>
            )}
          </div>
        ) : (
          <div style={css('display:grid;grid-template-columns:1.15fr 1fr;min-height:340px;')}>
            {/* Left column: Clickable Failed Rows List */}
            <div style={css('border-right:1px solid var(--border,#e7e7ea);max-height:540px;overflow-y:auto;')}>
              <div style={css('display:grid;grid-template-columns:1.1fr 1fr 0.9fr 1fr;gap:10px;padding:9px 16px;font-size:10.5px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--fgs);border-bottom:1px solid var(--border,#e7e7ea);position:sticky;top:0;background:var(--card,#fff);z-index:1;')}>
                <span>Primary Key / Table</span>
                <span>Failed Rule</span>
                <span>Column</span>
                <span>Offending Value</span>
              </div>
              {filteredRows.map((fr) => {
                const isSelected = selectedRow?.id === fr.id;
                return (
                  <div
                    key={fr.id}
                    onClick={() => setSelectedRowId(fr.id)}
                    style={css(
                      `display:grid;grid-template-columns:1.1fr 1fr 0.9fr 1fr;gap:10px;padding:11px 16px;align-items:center;border-bottom:1px solid var(--border,#e7e7ea);cursor:pointer;transition:background 0.12s;background:${isSelected ? '#eef2ff' : 'transparent'};border-left:3px solid ${isSelected ? '#4f46e5' : 'transparent'};`,
                    )}
                  >
                    <div style={css('min-width:0;')}>
                      <div style={css("font-size:12.5px;font-weight:600;color:var(--fg);font-family:'Geist Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>
                        {fr.primaryKey}
                      </div>
                      <div style={css('font-size:11px;color:var(--fgs);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>
                        {fr.assetKey}
                      </div>
                    </div>
                    <div style={css('font-size:12px;font-weight:500;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>
                      {fr.ruleName}
                    </div>
                    <div style={css("font-size:12px;color:#4338ca;font-family:'Geist Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>
                      {fr.failedColumn}
                    </div>
                    <div style={css('display:flex;align-items:center;justify-content:space-between;gap:6px;min-width:0;')}>
                      <span
                        style={css(
                          "font-size:11.5px;font-weight:600;color:var(--crit,#dc2626);background:var(--critb,#fef2f2);padding:2px 7px;border-radius:5px;font-family:'Geist Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;",
                        )}
                      >
                        {fr.failedValue}
                      </span>
                      <i
                        className="ph ph-caret-right"
                        style={css(`font-size:12px;color:${isSelected ? '#4f46e5' : 'var(--fgs)'};flex-shrink:0;`)}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right column: Selected Failed Row Diagnosis (Likely Cause + Suggested Solution + SQL Fix) */}
            {selectedRow && (
              <div style={css('padding:18px 20px;background:#fcfcfd;display:flex;flex-direction:column;gap:14px;max-height:540px;overflow-y:auto;')}>
                <div style={css('display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--border,#e7e7ea);')}>
                  <div>
                    <div style={css('font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#4f46e5;')}>
                      Row Diagnostic · {selectedRow.assetKey}
                    </div>
                    <div style={css("font-size:15px;font-weight:700;color:var(--fg);margin-top:2px;font-family:'Geist Mono',monospace;")}>
                      {selectedRow.primaryKey}
                    </div>
                    <div style={css("font-size:12px;color:var(--fgm);margin-top:2px;font-family:'Geist Mono',monospace;")}>
                      Rule: <strong>{selectedRow.ruleName}</strong> ({selectedRow.ruleDefinition})
                    </div>
                  </div>
                  <span style={badge('var(--crit,#dc2626)', 'var(--critb,#fef2f2)')}>
                    {selectedRow.failedColumn}: {selectedRow.failedValue}
                  </span>
                </div>

                {/* Likely Cause */}
                <div style={css('padding:12px 14px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;')}>
                  <div style={css('font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#c2410c;display:flex;align-items:center;gap:6px;margin-bottom:5px;')}>
                    <i className="ph ph-warning-octagon" style={css('font-size:14px;')} aria-hidden="true" />
                    Likely Cause
                  </div>
                  <div style={css('font-size:12.5px;line-height:1.5;color:#7c2d12;')}>
                    {selectedRow.likelyCause}
                  </div>
                </div>

                {/* Suggested Solution */}
                <div style={css('padding:12px 14px;border-radius:10px;background:#f0fdf4;border:1px solid #bbf7d0;')}>
                  <div style={css('font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#15803d;display:flex;align-items:center;gap:6px;margin-bottom:5px;')}>
                    <i className="ph ph-lightbulb-filament" style={css('font-size:14px;')} aria-hidden="true" />
                    Suggested Solution
                  </div>
                  <div style={css('font-size:12.5px;line-height:1.55;color:#14532d;white-space:pre-line;')}>
                    {selectedRow.suggestedSolution}
                  </div>
                </div>

                {/* Ready-to-run Spark SQL Fix */}
                {selectedRow.sqlFix && (
                  <div style={css('border-radius:10px;border:1px solid #e4e4e7;background:#18181b;color:#f4f4f5;overflow:hidden;')}>
                    <div style={css('padding:8px 12px;border-bottom:1px solid #27272a;display:flex;align-items:center;justify-content:space-between;')}>
                      <span style={css('font-size:11px;font-weight:600;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.04em;')}>
                        Suggested Spark SQL Remediation
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopySql(selectedRow.sqlFix)}
                        style={css('height:22px;padding:0 8px;border-radius:5px;border:1px solid #3f3f46;background:#27272a;color:#e4e4e7;font-size:11px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:4px;')}
                      >
                        <i className={`ph ${copiedSql ? 'ph-check' : 'ph-copy'}`} aria-hidden="true" />
                        {copiedSql ? 'Copied' : 'Copy SQL'}
                      </button>
                    </div>
                    <pre style={css("margin:0;padding:11px 13px;font-size:11.5px;line-height:1.45;font-family:'Geist Mono',monospace;overflow-x:auto;color:#e4e4e7;")}>
                      {selectedRow.sqlFix}
                    </pre>
                  </div>
                )}

                {/* Full Failing Row Record Values */}
                <div>
                  <div style={css('font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--fgs);margin-bottom:6px;')}>
                    Captured Row Values (Delta Record)
                  </div>
                  <div style={css('border:1px solid var(--border,#e7e7ea);border-radius:8px;background:#fff;overflow:hidden;')}>
                    {parseRowColumns(selectedRow.rowJson).map(([colName, colVal]) => {
                      const isOffendingCol =
                        colName.toLowerCase() === selectedRow.failedColumn.toLowerCase();
                      return (
                        <div
                          key={colName}
                          style={css(
                            `display:grid;grid-template-columns:150px 1fr;gap:10px;padding:6px 12px;font-size:12px;border-bottom:1px solid #f4f4f5;background:${isOffendingCol ? '#fef2f2' : 'transparent'};`,
                          )}
                        >
                          <span
                            style={css(
                              `font-family:'Geist Mono',monospace;font-weight:${isOffendingCol ? '700' : '500'};color:${isOffendingCol ? '#dc2626' : 'var(--fgm)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`,
                            )}
                          >
                            {colName}
                          </span>
                          <span
                            style={css(
                              `font-family:'Geist Mono',monospace;font-weight:${isOffendingCol ? '700' : '400'};color:${isOffendingCol ? '#dc2626' : 'var(--fg)'};word-break:break-all;`,
                            )}
                          >
                            {colVal === null || colVal === undefined ? 'NULL' : String(colVal)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
