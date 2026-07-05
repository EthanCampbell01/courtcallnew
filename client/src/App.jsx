import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './api.jsx';
import { BottomNav } from './components/shared.jsx';
import Landing from './pages/Landing.jsx';
import Auth from './pages/Auth.jsx';
import { Onboarding, Circuits } from './pages/Circuits.jsx';
import { Tournaments, TournamentDetail } from './pages/Tournaments.jsx';
import Predictions from './pages/Predictions.jsx';
import Leagues from './pages/Leagues.jsx';
import LeagueDetail from './pages/LeagueDetail.jsx';
import Stats from './pages/Stats.jsx';
import H2H from './pages/H2H.jsx';
import Admin from './pages/Admin.jsx';

function Guard({ children }) {
  const { user, circuits, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="page"><div className="empty">Loading…</div></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (circuits.length === 0 && loc.pathname !== '/onboarding') return <Navigate to="/onboarding" replace />;
  return children;
}

function Shell() {
  const { user, ready } = useAuth();
  return (
    <>
      <Routes>
        <Route path="/" element={ready && user ? <Navigate to="/tournaments" replace /> : <Landing />} />
        <Route path="/auth" element={ready && user ? <Navigate to="/tournaments" replace /> : <Auth />} />
        <Route path="/onboarding" element={<Guard><Onboarding /></Guard>} />
        <Route path="/tournaments" element={<Guard><Tournaments /></Guard>} />
        <Route path="/tournaments/:id" element={<Guard><TournamentDetail /></Guard>} />
        <Route path="/predictions" element={<Guard><Predictions /></Guard>} />
        <Route path="/leagues" element={<Guard><Leagues /></Guard>} />
        <Route path="/leagues/:id" element={<Guard><LeagueDetail /></Guard>} />
        <Route path="/stats" element={<Guard><Stats /></Guard>} />
        <Route path="/h2h/:userId" element={<Guard><H2H /></Guard>} />
        <Route path="/admin" element={<Guard><Admin /></Guard>} />
        <Route path="/circuits" element={<Guard><Circuits /></Guard>} />
        <Route path="*" element={<Navigate to="/tournaments" replace />} />
      </Routes>
      {user && <BottomNav />}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  );
}
