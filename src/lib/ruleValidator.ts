import type { SchemaColumnFixture } from '../fixtures/types';

export type RuleType = 'sql_predicate' | 'not_null' | 'unique' | 'range';

export interface RuleValidationIssue {
  severity: 'error' | 'warning';
  message: string;
}

export interface BoundColumnInfo {
  name: string;
  type: string;
}

export interface RuleValidationResult {
  valid: boolean;
  issues: RuleValidationIssue[];
  boundColumns: BoundColumnInfo[];
  unknownColumns: string[];
  sparkPreview: string;
  sqlPreview: string;
}

const FORBIDDEN_KEYWORDS = new Set([
  'DROP',
  'DELETE',
  'UPDATE',
  'INSERT',
  'ALTER',
  'TRUNCATE',
  'EXEC',
  'EXECUTE',
  'MERGE',
  'GRANT',
  'REVOKE',
  'CREATE',
  'SELECT',
  'FROM',
  'JOIN',
  'UNION',
]);

const AGGREGATE_FUNCTIONS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'STDDEV', 'VARIANCE']);

const ALLOWED_KEYWORDS_AND_FUNCS = new Set([
  'AND',
  'OR',
  'NOT',
  'IS',
  'NULL',
  'TRUE',
  'FALSE',
  'IN',
  'BETWEEN',
  'LIKE',
  'ILIKE',
  'RLIKE',
  'REGEXP',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'AS',
  'CAST',
  'COALESCE',
  'NULLIF',
  'LENGTH',
  'CHAR_LENGTH',
  'LOWER',
  'UPPER',
  'TRIM',
  'LTRIM',
  'RTRIM',
  'ABS',
  'ROUND',
  'FLOOR',
  'CEIL',
  'CEILING',
  'YEAR',
  'MONTH',
  'DAY',
  'DATEDIFF',
  'DATE_SUB',
  'DATE_ADD',
  'CURRENT_DATE',
  'CURRENT_TIMESTAMP',
  'TO_DATE',
  'TO_TIMESTAMP',
  'SUBSTRING',
  'SUBSTR',
  'CONCAT',
  'REGEXP_LIKE',
  'REGEXP_EXTRACT',
  'SIZE',
  'ARRAY_CONTAINS',
  'INT',
  'BIGINT',
  'STRING',
  'DOUBLE',
  'DECIMAL',
  'FLOAT',
  'BOOLEAN',
  'DATE',
  'TIMESTAMP',
]);

function isNumericType(dtype: string): boolean {
  const u = dtype.toUpperCase();
  return (
    u.includes('INT') ||
    u.includes('DEC') ||
    u.includes('NUM') ||
    u.includes('DOUBLE') ||
    u.includes('FLOAT') ||
    u.includes('LONG') ||
    u.includes('SHORT') ||
    u.includes('MONEY')
  );
}

export function validateQualityRule(params: {
  ruleName: string;
  ruleType: RuleType;
  expression: string;
  thresholdPct: number;
  assetKey: string;
  schemaColumns?: SchemaColumnFixture[];
}): RuleValidationResult {
  const { ruleName, ruleType, expression, thresholdPct, assetKey, schemaColumns = [] } = params;
  const issues: RuleValidationIssue[] = [];
  const raw = expression.trim();

  if (!ruleName.trim()) {
    issues.push({ severity: 'error', message: 'Rule name is required.' });
  }
  if (Number.isNaN(thresholdPct) || thresholdPct <= 0 || thresholdPct > 100) {
    issues.push({ severity: 'error', message: 'Pass threshold must be between 0.1% and 100%.' });
  }
  if (!raw) {
    issues.push({ severity: 'error', message: 'Rule expression cannot be empty.' });
    return {
      valid: false,
      issues,
      boundColumns: [],
      unknownColumns: [],
      sparkPreview: '',
      sqlPreview: '',
    };
  }

  if (raw.includes(';') || raw.includes('--') || raw.includes('/*') || raw.includes('*/')) {
    issues.push({
      severity: 'error',
      message: 'Statement terminators (;) and SQL comments (-- or /* */) are not allowed in quality expressions.',
    });
  }

  // Check balanced single quotes and strip string literals for token analysis
  let inSingleQuote = false;
  let stripped = '';
  const stringComparisonPairs: Array<{ ident: string; literal: string }> = [];

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "'") {
      if (inSingleQuote && raw[i + 1] === "'") {
        i += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      stripped += ' ';
    } else if (!inSingleQuote) {
      stripped += ch;
    } else {
      stripped += ' ';
    }
  }

  if (inSingleQuote) {
    issues.push({ severity: 'error', message: "Unclosed string literal (missing closing single quote ')." });
  }

  // Check balanced parentheses
  let parenDepth = 0;
  for (const ch of stripped) {
    if (ch === '(') parenDepth += 1;
    if (ch === ')') parenDepth -= 1;
    if (parenDepth < 0) {
      issues.push({ severity: 'error', message: 'Unbalanced parentheses: unexpected closing parenthesis ).' });
      break;
    }
  }
  if (parenDepth > 0) {
    issues.push({ severity: 'error', message: `Unbalanced parentheses: missing ${parenDepth} closing parenthesis ).` });
  }

  // Check trailing/leading dangling operators
  if (/^(AND|OR)\b/i.test(stripped.trim()) || /\b(AND|OR|=|!=|<>|<|>|<=|>=|\+|-|\*|\/)\s*$/i.test(stripped.trim())) {
    issues.push({ severity: 'error', message: 'Expression has an incomplete or dangling operator at the start or end.' });
  }

  // Extract Comparison with string literals for type checking: e.g. col = 'abc' or col > 'abc'
  const cmpRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|!=|<>|<|>|<=|>=)\s*'([^']*)'/g;
  let cmpMatch = cmpRegex.exec(raw);
  while (cmpMatch) {
    stringComparisonPairs.push({ ident: cmpMatch[1], literal: cmpMatch[2] });
    cmpMatch = cmpRegex.exec(raw);
  }

  // Extract words/identifiers
  const wordRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
  const candidateColumns: string[] = [];
  let match = wordRegex.exec(stripped);
  while (match) {
    const token = match[1];
    const upper = token.toUpperCase();
    const afterToken = stripped.slice(match.index + token.length).trimStart();
    const isFuncCall = afterToken.startsWith('(');

    if (FORBIDDEN_KEYWORDS.has(upper)) {
      issues.push({
        severity: 'error',
        message: `Forbidden SQL keyword "${upper}" in quality predicate. Write a row-level filter condition (e.g. amount >= 0).`,
      });
    } else if (AGGREGATE_FUNCTIONS.has(upper) && isFuncCall && ruleType !== 'unique') {
      issues.push({
        severity: 'error',
        message: `Aggregate function "${upper}(...)" cannot be used in a row-level predicate. Use rule type "Unique" or a row filter.`,
      });
    } else if (!ALLOWED_KEYWORDS_AND_FUNCS.has(upper)) {
      if (isFuncCall) {
        issues.push({
          severity: 'warning',
          message: `Unrecognized Spark SQL function "${token}()". Ensure it is a valid Spark SQL built-in scalar function.`,
        });
      } else if (!candidateColumns.some((c) => c.toLowerCase() === token.toLowerCase())) {
        candidateColumns.push(token);
      }
    }
    match = wordRegex.exec(stripped);
  }

  const schemaByLower = new Map<string, SchemaColumnFixture>();
  for (const col of schemaColumns) {
    schemaByLower.set(col.col.toLowerCase(), col);
  }

  const boundColumns: BoundColumnInfo[] = [];
  const unknownColumns: string[] = [];

  for (const ident of candidateColumns) {
    const found = schemaByLower.get(ident.toLowerCase());
    if (found) {
      boundColumns.push({ name: found.col, type: found.type });
    } else if (schemaColumns.length > 0) {
      unknownColumns.push(ident);
    } else {
      boundColumns.push({ name: ident, type: 'UNVERIFIED' });
    }
  }

  if (unknownColumns.length > 0) {
    const availablePreview = schemaColumns
      .slice(0, 6)
      .map((c) => c.col)
      .join(', ');
    issues.push({
      severity: 'error',
      message: `Unknown column${unknownColumns.length > 1 ? 's' : ''} on ${assetKey}: ${unknownColumns.join(', ')}. Available columns: ${availablePreview}${schemaColumns.length > 6 ? ', …' : ''}.`,
    });
  }

  if (candidateColumns.length === 0) {
    issues.push({
      severity: 'warning',
      message: 'Expression does not reference any table columns (constant expression).',
    });
  }

  // Type compatibility check for numeric columns compared against non-numeric strings
  for (const pair of stringComparisonPairs) {
    const col = schemaByLower.get(pair.ident.toLowerCase());
    if (col && isNumericType(col.type) && Number.isNaN(Number(pair.literal))) {
      issues.push({
        severity: 'error',
        message: `Type mismatch: column "${col.col}" has numeric type ${col.type} but is compared to non-numeric string '${pair.literal}'.`,
      });
    }
  }

  const hasError = issues.some((i) => i.severity === 'error');
  const escaped = raw.replace(/"/g, '\\"');
  const sparkPreview =
    ruleType === 'unique' && candidateColumns.length === 1
      ? `df.select("${candidateColumns[0]}").distinct().count() / df.count()`
      : `df.filter("${escaped}").count() / df.count()`;
  const sqlPreview =
    ruleType === 'unique' && candidateColumns.length === 1
      ? `SELECT COUNT(DISTINCT ${candidateColumns[0]}) * 100.0 / NULLIF(COUNT(*), 0) AS pass_pct FROM ${assetKey}`
      : `SELECT SUM(CASE WHEN (${raw}) THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) AS pass_pct FROM ${assetKey}`;

  return {
    valid: !hasError,
    issues,
    boundColumns,
    unknownColumns,
    sparkPreview,
    sqlPreview,
  };
}
