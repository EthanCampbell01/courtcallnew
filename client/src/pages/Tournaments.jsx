import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, useAuth } from '../api.jsx';
import MatchCard from '../components/MatchCard.jsx';
import { Countdown, Toast, useToast, fmtDate } from '../components/shared.jsx';

export function Tournaments() {
  const { circuits } = useAuth();
  const [filter, setFilter] = useState('');
  const [tournaments, setTournaments] = useState(null);

  useEffect(() => {
    api(`/tournaments${filter ? `?circuit=${filter}` : ''}`)
      .then(setTournaments)
      .catch(() => setTournaments([]));
  }, [filter]);

  return (
    <div className="page">
      <h1 className="page-title">Tournaments</h1>
      <p className="page-sub">Across your circuits</p>

      {circuits.length > 1 && (
        <div className="tabs">
          <button className={`tab${!filter ? ' active' : ''}`} onClick={() => setFilter('')}>All</button>
          {circuits.map((c) => (
            <button key={c.id} className={`tab${filter === String(c.id) ? ' active' : ''}`} onClick={() => setFilter(String(c.id))}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {tournaments === null ? (
        <div className="empty">Loading…</div>
      ) : tournaments.length === 0 ? (
        <div className="empty">
          <div className="big">🎾</div>
          No tournaments yet. Join a circuit on the Circuits tab, or check back soon.
        </div>
      ) : (
        tournaments.map((t) => (
          <Link key={t.id} to={`/tournaments/${t.id}`} className={`card link row between status-${t.status}`}>
            <div className="grow">
              <div className="card-title">{t.name}</div>
              <div className="card-meta">{t.venue} · {t.circuit_name}</div>
              <div className="card-meta mono" style={{ fontSize: 11.5, marginTop: 3 }}>
                {fmtDate(t.start_date)} – {fmtDate(t.end_date)} · {t.event_count} events
              </div>
            </div>
            <span className={`pill ${t.status === 'live' ? 'live' : t.status === 'completed' ? 'done' : ''}`}>{t.status}</span>
          </Link>
        ))
      )}
    </div>
  );
}

export function TournamentDetail() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [eventId, setEventId] = useState(null);
  const [toast, showToast] = useToast();

  const load = () =>
    api(`/tournaments/${id}`).then((d) => {
      setT(d);
      setEventId((prev) => prev ?? d.events[0]?.id ?? null);
    });
  useEffect(() => { load().catch(() => setT(undefined)); }, [id]);

  if (t === undefined) return <div className="page empty">Tournament not found.</div>;
  if (!t) return <div className="page empty">Loading…</div>;

  const event = t.events.find((e) => e.id === eventId);

  return (
    <div className="page">
      <Link to="/tournaments" className="card-meta">← Tournaments</Link>
      <h1 className="page-title" style={{ marginTop: 8 }}>{t.name}</h1>
      <p className="page-sub">{t.venue} · {t.circuit_name}</p>

      <div className="tabs">
        {t.events.map((e) => (
          <button key={e.id} className={`tab${e.id === eventId ? ' active' : ''}`} onClick={() => setEventId(e.id)}>
            {e.type} — {e.name}
          </button>
        ))}
      </div>

      {!event && <div className="empty">No events yet.</div>}
      {event?.rounds.map((r) => (
        <section key={r.id}>
          <div className="row between">
            <h2 className="section-label">{r.name}</h2>
            {!r.locked && <Countdown deadline={r.deadline} />}
          </div>
          {r.matches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              deadline={r.deadline}
              locked={r.locked}
              context={`${event.type} · ${r.name}`}
              onSaved={load}
              showToast={showToast}
            />
          ))}
          {r.matches.length === 0 && <p className="card-meta">No matches in this round yet.</p>}
        </section>
      ))}
      <Toast message={toast} />
    </div>
  );
}
