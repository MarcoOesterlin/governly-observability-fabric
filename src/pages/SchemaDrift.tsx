import { useState } from 'react';
import { SchemaChangesCard } from '../components/governly/SchemaChangesCard';
import { SchemaTab } from '../components/governly/asset-tabs/SchemaTab';
import { useAssets } from '../data/useAssets';
import { useSchemaChanges } from '../data/useOverview';
import { css } from '../lib/css';

export function SchemaDrift() {
  const changes = useSchemaChanges(10);
  const { rows: assets } = useAssets();
  const tableAssets = assets.filter((a) => a.type === 'Lakehouse table');
  const [selectedTable, setSelectedTable] = useState<string>('');
  const activeTable =
    selectedTable && tableAssets.some((a) => a.name === selectedTable)
      ? selectedTable
      : (tableAssets[0]?.name ?? 'sales.fact_orders');

  return (
    <div style={css('padding:24px 28px 40px;max-width:1400px;margin:0 auto;')}>
      <div style={css('font-size:12px;color:var(--fgm,#52525b);margin-bottom:8px;display:flex;align-items:center;gap:6px;')}>
        Governly <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" /> Schema &amp; Drift
      </div>
      <div style={css('margin-bottom:20px;display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:12px;')}>
        <div>
          <div style={css('font-size:22px;font-weight:600;letter-spacing:-0.02em;color:var(--fg,#18181b);')}>Schema &amp; Drift</div>
          <div style={css('font-size:13.5px;color:var(--fgm,#52525b);margin-top:4px;')}>
            Row count drift, key-column null rates, and recent column additions, type modifications, and drops across workspaces.
          </div>
        </div>
        {tableAssets.length > 0 && (
          <div style={css('display:flex;align-items:center;gap:8px;')}>
            <label htmlFor="schema-drift-table-select" style={css('font-size:12px;font-weight:600;color:var(--fgm);')}>
              Inspect Table:
            </label>
            <select
              id="schema-drift-table-select"
              value={activeTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              style={css(
                'height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--border,#e7e7ea);background:var(--card,#fff);color:var(--fg);font-size:13px;font-weight:500;',
              )}
            >
              {tableAssets.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name} ({a.domain})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div style={css('display:flex;flex-direction:column;gap:18px;')}>
        <SchemaTab assetKey={activeTable} />
        <SchemaChangesCard changes={changes} />
      </div>
    </div>
  );
}
