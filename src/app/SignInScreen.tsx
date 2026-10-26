import { client } from "../data/client";
import { css } from "../lib/css";
import { Box } from "../components/governly/Box";

export function SignInScreen() {
  return (
    <Box style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:24px">
      <div
        style={css(
          "background:var(--card);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);padding:40px 32px;max-width:420px;width:100%;text-align:center"
        )}
      >
        <div
          style={css(
            "width:44px;height:44px;border-radius:11px;background:var(--accent);color:var(--primary);display:inline-flex;align-items:center;justify-content:center;margin-bottom:14px"
          )}
        >
          <i className="ph-fill ph-shield-check" style={css("font-size:22px")} aria-hidden="true" />
        </div>
        <div style={css("font-size:16px;font-weight:600;color:var(--fg);letter-spacing:-0.01em")}>
          Sign in to Governly
        </div>
        <div style={css("font-size:12.5px;color:var(--fgm);margin-top:6px;margin-bottom:20px;line-height:1.5")}>
          Governly needs your Microsoft account to show the workspaces you have access to.
        </div>
        <button
          type="button"
          style={css(
            "display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:9px;border:none;background:var(--primary);color:var(--pfg);font-size:12.5px;font-weight:600;cursor:pointer"
          )}
          onClick={() => {
            const auth = client.auth as unknown as {
              ensureSignedInWithFabric?: () => Promise<unknown>;
            };
            void auth.ensureSignedInWithFabric?.();
          }}
        >
          <i className="ph ph-microsoft-outlook-logo" aria-hidden="true" />
          Sign in with Microsoft
        </button>
      </div>
    </Box>
  );
}
