import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, useAuth } from '../api.jsx';
import MatchCard from '../components/MatchCard.jsx';
import BracketView from '../components/BracketView.jsx';
import { Countdown, Toast, useToast, fmtDate } from '../components/shared.jsx';
import ScoringInfo, { ScoringPip } from '../components/ScoringInfo.jsx';
import PixelCourt from '../components/PixelCourt.jsx';
import FuturesCard from '../components/FuturesCard.jsx';

export function Tournaments() {
  const { circuits } = useAuth();
  const [filter, setFilter] = useState('');
  const [tournaments, setTournaments] = useState(null);
  const [showScoring, setShowScoring] = useState(false);

  useEffect(() => {
    api(`/tournaments${filter ? `?circuit=${filter}` : ''}`)
      .then(setTournaments)
      .catch(() => setTournaments([]));
  }, [filter]);

  return (
    <div className="page">
      <div className="row between">
        <h1 className="page-title">Tournaments</h1>
        <ScoringPip onClick={() => setShowScoring(true)} />
      </div>
      <p className="page-sub">Across your circuits</p>
      {showScoring && <ScoringInfo onClose={() => setShowScoring(false)} />}

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
        <div>
          <PixelCourt height={128} showScore={false} />
          <div className="empty">No tournaments yet. Join a circuit on the Circuits tab, or check back soon.</div>
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
  const [roundId, setRoundId] = useState(null);
  const [view, setView] = useState('list'); // 'list' | 'bracket'
  const [toast, showToast] = useToast();

  const load = () =>
    api(`/tournaments/${id}`).then((d) => {
      setT(d);
      setEventId((prev) => prev ?? d.events[0]?.id ?? null);
    });
  // Reset per-tournament view state when the :id changes — the component is
  // reused across tournament routes, so stale event/round selection would
  // otherwise carry over and not match the newly-loaded tournament.
  useEffect(() => {
    setT(null);
    setEventId(null);
    setRoundId(null);
    setView('list');
    load().catch(() => setT(undefined));
  }, [id]);

  if (t === undefined) return <div className="page empty">Tournament not found.</div>;
  if (!t) return <div className="page empty">Loading…</div>;

  const event = t.events.find((e) => e.id === eventId);
  const rounds = event?.rounds ?? [];
  const round = rounds.find((r) => r.id === roundId) ?? rounds[0];

  return (
    <div className="page">
      <Link to="/tournaments" className="card-meta">← Tournaments</Link>
      <h1 className="page-title" style={{ marginTop: 8 }}>{t.name}</h1>
      <p className="page-sub">{t.venue} · {t.circuit_name}</p>

      <div className="tabs">
        {t.events.map((e) => (
          <button key={e.id} className={`tab${e.id === eventId ? ' active' : ''}`}
            onClick={() => { setEventId(e.id); setRoundId(null); }}>
            {e.type} — {e.name}
          </button>
        ))}
      </div>

      {!event && <div className="empty">No events yet.</div>}

      {event && <FuturesCard eventId={event.id} showToast={showToast} />}

      {event && rounds.length > 0 && (
        <>
          <div className="row between" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div className="tabs" style={{ margin: 0 }}>
              {rounds.map((r) => (
                <button key={r.id} className={`tab${r.id === round.id ? ' active' : ''}`} onClick={() => setRoundId(r.id)}>
                  {r.name}
                </button>
              ))}
            </div>
            {rounds.length > 1 && (
              <div className="tabs" style={{ margin: 0 }}>
                <button className={`tab${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>📋 List</button>
                <button className={`tab${view === 'bracket' ? ' active' : ''}`} onClick={() => setView('bracket')}>🏆 Bracket</button>
              </div>
            )}
          </div>

          {view === 'bracket' ? (
            <BracketView rounds={rounds} onSelectMatch={(r) => { setRoundId(r.id); setView('list'); }} />
          ) : (
            <section>
              <div className="row between">
                <h2 className="section-label" style={{ margin: 0 }}>{round.name}</h2>
                {!round.locked && <Countdown deadline={round.deadline} />}
              </div>
              {round.matches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  deadline={round.deadline}
                  locked={round.locked}
                  context={`${event.type} · ${round.name}`}
                  onSaved={load}
                  showToast={showToast}
                />
              ))}
              {round.matches.length === 0 && <p className="card-meta">No matches in this round yet.</p>}
            </section>
          )}
        </>
      )}
      <Toast message={toast} />
    </div>
  );
}
