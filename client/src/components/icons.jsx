// Monochrome line icons for stat tiles. They inherit currentColor so they sit in
// the amber/chalk palette instead of fighting it the way full-colour emoji did.
const PATHS = {
  star: 'M12 3.6l2.6 5.3 5.8.9-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.9L12 3.6Z',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.6a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8Zm0 3.9a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1Z',
  flame: 'M12 3s5 3.9 5 8.2a5 5 0 0 1-10 0c0-2 .9-3.2 2-4.2 0 1.6 1 2.2 1.6 2.2.5-2.1-.6-4 1.4-6.2Z',
  bars: 'M4 20v-7m5 7V6m5 14v-4.5M19 20V9',
  check: 'M4.5 12.5 9 17 19.5 6.5',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4.4V12l3.4 2',
  crosshair: 'M12 2.5v4m0 11v4M2.5 12h4m11 0h4M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Z',
  burst: 'M12 2.4l1.9 5.7 5.7-1.9-3.8 4.8 3.8 4.8-5.7-1.9L12 21.6l-1.9-5.7-5.7 1.9 3.8-4.8-3.8-4.8 5.7 1.9L12 2.4Z',
  trophy: 'M8.5 20.5h7M12 16.8v3.7M6 3.5h12v4.8a6 6 0 0 1-12 0V3.5Zm0 1.8H3.6a3.4 3.4 0 0 0 3.4 3.4M18 5.3h2.4a3.4 3.4 0 0 1-3.4 3.4',
  bolt: 'M13.2 2.5 4.8 13.7h6l-1 7.8 8.4-11.2h-6l1-7.8Z',
};

export function StatIcon({ name }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
