import { css } from "../../lib/css";
import { Box } from "../governly/Box";

export function AppSpinner({ label = "Starting Governly…" }: { label?: string }) {
  return (
    <Box
      style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:var(--bg);color:var(--fg)"
      role="status"
      aria-live="polite"
    >
      <div style={css("display:flex;align-items:center;gap:10px")}>
        <div
          style={css(
            "width:28px;height:28px;border-radius:8px;background:var(--primary);color:var(--pfg);display:flex;align-items:center;justify-content:center"
          )}
        >
          <i className="ph-fill ph-shield-check" style={css("font-size:16px")} aria-hidden="true" />
        </div>
        <span style={css("font-size:15px;font-weight:600;letter-spacing:-0.01em")}>Governly</span>
      </div>
      <div style={css("width:140px;height:2px;background:var(--border);border-radius:999px;overflow:hidden")}>
        <div style={css("width:60%;height:100%;background:var(--primary);border-radius:999px")} />
      </div>
      <span style={css("font-size:12px;color:var(--fgm)")}>{label}</span>
    </Box>
  );
}
