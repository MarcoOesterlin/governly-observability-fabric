import { createContext, useContext, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { useTheme } from '../../app/theme';
import { useCurrentSteward } from '../../data/useCurrentSteward';
import { useCases, useIncidents } from '../../data/useIncidents';
import { css } from '../../lib/css';
import { FabricChrome, IS_EMBEDDED } from './FabricChrome';
import { Sidebar, type SidebarProps } from './Sidebar';

const CompactContext = createContext(false);

export function useCompact(): boolean {
  return useContext(CompactContext);
}

function subscribeMedia(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia('(max-width: 1100px)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

function getMediaSnapshot() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(max-width: 1100px)').matches;
}

export type ShellProps = {
  sidebarProps?: SidebarProps;
  initials?: string;
  children?: ReactNode;
};

export function Shell({ sidebarProps, initials, children }: ShellProps = {}) {
  const { theme, toggle, vars } = useTheme();
  const steward = useCurrentSteward();
  const incidents = useIncidents();
  const cases = useCases();
  const compact = useSyncExternalStore(subscribeMedia, getMediaSnapshot, () => false);

  const stewardName = steward.entra?.display_name ?? 'Workspace Steward';
  const stewardRole = steward.entra?.job_title ?? 'Workspace Steward';
  const stewardUpn = steward.entra?.upn ?? '';
  const derivedInitials = initials ?? steward.initials ?? 'WS';

  const openIncidentsCount = incidents.filter((i) => i.status !== 'Resolved').length;
  const openCasesCount = cases.filter((c) => c.status !== 'Done').length;

  const mergedSidebarProps: SidebarProps = {
    stewardName,
    stewardRoleLabel: stewardRole,
    stewardInitials: derivedInitials,
    stewardUpn,
    incidentsBadge: String(openIncidentsCount),
    casesBadge: String(openCasesCount),
    ...sidebarProps,
  };

  const rootStyle: CSSProperties = {
    ...vars,
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
    background: 'var(--bg)',
    color: 'var(--fg)',
    fontFamily: "'Geist Variable','Geist', system-ui, -apple-system, sans-serif",
    fontSize: '14px',
    WebkitFontSmoothing: 'antialiased',
  };

  return (
    <CompactContext.Provider value={compact}>
      <div style={rootStyle}>
        <FabricChrome
          onToggleTheme={toggle}
          themeIcon={theme === 'light' ? 'ph-moon' : 'ph-sun'}
          initials={derivedInitials}
          stewardName={stewardName}
          stewardRole={stewardRole}
          stewardUpn={stewardUpn}
          embedded={IS_EMBEDDED}
        />
        <div style={css('flex:1;display:flex;min-height:0')}>
          {!compact && <Sidebar {...mergedSidebarProps} />}
          <main style={css('flex:1;overflow:auto;min-width:0')}>
            {children ?? <Outlet />}
          </main>
        </div>
      </div>
    </CompactContext.Provider>
  );
}
