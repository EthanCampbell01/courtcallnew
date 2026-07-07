import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.jsx';
import { timeAgo } from './shared.jsx';

const ICON = { scored: '⭐', futures_scored: '🏆', league_join: '👋', deadline: '⏰' };

function message(n) {
  const p = n.payload || {};
  switch (n.type) {
    case 'scored':
      return p.points > 0
        ? <>You scored <b style={{ color: 'var(--accent)' }}>+{p.points}</b> — {p.player1} v {p.player2}</>
        : <>{p.player1} v {p.player2} finished — no points this time</>;
    case 'futures_scored':
      return <>Champion called ✓ <b style={{ color: 'var(--accent)' }}>+{p.points}</b> — {p.champion} won the {p.event_type}</>;
    case 'league_join':
      return <><b>{p.username}</b> joined {p.league_name}</>;
    case 'deadline':
      return <>Picks lock soon — {p.round_name}, {p.tournament_name}</>;
    default:
      return n.type;
  }
}

function linkFor(n) {
  const p = n.payload || {};
  if (n.type === 'league_join') return `/leagues/${p.league_id}`;
  if (p.tournament_id) return `/tournaments/${p.tournament_id}`;
  return null;
}

export default function NotificationBell() {
  const [data, setData] = useState({ unread: 0, notifications: [] });
  const [open, setOpen] = useState(false);

  const load = () => api('/notifications').then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const openSheet = () => {
    setOpen(true);
    if (data.unread > 0) {
      api('/notifications/read', { method: 'POST' })
        .then(() => setData((d) => ({ ...d, unread: 0, notifications: d.notifications.map((n) => ({ ...n, read: 1 })) })))
        .catch(() => {});
    }
  };

  return (
    <>
      <button className="bell" onClick={openSheet} aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`}>
        🔔{data.unread > 0 && <span className="bell-badge">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="modal-handle" />
            <h2 style={{ fontSize: 16, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 12 }}>Notifications</h2>
            {data.notifications.length === 0 ? (
              <div className="empty">Nothing yet — make some picks and results will land here.</div>
            ) : (
              data.notifications.map((n) => {
                const to = linkFor(n);
                const body = (
                  <>
                    <span className="notif-ic">{ICON[n.type] || '•'}</span>
                    <span className="grow">{message(n)}<div className="feed-time">{timeAgo(n.created_at)}</div></span>
                  </>
                );
                return to
                  ? <Link key={n.id} to={to} className={`notif-row${n.read ? '' : ' unread'}`} onClick={() => setOpen(false)}>{body}</Link>
                  : <div key={n.id} className={`notif-row${n.read ? '' : ' unread'}`}>{body}</div>;
              })
            )}
            <button className="btn block" style={{ marginTop: 14 }} onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
