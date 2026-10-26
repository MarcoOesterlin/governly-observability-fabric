import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../app/WorkspaceProvider';
import { css } from '../lib/css';
import type {
  AssetFixture,
  IncidentFixture,
  KpiFixture,
  SchemaChangeFixture,
} from '../fixtures/types';
import { useOverviewKpis, useHealthStrip, useSchemaChanges } from '../data/useOverview';
import { useAssets } from '../data/useAssets';
import { useIncidents } from '../data/useIncidents';
import { KpiCard } from '../components/governly/KpiCard';
import { HealthCard } from '../components/governly/HealthCard';
import { AssetsCard } from '../components/governly/AssetsCard';
import { IncidentsCard } from '../components/governly/IncidentsCard';
import { SchemaChangesCard } from '../components/governly/SchemaChangesCard';
import { useCompact } from '../components/governly/Shell';

export type OverviewProps = {
  kpis?: KpiFixture[];
  healthBarHeights?: number[];
  bucketStates?: Array<'ok' | 'warn' | 'crit'>;
  healthyCount?: number;
  warningCount?: number;
  criticalCount?: number;
  assets?: AssetFixture[];
  incidentsTop?: IncidentFixture[];
  schemaChanges?: SchemaChangeFixture[];
  headerExtra?: ReactNode;
};

export function Overview({
  kpis: propKpis,
  healthBarHeights: propHeights,
  bucketStates,
  healthyCount: propHealthyCount,
  warningCount: propWarningCount,
  criticalCount: propCriticalCount,
  assets: propAssets,
  incidentsTop: propIncidentsTop,
  schemaChanges: propSchemaChanges,
  headerExtra,
}: OverviewProps = {}) {
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('24h');
  const navigate = useNavigate();
  const { casesEnabled } = useWorkspace();
  const liveKpis = useOverviewKpis(range);
  const liveStrip = useHealthStrip(range);
  const { rows: liveAssets, domains } = useAssets();
  const liveIncidents = useIncidents();
  const liveSchemaChanges = useSchemaChanges(4);

  const rawKpis = propKpis ?? liveKpis;
  const kpis = casesEnabled ? rawKpis : rawKpis.filter((k) => k.label !== 'Open cases');
  const healthBarHeights = propHeights ?? liveStrip.heights;
  const healthyCount = propHealthyCount ?? liveStrip.distribution.healthy;
  const warningCount = propWarningCount ?? liveStrip.distribution.warning;
  const criticalCount = propCriticalCount ?? liveStrip.distribution.critical;
  const assets = propAssets ?? liveAssets;
  const incidentsTop = propIncidentsTop ?? liveIncidents.slice(0, 4);
  const openIncidentCount = (propIncidentsTop ?? liveIncidents).filter((i) => i.status !== 'Resolved').length;
  const derivedDomains =
    domains.length > 0
      ? domains
      : Array.from(new Set(assets.map((a) => a.domain).filter(Boolean)));
  const domainSummary =
    derivedDomains.length === 0
      ? 'No domains discovered yet.'
      : `${derivedDomains.join(', ')} domain${derivedDomains.length === 1 ? '' : 's'}.`;
  const schemaChanges = propSchemaChanges ?? liveSchemaChanges;
  const compact = useCompact();
  const totalAssets = healthyCount + warningCount + criticalCount;

  const segStyle = (key: '24h' | '7d' | '30d', idx: number) =>
    `padding:6px 12px;font-size:12.5px;${range === key ? 'font-weight:600;background:var(--card2,#f4f4f5);color:var(--fg);' : 'color:var(--fgm);cursor:pointer;'}${idx > 0 ? 'border-left:1px solid var(--border);' : ''}`;

  return (
    <div style={css('padding:24px 28px 40px;max-width:1500px;margin:0 auto;')}>
      <div style={css('font-size:12px;color:var(--fgm,#52525b);margin-bottom:8px;display:flex;align-items:center;gap:6px;')}>
        Governly <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" /> Overview
      </div>
      <div style={css('display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:22px;flex-wrap:wrap;')}>
        <div>
          <div style={css('font-size:22px;font-weight:600;letter-spacing:-0.02em;color:var(--fg,#18181b);')}>Observability Overview</div>
          <div style={css('font-size:13.5px;color:var(--fgm,#52525b);margin-top:4px;')}>
            Health across <b style={css('color:var(--fg);font-weight:600;')}>{totalAssets}</b> monitored assets · {domainSummary}
          </div>
          {headerExtra}
        </div>
        <div style={css('display:flex;align-items:center;gap:8px;')}>
          <div style={css('display:flex;border:1px solid var(--border,#e7e7ea);border-radius:8px;overflow:hidden;background:var(--card,#fff);')}>
            {(['24h', '7d', '30d'] as const).map((r, idx) => (
              <div key={r} onClick={() => setRange(r)} style={css(segStyle(r, idx))}>
                {r}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => navigate('/quality/authoring')}
            style={css('display:flex;align-items:center;gap:8px;height:34px;padding:0 14px;border-radius:8px;border:none;background:var(--primary);color:var(--pfg);font-size:13px;font-weight:600;cursor:pointer;')}
          >
            <i className="ph ph-plus" style={css('font-size:15px;')} aria-hidden="true" />
            New monitor
          </button>
        </div>
      </div>

      <div style={css(`display:grid;grid-template-columns:${compact ? 'repeat(2,1fr)' : `repeat(${kpis.length || 4},1fr)`};gap:14px;margin-bottom:14px;`)}>
        {kpis.map((k) => (
          <KpiCard key={k.label} kpi={k} />
        ))}
      </div>

      <HealthCard
        healthy={healthyCount}
        warning={warningCount}
        critical={criticalCount}
        heights={healthBarHeights}
        bucketStates={bucketStates ?? liveStrip.bucketStates}
        axisLabels={liveStrip.axisLabels}
      />

      <div style={css(`display:grid;grid-template-columns:${compact ? '1fr' : '1.65fr 1fr'};gap:16px;align-items:start;`)}>
        <AssetsCard assets={assets} totalCount={totalAssets} />
        <div style={css('display:flex;flex-direction:column;gap:16px;')}>
          <IncidentsCard incidents={incidentsTop} openCount={openIncidentCount} />
          <SchemaChangesCard changes={schemaChanges} />
        </div>
      </div>
    </div>
  );
}
