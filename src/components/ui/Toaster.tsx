import { css } from "../../lib/css";

export interface ToastItem {
  id: string;
  message: string;
}

export function Toaster({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;
  return (
    <div
      style={css("position:fixed;bottom:20px;right:20px;display:flex;flex-direction:column;gap:8px;z-index:100")}
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={css(
            "background:var(--card);border:1px solid var(--border);box-shadow:var(--shadow);border-radius:9px;padding:10px 14px;font-size:12.5px;color:var(--fg)"
          )}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
