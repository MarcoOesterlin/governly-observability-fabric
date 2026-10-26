import { useState } from "react";
import { css } from "../../lib/css";

export function ResolveDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Resolve incident"
      style={css(
        "position:fixed;inset:0;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;z-index:90;padding:20px"
      )}
    >
      <div
        style={css(
          "background:var(--card);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);padding:20px;max-width:440px;width:100%"
        )}
      >
        <div style={css("font-size:14.5px;font-weight:600;color:var(--fg);margin-bottom:6px")}>
          Resolve incident
        </div>
        <div style={css("font-size:12px;color:var(--fgm);margin-bottom:12px")}>
          Document the root cause and remediation steps before closing this incident.
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Resolution note…"
          style={css(
            "width:100%;min-height:84px;padding:9px 11px;border-radius:8px;border:1px solid var(--border);background:var(--card2);color:var(--fg);font-size:12.5px;resize:vertical"
          )}
        />
        <div style={css("display:flex;justify-content:flex-end;gap:8px;margin-top:14px")}>
          <button
            type="button"
            onClick={onCancel}
            style={css(
              "padding:6px 12px;border-radius:7px;border:1px solid var(--border);background:var(--card2);color:var(--fg);font-size:12px;font-weight:500;cursor:pointer"
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!note.trim()}
            onClick={() => {
              onConfirm(note.trim());
              setNote("");
            }}
            style={css(
              `padding:6px 12px;border-radius:7px;border:1px solid var(--ok);background:var(--ok);color:#fff;font-size:12px;font-weight:600;cursor:${
                note.trim() ? "pointer" : "not-allowed"
              };opacity:${note.trim() ? "1" : "0.55"}`
            )}
          >
            Resolve
          </button>
        </div>
      </div>
    </div>
  );
}
