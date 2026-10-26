const MINUS = '\u2212';

export function formatDuration(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  const total = Math.round(minutes);
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours) return mins ? `${hours}h ${mins}m` : `${hours}h`;
  return `${mins}m`;
}

export function formatRelative(at: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, (now.getTime() - at.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  const hours = seconds / 3600;
  if (hours >= 24 && hours < 48) return 'Yesterday';
  return `${formatDuration(seconds / 60)} ago`;
}

export function formatCompactNumber(n: number): string {
  const units: Array<[number, string]> = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [size, suffix] of units) {
    if (Math.abs(n) >= size) {
      const scaled = n / size;
      return `${scaled.toFixed(1).replace(/\.0$/, '')}${suffix}`;
    }
  }
  return String(n);
}

export function formatPercent(n: number, digits = 1): string {
  const body = Math.abs(n).toFixed(digits);
  return `${n < 0 ? MINUS : ''}${body}%`;
}
