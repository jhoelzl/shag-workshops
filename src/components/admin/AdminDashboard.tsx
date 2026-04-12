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
    cancelled: registrations.filter((r) => r.status === 'cancelled').length,
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
          <OverviewTab
            classes={classes}
            registrations={registrations}
            sessionsMap={sessionsMap}
            stats={stats}
            onNavigate={setTab}
          />
        )}

        {tab === 'classes' && (
          <ClassEditor classes={classes} registrations={registrations} onUpdate={loadData} />
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

function OverviewTab({
  classes,
  registrations,
  sessionsMap,
  stats,
  onNavigate,
}: {
  classes: DanceClass[];
  registrations: Registration[];
  sessionsMap: Record<string, ClassSession[]>;
  stats: { totalClasses: number; openClasses: number; totalRegistrations: number; pending: number; confirmed: number; waitlisted: number; cancelled: number };
  onNavigate: (tab: Tab) => void;
}) {
  // Open classes with capacity info
  const openClasses = classes
    .filter((c) => getClassState(sessionsMap[c.id] || [], c.registration_opens_at, c.registration_closes_at) === 'open')
    .map((c) => {
      const regs = registrations.filter((r) => r.dance_class_id === c.id && ['pending', 'confirmed'].includes(r.status));
      const leads = regs.filter((r) => r.role === 'lead').length;
      const follows = regs.filter((r) => r.role === 'follow').length;
      return { ...c, leads, follows };
    });

  // Upcoming sessions (next 14 days)
  const now = new Date();
  const in14Days = new Date(now);
  in14Days.setDate(in14Days.getDate() + 14);
  const today = now.toISOString().split('T')[0];
  const cutoff = in14Days.toISOString().split('T')[0];

  const upcomingSessions: { session: ClassSession; danceClass: DanceClass }[] = [];
  for (const c of classes) {
    for (const s of sessionsMap[c.id] || []) {
      if (s.session_date >= today && s.session_date <= cutoff) {
        upcomingSessions.push({ session: s, danceClass: c });
      }
    }
  }
  upcomingSessions.sort((a, b) => a.session.session_date.localeCompare(b.session.session_date) || a.session.start_time.localeCompare(b.session.start_time));

  // Recent registrations (last 10)
  const recentRegs = registrations.slice(0, 8).map((r) => ({
    ...r,
    className: classes.find((c) => c.id === r.dance_class_id)?.title_de || '—',
  }));

  // Pending actions count
  const pendingActions = stats.pending;

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-green-100 text-green-700',
    waitlisted: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-600',
  };

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Classes" value={stats.totalClasses} icon="📚" onClick={() => onNavigate('classes')} hint="View all" />
        <StatCard label="Open for Registration" value={stats.openClasses} icon="🟢" color="success" onClick={() => onNavigate('classes')} hint="View open" />
        <StatCard label="Total Registrations" value={stats.totalRegistrations} icon="👥" onClick={() => onNavigate('registrations')} hint="View all" />
        <StatCard
          label="Pending"
          value={stats.pending}
          icon="⏳"
          color="warning"
          onClick={() => onNavigate('registrations')}
          hint={stats.pending > 0 ? 'Action needed!' : 'All clear'}
          pulse={stats.pending > 0}
        />
      </div>

      {/* Registration summary bar */}
      <div className="bg-surface rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Registration Status</h3>
          <button onClick={() => onNavigate('registrations')} className="text-xs text-primary hover:text-primary-light font-medium transition-colors">
            View all →
          </button>
        </div>
        <div className="flex items-center gap-1 h-4 rounded-full overflow-hidden bg-gray-100">
          {stats.confirmed > 0 && (
            <div className="bg-green-500 h-full transition-all" style={{ width: `${(stats.confirmed / stats.totalRegistrations) * 100}%` }} title={`${stats.confirmed} confirmed`} />
          )}
          {stats.pending > 0 && (
            <div className="bg-amber-400 h-full transition-all" style={{ width: `${(stats.pending / stats.totalRegistrations) * 100}%` }} title={`${stats.pending} pending`} />
          )}
          {stats.waitlisted > 0 && (
            <div className="bg-gray-400 h-full transition-all" style={{ width: `${(stats.waitlisted / stats.totalRegistrations) * 100}%` }} title={`${stats.waitlisted} waitlisted`} />
          )}
          {stats.cancelled > 0 && (
            <div className="bg-red-400 h-full transition-all" style={{ width: `${(stats.cancelled / stats.totalRegistrations) * 100}%` }} title={`${stats.cancelled} cancelled`} />
          )}
        </div>
        <div className="flex gap-4 mt-2 text-xs text-text-muted">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> {stats.confirmed} Confirmed</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> {stats.pending} Pending</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" /> {stats.waitlisted} Waitlisted</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" /> {stats.cancelled} Cancelled</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Open Classes with Capacity */}
        <div className="bg-surface rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="font-semibold text-sm">Open Classes — Capacity</h3>
            <button onClick={() => onNavigate('classes')} className="text-xs text-primary hover:text-primary-light font-medium transition-colors">
              Manage →
            </button>
          </div>
          {openClasses.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-6">No classes currently open for registration.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {openClasses.map((c) => {
                const leadPct = c.max_leads > 0 ? Math.min((c.leads / c.max_leads) * 100, 100) : 0;
                const followPct = c.max_follows > 0 ? Math.min((c.follows / c.max_follows) * 100, 100) : 0;
                const leadColor = leadPct >= 100 ? 'bg-red-500' : leadPct >= 75 ? 'bg-amber-400' : 'bg-teal';
                const followColor = followPct >= 100 ? 'bg-red-500' : followPct >= 75 ? 'bg-amber-400' : 'bg-teal';
                return (
                  <div key={c.id} className="p-4 hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => onNavigate('classes')}>
                    <div className="font-medium text-sm mb-2">{c.title_de}</div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                          <span>Leads</span>
                          <span className="tabular-nums font-medium">{c.leads}/{c.max_leads}</span>
                        </div>
                        <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${leadColor}`} style={{ width: `${leadPct}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                          <span>Follows</span>
                          <span className="tabular-nums font-medium">{c.follows}/{c.max_follows}</span>
                        </div>
                        <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${followColor}`} style={{ width: `${followPct}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming Sessions */}
        <div className="bg-surface rounded-xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="font-semibold text-sm">Upcoming Sessions (14 days)</h3>
          </div>
          {upcomingSessions.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-6">No sessions in the next 14 days.</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {upcomingSessions.map(({ session, danceClass }) => {
                const date = new Date(session.session_date);
                const isToday = session.session_date === today;
                return (
                  <div key={session.id} className="p-4 hover:bg-gray-50/50 transition-colors cursor-pointer flex items-center gap-3" onClick={() => onNavigate('classes')}>
                    <div className={`text-center rounded-lg px-2.5 py-1.5 min-w-[52px] ${isToday ? 'bg-primary text-white' : 'bg-gray-100 text-text-muted'}`}>
                      <div className="text-[10px] font-bold uppercase">{date.toLocaleDateString('de-AT', { weekday: 'short' })}</div>
                      <div className="text-lg font-bold leading-none">{date.getDate()}</div>
                      <div className="text-[10px]">{date.toLocaleDateString('de-AT', { month: 'short' })}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{danceClass.title_de}</div>
                      <div className="text-xs text-text-muted flex items-center gap-2">
                        <span>{session.start_time.slice(0, 5)} – {session.end_time.slice(0, 5)}</span>
                        {danceClass.location && <span>· {danceClass.location}</span>}
                      </div>
                    </div>
                    {isToday && <span className="text-[10px] font-bold uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full">Today</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Registrations */}
      <div className="bg-surface rounded-xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <h3 className="font-semibold text-sm">Recent Registrations</h3>
          <button onClick={() => onNavigate('registrations')} className="text-xs text-primary hover:text-primary-light font-medium transition-colors">
            View all →
          </button>
        </div>
        {recentRegs.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-6">No registrations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-muted border-b border-gray-100">
                  <th className="py-2 px-4 font-medium">Name</th>
                  <th className="py-2 px-4 font-medium">Class</th>
                  <th className="py-2 px-4 font-medium">Role</th>
                  <th className="py-2 px-4 font-medium">Status</th>
                  <th className="py-2 px-4 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentRegs.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => onNavigate('registrations')}>
                    <td className="py-2.5 px-4 font-medium">{r.name}</td>
                    <td className="py-2.5 px-4 text-text-muted truncate max-w-[200px]">{r.className}</td>
                    <td className="py-2.5 px-4">
                      <span className={`text-xs font-semibold ${r.role === 'lead' ? 'text-primary' : 'text-accent-dark'}`}>
                        {r.role === 'lead' ? 'Lead' : 'Follow'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusColors[r.status]}`}>{r.status}</span>
                    </td>
                    <td className="py-2.5 px-4 text-text-muted text-xs tabular-nums">{new Date(r.created_at).toLocaleDateString('de-AT')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon, color, onClick, hint, pulse }: {
  label: string;
  value: number;
  icon?: string;
  color?: string;
  onClick?: () => void;
  hint?: string;
  pulse?: boolean;
}) {
  const colorClass = color === 'success' ? 'text-green-600' : color === 'warning' ? 'text-amber-600' : 'text-primary';
  return (
    <div
      onClick={onClick}
      className={`bg-surface rounded-xl shadow-sm border border-gray-100 p-5 transition-all ${onClick ? 'cursor-pointer hover:shadow-md hover:border-primary/20 active:scale-[0.98]' : ''} ${pulse ? 'ring-2 ring-amber-300/50' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-text-muted">{label}</span>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <div className={`text-3xl font-bold ${colorClass}`}>{value}</div>
      {hint && <div className="text-[11px] text-text-muted mt-1">{hint}</div>}
    </div>
  );
}
