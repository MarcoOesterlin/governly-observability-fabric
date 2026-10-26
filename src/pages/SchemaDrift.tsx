import { SchemaChangesCard } from '../components/governly/SchemaChangesCard';
import { useSchemaChanges } from '../data/useOverview';
import { css } from '../lib/css';

export function SchemaDrift() {
  const changes = useSchemaChanges(10);
  return (
    <div style={css('padding:24px 28px 40px;max-width:1400px;margin:0 auto;')}>
      <div style={css('font-size:12px;color:var(--fgm,#52525b);margin-bottom:8px;display:flex;align-items:center;gap:6px;')}>
        Governly <i className="ph ph-caret-right" style={css('font-size:11px;color:var(--fgs);')} aria-hidden="true" /> Schema &amp; Drift
      </div>
      <div style={css('margin-bottom:20px;')}>
        <div style={css('font-size:22px;font-weight:600;letter-spacing:-0.02em;color:var(--fg,#18181b);')}>Schema &amp; Drift</div>
        <div style={css('font-size:13.5px;color:var(--fgm,#52525b);margin-top:4px;')}>
          Recent column additions, type modifications and breaking drops across workspaces.
        </div>
      </div>
      <SchemaChangesCard changes={changes} />
    </div>
  );
}
