import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { client } from '../../data/client';
import { useAssetFailedRows } from '../../data/useAsset';
import { useAssets, useRuntimeAssets } from '../../data/useAssets';
import { useCurrentSteward } from '../../data/useCurrentSteward';
import { useCases, useIncidents } from '../../data/useIncidents';
import { useHealthStrip, useLastPublishRun, useSchemaChanges } from '../../data/useOverview';
import { useQualityRules } from '../../data/useQualityRules';
import { Box } from './Box';
import { css } from '../../lib/css';

export const IS_EMBEDDED = typeof window !== 'undefined' && window.self !== window.top;

type FabricChromeProps = {
  onToggleTheme: () => void;
  themeIcon: string;
  initials: string;
  stewardName?: string;
  stewardRole?: string;
  stewardUpn?: string;
  embedded?: boolean;
};

export function FabricChrome({
  onToggleTheme,
  themeIcon,
  initials,
  stewardName: propStewardName,
  stewardRole: propStewardRole,
  stewardUpn: propStewardUpn,
  embedded = IS_EMBEDDED,
}: FabricChromeProps) {
  const navigate = useNavigate();
  const {
    refreshLiveTelemetry,
    isRefreshingTelemetry,
    workspaces,
    workspaceId,
    selectedDomain,
  } = useWorkspace();
  const { allRows: assets } = useAssets();
  // Keep core cross-page hooks warm in the persistent shell so navigating between tabs renders in 0ms without value jumps
  useRuntimeAssets();
  const incidents = useIncidents();
  useCases();
  useQualityRules();
  useAssetFailedRows(undefined, true);
  useHealthStrip('24h');
  const schemaChanges = useSchemaChanges(4);
  const lastRun = useLastPublishRun();
  const steward = useCurrentSteward();

  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activePopover, setActivePopover] = useState<'notifications' | 'help' | 'user' | null>(null);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [reloadState, setReloadState] = useState<'idle' | 'reloading' | 'done'>('idle');

  const handleReloadTelemetry = () => {
    if (reloadState === 'reloading' || isRefreshingTelemetry) return;
    setReloadState('reloading');
    void refreshLiveTelemetry().finally(() => {
      setReloadState('done');
      setTimeout(() => setReloadState('idle'), 2500);
    });
  };

  const searchRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  const stewardName = propStewardName ?? steward.entra?.display_name ?? 'Workspace Steward';
  const stewardRole = propStewardRole ?? steward.entra?.job_title ?? 'Workspace Steward';
  const stewardUpn = propStewardUpn ?? steward.entra?.upn ?? '';
  const activeWsName =
    workspaces.find((w) => w.workspace_id === workspaceId)?.display_name ??
    (workspaceId === 'all' ? 'All workspaces' : 'Active workspace');

  useEffect(() => {
    if (!searchOpen && !activePopover) return;
    const onDown = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setActivePopover(null);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [searchOpen, activePopover]);

  const trimmed = query.trim().toLowerCase();
  const matchingAssets = trimmed
    ? assets
        .filter(
          (a) =>
            a.name.toLowerCase().includes(trimmed) ||
            a.domain.toLowerCase().includes(trimmed) ||
            a.type.toLowerCase().includes(trimmed)
        )
        .slice(0, 5)
    : [];
  const matchingIncidents = trimmed
    ? incidents
        .filter(
          (i) =>
            i.id.toLowerCase().includes(trimmed) ||
            i.title.toLowerCase().includes(trimmed) ||
            i.asset.toLowerCase().includes(trimmed)
        )
        .slice(0, 4)
    : [];

  const openIncidents = incidents.filter((i) => i.status !== 'Resolved');
  const unreadNotifications = openIncidents.filter((i) => !dismissedIds.includes(i.id));
  const unreadCount = unreadNotifications.length;

  return (
    <div style={css('flex:0 0 48px;display:flex;align-items:center;gap:14px;padding:0 14px;background:var(--chrome,#fff);border-bottom:1px solid var(--border,#e7e7ea);')}>
      {!embedded && (
        <div style={css('display:flex;align-items:center;gap:9px;flex:0 0 auto;')}>
          <div style={css('width:24px;height:24px;border-radius:6px;background:linear-gradient(135deg,#117865,#34c3a6);position:relative;flex:0 0 auto;')}>
            <div style={css('position:absolute;inset:0;margin:auto;width:9px;height:9px;background:#fff;transform:rotate(45deg);border-radius:1.5px;')} />
          </div>
          <span style={css('font-size:13px;font-weight:600;letter-spacing:-0.01em;color:var(--fg,#18181b);')}>Microsoft Fabric</span>
          <span style={css('color:var(--fgs,#a1a1aa);font-size:13px;margin:0 2px;')}>/</span>
          <span style={css('font-size:13px;color:var(--fgm,#52525b);')}>Enterprise Data Platform</span>
        </div>
      )}
      <div ref={searchRef} style={css('flex:1;display:flex;justify-content:center;position:relative;')}>
        <div style={css('width:min(440px,100%);height:30px;border:1px solid var(--border,#e7e7ea);border-radius:8px;display:flex;align-items:center;gap:8px;padding:0 11px;background:var(--card2,#f4f4f5);color:var(--fgs,#a1a1aa);font-size:12.5px;')}>
          <i className="ph ph-magnifying-glass" style={css('font-size:15px;')} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search assets, monitors, incidents"
            placeholder="Search assets, monitors, incidents…"
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchOpen(false);
              } else if (e.key === 'Enter' && matchingAssets[0]) {
                navigate(`/assets/${matchingAssets[0].id}`);
                setSearchOpen(false);
                setQuery('');
              } else if (e.key === 'Enter' && matchingIncidents[0]) {
                navigate(`/incidents/${matchingIncidents[0].id}`);
                setSearchOpen(false);
                setQuery('');
              }
            }}
            style={css('border:none;outline:none;background:transparent;width:100%;font-size:12.5px;color:var(--fg);font-family:inherit;')}
          />
        </div>
        {searchOpen && trimmed.length > 0 && (
          <div style={css('position:absolute;top:36px;width:min(440px,100%);background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:10px;box-shadow:var(--shadow);z-index:50;padding:6px;max-height:320px;overflow:auto;')}>
            {matchingAssets.length === 0 && matchingIncidents.length === 0 ? (
              <div style={css('padding:10px 12px;font-size:12px;color:var(--fgm);')}>
                No matching assets or incidents for "{query}".
              </div>
            ) : (
              <>
                {matchingAssets.map((a) => (
                  <Box
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      navigate(`/assets/${a.id}`);
                      setSearchOpen(false);
                      setQuery('');
                    }}
                    style="padding:8px 10px;border-radius:7px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;"
                    hover="background:var(--card2)"
                  >
                    <span style={css("font-size:12.5px;font-weight:600;color:var(--fg);font-family:'Geist Mono',monospace;")}>{a.name}</span>
                    <span style={css('font-size:11px;color:var(--fgs);')}>{a.domain} · {a.type}</span>
                  </Box>
                ))}
                {matchingIncidents.map((inc) => (
                  <Box
                    key={inc.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      navigate(`/incidents/${inc.id}`);
                      setSearchOpen(false);
                      setQuery('');
                    }}
                    style="padding:8px 10px;border-radius:7px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;"
                    hover="background:var(--card2)"
                  >
                    <span style={css('font-size:12.5px;color:var(--fg);')}>{inc.id}: {inc.title}</span>
                    <span style={css('font-size:11px;color:var(--crit);font-weight:600;')}>{inc.sev}</span>
                  </Box>
                ))}
              </>
            )}
          </div>
        )}
      </div>
      <div ref={actionsRef} style={css('display:flex;align-items:center;gap:6px;flex:0 0 auto;position:relative;')}>
        <Box
          as="button"
          type="button"
          onClick={handleReloadTelemetry}
          title={
            lastRun
              ? `Last notebook sync: ${lastRun.label} (${lastRun.status}) — click to reload live data`
              : 'Click to reload live workspace telemetry'
          }
          style={`height:26px;padding:0 10px;border-radius:99px;border:1px solid ${
            reloadState !== 'idle' ? 'var(--accent,#4f46e5)' : 'var(--border)'
          };background:var(--card2);color:${
            reloadState !== 'idle' ? 'var(--accent,#4f46e5)' : 'var(--fgm)'
          };font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px;cursor:pointer;transition:all 0.15s;`}
          hover="background:var(--sec)"
        >
          <span
            style={css(
              `width:6px;height:6px;border-radius:99px;background:${
                reloadState === 'reloading'
                  ? 'var(--accent,#4f46e5)'
                  : lastRun?.status === 'Failed'
                  ? 'var(--crit)'
                  : 'var(--ok)'
              };`
            )}
          />
          {reloadState === 'reloading' || isRefreshingTelemetry
            ? 'Syncing live telemetry…'
            : reloadState === 'done'
            ? 'Synced just now'
            : lastRun?.shortLabel || 'Live telemetry'}
          <i
            className="ph ph-arrows-clockwise"
            style={css(
              `font-size:12px;display:inline-block;transition:transform 0.5s ease;${
                reloadState === 'reloading' || isRefreshingTelemetry ? 'transform:rotate(360deg);' : ''
              }`
            )}
            aria-hidden="true"
          />
        </Box>
        <Box
          as="button"
          type="button"
          aria-label="Toggle theme"
          onClick={onToggleTheme}
          title="Toggle theme"
          style="width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:var(--fgm,#52525b);cursor:pointer;font-size:17px;border:none;background:transparent;"
          hover="background:var(--card2)"
        >
          <i className={`ph ${themeIcon}`} aria-hidden="true" />
        </Box>

        {/* Notification Bell */}
        <Box
          as="button"
          type="button"
          aria-label="Notifications"
          aria-expanded={activePopover === 'notifications'}
          title="Notifications & active incidents"
          onClick={() =>
            setActivePopover((prev) => (prev === 'notifications' ? null : 'notifications'))
          }
          style={`width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:${
            activePopover === 'notifications' ? 'var(--accent,#4f46e5)' : 'var(--fgm,#52525b)'
          };cursor:pointer;font-size:17px;position:relative;border:none;background:${
            activePopover === 'notifications' ? 'var(--card2)' : 'transparent'
          };`}
          hover="background:var(--card2)"
        >
          <i className="ph ph-bell" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              style={css(
                'position:absolute;top:4px;right:4px;min-width:15px;height:15px;padding:0 4px;border-radius:99px;background:var(--crit,#dc2626);color:#fff;font-size:9.5px;font-weight:700;display:flex;align-items:center;justify-content:center;line-height:1;'
              )}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Box>

        {/* Help & Diagnostics Question Mark */}
        <Box
          as="button"
          type="button"
          aria-label="Help and system status"
          aria-expanded={activePopover === 'help'}
          title="Help, documentation & telemetry status"
          onClick={() => setActivePopover((prev) => (prev === 'help' ? null : 'help'))}
          style={`width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:${
            activePopover === 'help' ? 'var(--accent,#4f46e5)' : 'var(--fgm,#52525b)'
          };cursor:pointer;font-size:17px;border:none;background:${
            activePopover === 'help' ? 'var(--card2)' : 'transparent'
          };`}
          hover="background:var(--card2)"
        >
          <i className="ph ph-question" aria-hidden="true" />
        </Box>

        {/* Top-Right User Initials Button */}
        <Box
          as="button"
          type="button"
          aria-label="User profile and session"
          aria-expanded={activePopover === 'user'}
          title={`${stewardName}${stewardUpn ? ` (${stewardUpn})` : ''}`}
          onClick={() => setActivePopover((prev) => (prev === 'user' ? null : 'user'))}
          style={`width:28px;height:28px;border-radius:99px;background:var(--accent,#4f46e5);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;margin-left:4px;border:${
            activePopover === 'user' ? '2px solid var(--fg)' : 'none'
          };cursor:pointer;`}
        >
          {initials}
        </Box>

        {/* Notifications Popover */}
        {activePopover === 'notifications' && (
          <div
            role="dialog"
            aria-label="Notifications"
            style={css(
              'position:absolute;top:42px;right:0;width:360px;max-height:420px;display:flex;flex-direction:column;background:var(--card,#fff);border:1px solid var(--border,#e4e4e7);border-radius:12px;box-shadow:0 12px 28px -6px rgba(0,0,0,0.14),0 4px 10px -3px rgba(0,0,0,0.06);z-index:70;overflow:hidden;'
            )}
          >
            <div style={css('padding:12px 14px;border-bottom:1px solid var(--border,#e4e4e7);display:flex;align-items:center;justify-content:space-between;')}>
              <div style={css('display:flex;align-items:center;gap:8px;')}>
                <span style={css('font-size:13.5px;font-weight:600;color:var(--fg);')}>Notifications</span>
                <span style={css('font-size:11px;font-weight:600;padding:1px 7px;border-radius:99px;background:var(--card2,#f4f4f5);color:var(--fgm);')}>
                  {openIncidents.length} open
                </span>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => setDismissedIds(openIncidents.map((i) => i.id))}
                  style={css('border:none;background:transparent;color:var(--accent,#4f46e5);font-size:11.5px;font-weight:600;cursor:pointer;padding:0;')}
                >
                  Mark all read
                </button>
              )}
            </div>
            <div style={css('flex:1;overflow:auto;max-height:310px;')}>
              {openIncidents.length === 0 && schemaChanges.length === 0 ? (
                <div style={css('padding:24px 16px;text-align:center;color:var(--fgm);font-size:12.5px;')}>
                  <i className="ph ph-check-circle" style={css('font-size:24px;color:var(--ok);display:block;margin-bottom:6px;')} aria-hidden="true" />
                  All clear — no open incidents or breaking schema changes.
                </div>
              ) : (
                <>
                  {openIncidents.slice(0, 6).map((inc) => {
                    const isUnread = !dismissedIds.includes(inc.id);
                    return (
                      <Box
                        key={inc.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setDismissedIds((prev) => (prev.includes(inc.id) ? prev : [...prev, inc.id]));
                          setActivePopover(null);
                          navigate(`/incidents/${inc.id}`);
                        }}
                        style={`padding:11px 14px;border-bottom:1px solid var(--border,#e4e4e7);display:flex;align-items:flex-start;gap:10px;cursor:pointer;background:${
                          isUnread ? 'color-mix(in srgb,var(--accent,#4f46e5) 4%,transparent)' : 'transparent'
                        };`}
                        hover="background:var(--card2)"
                      >
                        <span
                          style={css(
                            `width:8px;height:8px;border-radius:99px;margin-top:5px;flex:0 0 auto;background:${
                              inc.sev === 'Critical' || inc.sev === 'High' ? 'var(--crit)' : 'var(--warn)'
                            };`
                          )}
                        />
                        <div style={css('flex:1;min-width:0;')}>
                          <div style={css('display:flex;align-items:center;justify-content:space-between;gap:6px;')}>
                            <span style={css("font-size:11px;font-family:'Geist Mono',monospace;color:var(--fgs);font-weight:600;")}>
                              {inc.id} · {inc.sev}
                            </span>
                            <span style={css('font-size:11px;color:var(--fgs);')}>{inc.age}</span>
                          </div>
                          <div style={css('font-size:12.5px;font-weight:600;color:var(--fg);margin-top:2px;')}>
                            {inc.title}
                          </div>
                          <div style={css("font-size:11.5px;color:var(--fgm);font-family:'Geist Mono',monospace;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>
                            {inc.asset} · {inc.status}
                          </div>
                        </div>
                      </Box>
                    );
                  })}
                  {schemaChanges.slice(0, 2).map((sc, idx) => (
                    <Box
                      key={`${sc.col}-${idx}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setActivePopover(null);
                        navigate('/schema');
                      }}
                      style="padding:10px 14px;border-bottom:1px solid var(--border,#e4e4e7);display:flex;align-items:flex-start;gap:10px;cursor:pointer;"
                      hover="background:var(--card2)"
                    >
                      <i className="ph ph-columns" style={css('font-size:15px;color:var(--info);margin-top:2px;')} aria-hidden="true" />
                      <div style={css('flex:1;min-width:0;')}>
                        <div style={css('font-size:12px;font-weight:600;color:var(--fg);')}>
                          Schema {sc.kind}: {sc.col}
                        </div>
                        <div style={css("font-size:11px;color:var(--fgm);font-family:'Geist Mono',monospace;margin-top:2px;")}>
                          {sc.detail} · {sc.time}
                        </div>
                      </div>
                    </Box>
                  ))}
                </>
              )}
            </div>
            <div style={css('padding:9px 14px;background:var(--card2,#f4f4f5);display:flex;justify-content:space-between;align-items:center;')}>
              <button
                type="button"
                onClick={() => {
                  setActivePopover(null);
                  navigate('/incidents');
                }}
                style={css('border:none;background:transparent;color:var(--accent,#4f46e5);font-size:12px;font-weight:600;cursor:pointer;padding:0;')}
              >
                View all incidents →
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePopover(null);
                  navigate('/settings');
                }}
                style={css('border:none;background:transparent;color:var(--fgm);font-size:11.5px;cursor:pointer;padding:0;')}
              >
                Alert routing
              </button>
            </div>
          </div>
        )}

        {/* Help & System Status Popover */}
        {activePopover === 'help' && (
          <div
            role="dialog"
            aria-label="Help and system status"
            style={css(
              'position:absolute;top:42px;right:0;width:340px;background:var(--card,#fff);border:1px solid var(--border,#e4e4e7);border-radius:12px;box-shadow:0 12px 28px -6px rgba(0,0,0,0.14),0 4px 10px -3px rgba(0,0,0,0.06);z-index:70;padding:14px;'
            )}
          >
            <div style={css('font-size:13.5px;font-weight:600;color:var(--fg);')}>
              Governly Help & Telemetry Status
            </div>
            <div style={css('font-size:12px;color:var(--fgm);margin-top:4px;line-height:1.45;')}>
              Live Microsoft Fabric observability powered by OneLake Delta table profiling and custom SQL quality rules.
            </div>

            <div style={css('margin-top:12px;padding:10px 12px;border-radius:9px;background:var(--card2,#f4f4f5);border:1px solid var(--border,#e4e4e7);')}>
              <div style={css('display:flex;align-items:center;justify-content:space-between;')}>
                <span style={css('font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--fgs);')}>
                  Spark Telemetry Engine
                </span>
                <span
                  style={css(
                    `font-size:11px;font-weight:600;color:${
                      lastRun?.status === 'Failed' ? 'var(--crit)' : 'var(--ok)'
                    };`
                  )}
                >
                  {lastRun?.status ?? 'Active'}
                </span>
              </div>
              <div style={css("font-size:11.5px;color:var(--fg);font-family:'Geist Mono',monospace;margin-top:4px;")}>
                nb_governly_compute_publish
              </div>
              <div style={css('font-size:11px;color:var(--fgm);margin-top:2px;')}>
                {lastRun?.label
                  ? `Last completed: ${String(lastRun.label).slice(0, 19).replace('T', ' ')} UTC`
                  : 'Scheduled every 36m in Fabric'}
              </div>
              <button
                type="button"
                onClick={() => {
                  handleReloadTelemetry();
                  setActivePopover(null);
                }}
                style={css('margin-top:8px;width:100%;height:28px;border-radius:7px;border:1px solid var(--border);background:var(--card,#fff);color:var(--fg);font-size:11.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;')}
              >
                <i className="ph ph-arrows-clockwise" aria-hidden="true" />
                Refresh live telemetry now
              </button>
            </div>

            <div style={css('font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--fgs);margin:12px 0 6px;')}>
              Quick Navigation & Guides
            </div>
            <div style={css('display:flex;flex-direction:column;gap:2px;')}>
              {[
                { label: 'Author & Validate DQ Rules', icon: 'ph-flask', path: '/quality/authoring' },
                { label: 'Inspect Failed Rows & SQL Fixes', icon: 'ph-magnifying-glass-plus', path: '/quality/failed-rows' },
                { label: 'Pipelines & Freshness SLAs', icon: 'ph-flow-arrow', path: '/freshness' },
                { label: 'Schema Drift & Column Lineage', icon: 'ph-columns', path: '/schema' },
                { label: 'Steward Cases & Remediation', icon: 'ph-kanban', path: '/cases' },
                { label: 'Workspace & RBAC Configuration', icon: 'ph-gear', path: '/settings' },
              ].map((item) => (
                <Box
                  key={item.path}
                  as="button"
                  type="button"
                  onClick={() => {
                    setActivePopover(null);
                    navigate(item.path);
                  }}
                  style="width:100%;display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:7px;border:none;background:transparent;color:var(--fg);font-size:12.5px;cursor:pointer;text-align:left;"
                  hover="background:var(--card2)"
                >
                  <i className={`ph ${item.icon}`} style={css('font-size:15px;color:var(--accent,#4f46e5);')} aria-hidden="true" />
                  <span style={css('flex:1;')}>{item.label}</span>
                  <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" />
                </Box>
              ))}
            </div>
          </div>
        )}

        {/* User Profile & Session Popover */}
        {activePopover === 'user' && (
          <div
            role="dialog"
            aria-label="User profile and session"
            style={css(
              'position:absolute;top:42px;right:0;width:300px;background:var(--card,#fff);border:1px solid var(--border,#e4e4e7);border-radius:12px;box-shadow:0 12px 28px -6px rgba(0,0,0,0.14),0 4px 10px -3px rgba(0,0,0,0.06);z-index:70;padding:12px;'
            )}
          >
            <div style={css('display:flex;align-items:center;gap:10px;padding-bottom:10px;border-bottom:1px solid var(--border,#e4e4e7);')}>
              <div style={css('width:36px;height:36px;border-radius:99px;background:var(--accent,#4f46e5);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;flex:0 0 auto;')}>
                {initials}
              </div>
              <div style={css('min-width:0;flex:1;')}>
                <div style={css('font-size:13px;font-weight:600;color:var(--fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>
                  {stewardName}
                </div>
                {stewardUpn && (
                  <div style={css("font-size:11px;color:var(--fgs);font-family:'Geist Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px;")}>
                    {stewardUpn}
                  </div>
                )}
                <div style={css('font-size:11px;color:var(--accent,#4f46e5);font-weight:600;margin-top:2px;')}>
                  {stewardRole}
                </div>
              </div>
            </div>

            <div style={css('padding:8px 4px;border-bottom:1px solid var(--border,#e4e4e7);font-size:11.5px;color:var(--fgm);display:flex;flex-direction:column;gap:4px;')}>
              <div style={css('display:flex;justify-content:space-between;gap:8px;')}>
                <span style={css('color:var(--fgs);')}>Workspace</span>
                <span style={css('font-weight:600;color:var(--fg);text-align:right;')}>{activeWsName}</span>
              </div>
              <div style={css('display:flex;justify-content:space-between;gap:8px;')}>
                <span style={css('color:var(--fgs);')}>Domain scope</span>
                <span style={css('font-weight:600;color:var(--fg);')}>{selectedDomain || 'All'}</span>
              </div>
            </div>

            <div style={css('padding-top:6px;display:flex;flex-direction:column;gap:2px;')}>
              <Box
                as="button"
                type="button"
                onClick={() => {
                  onToggleTheme();
                  setActivePopover(null);
                }}
                style="width:100%;display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:7px;border:none;background:transparent;color:var(--fg);font-size:12.5px;cursor:pointer;text-align:left;"
                hover="background:var(--card2)"
              >
                <i className={`ph ${themeIcon}`} style={css('font-size:15px;color:var(--fgm);')} aria-hidden="true" />
                <span>Switch theme</span>
              </Box>
              <Box
                as="button"
                type="button"
                onClick={() => {
                  setActivePopover(null);
                  navigate('/settings');
                }}
                style="width:100%;display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:7px;border:none;background:transparent;color:var(--fg);font-size:12.5px;cursor:pointer;text-align:left;"
                hover="background:var(--card2)"
              >
                <i className="ph ph-gear" style={css('font-size:15px;color:var(--fgm);')} aria-hidden="true" />
                <span>Workspace & RBAC Settings</span>
              </Box>
              <div style={css('height:1px;background:var(--border,#e4e4e7);margin:4px 0;')} />
              <Box
                as="button"
                type="button"
                onClick={() => {
                  setActivePopover(null);
                  void client.auth?.signOut?.();
                }}
                style="width:100%;display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:7px;border:none;background:transparent;color:var(--crit,#dc2626);font-size:12.5px;font-weight:500;cursor:pointer;text-align:left;"
                hover="background:var(--critb,#fef2f2)"
              >
                <i className="ph ph-sign-out" style={css('font-size:15px;')} aria-hidden="true" />
                <span>Sign out</span>
              </Box>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
