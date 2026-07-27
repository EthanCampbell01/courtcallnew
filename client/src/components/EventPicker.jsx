import { useEffect, useRef, useState } from 'react';

const TYPE_LABEL = { MS: "Men's Singles", WS: "Women's Singles", MD: "Men's Doubles", WD: "Women's Doubles", XD: 'Mixed Doubles' };
const TYPE_ORDER = ['MS', 'WS', 'MD', 'WD', 'XD'];

// Junior draws are stored under the adult type they map to (BS→MS and so on) so
// scoring works, but calling a U12 boys' draw "Men's Singles" reads as a bug.
// The draw name still carries the real code, so labels come from it where it has one.
const JUNIOR = {
  BS: { label: "Boys' Singles", code: 'BS' },
  GS: { label: "Girls' Singles", code: 'GS' },
  BD: { label: "Boys' Doubles", code: 'BD' },
  GD: { label: "Girls' Doubles", code: 'GD' },
};
const juniorOf = (name) => {
  const m = (name || '').trim().match(/^(BS|GS|BD|GD)\b/i);
  return m ? JUNIOR[m[1].toUpperCase()] : null;
};
// "BS 200 U12 - Group A" → stem "BS 200 U12", part "Group A"
const splitName = (name) => {
  const bits = (name || '').split(/\s+[-–—]\s+/);
  return { stem: (bits[0] || '').trim(), part: bits.slice(1).join(' – ').trim() || null };
};

export default function EventPicker({ events, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  const selected = events.find((e) => e.id === value) || null;
  const selJunior = selected ? juniorOf(selected.name) : null;

  useEffect(() => {
    if (!open) { setQ(''); return; }
    searchRef.current?.focus();
    // centre the current pick inside the list without scrolling the page itself,
    // which scrollIntoView would do — a 50-draw tournament opens far from it
    const scroller = wrapRef.current?.querySelector('.evp-scroll');
    const sel = scroller?.querySelector('.evp-item.sel');
    if (scroller && sel) scroller.scrollTop = sel.offsetTop - scroller.clientHeight / 2 + sel.clientHeight / 2;

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

  // type groups, each split again by draw family so "BS 200 U12" is stated once
  // instead of prefixing all six of its groups and position play-offs
  const groups = TYPE_ORDER.map((type) => {
    const items = matches.filter((e) => e.type === type);
    if (!items.length) return null;
    const juniors = items.map((e) => juniorOf(e.name));
    const allSame = juniors[0] && juniors.every((j) => j && j.code === juniors[0].code);
    const families = [];
    for (const e of items) {
      const { stem, part } = splitName(e.name);
      const last = families[families.length - 1];
      if (last && last.stem === stem) last.items.push({ e, part });
      else families.push({ stem, items: [{ e, part }] });
    }
    return { type, label: allSame ? juniors[0].label : (TYPE_LABEL[type] || type), count: items.length, families };
  }).filter(Boolean);

  const pick = (id) => { onChange(id); setOpen(false); };

  const row = (e, text) => (
    <button key={e.id} type="button" role="option" aria-selected={e.id === value}
      className={`evp-item${e.id === value ? ' sel' : ''}`} onClick={() => pick(e.id)}>
      {text}
    </button>
  );

  return (
    <div className="evp" ref={wrapRef}>
      <button type="button" className={`evp-trigger${open ? ' open' : ''}`} onClick={() => setOpen(!open)}
        aria-haspopup="listbox" aria-expanded={open}>
        <span className="evp-type">{selJunior?.code ?? selected?.type ?? '—'}</span>
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
                <div className="evp-group-head">{g.label}<span>{g.count}</span></div>
                {g.families.map((f) =>
                  f.items.length === 1 && !f.items[0].part ? (
                    row(f.items[0].e, f.stem)
                  ) : (
                    <div key={f.stem} className="evp-family">
                      <div className="evp-family-head">{f.stem}</div>
                      {f.items.map(({ e, part }) => row(e, part || 'Main draw'))}
                    </div>
                  )
                )}
              </div>
            ))}
            {groups.length === 0 && <div className="evp-none">No events match “{q}”.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
