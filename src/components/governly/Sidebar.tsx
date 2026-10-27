import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWorkspace } from '../../app/WorkspaceProvider';
import { client } from '../../data/client';
import { useAssets } from '../../data/useAssets';
import { useCurrentSteward } from '../../data/useCurrentSteward';
import { Box } from './Box';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { css } from '../../lib/css';
import type { NavItemFixture } from '../../fixtures/types';
import { ACCENT } from '../../app/theme';

const NAV_MAIN: NavItemFixture[] = [
  { label: 'Overview', icon: 'ph-squares-four', path: '/' },
  { label: 'Pipelines & Freshness', icon: 'ph-flow-arrow', path: '/freshness' },
  { label: 'Data Quality', icon: 'ph-seal-check', path: '/quality' },
  { label: 'Schema & Drift', icon: 'ph-columns', path: '/schema' },
];

const QUALITY_SUBNAV: Array<{ label: string; path: string; icon: string }> = [
  { label: 'Data Quality Rules', path: '/quality/rules', icon: 'ph-list-checks' },
  { label: 'Data Quality Rule Authoring & Validation', path: '/quality/authoring', icon: 'ph-flask' },
  { label: 'Failed Row Inspect & Root Cause Diagnostics', path: '/quality/failed-rows', icon: 'ph-magnifying-glass-plus' },
];

const NAV_OPS: NavItemFixture[] = [
  { label: 'Incidents', icon: 'ph-warning-octagon', path: '/incidents', badge: '0' },
  { label: 'Cases', icon: 'ph-kanban', path: '/cases', badge: '0' },
  { label: 'Settings', icon: 'ph-gear', path: '/settings' },
];

const navStyle = (active: boolean) =>
  `display:flex;align-items:center;gap:11px;height:36px;padding:0 10px;border-radius:8px;font-size:13px;font-weight:${active ? 600 : 500};cursor:pointer;color:${active ? 'var(--fg)' : 'var(--fgm)'};background:${active ? 'var(--card2)' : 'transparent'}`;

const badgeS =
  'font-size:10.5px;font-weight:600;min-width:18px;height:18px;padding:0 6px;border-radius:99px;background:var(--card2);color:var(--fgm);display:inline-flex;align-items:center;justify-content:center';

export type SidebarProps = {
  workspaceSwitcher?: ReactNode;
  stewardName?: string;
  stewardRoleLabel?: string;
  stewardInitials?: string;
  stewardUpn?: string;
  incidentsBadge?: string;
  casesBadge?: string;
};

function isItemActive(item: NavItemFixture, pathname: string): boolean {
  if (item.path === '/') {
    return pathname === '/' || pathname.startsWith('/assets');
  }
  if (item.path === '/incidents') {
    return pathname === '/incidents' || pathname.startsWith('/incidents/');
  }
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

export function Sidebar({
  workspaceSwitcher,
  stewardName: propStewardName,
  stewardRoleLabel: propStewardRole,
  stewardInitials: propStewardInitials,
  stewardUpn: propStewardUpn,
  incidentsBadge,
  casesBadge,
}: SidebarProps = {}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { selectedDomain, setSelectedDomain, casesEnabled, hasCompletedScan } = useWorkspace();
  const { allRows, domains: liveDomains } = useAssets();
  const [cachedDomains, setCachedDomains] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem('governly:cached-domains:v1');
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    if (liveDomains.length > 0) {
      setCachedDomains(liveDomains);
      try {
        window.localStorage.setItem('governly:cached-domains:v1', JSON.stringify(liveDomains));
      } catch {
        // ignore
      }
    }
  }, [liveDomains]);
  const domains = liveDomains.length > 0 ? liveDomains : cachedDomains;
  const canFilterDomains = hasCompletedScan && domains.length > 0;
  const steward = useCurrentSteward();
  const [domainMenuOpen, setDomainMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const domainContainerRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const stewardName = propStewardName ?? steward.entra?.display_name ?? 'Workspace Steward';
  const stewardRoleLabel = propStewardRole ?? steward.entra?.job_title ?? 'Workspace Steward';
  const stewardInitials = propStewardInitials ?? steward.initials ?? 'WS';
  const stewardUpn = propStewardUpn ?? steward.entra?.upn ?? '';

  useEffect(() => {
    if (selectedDomain !== 'All' && domains.length > 0 && !domains.includes(selectedDomain)) {
      setSelectedDomain('All');
    }
  }, [domains, selectedDomain, setSelectedDomain]);

  useEffect(() => {
    if (!domainMenuOpen && !userMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDomainMenuOpen(false);
        setUserMenuOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (domainContainerRef.current && !domainContainerRef.current.contains(e.target as Node)) {
        setDomainMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [domainMenuOpen, userMenuOpen]);

  const brandBg = `linear-gradient(135deg,${ACCENT},color-mix(in srgb,${ACCENT} 60%,#ffffff))`;
  const opsItems = casesEnabled ? NAV_OPS : NAV_OPS.filter((n) => n.path !== '/cases');
  const isAllDomains = !selectedDomain || selectedDomain === 'All';
  const activeDomainCount = isAllDomains
    ? allRows.length
    : allRows.filter((a) => a.domain === selectedDomain).length;

  return (
    <nav aria-label="Main navigation" style={css('width:248px;flex:0 0 248px;border-right:1px solid var(--border,#e7e7ea);background:var(--card,#fff);display:flex;flex-direction:column;min-height:0;')}>
      <div style={css('padding:16px 16px 12px;display:flex;align-items:center;gap:10px;')}>
        <div style={css(`width:30px;height:30px;border-radius:8px;background:${brandBg};display:flex;align-items:center;justify-content:center;color:#fff;font-size:17px;flex:0 0 auto;`)}>
          <i className="ph ph-pulse" aria-hidden="true" />
        </div>
        <div>
          <div style={css('font-size:14.5px;font-weight:600;letter-spacing:-0.01em;color:var(--fg,#18181b);')}>Governly</div>
          <div style={css('font-size:11px;color:var(--fgm,#52525b);margin-top:1px;')}>Data Observability</div>
        </div>
      </div>
      <div style={css('padding:0 12px 12px;')}>
        {workspaceSwitcher ?? <WorkspaceSwitcher />}
      </div>
      <div style={css('flex:1;overflow:auto;padding:2px 8px 8px;')}>
        <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--fgs,#a1a1aa);padding:8px 10px 6px;')}>Monitoring</div>
        {NAV_MAIN.map((n) => {
          const isQualityGroup = n.path === '/quality';
          const inQualitySection = pathname === '/quality' || pathname.startsWith('/quality/');
          const active = isQualityGroup ? pathname === '/quality' : isItemActive(n, pathname);
          return (
            <div key={n.path}>
              <Box
                role="link"
                tabIndex={0}
                onClick={() => navigate(n.path)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(n.path); } }}
                style={navStyle(active || (isQualityGroup && inQualitySection))}
                hover="background:var(--card2)"
              >
                <i className={`ph ${n.icon}`} style={css('font-size:17px;')} aria-hidden="true" />
                <span style={css('flex:1;')}>{n.label}</span>
                {isQualityGroup && (
                  <i
                    className={`ph ${inQualitySection ? 'ph-caret-down' : 'ph-caret-right'}`}
                    style={css('font-size:12px;color:var(--fgs);')}
                    aria-hidden="true"
                  />
                )}
              </Box>
              {isQualityGroup && inQualitySection && (
                <div style={css('margin:3px 0 6px 18px;padding-left:10px;border-left:1.5px solid var(--border,#e7e7ea);display:flex;flex-direction:column;gap:2px;')}>
                  {QUALITY_SUBNAV.map((sub) => {
                    const subActive = pathname === sub.path;
                    return (
                      <Box
                        key={sub.path}
                        role="link"
                        tabIndex={0}
                        onClick={() => navigate(sub.path)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            navigate(sub.path);
                          }
                        }}
                        style={`display:flex;align-items:center;gap:8px;min-height:30px;padding:4px 8px;border-radius:7px;font-size:12px;line-height:1.25;font-weight:${subActive ? 600 : 500};cursor:pointer;color:${subActive ? 'var(--accent,#4f46e5)' : 'var(--fgm)'};background:${subActive ? '#eef2ff' : 'transparent'};`}
                        hover="background:var(--card2)"
                      >
                        <i className={`ph ${sub.icon}`} style={css('font-size:14px;flex-shrink:0;')} aria-hidden="true" />
                        <span style={css('flex:1;')}>{sub.label}</span>
                      </Box>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        <div style={css('font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--fgs,#a1a1aa);padding:14px 10px 6px;')}>Operations</div>
        {opsItems.map((n) => {
          const active = isItemActive(n, pathname);
          const badgeVal = n.path === '/incidents' && incidentsBadge !== undefined ? incidentsBadge : n.path === '/cases' && casesBadge !== undefined ? casesBadge : n.badge;
          return (
            <Box
              key={n.path}
              role="link"
              tabIndex={0}
              onClick={() => navigate(n.path)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(n.path); } }}
              style={navStyle(active)}
              hover="background:var(--card2)"
            >
              <i className={`ph ${n.icon}`} style={css('font-size:17px;')} aria-hidden="true" />
              <span style={css('flex:1;')}>{n.label}</span>
              {badgeVal && <span style={css(badgeS)}>{badgeVal}</span>}
            </Box>
          );
        })}
        <div style={css('padding:14px 4px 6px;')}>
          <div ref={domainContainerRef} style={css('position:relative;width:100%;')}>
            <Box
              as="button"
              type="button"
              disabled={!canFilterDomains}
              onClick={() => {
                if (canFilterDomains) setDomainMenuOpen((o) => !o);
              }}
              aria-haspopup="listbox"
              aria-expanded={domainMenuOpen}
              style={`width:100%;display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:${
                canFilterDomains ? 'pointer' : 'not-allowed'
              };opacity:${canFilterDomains ? 1 : 0.65};border:1px solid ${
                domainMenuOpen ? 'var(--accent,#4f46e5)' : 'var(--border2,#d4d4d8)'
              };background:var(--card2,#f4f4f5);color:var(--fg);text-align:left;box-shadow:0 1px 2px rgba(0,0,0,0.04);transition:border-color 0.15s,background 0.15s;`}
              hover={canFilterDomains ? 'border-color:var(--accent,#4f46e5);background:var(--sec,#ededf0)' : ''}
            >
              <div
                style={css(
                  'width:28px;height:28px;border-radius:7px;background:color-mix(in srgb,var(--accent,#4f46e5) 12%,transparent);color:var(--accent,#4f46e5);display:flex;align-items:center;justify-content:center;flex:0 0 auto;'
                )}
              >
                <i
                  className={`ph ${isAllDomains ? 'ph-circles-four' : 'ph-tag'}`}
                  style={css('font-size:15px;')}
                  aria-hidden="true"
                />
              </div>
              <div style={css('flex:1;min-width:0;')}>
                <div
                  style={css(
                    'font-size:9.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--fgs,#71717a);line-height:1.1;'
                  )}
                >
                  Domain filter
                </div>
                <div
                  style={css(
                    'font-size:12.5px;color:var(--fg);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;'
                  )}
                >
                  {!canFilterDomains
                    ? 'Run first scan in Settings'
                    : isAllDomains
                      ? `All assets (${allRows.length})`
                      : `${selectedDomain} (${activeDomainCount} asset${activeDomainCount === 1 ? '' : 's'})`}
                </div>
              </div>
              <div
                style={css(
                  'width:22px;height:22px;border-radius:6px;background:var(--card,#fff);border:1px solid var(--border,#e4e4e7);display:flex;align-items:center;justify-content:center;flex:0 0 auto;color:var(--fgm);'
                )}
              >
                <i className="ph ph-caret-up-down" style={css('font-size:12px;')} aria-hidden="true" />
              </div>
            </Box>

            {domainMenuOpen && canFilterDomains && (
                <div
                  role="listbox"
                  aria-label="Select domain"
                  style={css(
                    'position:absolute;top:calc(100% + 6px);left:0;width:232px;max-height:300px;overflow:auto;background:var(--card,#fff);border:1px solid var(--border,#e4e4e7);box-shadow:0 10px 25px -5px rgba(0,0,0,0.12),0 4px 10px -3px rgba(0,0,0,0.06);border-radius:10px;padding:6px;z-index:50'
                  )}
                >
                  <Box
                    as="button"
                    type="button"
                    role="option"
                    aria-selected={isAllDomains}
                    onClick={() => {
                      setSelectedDomain('All');
                      setDomainMenuOpen(false);
                    }}
                    style={`width:100%;text-align:left;padding:8px 10px;border-radius:7px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;background:${
                      isAllDomains ? 'color-mix(in srgb,var(--accent,#4f46e5) 12%,transparent)' : 'transparent'
                    }`}
                    hover="background:var(--sec)"
                  >
                    <div style={css('display:flex;flex-direction:column;gap:2px;min-width:0;')}>
                      <span
                        style={css(
                          `font-size:12.5px;font-weight:600;color:${isAllDomains ? 'var(--accent,#4f46e5)' : 'var(--fg)'}`
                        )}
                      >
                        All domains
                      </span>
                      <span style={css('font-size:11px;color:var(--fgs)')}>
                        {domains.length} domains · {allRows.length} assets
                      </span>
                    </div>
                    {isAllDomains && (
                      <i
                        className="ph ph-check"
                        style={css('font-size:14px;color:var(--accent,#4f46e5);flex:0 0 auto;')}
                        aria-hidden="true"
                      />
                    )}
                  </Box>
                  <div style={css('height:1px;background:var(--border,#e4e4e7);margin:4px 2px 6px;')} />
                  {domains.map((dom) => {
                    const selected = !isAllDomains && selectedDomain === dom;
                    const count = allRows.filter((a) => a.domain === dom).length;
                    return (
                      <Box
                        key={dom}
                        as="button"
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => {
                          setSelectedDomain(dom);
                          setDomainMenuOpen(false);
                        }}
                        style={`width:100%;text-align:left;padding:8px 10px;border-radius:7px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px;background:${
                          selected ? 'color-mix(in srgb,var(--accent,#4f46e5) 12%,transparent)' : 'transparent'
                        }`}
                        hover="background:var(--sec)"
                      >
                        <div style={css('display:flex;flex-direction:column;gap:2px;min-width:0;')}>
                          <span
                            style={css(
                              `font-size:12.5px;font-weight:600;color:${selected ? 'var(--accent,#4f46e5)' : 'var(--fg)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
                            )}
                          >
                            {dom}
                          </span>
                          <span style={css('font-size:11px;color:var(--fgs)')}>
                            {count} {count === 1 ? 'asset' : 'assets'}
                          </span>
                        </div>
                        {selected && (
                          <i
                            className="ph ph-check"
                            style={css('font-size:14px;color:var(--accent,#4f46e5);flex:0 0 auto;')}
                            aria-hidden="true"
                          />
                        )}
                      </Box>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
      </div>
      <div ref={userMenuRef} style={css('position:relative;border-top:1px solid var(--border,#e7e7ea);')}>
        <Box
          as="button"
          type="button"
          aria-label="Open steward account menu"
          aria-expanded={userMenuOpen}
          onClick={() => setUserMenuOpen((o) => !o)}
          style="width:100%;padding:11px 14px;display:flex;align-items:center;gap:10px;border:none;background:transparent;cursor:pointer;text-align:left;"
          hover="background:var(--card2,#f4f4f5)"
        >
          <div style={css('width:30px;height:30px;border-radius:99px;background:var(--accent,#4f46e5);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:600;flex:0 0 auto;')}>
            {stewardInitials}
          </div>
          <div style={css('flex:1;min-width:0;')}>
            <div style={css('font-size:12.5px;font-weight:600;color:var(--fg,#18181b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>
              {stewardName}
            </div>
            <div style={css('font-size:11px;color:var(--fgm,#52525b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>
              {stewardRoleLabel}
            </div>
          </div>
          <i className="ph ph-dots-three" style={css('font-size:16px;color:var(--fgs);')} aria-hidden="true" />
        </Box>

        {userMenuOpen && (
          <div
            role="menu"
            aria-label="Steward account options"
            style={css(
              'position:absolute;bottom:calc(100% + 6px);left:8px;right:8px;background:var(--card,#fff);border:1px solid var(--border,#e4e4e7);border-radius:10px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.12),0 4px 10px -3px rgba(0,0,0,0.06);padding:8px;z-index:60;'
            )}
          >
            <div style={css('padding:6px 8px 8px;border-bottom:1px solid var(--border,#e4e4e7);margin-bottom:4px;')}>
              <div style={css('font-size:12.5px;font-weight:600;color:var(--fg);')}>{stewardName}</div>
              {stewardUpn && (
                <div style={css("font-size:11px;color:var(--fgs);font-family:'Geist Mono',monospace;margin-top:2px;word-break:break-all;")}>
                  {stewardUpn}
                </div>
              )}
              <div style={css('font-size:11px;color:var(--accent,#4f46e5);font-weight:500;margin-top:3px;')}>
                {stewardRoleLabel}
              </div>
            </div>
            <Box
              as="button"
              type="button"
              role="menuitem"
              onClick={() => {
                setUserMenuOpen(false);
                navigate('/settings');
              }}
              style="width:100%;display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:7px;border:none;background:transparent;color:var(--fg);font-size:12.5px;cursor:pointer;text-align:left;"
              hover="background:var(--card2,#f4f4f5)"
            >
              <i className="ph ph-gear" style={css('font-size:15px;color:var(--fgm);')} aria-hidden="true" />
              <span>Workspace & RBAC Settings</span>
            </Box>
            <Box
              as="button"
              type="button"
              role="menuitem"
              onClick={() => {
                setUserMenuOpen(false);
                navigate('/quality/authoring');
              }}
              style="width:100%;display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:7px;border:none;background:transparent;color:var(--fg);font-size:12.5px;cursor:pointer;text-align:left;"
              hover="background:var(--card2,#f4f4f5)"
            >
              <i className="ph ph-flask" style={css('font-size:15px;color:var(--fgm);')} aria-hidden="true" />
              <span>Author Quality Rule</span>
            </Box>
            <div style={css('height:1px;background:var(--border,#e4e4e7);margin:4px 0;')} />
            <Box
              as="button"
              type="button"
              role="menuitem"
              onClick={() => {
                setUserMenuOpen(false);
                void client.auth?.signOut?.();
              }}
              style="width:100%;display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:7px;border:none;background:transparent;color:var(--crit,#dc2626);font-size:12.5px;font-weight:500;cursor:pointer;text-align:left;"
              hover="background:var(--critb,#fef2f2)"
            >
              <i className="ph ph-sign-out" style={css('font-size:15px;')} aria-hidden="true" />
              <span>Sign out</span>
            </Box>
          </div>
        )}
      </div>
    </nav>
  );
}
