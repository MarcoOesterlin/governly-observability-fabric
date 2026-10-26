import { useState } from 'react';
import { css } from '../../lib/css';
import type { CommentFixture } from '../../fixtures/types';

const cav = (sys: boolean) =>
  css(`width:30px;height:30px;border-radius:99px;background:${sys ? 'var(--card2)' : 'var(--accent)'};color:${sys ? 'var(--fgm)' : '#fff'};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex:0 0 auto;`);

export function CommentThread({
  comments,
  onAddComment,
}: {
  comments: CommentFixture[];
  onAddComment?: (body: string) => void;
}) {
  const [draft, setDraft] = useState('');

  const handleSubmit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAddComment?.(trimmed);
    setDraft('');
  };

  return (
    <div style={css('background:var(--card,#fff);border:1px solid var(--border,#e7e7ea);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;')}>
      <div style={css('padding:14px 18px;border-bottom:1px solid var(--border,#e7e7ea);font-size:14px;font-weight:600;color:var(--fg);')}>
        Activity
      </div>
      <div style={css('padding:6px 18px;')}>
        {comments.map((c, idx) => (
          <div key={idx} style={css('display:flex;gap:11px;padding:13px 0;border-bottom:1px solid var(--border,#e7e7ea);')}>
            <div style={cav(c.system)}>{c.initials}</div>
            <div style={css('flex:1;')}>
              <div style={css('display:flex;align-items:center;gap:8px;')}>
                <span style={css('font-size:12.5px;font-weight:600;color:var(--fg);')}>{c.who}</span>
                <span style={css("font-size:11px;color:var(--fgs);font-family:'Geist Mono',monospace;")}>{c.time}</span>
              </div>
              <div style={css('font-size:12.5px;color:var(--fgm);margin-top:3px;line-height:1.55;')}>{c.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={css('padding:12px 18px;display:flex;gap:10px;align-items:center;')}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="Add a comment…"
          style={css('flex:1;height:36px;border:1px solid var(--border,#e7e7ea);border-radius:9px;display:flex;align-items:center;padding:0 12px;color:var(--fg);font-size:12.5px;background:var(--card2,#f4f4f5);outline:none;font-family:inherit;')}
        />
        <button
          type="button"
          onClick={handleSubmit}
          style={css('height:36px;padding:0 16px;border-radius:9px;background:var(--primary);color:var(--pfg);font-size:12.5px;font-weight:600;display:flex;align-items:center;cursor:pointer;border:none;')}
        >
          Comment
        </button>
      </div>
    </div>
  );
}
