import { createContext, useContext, useState, useEffect } from 'react';

// One CourtCall app, two sports. Sport is a runtime, user-chosen dimension:
// switching live re-themes the app (data-sport on <html> drives styles.css),
// swaps the court render, and scopes the data to that sport.
export const SPORTS = {
  tennis: { key: 'tennis', label: 'Tennis', tagline: 'Fantasy predictions for Irish & UK amateur tennis', themeColor: '#191d20' },
  padel:  { key: 'padel',  label: 'Padel',  tagline: 'Fantasy predictions for Irish padel',                themeColor: '#0a1020' },
};

const BUILD_DEFAULT = import.meta.env.VITE_APP_SPORT === 'padel' ? 'padel' : 'tennis';

const Ctx = createContext(null);

export function SportProvider({ children }) {
  const [sport, setSport] = useState(() => {
    const s = localStorage.getItem('courtcall_sport');
    return s === 'padel' || s === 'tennis' ? s : BUILD_DEFAULT;
  });

  useEffect(() => {
    document.documentElement.dataset.sport = sport;
    localStorage.setItem('courtcall_sport', sport);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', SPORTS[sport].themeColor);
  }, [sport]);

  return (
    <Ctx.Provider value={{ sport, setSport, isPadel: sport === 'padel', ...SPORTS[sport] }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSport() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSport must be used within SportProvider');
  return c;
}
