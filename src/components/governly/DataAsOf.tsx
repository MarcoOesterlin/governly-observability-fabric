import { css } from "../../lib/css";
import { Box } from "./Box";

export function DataAsOf({
  relativeLabel = "2m ago",
  utcIso = "2026-10-25T12:00:00Z",
  onRefresh,
}: {
  relativeLabel?: string;
  utcIso?: string;
  onRefresh?: () => void;
}) {
  return (
    <div style={css("display:inline-flex;align-items:center;gap:6px")}>
      <span title={utcIso} style={css("font-size:11px;color:var(--fgs)")}>
        Data as of {relativeLabel}
      </span>
      <Box
        as="button"
        type="button"
        aria-label="Refresh telemetry data"
        onClick={onRefresh}
        style="width:24px;height:24px;border-radius:6px;border:1px solid var(--border);background:var(--card);color:var(--fgm);display:inline-flex;align-items:center;justify-content:center;cursor:pointer"
        hover="background:var(--sec);color:var(--fg)"
      >
        <i className="ph ph-arrows-clockwise" style={css("font-size:12px")} aria-hidden="true" />
      </Box>
    </div>
  );
}
