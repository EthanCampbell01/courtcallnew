import { useEffect, useRef, useState } from 'react';

const TYPE_LABEL = { MS: "Men's Singles", WS: "Women's Singles", MD: "Men's Doubles", WD: "Women's Doubles", XD: 'Mixed Doubles' };
const TYPE_ORDER = ['MS', 'WS', 'MD', 'WD', 'XD'];

// Event chooser for a tournament. A native <select> could not show the draw type
// alongside the name or be styled to match, and junior tournaments now bring ~50
// draws, so this adds a filter box and sticky group headers to keep them findable.
export default function EventPicker({ events, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  const selected = events.find((e) => e.id === value) || null;

  useEffect(() => {
    if (!open) { setQ(''); return; }
    searchRef.current?.focus();
    // a 50-draw junior tournament opens far from the current pick otherwise
    wrapRef.current?.querySelector('.evp-item.sel')?.scrollIntoView({ block: 'center' });
    // touchstart as well as mousedown — on iOS a tap outside must dismiss the
    // panel without waiting for the synthesised mouse events
    const onDown = (ev) => { if (!wrapRef.current?.contains(ev.target)) setOpen(false); };
    const onKey = (ev) => { if (ev.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const matches = needle
    ? events.filter((e) => `${e.name} ${TYPE_LABEL[e.type] || e.type}`.toLowerCase().includes(needle))
    : events;
  const groups = TYPE_ORDER
    .map((type) => ({ type, items: matches.filter((e) => e.type === type) }))
    .filter((g) => g.items.length);

  const pick = (id) => { onChange(id); setOpen(false); };

  return (
    <div className="evp" ref={wrapRef}>
      <button type="button" className={`evp-trigger${open ? ' open' : ''}`} onClick={() => setOpen(!open)}
        aria-haspopup="listbox" aria-expanded={open}>
        <span className="evp-type">{selected?.type ?? '—'}</span>
        <span className="evp-name">{selected?.name ?? 'Choose an event'}</span>
        <span className="evp-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="evp-panel" role="listbox" aria-label="Events">
          {events.length > 8 && (
            <div className="evp-search">
              <input ref={searchRef} className="input" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Filter events…" aria-label="Filter events" />
            </div>
          )}
          <div className="evp-scroll">
            {groups.map((g) => (
              <div key={g.type} className="evp-group">
                <div className="evp-group-head">{TYPE_LABEL[g.type] || g.type}<span>{g.items.length}</span></div>
                {g.items.map((e) => (
                  <button key={e.id} type="button" role="option" aria-selected={e.id === value}
                    className={`evp-item${e.id === value ? ' sel' : ''}`} onClick={() => pick(e.id)}>
                    {e.name}
                  </button>
                ))}
              </div>
            ))}
            {groups.length === 0 && <div className="evp-none">No events match “{q}”.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
