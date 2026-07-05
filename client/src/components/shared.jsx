import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api.jsx';

/* ---------------- Bottom navigation ---------------- */
const ICONS = {
  Dashboard: <path d="M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  Tournaments: <path d="M8 21h8m-4-4v4m-7-17h14v5a7 7 0 0 1-14 0V4Zm0 2H3a4 4 0 0 0 4 4M21 6h2a4 4 0 0 1-4 4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" transform="translate(-1.5 0)" />,
  Predictions: <path d="M9 12l2 2 4-5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  Leagues: <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10 10v-2a4 4 0 0 0-3-3.87M15.5 3.13A4 4 0 0 1 15.5 11" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  Stats: <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  Circuits: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.5-2.2 4-5.5 4-9s-1.5-6.8-4-9c-2.5 2.2-4 5.5-4 9s1.5 6.8 4 9ZM3.5 9h17m-17 6h17" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
};

export function BottomNav() {
  const tabs = [
    ['Dashboard', '/dashboard'],
    ['Tournaments', '/tournaments'],
    ['Predictions', '/predictions'],
    ['Leagues', '/leagues'],
    ['Stats', '/stats'],
    ['Circuits', '/circuits'],
  ];
  return (
    <nav className="bottom-nav" aria-label="Main">
      {tabs.map(([label, to]) => (
        <NavLink key={to} to={to} className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[label]}</svg>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

/* ---------------- Countdown (pulses under 24h) ---------------- */
export function Countdown({ deadline, prefix = 'locks in' }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const ms = new Date(deadline) - now;
  if (ms <= 0) return <span className="countdown">locked</span>;

  const urgent = ms < 24 * 3600 * 1000;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const text = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, '0')}s`;

  return (
    <span className={`countdown${urgent ? ' urgent' : ''}`} role="timer">
      {prefix} {text}
    </span>
  );
}

/* ---------------- Emoji reactions ---------------- */
export const EMOJIS = ['😂', '🔥', '💀', '👏', '🤡', '😤', '💪', '🧠'];

export function ReactionBar({ prediction, onChange }) {
  const [busy, setBusy] = useState(false);
  const counts = Object.fromEntries((prediction.reactions || []).map((r) => [r.emoji, r]));

  const react = async (emoji) => {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/predictions/${prediction.id}/react`, { method: 'POST', body: { emoji } });
      onChange?.();
    } catch (e) {
      console.warn(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="reactions">
      {EMOJIS.map((e) => {
        const r = counts[e];
        return (
          <button key={e} className={`react-btn${r?.mine ? ' mine' : ''}`} onClick={() => react(e)} aria-label={`React ${e}`}>
            {e} {r?.count ? <span className="count">{r.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- misc ---------------- */
export function Toast({ message }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

export function useToast() {
  const [msg, setMsg] = useState('');
  const show = (m) => {
    setMsg(m);
    setTimeout(() => setMsg(''), 2200);
  };
  return [msg, show];
}

export const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';

// SQLite emits 'YYYY-MM-DD HH:MM:SS' (UTC) — Safari rejects that format, so normalise to ISO.
export const parseUTC = (d) =>
  new Date(/\d{4}-\d{2}-\d{2} /.test(d) ? d.replace(' ', 'T') + 'Z' : d);

export const timeAgo = (d) => {
  const s = (Date.now() - parseUTC(d)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};
