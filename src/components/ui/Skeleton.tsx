import { css } from "../../lib/css";

export function Skeleton({ height = 84 }: { height?: number }) {
  return (
    <div
      aria-busy="true"
      style={css(
        `height:${height}px;border-radius:11px;background:var(--card2);border:1px solid var(--border)`
      )}
    />
  );
}
