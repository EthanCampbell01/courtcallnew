import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useAuth } from '../api.jsx';
import { Toast, useToast } from '../components/shared.jsx';

const EVENT_TYPES = ['MS', 'WS', 'MD', 'WD', 'XD'];

function Section({ id, title, open, setOpen, children }) {
  const isOpen = open === id;
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button onClick={() => setOpen(isOpen ? '' : id)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', color: 'var(--text)', padding: '13px 15px', fontSize: 15, fontWeight: 600 }}>
        {title}
        <span className="mono" style={{ color: 'var(--text-faint)' }}>{isOpen ? '−' : '+'}</span>
      </button>
      {isOpen && <div className="admin-form" style={{ padding: '0 15px 15px' }}>{children}</div>}
    </div>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [msg, toast] = useToast();
  const [ov, setOv] = useState(null);
  const [users, setUsers] = useState(null);
  const [open, setOpen] = useState('result');
  const [pickT, setPickT] = useState('');
  const [detail, setDetail] = useState(null);

  const [t, setT] = useState({ circuit_id: '', name: '', venue: '', start_date: '', end_date: '' });
  const [ev, setEv] = useState({ type: 'MS', name: '' });
  const [rd, setRd] = useState({ event_id: '', name: '', deadline: '' });
  const [mt, setMt] = useState({ round_id: '', player1: '', player2: '', seed1: '', seed2: '' });
  const [rs, setRs] = useState({ match_id: '', winner: '1', score: '', status: 'completed' });

  const loadOverview = () =>
    api('/admin/overview').then((d) => {
      setOv(d);
      setT((s) => (s.circuit_id ? s : { ...s, circuit_id: d.circuits[0]?.id ?? '' }));
      setPickT((p) => p || String(d.tournaments[0]?.id ?? ''));
    }).catch((e) => toast(e.message));

  const loadUsers = () => api('/admin/users').then(setUsers).catch((e) => toast(e.message));

  const loadDetail = () => {
    if (!pickT) return setDetail(null);
    api(`/tournaments/${pickT}`).then(setDetail).catch(() => setDetail(null));
  };

  useEffect(() => { if (user?.is_admin) { loadOverview(); loadUsers(); } }, [user]);
  useEffect(() => { loadDetail(); }, [pickT]);

  if (!user?.is_admin) {
    return (
      <div className="page">
        <div className="empty"><div className="big">🔒</div>Admin access required.</div>
      </div>
    );
  }

  const post = async (path, body, success, after) => {
    try {
      await api(path, { method: 'POST', body });
      toast(success);
      loadOverview();
      loadDetail();
      if (after) after();
    } catch (e) { toast(e.message); }
  };

  const removeTournament = async (id, name) => {
    if (!window.confirm(`Delete "${name}" and all its events, rounds and matches?`)) return;
    try {
      await api(`/admin/tournaments/${id}`, { method: 'DELETE' });
      toast('Tournament deleted');
      if (pickT === String(id)) setPickT('');
      loadOverview();
    } catch (e) { toast(e.message); }
  };

  const setAdmin = async (id, isAdmin) => {
    try {
      await api(`/admin/users/${id}/set-admin`, { method: 'POST', body: { is_admin: isAdmin } });
      loadUsers();
    } catch (e) { toast(e.message); }
  };

  const events = detail?.events ?? [];
  const rounds = events.flatMap((e) => e.rounds.map((r) => ({ ...r, eventType: e.type })));
  const scheduled = events.flatMap((e) =>
    e.rounds.flatMap((r) =>
      r.matches.filter((m) => m.status === 'scheduled')
        .map((m) => ({ ...m, label: `${e.type} ${r.name} — ${m.player1} vs ${m.player2}` }))
    )
  );
  const picked = scheduled.find((m) => String(m.id) === rs.match_id);

  return (
    <div className="page">
      <button className="btn small ghost" onClick={() => nav('/stats')} style={{ marginBottom: 12 }}>← Stats</button>
      <h1 className="page-title">Admin</h1>
      <p className="page-sub">
        {ov ? `${ov.counts.users} users · ${ov.counts.predictions} predictions · ${ov.counts.matches_pending} matches awaiting results` : 'Loading…'}
      </p>

      <div className="field">
        <label htmlFor="at">Working tournament (for results, rounds & matches)</label>
        <select id="at" className="input" value={pickT} onChange={(e) => { setPickT(e.target.value); setRs((s) => ({ ...s, match_id: '' })); setRd((s) => ({ ...s, event_id: '' })); setMt((s) => ({ ...s, round_id: '' })); }}>
          {(ov?.tournaments ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <Section id="result" title="Enter result → auto-score" open={open} setOpen={setOpen}>
          <div className="field">
            <label htmlFor="rm">Match</label>
            <select id="rm" className="input" value={rs.match_id} onChange={(e) => setRs((s) => ({ ...s, match_id: e.target.value }))}>
              <option value="">Choose a scheduled match…</option>
              {scheduled.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          {picked && (
            <>
              <div className="field">
                <label htmlFor="rw">Winner</label>
                <select id="rw" className="input" value={rs.winner} onChange={(e) => setRs((s) => ({ ...s, winner: e.target.value }))}>
                  <option value="1">{picked.player1}</option>
                  <option value="2">{picked.player2}</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="rst">Status</label>
                <select id="rst" className="input" value={rs.status} onChange={(e) => setRs((s) => ({ ...s, status: e.target.value }))}>
                  <option value="completed">Completed</option>
                  <option value="walkover">Walkover</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
              {rs.status === 'completed' && (
                <div className="field">
                  <label htmlFor="rsc">Score (winner's sets first)</label>
                  <input id="rsc" className="input" style={{ fontFamily: 'var(--font-mono)' }} value={rs.score}
                    onChange={(e) => setRs((s) => ({ ...s, score: e.target.value }))} placeholder="6-4 3-6 7-5" />
                </div>
              )}
              <button className="btn block"
                disabled={rs.status === 'completed' && !rs.score.trim()}
                onClick={() => post(`/admin/matches/${rs.match_id}/result`,
                  { winner: Number(rs.winner), score: rs.score.trim() || undefined, status: rs.status },
                  'Result saved — predictions scored',
                  () => setRs({ match_id: '', winner: '1', score: '', status: 'completed' }))}>
                Save result & score predictions
              </button>
            </>
          )}
        </Section>

        <Section id="t" title="Add tournament" open={open} setOpen={setOpen}>
          <div className="field">
            <label htmlFor="tc">Circuit</label>
            <select id="tc" className="input" value={t.circuit_id} onChange={(e) => setT((s) => ({ ...s, circuit_id: e.target.value }))}>
              {(ov?.circuits ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tn">Name</label>
            <input id="tn" className="input" value={t.name} onChange={(e) => setT((s) => ({ ...s, name: e.target.value }))} placeholder="Cavehill Open 2026" />
          </div>
          <div className="field">
            <label htmlFor="tv">Venue</label>
            <input id="tv" className="input" value={t.venue} onChange={(e) => setT((s) => ({ ...s, venue: e.target.value }))} placeholder="Cavehill LTC, Belfast" />
          </div>
          <div className="row">
            <div className="field grow">
              <label htmlFor="ts">Start</label>
              <input id="ts" className="input" type="date" value={t.start_date} onChange={(e) => setT((s) => ({ ...s, start_date: e.target.value }))} />
            </div>
            <div className="field grow">
              <label htmlFor="te">End</label>
              <input id="te" className="input" type="date" value={t.end_date} onChange={(e) => setT((s) => ({ ...s, end_date: e.target.value }))} />
            </div>
          </div>
          <button className="btn block" disabled={!t.name.trim()} onClick={() =>
            post('/admin/tournaments',
              { circuit_id: Number(t.circuit_id), name: t.name.trim(), venue: t.venue.trim(), start_date: t.start_date || null, end_date: t.end_date || null },
              'Tournament added', () => setT((s) => ({ ...s, name: '', venue: '' })))}>
            Add tournament
          </button>
        </Section>

        <Section id="tlist" title={`Manage tournaments (${ov?.tournaments?.length ?? 0})`} open={open} setOpen={setOpen}>
          {(ov?.tournaments ?? []).length === 0 && <p className="card-meta">No tournaments yet.</p>}
          {(ov?.tournaments ?? []).map((x) => (
            <div key={x.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="grow">
                {x.name}
                <div className="card-meta">{x.venue} · {x.status}</div>
              </span>
              <button className="btn small danger" onClick={() => removeTournament(x.id, x.name)}>Delete</button>
            </div>
          ))}
        </Section>

        <Section id="e" title="Add event" open={open} setOpen={setOpen}>
          <p className="card-meta">Adds to the working tournament selected above.</p>
          <div className="field">
            <label htmlFor="et">Type</label>
            <select id="et" className="input" value={ev.type} onChange={(e) => setEv((s) => ({ ...s, type: e.target.value }))}>
              {EVENT_TYPES.map((x) => <option key={x}>{x}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="en">Display name (optional)</label>
            <input id="en" className="input" value={ev.name} onChange={(e) => setEv((s) => ({ ...s, name: e.target.value }))} placeholder="Men's Singles" />
          </div>
          <button className="btn block" disabled={!pickT} onClick={() =>
            post('/admin/events', { tournament_id: Number(pickT), type: ev.type, name: ev.name.trim() || undefined },
              'Event added', () => setEv((s) => ({ ...s, name: '' })))}>
            Add event
          </button>
        </Section>

        <Section id="r" title="Add round" open={open} setOpen={setOpen}>
          <div className="field">
            <label htmlFor="re">Event</label>
            <select id="re" className="input" value={rd.event_id} onChange={(e) => setRd((s) => ({ ...s, event_id: e.target.value }))}>
              <option value="">Choose…</option>
              {events.map((e2) => <option key={e2.id} value={e2.id}>{e2.type}{e2.name && e2.name !== e2.type ? ` · ${e2.name}` : ''}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rn">Name</label>
            <input id="rn" className="input" value={rd.name} onChange={(e) => setRd((s) => ({ ...s, name: e.target.value }))} placeholder="Quarter-finals" />
          </div>
          <div className="field">
            <label htmlFor="rdl">Prediction deadline</label>
            <input id="rdl" className="input" type="datetime-local" value={rd.deadline} onChange={(e) => setRd((s) => ({ ...s, deadline: e.target.value }))} />
          </div>
          <button className="btn block" disabled={!rd.event_id || !rd.name.trim() || !rd.deadline} onClick={() =>
            post('/admin/rounds', { event_id: Number(rd.event_id), name: rd.name.trim(), deadline: rd.deadline },
              'Round added', () => setRd({ event_id: rd.event_id, name: '', deadline: '' }))}>
            Add round
          </button>
        </Section>

        <Section id="m" title="Add match" open={open} setOpen={setOpen}>
          <div className="field">
            <label htmlFor="mr">Round</label>
            <select id="mr" className="input" value={mt.round_id} onChange={(e) => setMt((s) => ({ ...s, round_id: e.target.value }))}>
              <option value="">Choose…</option>
              {rounds.map((r) => <option key={r.id} value={r.id}>{r.eventType} · {r.name}</option>)}
            </select>
          </div>
          <div className="row">
            <div className="field grow">
              <label htmlFor="p1">Player 1</label>
              <input id="p1" className="input" value={mt.player1} onChange={(e) => setMt((s) => ({ ...s, player1: e.target.value }))} />
            </div>
            <div className="field" style={{ width: 84 }}>
              <label htmlFor="s1">Seed</label>
              <input id="s1" className="input" type="number" min="1" value={mt.seed1} onChange={(e) => setMt((s) => ({ ...s, seed1: e.target.value }))} placeholder="–" />
            </div>
          </div>
          <div className="row">
            <div className="field grow">
              <label htmlFor="p2">Player 2</label>
              <input id="p2" className="input" value={mt.player2} onChange={(e) => setMt((s) => ({ ...s, player2: e.target.value }))} />
            </div>
            <div className="field" style={{ width: 84 }}>
              <label htmlFor="s2">Seed</label>
              <input id="s2" className="input" type="number" min="1" value={mt.seed2} onChange={(e) => setMt((s) => ({ ...s, seed2: e.target.value }))} placeholder="–" />
            </div>
          </div>
          <button className="btn block" disabled={!mt.round_id || !mt.player1.trim() || !mt.player2.trim()} onClick={() =>
            post('/admin/matches', {
              round_id: Number(mt.round_id),
              player1: mt.player1.trim(),
              player2: mt.player2.trim(),
              seed1: mt.seed1 ? Number(mt.seed1) : null,
              seed2: mt.seed2 ? Number(mt.seed2) : null,
            }, 'Match added', () => setMt((s) => ({ ...s, player1: '', player2: '', seed1: '', seed2: '' })))}>
            Add match
          </button>
        </Section>

        <Section id="users" title={`Users (${users?.length ?? 0})`} open={open} setOpen={setOpen}>
          {users === null && <p className="card-meta">Loading…</p>}
          {(users ?? []).map((u) => (
            <div key={u.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="grow">
                {u.username}
                {u.is_admin ? <span className="pill live" style={{ marginLeft: 8 }}>admin</span> : null}
              </span>
              <button
                className={`btn small ${u.is_admin ? 'ghost' : ''}`}
                disabled={u.id === user.id}
                onClick={() => setAdmin(u.id, !u.is_admin)}>
                {u.is_admin ? 'Revoke admin' : 'Make admin'}
              </button>
            </div>
          ))}
        </Section>
      </div>
      <Toast message={msg} />
    </div>
  );
}
