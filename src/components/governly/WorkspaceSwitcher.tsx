import { useEffect, useRef, useState } from "react";
import { ALL_WORKSPACES_ID, useWorkspace } from "../../app/WorkspaceProvider";
import { css } from "../../lib/css";
import { Box } from "./Box";

export function WorkspaceSwitcher() {
  const { workspaceId, workspaces, hasCompletedScan, setWorkspaceId } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const canFilter = hasCompletedScan && workspaces.length > 0;
  const isAll = !workspaceId || workspaceId === ALL_WORKSPACES_ID;
  const current = isAll
    ? null
    : (workspaces.find((w) => w.workspace_id === workspaceId) ?? workspaces[0]);
  const filtered = workspaces.filter((w) =>
    w.display_name.toLowerCase().includes(search.trim().toLowerCase())
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={css("position:relative;width:100%;")}>
      <Box
        as="button"
        type="button"
        disabled={!canFilter}
        onClick={() => {
          if (canFilter) setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={`width:100%;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:${
          canFilter ? "pointer" : "not-allowed"
        };opacity:${canFilter ? 1 : 0.65};border:1px solid ${
          open ? "var(--accent,#4f46e5)" : "var(--border2,#d4d4d8)"
        };background:var(--card2,#f4f4f5);color:var(--fg);text-align:left;box-shadow:0 1px 2px rgba(0,0,0,0.04);transition:border-color 0.15s,background 0.15s;`}
        hover={canFilter ? "border-color:var(--accent,#4f46e5);background:var(--sec,#ededf0)" : ""}
      >
        <div
          style={css(
            "width:28px;height:28px;border-radius:7px;background:color-mix(in srgb,var(--accent,#4f46e5) 12%,transparent);color:var(--accent,#4f46e5);display:flex;align-items:center;justify-content:center;flex:0 0 auto;"
          )}
        >
          <i
            className={`ph ${isAll ? "ph-stack" : "ph-folders"}`}
            style={css("font-size:15px;")}
            aria-hidden="true"
          />
        </div>
        <div style={css("flex:1;min-width:0;")}>
          <div
            style={css(
              "font-size:9.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--fgs,#71717a);line-height:1.1;"
            )}
          >
            Workspace filter
          </div>
          <div
            style={css(
              "font-size:12.5px;color:var(--fg);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;"
            )}
          >
            {!canFilter
              ? "Run first scan in Settings"
              : isAll
                ? `All workspaces (${workspaces.length})`
                : (current?.display_name ?? "Select workspace")}
          </div>
        </div>
        <div
          style={css(
            "width:22px;height:22px;border-radius:6px;background:var(--card,#fff);border:1px solid var(--border,#e4e4e7);display:flex;align-items:center;justify-content:center;flex:0 0 auto;color:var(--fgm);"
          )}
        >
          <i className="ph ph-caret-up-down" style={css("font-size:12px;")} aria-hidden="true" />
        </div>
      </Box>

      {open && canFilter && (
        <div
          role="listbox"
          aria-label="Select monitored workspace"
          style={css(
            "position:absolute;top:calc(100% + 6px);left:0;width:272px;max-height:360px;overflow:auto;background:var(--card,#fff);border:1px solid var(--border,#e4e4e7);box-shadow:0 10px 25px -5px rgba(0,0,0,0.12),0 4px 10px -3px rgba(0,0,0,0.06);border-radius:10px;padding:6px;z-index:50"
          )}
        >
          {workspaces.length > 4 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter workspaces…"
              style={css(
                "width:100%;padding:6px 8px;margin-bottom:6px;border-radius:6px;border:1px solid var(--border);background:var(--card2);color:var(--fg);font-size:12px"
              )}
            />
          )}
          <Box
            as="button"
            type="button"
            role="option"
            aria-selected={isAll}
            onClick={() => {
              setWorkspaceId(ALL_WORKSPACES_ID);
              setOpen(false);
            }}
            style={`width:100%;text-align:left;padding:8px 10px;border-radius:7px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;background:${
              isAll ? "color-mix(in srgb,var(--accent,#4f46e5) 12%,transparent)" : "transparent"
            }`}
            hover="background:var(--sec)"
          >
            <div style={css("display:flex;flex-direction:column;gap:2px;min-width:0;")}>
              <span
                style={css(
                  `font-size:12.5px;font-weight:600;color:${isAll ? "var(--accent,#4f46e5)" : "var(--fg)"}`
                )}
              >
                All workspaces
              </span>
              <span style={css("font-size:11px;color:var(--fgs)")}>
                {workspaces.length} monitored workspaces · All capacities
              </span>
            </div>
            {isAll && (
              <i
                className="ph ph-check"
                style={css("font-size:14px;color:var(--accent,#4f46e5);flex:0 0 auto;")}
                aria-hidden="true"
              />
            )}
          </Box>
          <div style={css("height:1px;background:var(--border,#e4e4e7);margin:4px 2px 6px;")} />
          {filtered.map((ws) => {
            const selected = !isAll && ws.workspace_id === current?.workspace_id;
            return (
              <Box
                key={ws.workspace_id}
                as="button"
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setWorkspaceId(ws.workspace_id);
                  setOpen(false);
                }}
                style={`width:100%;text-align:left;padding:8px 10px;border-radius:7px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;background:${
                  selected ? "color-mix(in srgb,var(--accent,#4f46e5) 12%,transparent)" : "transparent"
                }`}
                hover="background:var(--sec)"
              >
                <div style={css("display:flex;flex-direction:column;gap:2px;min-width:0;")}>
                  <span
                    style={css(
                      `font-size:12.5px;font-weight:600;color:${selected ? "var(--accent,#4f46e5)" : "var(--fg)"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
                    )}
                  >
                    {ws.display_name}
                  </span>
                  <span style={css("font-size:11px;color:var(--fgs)")}>
                    {ws.role} · {ws.capacity_sku}
                  </span>
                </div>
                {selected && (
                  <i
                    className="ph ph-check"
                    style={css("font-size:14px;color:var(--accent,#4f46e5);flex:0 0 auto;")}
                    aria-hidden="true"
                  />
                )}
              </Box>
            );
          })}
        </div>
      )}
    </div>
  );
}
