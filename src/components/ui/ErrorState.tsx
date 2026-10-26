import { css } from "../../lib/css";

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      style={css(
        "background:var(--card);border:1px solid var(--border);border-radius:11px;box-shadow:var(--shadow);padding:36px 24px;text-align:center"
      )}
    >
      <div
        style={css(
          "width:36px;height:36px;border-radius:9px;background:var(--critb);color:var(--crit);display:inline-flex;align-items:center;justify-content:center;margin-bottom:10px"
        )}
      >
        <i className="ph-fill ph-warning-octagon" style={css("font-size:18px")} aria-hidden="true" />
      </div>
      <div style={css("font-size:13.5px;font-weight:600;color:var(--fg)")}>Unable to load data</div>
      <div style={css("font-size:12px;color:var(--fgm);margin-top:4px")}>{message}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={css(
            "margin-top:12px;padding:6px 12px;border-radius:7px;border:1px solid var(--border);background:var(--card2);color:var(--fg);font-size:12px;font-weight:500;cursor:pointer"
          )}
        >
          Retry
        </button>
      )}
    </div>
  );
}
