import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { DanceClass, ClassSession, Registration } from '../../lib/database.types';
import { getClassState } from '../../lib/classState';
import ClassEditor from './ClassEditor';
import RegistrationTable from './RegistrationTable';

type Tab = 'overview' | 'classes' | 'registrations';

export default function AdminDashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [sessionsMap, setSessionsMap] = useState<Record<string, ClassSession[]>>({});
  const base = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        window.location.href = `${base}/admin/login/`;
        return;
      }
      setUser(user);
      setLoading(false);
      loadData();
    });
  }, []);

  async function loadData() {
    const [classRes, regRes, sessRes] = await Promise.all([
      supabase.from('dance_classes').select('*').order('created_at', { ascending: false }),
      supabase.from('registrations').select('*').order('created_at', { ascending: false }),
      supabase.from('class_sessions').select('*').order('session_date', { ascending: true }),
    ]);
    if (classRes.data) setClasses(classRes.data);
    if (regRes.data) setRegistrations(regRes.data);
    if (sessRes.data) {
      const map: Record<string, ClassSession[]> = {};
      for (const s of sessRes.data) {
        if (!map[s.dance_class_id]) map[s.dance_class_id] = [];
        map[s.dance_class_id].push(s);
      }
      setSessionsMap(map);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = `${base}/admin/login/`;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const stats = {
    totalClasses: classes.length,
    openClasses: classes.filter((c) => getClassState(sessionsMap[c.id] || [], c.registration_opens_at, c.registration_closes_at) === 'open').length,
    totalRegistrations: registrations.length,
    pending: registrations.filter((r) => r.status === 'pending').length,
    confirmed: registrations.filter((r) => r.status === 'confirmed').length,
    waitlisted: registrations.filter((r) => r.status === 'waitlisted').length,
  };

  return (
    <div className="min-h-screen">
      {/* Admin Header */}
      <header className="bg-primary text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">💃</span>
            <span className="font-bold">Admin Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/70">{user?.email}</span>
            <button onClick={handleLogout} className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1 rounded transition-colors">
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="bg-surface border-b">
        <div className="max-w-6xl mx-auto px-4 flex gap-1">
          {(['overview', 'classes', 'registrations'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text'
              }`}
            >
              {t === 'overview' ? 'Overview' : t === 'classes' ? 'Classes' : 'Registrations'}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {tab === 'overview' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Classes" value={stats.totalClasses} />
            <StatCard label="Open for Registration" value={stats.openClasses} />
            <StatCard label="Total Registrations" value={stats.totalRegistrations} />
            <StatCard label="Pending" value={stats.pending} color="warning" />
            <StatCard label="Confirmed" value={stats.confirmed} color="success" />
            <StatCard label="Waitlisted" value={stats.waitlisted} color="text-muted" />
          </div>
        )}

        {tab === 'classes' && (
          <ClassEditor classes={classes} onUpdate={loadData} />
        )}

        {tab === 'registrations' && (
          <RegistrationTable
            registrations={registrations}
            classes={classes}
            onUpdate={loadData}
          />
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  const colorClass = color === 'success' ? 'text-success' : color === 'warning' ? 'text-warning' : color === 'text-muted' ? 'text-text-muted' : 'text-primary';
  return (
    <div className="bg-surface rounded-xl shadow-sm border border-gray-100 p-5">
      <div className="text-sm text-text-muted mb-1">{label}</div>
      <div className={`text-3xl font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}
