import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export const LIGHT_VARS: Record<string, string> = {
  '--bg': '#fafafa', '--card': '#ffffff', '--card2': '#f4f4f5', '--border': '#e8e8eb',
  '--border2': '#d4d4d8', '--chrome': '#ffffff',
  '--fg': '#18181b', '--fgm': '#52525b', '--fgs': '#a1a1aa',
  '--primary': '#18181b', '--pfg': '#fafafa',
  '--ok': '#16a34a', '--okb': '#f0fdf4', '--warn': '#f59e0b', '--warnb': '#fffbeb',
  '--crit': '#dc2626', '--critb': '#fef2f2', '--info': '#2563eb', '--infob': '#eff6ff',
  '--shadow': '0 1px 2px rgba(16,24,40,0.05)',
};

export const DARK_VARS: Record<string, string> = {
  '--bg': '#09090b', '--card': '#131316', '--card2': '#1d1d21', '--border': '#27272a',
  '--border2': '#3f3f46', '--chrome': '#0c0c0f',
  '--fg': '#fafafa', '--fgm': '#a1a1aa', '--fgs': '#71717a',
  '--primary': '#fafafa', '--pfg': '#18181b',
  '--ok': '#4ade80', '--okb': 'rgba(34,197,94,0.15)', '--warn': '#fbbf24', '--warnb': 'rgba(245,158,11,0.15)',
  '--crit': '#f87171', '--critb': 'rgba(248,113,113,0.15)', '--info': '#60a5fa', '--infob': 'rgba(96,165,250,0.15)',
  '--shadow': '0 1px 2px rgba(0,0,0,0.5)',
};

export const ACCENT = '#4f46e5';
const STORAGE_KEY = 'governly-theme-v2';

type Theme = 'light' | 'dark';
type ThemeValue = { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void; vars: Record<string, string> };

const ThemeContext = createContext<ThemeValue | null>(null);

function initial(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return 'light';
  } catch {
    return 'light';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initial);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage unavailable */ }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({ theme, toggle, setTheme, vars: { ...(theme === 'dark' ? DARK_VARS : LIGHT_VARS), '--accent': ACCENT } }),
    [theme, toggle, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
