import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { DanceClass, ClassSession, Registration, RegistrationHistory } from '../../lib/database.types';
import { getClassState } from '../../lib/classState';
import { useAdminPermissions } from '../../lib/useAdminPermissions';
import ClassEditor from './ClassEditor';
import RegistrationTable from './RegistrationTable';
import AdminPermissionsManager from './AdminPermissionsManager';

type Tab = 'overview' | 'classes' | 'registrations' | 'permissions';

function getTabFromUrl(): Tab {
  if (typeof window === 'undefined') return 'overview';
  const params = new URLSearchParams(window.location.search);
  const t = params.get('tab');
  if (t === 'classes' || t === 'registrations' || t === 'overview' || t === 'permissions') return t;
  return 'overview';
}

export default function AdminDashboard() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTabState] = useState<Tab>(getTabFromUrl);
  const [classes, setClasses] = useState<DanceClass[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [registrationHistory, setRegistrationHistory] = useState<RegistrationHistory[]>([]);
  const [sessionsMap, setSessionsMap] = useState<Record<string, ClassSession[]>>({});
  const base = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';

  const { isSuperAdmin, allowedClassIds, canAccessClass, loading: permissionsLoading } = useAdminPermissions();

  function setTab(newTab: Tab) {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', newTab);
    window.history.pushState({ tab: newTab }, '', url.toString());
    setTabState(newTab);
  }

  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      setTabState(getTabFromUrl());
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
    const [classRes, regRes, sessRes, historyRes] = await Promise.all([
      supabase.from('dance_classes').select('*').order('created_at', { ascending: false }),
      supabase.from('registrations').select('*').order('created_at', { ascending: false }),
      supabase.from('class_sessions').select('*').order('session_date', { ascending: true }),
      supabase.from('registration_history').select('*').order('created_at', { ascending: false }),
    ]);
    // Filter data based on permissions - RLS already restricts server-side,
    // but we filter client-side as well for defense in depth
    if (classRes.data) {
      const visibleClasses = isSuperAdmin
        ? classRes.data
        : classRes.data.filter(c => allowedClassIds.has(c.id));
      setClasses(visibleClasses);
    }
    if (regRes.data) {
      const visibleRegs = isSuperAdmin
        ? regRes.data
        : regRes.data.filter(r => allowedClassIds.has(r.dance_class_id));
      setRegistrations(visibleRegs);
    }
    if (historyRes.data) {
      const visibleHistory = isSuperAdmin
        ? historyRes.data
        : historyRes.data.filter(h => allowedClassIds.has(h.dance_class_id));
      setRegistrationHistory(visibleHistory);
    }
    if (sessRes.data) {
      const map: Record<string, ClassSession[]> = {};
      for (const s of sessRes.data) {
        // Only include sessions for classes user can access
        if (isSuperAdmin || allowedClassIds.has(s.dance_class_id)) {
          if (!map[s.dance_class_id]) map[s.dance_class_id] = [];
          map[s.dance_class_id].push(s);
        }
      }
      setSessionsMap(map);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = `${base}/admin/login/`;
  }

  if (loading || permissionsLoading) {
    return (
      <div className="min-h-screen animate-pulse">
        {/* Header skeleton */}
        <header className="sticky top-0 z-40 border-b border-primary/5 bg-bg/80 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-5 sm:px-6 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-gray-200" />
              <div className="h-5 w-16 rounded-lg bg-gray-200" />
            </div>
            <div className="h-7 w-20 rounded-full bg-gray-200" />
          </div>
          <nav className="max-w-6xl mx-auto px-5 sm:px-6 pb-3.5">
            <div className="inline-flex items-center gap-1 p-1 bg-white/60 rounded-full border border-primary/10">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-8 w-24 rounded-full bg-gray-200" />
              ))}
            </div>
          </nav>
        </header>
        {/* Content skeleton */}
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8 space-y-6">
          {/* Greeting */}
          <div className="h-7 w-48 rounded-lg bg-gray-200" />
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-5 shadow-soft space-y-3">
                <div className="h-3.5 w-20 rounded bg-gray-200" />
                <div className="h-8 w-12 rounded-lg bg-gray-200" />
              </div>
            ))}
          </div>
          {/* Classes list */}
          <div className="bg-white rounded-2xl shadow-soft p-5 space-y-3">
            <div className="h-5 w-32 rounded-lg bg-gray-200" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 py-3 border-t border-gray-100">
                <div className="h-4 flex-1 rounded bg-gray-100" />
                <div className="h-6 w-16 rounded-full bg-gray-200" />
                <div className="h-6 w-16 rounded-full bg-gray-200" />
              </div>
            ))}
          </div>
          {/* Recent registrations */}
          <div className="bg-white rounded-2xl shadow-soft p-5 space-y-3">
            <div className="h-5 w-44 rounded-lg bg-gray-200" />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 py-2.5 border-t border-gray-100">
                <div className="h-4 w-32 rounded bg-gray-100" />
                <div className="h-4 flex-1 rounded bg-gray-100" />
                <div className="h-5 w-20 rounded-full bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
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
    ...(isSuperAdmin ? [{ key: 'permissions' as Tab, label: 'Admin Permissions', icon: '✦' }] : []),
  ];

  return (
    <div className="min-h-screen">
      {/* Admin Header - modern, soft, matches frontend */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-bg/80 border-b border-primary/5">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="relative">
              <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-coral/30 to-accent/30 blur-md opacity-70"></span>
              <img src={`${base}/shagadeus_logo.png`} alt="" className="relative h-9 w-auto rounded-xl shadow-soft" />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="font-display text-lg font-bold text-primary tracking-tight">Admin</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs text-text-muted tabular-nums">{user?.email}</span>
              {!permissionsLoading && (
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${isSuperAdmin ? 'text-coral' : 'text-amber-600'}`}>
                  {isSuperAdmin ? 'Super Admin' : 'Limited Admin'}
                </span>
              )}
            </div>
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
          <ClassEditor classes={classes} registrations={registrations} history={registrationHistory} currentUser={user} onUpdate={loadData} isSuperAdmin={isSuperAdmin} />
        )}

        {tab === 'registrations' && (
          <RegistrationTable
            registrations={registrations}
            history={registrationHistory}
            classes={classes}
            sessionsMap={sessionsMap}
            currentUser={user}
            onUpdate={loadData}
          />
        )}

        {tab === 'permissions' && isSuperAdmin && (
          <AdminPermissionsManager classes={classes} />
        )}
      </div>
    </div>
  );
}

function OverviewTab({
  classes,
  registrations,
  sessionsMap,
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
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const in14Days = new Date(now);
  in14Days.setDate(in14Days.getDate() + 14);
  const cutoff = in14Days.toISOString().split('T')[0];

  // Archived vs Active classes
  const archivedClassIds = useMemo(() => {
    return new Set(
      classes
        .filter((c) => {
          const sessions = sessionsMap[c.id] || [];
          const hasFutureSessions = sessions.some((s) => s.session_date >= today);
          return !hasFutureSessions && sessions.length > 0;
        })
        .map((c) => c.id)
    );
  }, [classes, sessionsMap, today]);

  // Active classes with registration data (excluding preview mode)
  const activeClasses = classes.filter(c => !archivedClassIds.has(c.id) && !c.is_preview);
  const openClasses = activeClasses
    .filter((c) => getClassState(sessionsMap[c.id] || [], c.registration_opens_at, c.registration_closes_at) === 'open')
    .map((c) => {
      const regs = registrations.filter((r) => r.dance_class_id === c.id && ['pending', 'confirmed'].includes(r.status));
      const leads = regs.filter((r) => r.role === 'lead').length;
      const follows = regs.filter((r) => r.role === 'follow').length;
      return { ...c, leads, follows };
    });

  // Upcoming sessions (exclude archived and preview)
  const upcomingSessions: { session: ClassSession; danceClass: DanceClass }[] = [];
  for (const c of classes.filter(cx => !archivedClassIds.has(cx.id) && !cx.is_preview)) {
    for (const s of sessionsMap[c.id] || []) {
      if (s.session_date >= today && s.session_date <= cutoff) {
        upcomingSessions.push({ session: s, danceClass: c });
      }
    }
  }
  upcomingSessions.sort((a, b) => a.session.session_date.localeCompare(b.session.session_date) || a.session.start_time.localeCompare(b.session.start_time));

  // Stats for active registrations only (exclude preview classes)
  const activeRegs = registrations.filter(r => {
    const cls = classes.find(c => c.id === r.dance_class_id);
    if (!cls) return false;
    return !archivedClassIds.has(cls.id) && !cls.is_preview;
  });
  const activeStats = {
    total: activeRegs.length,
    pending: activeRegs.filter(r => r.status === 'pending').length,
    confirmed: activeRegs.filter(r => r.status === 'confirmed').length,
    waitlisted: activeRegs.filter(r => r.status === 'waitlisted').length,
    cancelled: activeRegs.filter(r => r.status === 'cancelled').length,
  };

  // Recent registrations (active only)
  const recentRegs = activeRegs
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
    .map((r) => ({
      ...r,
      className: classes.find((c) => c.id === r.dance_class_id)?.title_de || '-',
    }));

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Welcome Message */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-primary">Welcome back!</h2>
          <p className="text-sm text-text-muted mt-0.5">
            {activeStats.pending > 0
              ? `${activeStats.pending} pending ${activeStats.pending === 1 ? 'registration' : 'registrations'} need attention.`
              : 'All registrations are up to date.'}
          </p>
        </div>
        <button
          onClick={() => onNavigate('classes')}
          className="text-xs font-semibold bg-gradient-to-br from-coral to-coral-dark hover:brightness-105 text-white px-4 py-2 rounded-full shadow-[0_4px_14px_-4px_rgba(231,111,81,0.5)] transition-all"
        >
          Manage Classes
        </button>
      </div>

      {/* Registration Summary */}
      <div className="bg-white rounded-xl border border-primary/10 p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="text-xs text-text-muted uppercase tracking-wider font-medium mb-1">Registrations</div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-display font-bold text-primary">{activeStats.total}</span>
              <span className="text-sm text-text-muted">active total</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {activeStats.pending > 0 && (
              <button onClick={() => onNavigate('registrations')} className="text-center px-4 py-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
                <div className="text-xl font-display font-bold">{activeStats.pending}</div>
                <div className="text-[10px] font-medium">Pending</div>
              </button>
            )}
            <button onClick={() => onNavigate('registrations')} className="text-center px-4 py-2 rounded-xl bg-teal/10 text-teal-dark hover:bg-teal/20 transition-colors">
              <div className="text-xl font-display font-bold">{activeStats.confirmed}</div>
              <div className="text-[10px] font-medium">Confirmed</div>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left Column: Open Classes */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-primary">Classes Open for Registration</h3>
            {openClasses.length === 0 && (
              <span className="text-xs text-text-muted">No open classes</span>
            )}
          </div>

          {openClasses.length === 0 ? (
            <div className="bg-bg-warm/50 rounded-xl p-8 text-center">
              <p className="text-sm text-text-muted">No classes are currently open for registration.</p>
              <button onClick={() => onNavigate('classes')} className="text-xs font-medium text-coral hover:text-coral-dark mt-2">
                Open a class →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {openClasses.map((c) => (
                <ClassCard key={c.id} c={c} onClick={() => onNavigate('classes')} />
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Activity */}
        <div className="space-y-4">
          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-primary/10 shadow-soft p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-bold text-primary">Recent</h3>
              <button onClick={() => onNavigate('registrations')} className="text-xs text-coral hover:text-coral-dark">View all</button>
            </div>
            {recentRegs.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">No recent registrations.</p>
            ) : (
              <div className="space-y-2">
                {recentRegs.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-warm/50 transition-colors cursor-pointer" onClick={() => onNavigate('registrations')}>
                    <div className={`w-2 h-2 rounded-full ${r.status === 'pending' ? 'bg-amber-400' : r.status === 'confirmed' ? 'bg-teal' : 'bg-slate-300'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-primary truncate">{r.name}</div>
                      <div className="text-xs text-text-muted truncate">{r.className}</div>
                    </div>
                    <RoleChip role={r.role} />
                    <div className="text-[10px] text-text-muted/70 tabular-nums">{new Date(r.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Sessions */}
          <div className="bg-white rounded-xl border border-primary/10 shadow-soft p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-bold text-primary">Next Sessions</h3>
              <span className="text-xs text-text-muted">14 days</span>
            </div>
            {upcomingSessions.length === 0 ? (
              <p className="text-sm text-text-muted text-center py-4">No upcoming sessions.</p>
            ) : (
              <div className="space-y-2">
                {upcomingSessions.slice(0, 5).map(({ session, danceClass }) => {
                  const date = new Date(session.session_date);
                  const isToday = session.session_date === today;
                  return (
                    <div key={session.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-warm/50 transition-colors">
                      <div className={`text-center min-w-[44px] py-1.5 rounded-lg ${isToday ? 'bg-coral text-white' : 'bg-bg-warm text-primary'}`}>
                        <div className="text-[9px] font-bold uppercase">{date.toLocaleDateString('de-DE', { weekday: 'short' })}</div>
                        <div className="text-lg font-bold leading-none">{date.getDate()}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-primary truncate">{danceClass.title_de}</div>
                        <div className="text-[10px] text-text-muted">{session.start_time.slice(0, 5)} – {session.end_time.slice(0, 5)}</div>
                      </div>
                      {isToday && <span className="text-[10px] font-medium text-coral bg-coral/10 px-2 py-0.5 rounded-full">Today</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
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


function ClassCard({ c, onClick }: { c: DanceClass & { leads: number; follows: number }; onClick: () => void }) {
  const leadPct = c.max_leads > 0 ? Math.min((c.leads / c.max_leads) * 100, 100) : 0;
  const followPct = c.max_follows > 0 ? Math.min((c.follows / c.max_follows) * 100, 100) : 0;
  const leadFull = leadPct >= 100;
  const followFull = followPct >= 100;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-primary/10 p-4 hover:shadow-soft hover:border-primary/20 transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="font-semibold text-primary">{c.title_de}</h4>
          <p className="text-xs text-text-muted mt-0.5">{(c as any).max_leads || 0} leads · {(c as any).max_follows || 0} follows capacity</p>
        </div>
        <span className="text-xs font-medium text-coral py-1 px-2.5 bg-coral/5 rounded-full">Manage</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <div>
          <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
            <span>Leads</span>
            <span className={`tabular-nums font-medium ${leadFull ? 'text-coral' : ''}`}>{c.leads}/{c.max_leads}</span>
          </div>
          <div className="bg-bg-warm rounded-full h-1.5 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${leadFull ? 'bg-coral' : 'bg-primary'}`} style={{ width: `${leadPct}%` }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-[11px] text-text-muted mb-1">
            <span>Follows</span>
            <span className={`tabular-nums font-medium ${followFull ? 'text-coral' : ''}`}>{c.follows}/{c.max_follows}</span>
          </div>
          <div className="bg-bg-warm rounded-full h-1.5 overflow-hidden">
            <div className={`h-full rounded-full transition-all ${followFull ? 'bg-coral' : 'bg-coral dark'}`} style={{ width: `${followPct}%` }} />
          </div>
        </div>
      </div>
    </div>
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
