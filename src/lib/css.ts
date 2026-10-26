import type { CSSProperties } from 'react';

const cache = new Map<string, CSSProperties>();

function toReactProp(prop: string): string {
  if (prop.startsWith('--')) return prop;
  return prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Parses a design CSS declaration string into React inline styles. Memoized by input. */
export function css(decl: string): CSSProperties {
  const cached = cache.get(decl);
  if (cached) return cached;

  const out: Record<string, string> = {};
  for (const part of decl.split(';')) {
    const sep = part.indexOf(':');
    if (sep < 0) continue;
    const prop = part.slice(0, sep).trim();
    const value = part.slice(sep + 1).trim();
    if (!prop || !value) continue;
    out[toReactProp(prop)] = value;
  }

  const style = out as CSSProperties;
  cache.set(decl, style);
  return style;
}
