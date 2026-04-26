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
        <div className="w-10 h-10 border-4 border-coral/20 border-t-coral rounded-full animate-spin" />
      </div>
    );
  }

  const openClassIds = new Set(
    classes
      .filter((c) => getClassState(sessionsMap[c.id] || [], c.registration_opens_at, c.registration_closes_at) === 'open')
      .map((c) => c.id),
  );

  const stats = {
    totalClasses: classes.length,
    openClasses: openClassIds.size,
    openRegistrations: registrations.filter((r) => openClassIds.has(r.dance_class_id) && r.status !== 'cancelled').length,
    totalRegistrations: registrations.length,
    pending: registrations.filter((r) => r.status === 'pending').length,
    confirmed: registrations.filter((r) => r.status === 'confirmed').length,
    waitlisted: registrations.filter((r) => r.status === 'waitlisted').length,
    cancelled: registrations.filter((r) => r.status === 'cancelled').length,
  };

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: '✦' },
    { key: 'classes', label: 'Classes', icon: '✦' },
    { key: 'registrations', label: 'Registrations', icon: '✦' },
  ];

  return (
    <div className="min-h-screen">
      {/* Admin Header — modern, soft, matches frontend */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-bg/80 border-b border-primary/5">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="relative">
              <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-coral/30 to-accent/30 blur-md opacity-70"></span>
              <img src={`${base}/shagadeus_logo.png`} alt="" className="relative h-9 w-auto rounded-xl shadow-soft" />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="font-display text-lg font-bold text-primary tracking-tight">Admin</span>
              <span className="eyebrow text-coral/80 text-[0.6rem]">Shagadeus Studio</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-text-muted tabular-nums">{user?.email}</span>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary/80 hover:text-primary border border-primary/15 hover:border-primary/30 px-3 py-1.5 rounded-full transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              Logout
            </button>
          </div>
        </div>

        {/* Pill Tabs */}
        <nav className="max-w-6xl mx-auto px-5 sm:px-6 pb-3.5">
          <div className="inline-flex items-center gap-1 p-1 bg-white/60 backdrop-blur rounded-full border border-primary/10 shadow-soft">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 text-sm font-semibold rounded-full transition-all ${
                  tab === t.key
                    ? 'bg-gradient-to-br from-coral to-coral-dark text-white shadow-[0_4px_14px_-4px_rgba(231,111,81,0.5)]'
                    : 'text-primary/70 hover:text-primary hover:bg-primary/5'
                }`}
              >
                {t.label}
                {t.key === 'registrations' && stats.pending > 0 && (
                  <span className={`ml-2 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-[10px] font-bold rounded-full ${tab === t.key ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700'}`}>
                    {stats.pending}
                  </span>
                )}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8">
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
  stats: {
    totalClasses: number;
    openClasses: number;
    openRegistrations: number;
    totalRegistrations: number;
    pending: number;
    confirmed: number;
    waitlisted: number;
    cancelled: number;
  };
  onNavigate: (tab: Tab) => void;
}) {
  const openClasses = classes
    .filter((c) => getClassState(sessionsMap[c.id] || [], c.registration_opens_at, c.registration_closes_at) === 'open')
    .map((c) => {
      const regs = registrations.filter((r) => r.dance_class_id === c.id && ['pending', 'confirmed'].includes(r.status));
      const leads = regs.filter((r) => r.role === 'lead').length;
      const follows = regs.filter((r) => r.role === 'follow').length;
      return { ...c, leads, follows };
    });

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

  const recentRegs = registrations.slice(0, 8).map((r) => ({
    ...r,
    className: classes.find((c) => c.id === r.dance_class_id)?.title_de || '—',
  }));

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Hero greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="eyebrow text-coral mb-1">Dashboard</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-primary">
            Welcome <span className="text-gradient-warm">back</span>
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {stats.pending > 0
              ? `${stats.pending} registration${stats.pending > 1 ? 's are' : ' is'} waiting for your confirmation.`
              : 'All caught up — no open actions.'}
          </p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Classes" value={stats.totalClasses} icon="📚" tone="primary" onClick={() => onNavigate('classes')} hint="View all" />
        <StatCard label="Open Registrations" value={stats.openRegistrations} icon="🟢" tone="teal" onClick={() => onNavigate('registrations')} hint="Active in open classes" />
        <StatCard label="Registrations" value={stats.totalRegistrations} icon="👥" tone="primary" onClick={() => onNavigate('registrations')} hint="View all" />
        <StatCard
          label="Pending"
          value={stats.pending}
          icon="⏳"
          tone="amber"
          onClick={() => onNavigate('registrations')}
          hint={stats.pending > 0 ? 'Action needed' : 'All clear'}
          pulse={stats.pending > 0}
        />
      </div>

      {/* Registration status distribution */}
      <div className="bg-surface/80 backdrop-blur rounded-2xl border border-primary/5 shadow-soft p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="eyebrow text-teal mb-0.5">Pipeline</p>
            <h3 className="font-display text-lg font-bold text-primary">Registration Status</h3>
          </div>
          <button onClick={() => onNavigate('registrations')} className="text-xs font-semibold text-coral hover:text-coral-dark transition-colors">
            View all →
          </button>
        </div>
        <div className="flex items-center gap-0.5 h-3 rounded-full overflow-hidden bg-primary/5">
          {stats.confirmed > 0 && (
            <div className="h-full transition-all" style={{ width: `${(stats.confirmed / stats.totalRegistrations) * 100}%`, background: 'var(--color-teal)' }} title={`${stats.confirmed} confirmed`} />
          )}
          {stats.pending > 0 && (
            <div className="h-full transition-all" style={{ width: `${(stats.pending / stats.totalRegistrations) * 100}%`, background: 'var(--color-accent)' }} title={`${stats.pending} pending`} />
          )}
          {stats.waitlisted > 0 && (
            <div className="h-full transition-all bg-slate-400" style={{ width: `${(stats.waitlisted / stats.totalRegistrations) * 100}%` }} title={`${stats.waitlisted} waitlisted`} />
          )}
          {stats.cancelled > 0 && (
            <div className="h-full transition-all" style={{ width: `${(stats.cancelled / stats.totalRegistrations) * 100}%`, background: 'var(--color-coral)' }} title={`${stats.cancelled} cancelled`} />
          )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 text-xs">
          <LegendDot color="var(--color-teal)" label={`${stats.confirmed} Confirmed`} />
          <LegendDot color="var(--color-accent)" label={`${stats.pending} Pending`} />
          <LegendDot color="rgb(148 163 184)" label={`${stats.waitlisted} Waitlisted`} />
          <LegendDot color="var(--color-coral)" label={`${stats.cancelled} Cancelled`} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Open Classes */}
        <div className="bg-surface/80 backdrop-blur rounded-2xl border border-primary/5 shadow-soft overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-primary/5">
            <div>
              <p className="eyebrow text-teal mb-0.5">Capacity</p>
              <h3 className="font-display text-lg font-bold text-primary">Open Classes</h3>
            </div>
            <button onClick={() => onNavigate('classes')} className="text-xs font-semibold text-coral hover:text-coral-dark transition-colors">
              Manage →
            </button>
          </div>
          {openClasses.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-8">No classes currently open for registration.</p>
          ) : (
            <div className="divide-y divide-primary/5">
              {openClasses.map((c) => {
                const leadPct = c.max_leads > 0 ? Math.min((c.leads / c.max_leads) * 100, 100) : 0;
                const followPct = c.max_follows > 0 ? Math.min((c.follows / c.max_follows) * 100, 100) : 0;
                const leadBg = leadPct >= 100 ? 'bg-coral' : leadPct >= 75 ? 'bg-accent' : 'bg-teal';
                const followBg = followPct >= 100 ? 'bg-coral' : followPct >= 75 ? 'bg-accent' : 'bg-teal';
                return (
                  <div key={c.id} className="p-5 hover:bg-bg-warm/40 transition-colors cursor-pointer" onClick={() => onNavigate('classes')}>
                    <div className="font-semibold text-sm mb-2.5">{c.title_de}</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                          <span>Leads</span>
                          <span className="tabular-nums font-semibold text-text">{c.leads}/{c.max_leads}</span>
                        </div>
                        <div className="bg-primary/5 rounded-full h-1.5 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${leadBg}`} style={{ width: `${leadPct}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                          <span>Follows</span>
                          <span className="tabular-nums font-semibold text-text">{c.follows}/{c.max_follows}</span>
                        </div>
                        <div className="bg-primary/5 rounded-full h-1.5 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${followBg}`} style={{ width: `${followPct}%` }} />
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
        <div className="bg-surface/80 backdrop-blur rounded-2xl border border-primary/5 shadow-soft overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-primary/5">
            <div>
              <p className="eyebrow text-teal mb-0.5">Calendar</p>
              <h3 className="font-display text-lg font-bold text-primary">Upcoming Sessions</h3>
            </div>
            <span className="text-xs text-text-muted">14 days</span>
          </div>
          {upcomingSessions.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-8">No sessions in the next 14 days.</p>
          ) : (
            <div className="divide-y divide-primary/5">
              {upcomingSessions.map(({ session, danceClass }) => {
                const date = new Date(session.session_date);
                const isToday = session.session_date === today;
                return (
                  <div key={session.id} className="p-4 hover:bg-bg-warm/40 transition-colors cursor-pointer flex items-center gap-3" onClick={() => onNavigate('classes')}>
                    <div className={`text-center rounded-xl px-3 py-2 min-w-[58px] ${isToday ? 'bg-gradient-to-br from-coral to-coral-dark text-white shadow-[0_6px_18px_-6px_rgba(231,111,81,0.5)]' : 'bg-bg-warm/60 text-primary'}`}>
                      <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">{date.toLocaleDateString('de-AT', { weekday: 'short' })}</div>
                      <div className="text-xl font-bold leading-none font-display">{date.getDate()}</div>
                      <div className="text-[10px] opacity-80">{date.toLocaleDateString('de-AT', { month: 'short' })}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{danceClass.title_de}</div>
                      <div className="text-xs text-text-muted flex items-center gap-1.5 mt-0.5">
                        <span className="tabular-nums">{session.start_time.slice(0, 5)} – {session.end_time.slice(0, 5)}</span>
                        {danceClass.location && <span>· {danceClass.location}</span>}
                      </div>
                    </div>
                    {isToday && <span className="text-[10px] font-bold uppercase tracking-wider bg-coral/10 text-coral px-2 py-0.5 rounded-full">Today</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Registrations */}
      <div className="bg-surface/80 backdrop-blur rounded-2xl border border-primary/5 shadow-soft overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-primary/5">
          <div>
            <p className="eyebrow text-teal mb-0.5">Activity</p>
            <h3 className="font-display text-lg font-bold text-primary">Recent Registrations</h3>
          </div>
          <button onClick={() => onNavigate('registrations')} className="text-xs font-semibold text-coral hover:text-coral-dark transition-colors">
            View all →
          </button>
        </div>
        {recentRegs.length === 0 ? (
          <p className="text-text-muted text-sm text-center py-8">No registrations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-text-muted bg-bg-warm/30">
                  <th className="py-2.5 px-5">Name</th>
                  <th className="py-2.5 px-5">Class</th>
                  <th className="py-2.5 px-5">Role</th>
                  <th className="py-2.5 px-5">Status</th>
                  <th className="py-2.5 px-5">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentRegs.map((r) => (
                  <tr key={r.id} className="border-t border-primary/5 hover:bg-bg-warm/30 transition-colors cursor-pointer" onClick={() => onNavigate('registrations')}>
                    <td className="py-3 px-5 font-semibold">{r.name}</td>
                    <td className="py-3 px-5 text-text-muted truncate max-w-[200px]">{r.className}</td>
                    <td className="py-3 px-5">
                      <RoleChip role={r.role} />
                    </td>
                    <td className="py-3 px-5">
                      <StatusPill status={r.status} size="sm" />
                    </td>
                    <td className="py-3 px-5 text-text-muted text-xs tabular-nums">{new Date(r.created_at).toLocaleDateString('de-AT')}</td>
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

function StatCard({ label, value, icon, tone, onClick, hint, pulse }: {
  label: string;
  value: number;
  icon?: string;
  tone?: 'primary' | 'teal' | 'amber' | 'coral';
  onClick?: () => void;
  hint?: string;
  pulse?: boolean;
}) {
  const tones: Record<string, { value: string; ring: string; glow: string }> = {
    primary: { value: 'text-primary', ring: 'border-primary/10', glow: 'from-primary/5 to-transparent' },
    teal: { value: 'text-teal', ring: 'border-teal/15', glow: 'from-teal/8 to-transparent' },
    amber: { value: 'text-accent-dark', ring: 'border-accent/20', glow: 'from-accent/10 to-transparent' },
    coral: { value: 'text-coral', ring: 'border-coral/15', glow: 'from-coral/8 to-transparent' },
  };
  const t = tones[tone || 'primary'];
  return (
    <button
      onClick={onClick}
      type="button"
      className={`relative text-left bg-surface/80 backdrop-blur rounded-2xl border ${t.ring} shadow-soft p-5 transition-all overflow-hidden ${onClick ? 'cursor-pointer hover:shadow-lift hover:-translate-y-0.5' : ''} ${pulse ? 'ring-2 ring-accent/40' : ''}`}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${t.glow} pointer-events-none`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <span className="eyebrow text-text-muted">{label}</span>
          {icon && <span className="text-xl opacity-80">{icon}</span>}
        </div>
        <div className={`text-4xl font-display font-bold ${t.value} tracking-tight`}>{value}</div>
        {hint && <div className="text-[11px] text-text-muted mt-1">{hint}</div>}
      </div>
    </button>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-text-muted">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      <span className="tabular-nums">{label}</span>
    </span>
  );
}

function RoleChip({ role }: { role: string }) {
  const isLead = role === 'lead';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${isLead ? 'bg-primary/8 text-primary' : 'bg-coral/10 text-coral-dark'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isLead ? 'bg-primary' : 'bg-coral'}`} />
      {isLead ? 'Lead' : 'Follow'}
    </span>
  );
}

function StatusPill({ status, size = 'md' }: { status: string; size?: 'sm' | 'md' }) {
  const styles: Record<string, { bg: string; text: string; icon: string; label: string }> = {
    pending: { bg: 'bg-accent/15', text: 'text-accent-dark', icon: '⏳', label: 'Pending' },
    confirmed: { bg: 'bg-teal/15', text: 'text-teal-dark', icon: '✓', label: 'Confirmed' },
    waitlisted: { bg: 'bg-slate-200/70', text: 'text-slate-600', icon: '⏸', label: 'Waitlist' },
    cancelled: { bg: 'bg-coral/15', text: 'text-coral-dark', icon: '✕', label: 'Cancelled' },
  };
  const s = styles[status] || styles.pending;
  const sz = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1 font-bold uppercase tracking-wider rounded-full ${s.bg} ${s.text} ${sz}`}>
      <span className="text-[0.85em]">{s.icon}</span>
      {s.label}
    </span>
  );
}
