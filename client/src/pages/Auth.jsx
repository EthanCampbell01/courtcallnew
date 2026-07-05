import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../api.jsx';

export default function Auth() {
  const { login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState(location.state?.mode === 'register' ? 'register' : 'login');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await login(username.trim(), pin, mode === 'register');
      nav(d.circuits?.length ? '/dashboard' : '/onboarding', { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <Link to="/" className="logo" style={{ display: 'block' }}>Court<span className="ball">Call</span></Link>
      <div className="logo-tag">call every match. top every league.</div>

      {error && <div className="error-banner">{error}</div>}

      <div className="field">
        <label htmlFor="u">Username</label>
        <input id="u" className="input" autoComplete="username" maxLength={20}
          value={username} onChange={(e) => setUsername(e.target.value)} placeholder="e.g. baseline_bandit" />
      </div>
      <div className="field">
        <label htmlFor="p">4-digit PIN</label>
        <input id="p" className="input mono" inputMode="numeric" pattern="\d*" maxLength={4} type="password"
          value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••"
          onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </div>

      <button className="btn block" disabled={busy || !username || pin.length !== 4} onClick={submit}>
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
      <button className="btn ghost block" style={{ marginTop: 10 }}
        onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
        {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>

      <p className="card-meta" style={{ marginTop: 22, textAlign: 'center' }}>
        Try the demo: username <span className="mono">demo</span>, PIN <span className="mono">0000</span>
      </p>
    </div>
  );
}
