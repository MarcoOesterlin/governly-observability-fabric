import { useNavigate, useParams } from 'react-router-dom';
import { Box } from '../components/governly/Box';
import { badge } from '../components/governly/primitives';
import { useAsset, useAssetQuality } from '../data/useAsset';
import { useIncidents } from '../data/useIncidents';
import { css } from '../lib/css';
import { OverviewTab } from '../components/governly/asset-tabs/OverviewTab';
import { FreshnessTab } from '../components/governly/asset-tabs/FreshnessTab';
import { QualityTab } from '../components/governly/asset-tabs/QualityTab';
import { SchemaTab } from '../components/governly/asset-tabs/SchemaTab';
import { LineageTab } from '../components/governly/asset-tabs/LineageTab';
import { IncidentsTab } from '../components/governly/asset-tabs/IncidentsTab';

const TABS_DEF = [
  ['overview', 'Overview'],
  ['freshness', 'Freshness'],
  ['quality', 'Quality'],
  ['schema', 'Schema'],
  ['lineage', 'Lineage'],
  ['incidents', 'Incidents'],
] as const;

type TabKey = (typeof TABS_DEF)[number][0];

const tabStyle = (active: boolean) =>
  `padding:10px 14px;font-size:13px;font-weight:${active ? 600 : 500};cursor:pointer;color:${active ? 'var(--fg)' : 'var(--fgm)'};border-bottom:2px solid ${active ? 'var(--accent)' : 'transparent'};margin-bottom:-1px;display:flex;align-items:center;gap:7px`;

const tabCount =
  'font-size:10px;font-weight:600;padding:0 6px;height:16px;border-radius:99px;background:var(--critb);color:var(--crit);display:inline-flex;align-items:center';

export function AssetDetail() {
  const { assetKey = '', tab } = useParams<{ assetKey: string; tab?: string }>();
  const navigate = useNavigate();

  const validTab: TabKey = TABS_DEF.some(([k]) => k === tab) ? (tab as TabKey) : 'overview';
  const asset = useAsset(assetKey);
  const rules = useAssetQuality(asset.name);
  const allIncidents = useIncidents();
  const assetIncidents = allIncidents.filter((i) => i.asset === asset.name && i.status !== 'Resolved');
  const failingQualityCount = rules.filter((r) => r.result === 'fail').length;

  const statusTone =
    asset.status === 'critical'
      ? (['var(--crit)', 'var(--critb)', 'Critical'] as const)
      : asset.status === 'warning'
        ? (['var(--warn)', 'var(--warnb)', 'Warning'] as const)
        : (['var(--ok)', 'var(--okb)', 'Healthy'] as const);

  const ownerDisplay = asset.owner ?? 'Workspace Steward';

  const handleTabClick = (k: TabKey) => {
    if (k === 'overview') navigate(`/assets/${asset.name}`);
    else navigate(`/assets/${asset.name}/${k}`);
  };

  return (
    <div style={css('padding:24px 28px 40px;max-width:1400px;margin:0 auto;')}>
      <div style={css('font-size:12px;color:var(--fgm,#52525b);margin-bottom:14px;display:flex;align-items:center;gap:6px;')}>
        <Box as="span" onClick={() => navigate('/')} style="cursor:pointer;" hover="color:var(--fg)">
          Governly
        </Box>
        <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" />
        <Box as="span" onClick={() => navigate('/')} style="cursor:pointer;" hover="color:var(--fg)">
          Assets
        </Box>
        <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" />
        <span style={css("color:var(--fg);font-family:'Geist Mono',monospace;")}>{asset.name}</span>
      </div>

      <div style={css('display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:18px;')}>
        <div style={css('display:flex;gap:15px;')}>
          <div style={css('width:48px;height:48px;border-radius:11px;background:var(--card2,#f4f4f5);display:flex;align-items:center;justify-content:center;color:var(--fgm);font-size:23px;flex:0 0 auto;')}>
            <i className={`ph ${asset.icon}`} aria-hidden="true" />
          </div>
          <div>
            <div style={css('display:flex;align-items:center;gap:10px;flex-wrap:wrap;')}>
              <span style={css("font-size:21px;font-weight:600;letter-spacing:-0.01em;color:var(--fg,#18181b);font-family:'Geist Mono',monospace;")}>
                {asset.name}
              </span>
              <span style={badge(statusTone[0], statusTone[1])}>
                <span style={css(`width:6px;height:6px;border-radius:99px;background:${statusTone[0]};`)} />
                {statusTone[2]}
              </span>
            </div>
            <div style={css('display:flex;align-items:center;gap:18px;margin-top:9px;flex-wrap:wrap;font-size:12.5px;color:var(--fgm,#52525b);')}>
              <span style={css('display:flex;align-items:center;gap:6px;')}>
                <i className={`ph ${asset.icon}`} style={css('font-size:14px;')} aria-hidden="true" />
                {asset.type}
              </span>
              <span style={css('display:flex;align-items:center;gap:6px;')}>
                <i className="ph ph-buildings" style={css('font-size:14px;')} aria-hidden="true" />
                {asset.domain} domain
              </span>
              <span style={css('display:flex;align-items:center;gap:6px;')}>
                <i className="ph ph-user" style={css('font-size:14px;')} aria-hidden="true" />
                {ownerDisplay}
              </span>
              <span style={css(`display:flex;align-items:center;gap:6px;color:${asset.late ? 'var(--crit)' : 'var(--fgm)'};`)}>
                <i className="ph ph-clock-countdown" style={css('font-size:14px;')} aria-hidden="true" />
                Last refresh {asset.fresh}
              </span>
            </div>
          </div>
        </div>
        <div style={css('display:flex;gap:8px;')}>
          <Box
            as="button"
            type="button"
            onClick={() => navigate('/quality/authoring')}
            style="display:flex;align-items:center;gap:7px;height:34px;padding:0 13px;border:1px solid var(--border,#e7e7ea);border-radius:8px;background:var(--card,#fff);color:var(--fg);font-size:12.5px;font-weight:500;cursor:pointer;"
            hover="background:var(--card2)"
          >
            <i className="ph ph-sliders-horizontal" style={css('font-size:15px;')} aria-hidden="true" />
            Configure monitors
          </Box>
          <div
            onClick={() => {
              if (asset.fabricItemUrl && typeof window !== 'undefined') {
                window.open(asset.fabricItemUrl, '_blank', 'noopener,noreferrer');
              }
            }}
            style={css('display:flex;align-items:center;gap:7px;height:34px;padding:0 13px;border-radius:8px;background:var(--primary);color:var(--pfg);font-size:12.5px;font-weight:600;cursor:pointer;')}
          >
            <i className="ph ph-arrow-square-out" style={css('font-size:15px;')} aria-hidden="true" />
            Open in workspace
          </div>
        </div>
      </div>

      <div role="tablist" style={css('display:flex;gap:4px;border-bottom:1px solid var(--border,#e7e7ea);margin-bottom:20px;')}>
        {TABS_DEF.map(([k, l]) => {
          const count =
            k === 'incidents'
              ? assetIncidents.length > 0
                ? String(assetIncidents.length)
                : ''
              : k === 'quality'
                ? failingQualityCount > 0
                  ? String(failingQualityCount)
                  : ''
                : '';
          return (
            <div
              key={k}
              role="tab"
              aria-selected={validTab === k}
              tabIndex={0}
              onClick={() => handleTabClick(k)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleTabClick(k); }}
              style={css(tabStyle(validTab === k))}
            >
              {l}
              {count && <span style={css(tabCount)}>{count}</span>}
            </div>
          );
        })}
      </div>

      {validTab === 'overview' && <OverviewTab assetKey={asset.name} onOpenIncident={(id) => navigate(`/incidents/${id}`)} />}
      {validTab === 'freshness' && <FreshnessTab assetKey={asset.name} />}
      {validTab === 'quality' && <QualityTab assetKey={asset.name} />}
      {validTab === 'schema' && <SchemaTab assetKey={asset.name} />}
      {validTab === 'lineage' && <LineageTab assetKey={asset.name} />}
      {validTab === 'incidents' && <IncidentsTab assetKey={asset.name} onOpenIncident={(id) => navigate(`/incidents/${id}`)} />}
    </div>
  );
}
