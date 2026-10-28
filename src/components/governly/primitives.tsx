import type { CSSProperties } from 'react';

export type Pair = [color: string, background: string];

export const badge = (c: string, b: string): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '2px 9px',
  borderRadius: '7px', fontSize: '11px', fontWeight: 600, color: c,
  background: b, whiteSpace: 'nowrap', lineHeight: 1.5,
});

export const pill = (c: string, b: string): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 10px',
  borderRadius: '999px', fontSize: '11px', fontWeight: 600, color: c,
  background: b, lineHeight: 1.6,
});

export const dot = (c: string, pulse: boolean): CSSProperties => ({
  width: '8px', height: '8px', borderRadius: '999px', background: c,
  flex: '0 0 auto', marginTop: '5px',
  ...(pulse ? { animation: 'pulseDot 1.5s ease-in-out infinite' } : {}),
});

const SEV: Record<string, Pair> = {
  Critical: ['var(--crit)', 'var(--critb)'],
  High: ['var(--crit)', 'var(--critb)'],
  Medium: ['var(--warn)', 'var(--warnb)'],
  Low: ['var(--info)', 'var(--infob)'],
};
export const sevPair = (s: string): Pair => {
  if (!s) return SEV.Low;
  const norm = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return SEV[norm] ?? SEV.Low;
};

const STATUS: Record<string, Pair> = {
  Open: ['var(--crit)', 'var(--critb)'],
  'In progress': ['var(--info)', 'var(--infob)'],
  Blocked: ['var(--warn)', 'var(--warnb)'],
  Investigating: ['var(--info)', 'var(--infob)'],
  Acknowledged: ['var(--warn)', 'var(--warnb)'],
  Resolved: ['var(--ok)', 'var(--okb)'],
};
export const statusPair = (s: string): Pair => STATUS[s] ?? STATUS.Open;

export const qColor = (q: number): string => (q >= 95 ? 'var(--ok)' : q >= 88 ? 'var(--warn)' : 'var(--crit)');

export const statusColor = (s: string): string =>
  s === 'healthy' ? 'var(--ok)' : s === 'warning' ? 'var(--warn)' : 'var(--crit)';
