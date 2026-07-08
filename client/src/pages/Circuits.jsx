import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useAuth } from '../api.jsx';
import { useSport } from '../sport.jsx';
import { Toast, useToast } from '../components/shared.jsx';

function CircuitList({ onboarding }) {
  const { refreshCircuits } = useAuth();
  const { sport } = useSport();
  const nav = useNavigate();
  const [circuits, setCircuits] = useState(null);
  const [toast, showToast] = useToast();

  const load = () => api(`/circuits?sport=${sport}`).then(setCircuits).catch(() => setCircuits([]));
  useEffect(() => { setCircuits(null); load(); }, [sport]);

  const toggle = async (c) => {
    await api(`/circuits/${c.id}/${c.joined ? 'leave' : 'join'}`, { method: 'POST' });
    await refreshCircuits();
    showToast(c.joined ? `Left ${c.name}` : `Joined ${c.name}`);
    if (onboarding && !c.joined) return nav('/dashboard', { replace: true });
    load();
  };

  if (!circuits) return <div className="empty">Loading circuits…</div>;

  return (
    <>
      {circuits.map((c) => (
        <div key={c.id} className="card row between">
          <div className="grow">
            <div className="card-title">{c.name}</div>
            <div className="card-meta">{c.description}</div>
            <div className="card-meta mono" style={{ fontSize: 11.5, marginTop: 4 }}>
              {c.tournament_count} tournaments · {c.member_count} members
            </div>
          </div>
          <button className={`btn small${c.joined ? ' ghost' : ''}`} onClick={() => toggle(c)}>
            {c.joined ? 'Leave' : 'Join'}
          </button>
        </div>
      ))}
      <Toast message={toast} />
    </>
  );
}

export function Onboarding() {
  return (
    <div className="page" style={{ paddingTop: 48 }}>
      <h1 className="page-title">Pick your circuit 🎾</h1>
      <p className="page-sub">Join at least one circuit to see its tournaments and start predicting.</p>
      <CircuitList onboarding />
    </div>
  );
}

export function Circuits() {
  return (
    <div className="page">
      <h1 className="page-title">Circuits</h1>
      <p className="page-sub">Tournaments are scoped to the circuits you join.</p>
      <CircuitList />
    </div>
  );
}
