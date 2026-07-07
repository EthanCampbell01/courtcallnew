import { useEffect, useState } from 'react';
import { api } from '../api.jsx';
import { Countdown } from './shared.jsx';

// Champion futures for one event: pick who wins the draw before play starts.
export default function FuturesCard({ eventId, showToast }) {
  const [data, setData] = useState(null);

  const load = () => api(`/events/${eventId}/futures`).then(setData).catch(() => setData(null));
  useEffect(() => { load(); }, [eventId]);

  if (!data || data.entrants.length === 0) return null; // no draw published yet

  const pick = async (name) => {
    if (data.locked) return;
    try {
      await api(`/events/${eventId}/futures`, { method: 'PUT', body: { predicted_player: name } });
      showToast?.('Champion pick saved');
      load();
    } catch (e) { showToast?.(e.message); }
  };

  const won = data.decided && data.my_points > 0;

  return (
    <div className="card futures">
      <div className="row between" style={{ marginBottom: 8 }}>
        <span className="section-label" style={{ margin: 0 }}>🏆 Champion — {data.event.type}</span>
        {!data.locked && data.deadline && <Countdown deadline={data.deadline} prefix="locks in" />}
      </div>

      {data.decided ? (
        <div>
          <div className="fut-champ">Winner: <b>{data.champion}</b></div>
          <div className="card-meta" style={{ marginTop: 4 }}>
            {data.my_pick
              ? won
                ? <span style={{ color: 'var(--accent)' }}>You called it ✓ +{data.my_points}</span>
                : <>You picked {data.my_pick} · +0</>
              : 'You didn’t pick a champion'}
          </div>
        </div>
      ) : data.locked ? (
        <div className="card-meta">
          Locked — play is underway.{' '}
          {data.my_pick ? <>Your pick: <b style={{ color: 'var(--accent)' }}>{data.my_pick}</b></> : 'You didn’t pick.'}
        </div>
      ) : (
        <>
          <div className="card-meta" style={{ marginBottom: 8 }}>Call who lifts the trophy — unseeded winners pay double.</div>
          <div className="fut-entrants">
            {data.entrants.map((e) => (
              <button key={e.name} className={`fut-chip${data.my_pick === e.name ? ' picked' : ''}`} onClick={() => pick(e.name)}>
                {e.name}{e.seed ? <span className="seed"> [{e.seed}]</span> : null}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
