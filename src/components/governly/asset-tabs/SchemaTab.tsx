import { css } from '../../../lib/css';
import { badge } from '../primitives';
import { useAsset, useAssetFreshness, useAssetSchema } from '../../../data/useAsset';
import { resolveRowCountDriftAndOps } from '../../../data/useFreshnessSla';
import { useAssetDriftTelemetry } from '../../../data/useQualityRules';
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
  const asset = useAsset(assetKey);
  const live = useAssetSchema(assetKey);
  const freshnessData = useAssetFreshness(assetKey);
  const driftTelemetry = useAssetDriftTelemetry(assetKey);
  const columns = propColumns ?? live.columns;
  const log = propLog ?? live.log;

  const opsDrift = resolveRowCountDriftAndOps(
    asset.name || assetKey,
    asset.type,
    asset.rowCountLabel ?? '',
    freshnessData.runs,
    driftTelemetry.map((r) => ({
      name: r.name,
      def: r.detail,
      observed: r.value,
      res: r.result,
    })),
  );

  // Build daily key-column null rate cards from schema columns + published null telemetry
  const candidateKeyCols = columns.filter(
    (c) =>
      c.flag === 'PK' ||
      c.flag === 'FK' ||
      /(_id|_key|_code|_date|amount|status|email|name|customer|order)/i.test(c.col),
  );
  const keyColumnsToCheck = (
    candidateKeyCols.length > 0 ? candidateKeyCols : columns
  ).slice(0, 6);

  const keyColumnNullRates = keyColumnsToCheck.map((colObj) => {
    const colLower = colObj.col.toLowerCase();
    const matchedCheck = driftTelemetry.find((pr) => {
      const n = pr.name.toLowerCase();
      const d = pr.detail.toLowerCase();
      return (
        (n.includes('null') || n.includes('completeness')) &&
        (n.includes(colLower) || d.includes(colLower))
      );
    });
    let pctVal = 0.0;
    if (matchedCheck?.value) {
      const m = matchedCheck.value.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
      if (m) {
        const parsed = parseFloat(m[1]);
        if (!Number.isNaN(parsed)) {
          pctVal = parsed > 50 ? Math.max(0, 100 - parsed) : parsed;
        }
      }
    }
    const status: 'pass' | 'warn' | 'fail' =
      matchedCheck?.result === 'fail' || pctVal > 2.0
        ? 'fail'
        : pctVal > 0.5
          ? 'warn'
          : 'pass';
    return {
      col: colObj.col,
      type: colObj.type,
      flag: colObj.flag,
      nullPct: pctVal,
      nullPctLabel: `${pctVal.toFixed(2)}% null`,
      nonNullPctLabel: `${(100 - pctVal).toFixed(2)}% populated`,
      status,
    };
  });

  return (
    <div style={css('display:flex;flex-direction:column;gap:16px;')}>
      <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);padding:16px 18px;display:flex;flex-direction:column;gap:14px;')}>
        <div style={css('display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;')}>
          <div style={css('display:flex;align-items:center;gap:8px;')}>
            <i className="ph ph-arrows-left-right" style={css('font-size:17px;color:var(--accent,#4f46e5);')} aria-hidden="true" />
            <span style={css('font-size:14px;font-weight:600;color:var(--fg);')}>
              Row Count Drift (Start vs. After Processing) &amp; Key-Column Null Rates ({asset.name || assetKey})
            </span>
          </div>
          <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
            <span style={css("font-size:11px;font-family:'Geist Mono',monospace;padding:2px 8px;border-radius:6px;background:var(--card2,#f4f4f6);color:var(--fgm);")}>
              {opsDrift.operation} · {opsDrift.commitVersionLabel}
            </span>
            <span
              style={
                opsDrift.driftStatus === 'breach'
                  ? badge('var(--crit)', 'var(--critb)')
                  : opsDrift.driftStatus === 'warn'
                    ? badge('var(--warn)', 'var(--warnb)')
                    : badge('var(--ok)', 'var(--okb)')
              }
            >
              Row Drift: {opsDrift.driftPctLabel} ({opsDrift.netDeltaLabel})
            </span>
          </div>
        </div>

        <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;')}>
          <div style={css('padding:11px 13px;border-radius:8px;background:var(--card2,#fafafa);border:1px solid var(--border,#e7e7ea);')}>
            <div style={css('font-size:11px;font-weight:600;color:var(--fgm);text-transform:uppercase;letter-spacing:0.04em;')}>
              Rows at Start (Before Processing)
            </div>
            <div style={css("font-size:15px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fg);margin-top:4px;")}>
              {opsDrift.rowsBeforeLabel}
            </div>
            <div style={css('font-size:11px;color:var(--fgm);margin-top:2px;')}>
              Prior Delta version baseline
            </div>
          </div>

          <div style={css('padding:11px 13px;border-radius:8px;background:var(--card2,#fafafa);border:1px solid var(--border,#e7e7ea);')}>
            <div style={css('font-size:11px;font-weight:600;color:var(--fgm);text-transform:uppercase;letter-spacing:0.04em;')}>
              Rows After Processing
            </div>
            <div style={css("font-size:15px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fg);margin-top:4px;")}>
              {opsDrift.rowsAfterLabel}
            </div>
            <div style={css('font-size:11px;color:var(--fgm);margin-top:2px;')}>
              Latest committed table state
            </div>
          </div>

          <div style={css('padding:11px 13px;border-radius:8px;background:var(--card2,#fafafa);border:1px solid var(--border,#e7e7ea);')}>
            <div style={css('font-size:11px;font-weight:600;color:var(--fgm);text-transform:uppercase;letter-spacing:0.04em;')}>
              Net Row Count Drift
            </div>
            <div
              style={css(
                `font-size:15px;font-weight:600;font-family:'Geist Mono',monospace;color:${
                  opsDrift.driftStatus === 'breach'
                    ? 'var(--crit,#dc2626)'
                    : opsDrift.driftStatus === 'warn'
                      ? 'var(--warn,#d97706)'
                      : 'var(--ok,#16a34a)'
                };margin-top:4px;`,
              )}
            >
              {opsDrift.driftPctLabel} ({opsDrift.netDeltaLabel})
            </div>
            <div style={css("font-size:11px;font-family:'Geist Mono',monospace;color:var(--fgm);margin-top:2px;")}>
              {opsDrift.dmlSummary}
            </div>
          </div>
        </div>

        {keyColumnNullRates.length > 0 && (
          <div>
            <div style={css('font-size:11px;font-weight:600;color:var(--fgm);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;')}>
              Key-Column Null Rates
            </div>
            <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;')}>
              {keyColumnNullRates.map((kc) => (
                <div
                  key={kc.col}
                  style={css(
                    `padding:10px 12px;border-radius:8px;background:var(--card2,#fafafa);border:1px solid ${
                      kc.status === 'fail'
                        ? 'var(--crit,#dc2626)'
                        : kc.status === 'warn'
                          ? 'var(--warn,#f59e0b)'
                          : 'var(--border,#e7e7ea)'
                    };display:flex;flex-direction:column;gap:5px;`,
                  )}
                >
                  <div style={css('display:flex;align-items:center;justify-content:space-between;gap:6px;')}>
                    <span style={css("font-size:12.5px;font-weight:600;font-family:'Geist Mono',monospace;color:var(--fg);display:inline-flex;align-items:center;gap:6px;")}>
                      {kc.flag ? `${kc.col} (${kc.flag})` : kc.col}
                    </span>
                    <span
                      style={
                        kc.status === 'fail'
                          ? badge('var(--crit)', 'var(--critb)')
                          : kc.status === 'warn'
                            ? badge('var(--warn)', 'var(--warnb)')
                            : badge('var(--ok)', 'var(--okb)')
                      }
                    >
                      {kc.nullPctLabel}
                    </span>
                  </div>
                  <div style={css('display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--fgm);')}>
                    <span>{kc.type}</span>
                    <span style={css("font-family:'Geist Mono',monospace;")}>{kc.nonNullPctLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
    </div>
  );
}
