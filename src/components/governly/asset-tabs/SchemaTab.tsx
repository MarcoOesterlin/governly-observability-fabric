import { css } from '../../../lib/css';
import { useAssetSchema } from '../../../data/useAsset';
import type {
  SchemaColumnFixture,
  SchemaLogFixture,
} from '../../../fixtures/types';

const noteStyle = (n: 'added' | 'changed') =>
  css(`font-size:10px;font-weight:600;padding:1px 6px;border-radius:5px;color:${n === 'added' ? 'var(--ok)' : 'var(--info)'};background:${n === 'added' ? 'var(--okb)' : 'var(--infob)'};`);

export function SchemaTab({
  assetKey,
  columns: propColumns,
  log: propLog,
}: {
  assetKey: string;
  columns?: SchemaColumnFixture[];
  log?: SchemaLogFixture[];
}) {
  const live = useAssetSchema(assetKey);
  const columns = propColumns ?? live.columns;
  const log = propLog ?? live.log;
  return (
    <div style={css('display:grid;grid-template-columns:1.5fr 1fr;gap:16px;align-items:start;')}>
      <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
        <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);font-size:14px;font-weight:600;color:var(--fg);')}>
          Columns · {columns.length}
        </div>
        {columns.map((c) => (
          <div key={c.col} style={css('display:grid;grid-template-columns:1.4fr 1fr auto;gap:12px;padding:11px 18px;align-items:center;border-bottom:1px solid var(--border,#e7e7ea);')}>
            <span style={css("font-size:12.5px;font-weight:600;color:var(--fg);font-family:'Geist Mono',monospace;")}>{c.col}</span>
            <span style={css("font-size:12px;color:var(--fgm);font-family:'Geist Mono',monospace;")}>{c.type}</span>
            <div style={css('display:flex;gap:6px;justify-content:flex-end;')}>
              {c.flag && (
                <span style={css('font-size:10px;font-weight:600;padding:1px 6px;border-radius:5px;background:var(--card2);color:var(--fgm);')}>
                  {c.flag}
                </span>
              )}
              {c.note && <span style={noteStyle(c.note)}>{c.note}</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
        <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);font-size:14px;font-weight:600;color:var(--fg);')}>
          Change log
        </div>
        <div style={css('padding:6px 18px 16px;')}>
          {log.map((l, idx) => (
            <div key={idx} style={css('display:flex;gap:12px;padding-top:14px;')}>
              <div style={css('display:flex;flex-direction:column;align-items:center;')}>
                <span style={css('width:9px;height:9px;border-radius:99px;background:var(--accent);margin-top:3px;')} />
                <span style={css('flex:1;width:1.5px;background:var(--border);margin-top:4px;')} />
              </div>
              <div style={css('padding-bottom:2px;')}>
                <div style={css('font-size:12.5px;color:var(--fg);font-weight:500;')}>{l.text}</div>
                <div style={css("font-size:11px;color:var(--fgs);margin-top:3px;font-family:'Geist Mono',monospace;")}>
                  {l.time} · {l.by}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
