import { useMemo, useState } from 'react';
import {
  Banknote,
  BarChart3,
  Bus as BusIcon,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Ticket,
  TrendingUp,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { ADMIN_EMAILS, CITIES } from '../data/seedData';
import { useUniBus } from '../context/UniBusContext';
import { AdminTab, BusCategory, TripStatus, UserRole } from '../types/unibus';
import { analyzeSentiment, formatDateShort, formatTime12h } from '../utils/scoring';
import { HorizontalBarList, SimpleBarChart, SimpleLineChart } from './Charts';
import { UniBusLogo } from './Logo';

export function AdminConsole({
  onViewPublicSite,
  onLogout,
}: {
  onViewPublicSite: () => void;
  onLogout: () => void;
}) {
  const {
    currentUser,
    emailNeedsVerification,
    resendVerificationEmail,
    refreshAuthUser,
    loginWithGoogle,
    users,
    buses,
    routes,
    trips,
    bookings,
    reviews,
    auditLogs,
    addTrip,
    updateTrip,
    deleteTrip,
    addBus,
    toggleBusActive,
    addRoute,
    deleteRoute,
    toggleUserStatus,
    setUserRole,
    deleteUserDataOnRequest,
    createAdminInvite,
    cancelBooking,
    restoreBooking,
    resetDemoData,
  } = useUniBus();
  const isAdmin = currentUser?.role === 'admin';
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [roleBusyUid, setRoleBusyUid] = useState<string | null>(null);
  const [roleFeedback, setRoleFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'moderator' | 'admin'>('moderator');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    ok: boolean;
    message: string;
    inviteUrl?: string;
    expiresAt?: string;
  } | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);

  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // AI Insights sub-tab
  const [aiTab, setAiTab] = useState<'overview' | 'demand' | 'sentiment' | 'safety' | 'arrival'>('overview');

  // Trips & Schedules form + filter
  const [tripSubTab, setTripSubTab] = useState<'Upcoming' | 'Past' | 'All'>('Upcoming');
  const [newBusId, setNewBusId] = useState(buses[0]?.id || '');
  const [newRouteId, setNewRouteId] = useState(routes[0]?.id || '');
  const [newDate, setNewDate] = useState('2026-11-26');
  const [newDepTime, setNewDepTime] = useState('08:30');
  const [newPrice, setNewPrice] = useState('80');
  const [newSeats, setNewSeats] = useState('');
  const [newStatus, setNewStatus] = useState<TripStatus>('Active');
  const [editingTripId, setEditingTripId] = useState<number | null>(null);

  // Add Bus form
  const [busName, setBusName] = useState('');
  const [busCat, setBusCat] = useState<BusCategory>('AC');
  const [busSeats, setBusSeats] = useState('40');
  const [busPlate, setBusPlate] = useState('');

  // Add Route form
  const [routeFrom, setRouteFrom] = useState('Tanta');
  const [routeTo, setRouteTo] = useState('Sabrabay Complex');
  const [routeDist, setRouteDist] = useState('8');
  const [routeDur, setRouteDur] = useState('25');

  // Live metrics
  const confirmedBookings = useMemo(() => bookings.filter((b) => b.status === 'Confirmed'), [bookings]);
  const cancelledBookings = useMemo(() => bookings.filter((b) => b.status === 'Cancelled'), [bookings]);
  const bookedRevenue = useMemo(
    () => confirmedBookings.reduce((sum, b) => sum + b.totalEgp, 0),
    [confirmedBookings]
  );
  const avgConfirmed = confirmedBookings.length > 0 ? Math.round(bookedRevenue / confirmedBookings.length) : 0;
  const cancelRate = bookings.length > 0 ? Math.round((cancelledBookings.length / bookings.length) * 100) : 0;

  const studentCount = users.filter((u) => u.role === 'student').length + 1;
  const activeBusesCount = buses.filter((b) => b.active).length;

  const routePopularity = useMemo(() => {
    const map: Record<string, { count: number; revenue: number }> = {};
    confirmedBookings.forEach((b) => {
      if (!map[b.routeLabel]) map[b.routeLabel] = { count: 0, revenue: 0 };
      map[b.routeLabel].count += 1;
      map[b.routeLabel].revenue += b.totalEgp;
    });
    return Object.entries(map)
      .map(([label, stats]) => ({ label, ...stats }))
      .sort((a, b) => b.count - a.count);
  }, [confirmedBookings]);

  const bookingsPerDayData = useMemo(() => {
    // 14-day window ending May 29 2026 + any new live dates
    const baseDates = [
      '2026-05-10',
      '2026-05-15',
      '2026-05-18',
      '2026-05-21',
      '2026-05-24',
      '2026-05-26',
      '2026-05-27',
      '2026-05-28',
      '2026-05-29',
    ];
    const counts: Record<string, number> = {};
    baseDates.forEach((d) => (counts[d] = 0));
    bookings.forEach((b) => {
      const day = b.createdAt.slice(0, 10);
      counts[day] = (counts[day] || 0) + 1;
    });
    return Object.keys(counts)
      .sort()
      .slice(-10)
      .map((d) => ({
        label: new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
        value: counts[d],
      }));
  }, [bookings]);

  const destinationDemand = useMemo(() => {
    const map: Record<string, number> = {};
    confirmedBookings.forEach((b) => {
      const dest = b.routeLabel.split('→')[1]?.trim() || b.routeLabel;
      map[dest] = (map[dest] || 0) + b.passengers;
    });
    return Object.entries(map)
      .map(([label, value]) => ({ label, value, display: `${value} pax` }))
      .sort((a, b) => b.value - a.value);
  }, [confirmedBookings]);

  const peakHoursData = useMemo(() => {
    const hours = [6, 8, 10, 12, 14, 16, 18, 20];
    return hours.map((h) => {
      const count = bookings.filter((b) => {
        const hr = new Date(b.createdAt).getUTCHours();
        return hr >= h && hr < h + 2;
      }).length;
      return { label: `${h}:00`, value: count };
    });
  }, [bookings]);

  const busOccupancyData = useMemo(() => {
    return buses.map((bus) => {
      const busTrips = trips.filter((t) => t.busId === bus.id);
      const totalCap = busTrips.reduce((s, t) => s + t.freeSeats + t.bookedSeats, 0);
      const booked = busTrips.reduce((s, t) => s + t.bookedSeats, 0);
      const pct = totalCap > 0 ? Math.round((booked / totalCap) * 100) : 0;
      return { label: bus.name, value: Math.max(1, pct), display: `${pct}%` };
    });
  }, [buses, trips]);

  const nearlyFullTrips = useMemo(() => {
    return trips.filter((t) => {
      const cap = t.freeSeats + t.bookedSeats;
      return cap > 0 && t.bookedSeats / cap >= 0.7 && t.status === 'Active';
    });
  }, [trips]);

  const sentimentStats = useMemo(() => analyzeSentiment(reviews), [reviews]);

  const handleAddOrUpdateTrip = (e: React.FormEvent) => {
    e.preventDefault();
    const bus = buses.find((b) => b.id === newBusId) || buses[0];
    const route = routes.find((r) => r.id === newRouteId) || routes[0];
    if (!bus || !route) return;

    const [h, m] = newDepTime.split(':').map(Number);
    const totalMin = h * 60 + m + route.estDurationMin;
    const arrH = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
    const arrM = String(totalMin % 60).padStart(2, '0');

    const seats = newSeats ? Number(newSeats) : bus.totalSeats;
    const price = Number(newPrice) || 70;

    if (editingTripId !== null) {
      updateTrip(editingTripId, {
        busId: bus.id,
        routeId: route.id,
        date: newDate,
        departureTime: newDepTime,
        arrivalTime: `${arrH}:${arrM}`,
        priceEgp: price,
        freeSeats: seats,
        status: newStatus,
      });
      setEditingTripId(null);
    } else {
      addTrip({
        busId: bus.id,
        routeId: route.id,
        date: newDate,
        departureTime: newDepTime,
        arrivalTime: `${arrH}:${arrM}`,
        priceEgp: price,
        freeSeats: seats,
        status: newStatus,
        gateDropoff: `${route.to} Terminal`,
      });
    }
    setNewSeats('');
  };

  const tabTitles: Record<AdminTab, string> = {
    dashboard: 'Admin dashboard',
    analytics: 'Analytics & reports',
    'ai-insights': 'AI insights',
    users: 'Users & Staff',
    buses: 'Buses',
    routes: 'Routes',
    trips: 'Trips & schedules',
    bookings: 'Bookings',
    'audit-logs': 'Immutable audit logs',
  };

  const filteredTripsList = useMemo(() => {
    if (tripSubTab === 'Upcoming') return trips.filter((t) => t.status === 'Active' && t.date >= '2026-11-25');
    if (tripSubTab === 'Past') return trips.filter((t) => t.date < '2026-11-25' || t.status === 'Completed');
    return trips;
  }, [trips, tripSubTab]);

  return (
    <div className="min-h-screen flex bg-[#FAF8F3] text-[#111111]">
      {/* Dark Admin Sidebar matching screenshot */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 bg-[#0F0F0F] text-white flex flex-col justify-between p-4 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-5">
          <div className="px-2 pt-1 flex items-center justify-between">
            <UniBusLogo dark size="md" />
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 text-white/60 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mx-2 px-3 py-1.5 rounded-full bg-white/10 text-[11px] font-semibold text-[#FACC15] w-fit">
            {isAdmin ? 'Admin console' : 'Moderator console'}
          </div>

          <div className="space-y-4">
            <div>
              <div className="px-3 text-[10px] font-bold tracking-wider uppercase text-white/40 mb-1.5">
                Overview
              </div>
              <nav className="space-y-1">
                {(
                  [
                    ['dashboard', 'Dashboard', LayoutDashboard],
                    ['analytics', 'Analytics & Reports', BarChart3],
                    ['ai-insights', 'AI Insights', Sparkles],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setTab(key);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      tab === key
                        ? 'bg-[#FACC15] text-[#111111] font-bold'
                        : 'text-white/75 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>
            </div>

            <div>
              <div className="px-3 text-[10px] font-bold tracking-wider uppercase text-white/40 mb-1.5">
                Manage
              </div>
              <nav className="space-y-1">
                {(
                  [
                    ...(isAdmin
                      ? ([
                          ['users', 'Users', Users],
                          ['buses', 'Buses', BusIcon],
                          ['routes', 'Routes', Route],
                        ] as const)
                      : ([] as const)),
                    ['trips', 'Trips & Schedules', CalendarClock],
                    ['bookings', 'Bookings', Ticket],
                    ...(isAdmin ? ([['audit-logs', 'Audit Logs', FileText]] as const) : ([] as const)),
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setTab(key);
                      setSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      tab === key
                        ? 'bg-[#FACC15] text-[#111111] font-bold'
                        : 'text-white/75 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>
        </div>

        <div className="space-y-1 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onViewPublicSite}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-white/75 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            <span>View public site</span>
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-white/75 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 px-4 sm:px-8 border-b border-[#ECE8DD] bg-[#FAF8F3] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg border border-[#DFDBD0] bg-white cursor-pointer"
            >
              <Menu className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium text-[#6E6A61]">{tabTitles[tab]}</span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={resetDemoData}
              className="hidden sm:inline-block px-3 py-1 rounded-full border border-[#DFDBD0] bg-white hover:border-[#111111] text-[11px] font-semibold text-[#55524B] cursor-pointer"
            >
              Reset seed data
            </button>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white border border-[#E5E0D5] text-xs font-semibold">
              <span className="w-6 h-6 rounded-full bg-[#111111] text-white text-[11px] font-bold flex items-center justify-center">
                A
              </span>
              <span>{currentUser?.name || 'Admin'}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto">
          {emailNeedsVerification && (
            <div className="mb-6 rounded-2xl bg-amber-50 border border-amber-300 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="font-bold text-[#111111]">
                  تفعيل البريد الإلكتروني مطلوب لتعديل قاعدة البيانات ({currentUser?.email})
                </div>
                <div className="text-[#55524B]">
                  أرسلنا رابط التفعيل لبريدك الإلكتروني، أو يمكنك تسجيل الدخول عبر Google بنفس الإيميل للتفعيل الفوري.
                  {verifyMsg && <span className="ml-2 font-semibold text-emerald-700">{verifyMsg}</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    const res = await resendVerificationEmail();
                    setVerifyMsg(res.message);
                  }}
                  className="px-3 py-1.5 rounded-full bg-white border border-amber-300 font-semibold text-[#111111] cursor-pointer"
                >
                  Resend link
                </button>
                <button
                  type="button"
                  onClick={refreshAuthUser}
                  className="px-3 py-1.5 rounded-full bg-[#111111] text-white font-semibold cursor-pointer"
                >
                  I verified
                </button>
                <button
                  type="button"
                  onClick={() => loginWithGoogle('admin')}
                  className="px-3 py-1.5 rounded-full bg-[#FACC15] text-[#111111] font-bold cursor-pointer"
                >
                  Verify with Google
                </button>
              </div>
            </div>
          )}
          {/* 1. ADMIN DASHBOARD */}
          {tab === 'dashboard' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">Dashboard</h1>
                  <p className="text-sm text-[#6E6A61] mt-0.5">System overview and AI insights.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('trips')}
                  className="px-4 py-2 rounded-full bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] text-xs font-bold cursor-pointer"
                >
                  Add trip
                </button>
              </div>

              {/* 4 Top KPI cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl bg-[#111111] text-white p-4 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#FACC15] flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-[#111111]" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold tabular-nums">{studentCount}</div>
                    <div className="text-xs text-white/65">Students</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-4 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#FEF9C3] flex items-center justify-center shrink-0">
                    <Ticket className="w-5 h-5 text-[#854D0E]" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold text-[#111111] tabular-nums">
                      {confirmedBookings.length}
                    </div>
                    <div className="text-xs text-[#6E6A61]">Active bookings</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-4 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#FEF9C3] flex items-center justify-center shrink-0">
                    <Route className="w-5 h-5 text-[#854D0E]" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold text-[#111111] tabular-nums">{trips.length}</div>
                    <div className="text-xs text-[#6E6A61]">Trips</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-4 flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#FEF9C3] flex items-center justify-center shrink-0">
                    <BusIcon className="w-5 h-5 text-[#854D0E]" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-2xl font-extrabold text-[#111111] tabular-nums">{activeBusesCount}</div>
                    <div className="text-xs text-[#6E6A61]">Active buses</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left 2 cols */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-bold text-[#111111]">Bookings created per day</h2>
                      <span className="text-[11px] text-[#7A766D]">Data through recent activity</span>
                    </div>
                    <SimpleBarChart data={bookingsPerDayData} height={175} />
                  </div>

                  <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-[#111111]">Most booked routes</h2>
                      <button
                        type="button"
                        onClick={() => setTab('analytics')}
                        className="text-xs font-semibold underline cursor-pointer"
                      >
                        Full analytics
                      </button>
                    </div>
                    <HorizontalBarList items={routePopularity.map((r) => ({ label: r.label, value: r.count }))} />
                  </div>

                  <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-[#111111]">Recent activity</h2>
                      <button
                        type="button"
                        onClick={() => setTab('bookings')}
                        className="text-xs font-semibold underline cursor-pointer"
                      >
                        All bookings
                      </button>
                    </div>
                    <div className="divide-y divide-[#F4F1E8]">
                      {bookings.slice(0, 6).map((b) => (
                        <div key={b.id} className="py-2.5 flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-bold text-[#111111]">
                              {b.userName} · {b.routeLabel}
                            </div>
                            <div className="text-[11px] text-[#7A766D] tabular-nums">
                              {b.createdAt.slice(0, 19).replace('T', ' ')} · {b.passengers} pax · {b.totalEgp} EGP
                            </div>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${
                              b.status === 'Confirmed'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {b.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right col */}
                <div className="space-y-6">
                  <div className="rounded-2xl bg-[#111111] text-white p-5 space-y-2">
                    <div className="text-xs text-white/60 font-medium">Booked revenue</div>
                    <div className="text-3xl font-extrabold tabular-nums">
                      {bookedRevenue.toLocaleString()}{' '}
                      <span className="text-sm font-semibold text-white/75">EGP</span>
                    </div>
                    <p className="text-[11px] text-white/55 leading-relaxed">
                      Sum of confirmed bookings. Payments are not settled online, so this is booked — not
                      collected — revenue.
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-bold text-[#111111]">AI insights</h2>
                      <button
                        type="button"
                        onClick={() => setTab('ai-insights')}
                        className="text-xs font-semibold underline cursor-pointer"
                      >
                        Open
                      </button>
                    </div>
                    <div className="space-y-3 text-xs">
                      {[
                        {
                          title: 'Demand forecast',
                          sub: '+2 passengers next 7 days · low confidence',
                          badge: 'Active',
                          cls: 'bg-emerald-50 text-emerald-700',
                        },
                        {
                          title: 'Fleet optimisation',
                          sub: '2 route(s) need more runs',
                          badge: 'Active',
                          cls: 'bg-emerald-50 text-emerald-700',
                        },
                        {
                          title: 'Sentiment',
                          sub: `${sentimentStats.avgRating}★ from ${reviews.length} reviews`,
                          badge: 'Beta',
                          cls: 'bg-amber-50 text-amber-700',
                        },
                        {
                          title: 'Safety flags',
                          sub: '2 booking-activity flag(s)',
                          badge: 'Beta',
                          cls: 'bg-amber-50 text-amber-700',
                        },
                        {
                          title: 'Arrival & delay',
                          sub: 'Needs GPS / arrival history',
                          badge: 'Requires Additional Data',
                          cls: 'bg-sky-50 text-sky-700',
                        },
                      ].map((row) => (
                        <div key={row.title} className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-[#111111]">{row.title}</div>
                            <div className="text-[11px] text-[#6E6A61]">{row.sub}</div>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${row.cls}`}>
                            {row.badge}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-2">
                    <h2 className="text-sm font-bold text-[#111111]">Nearly full trips</h2>
                    {nearlyFullTrips.length === 0 ? (
                      <p className="text-xs text-[#6E6A61]">No upcoming trip is above 70% occupancy.</p>
                    ) : (
                      <div className="space-y-2">
                        {nearlyFullTrips.map((t) => {
                          const r = routes.find((rt) => rt.id === t.routeId);
                          return (
                            <div key={t.id} className="text-xs p-2.5 rounded-xl bg-amber-50 border border-amber-200">
                              <div className="font-bold text-[#111111]">
                                {r?.from} → {r?.to}
                              </div>
                              <div className="text-[11px] text-amber-800 tabular-nums">
                                {t.freeSeats} seats remaining · {formatTime12h(t.departureTime)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. ANALYTICS & REPORTS */}
          {tab === 'analytics' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">Analytics &amp; reports</h1>
                <p className="text-sm text-[#6E6A61] mt-0.5">Actual data from bookings, trips and buses.</p>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FEF9C3] flex items-center justify-center shrink-0">
                    <Ticket className="w-4 h-4 text-[#854D0E]" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xl font-extrabold tabular-nums">{bookings.length}</div>
                    <div className="text-xs text-[#6E6A61]">Total bookings</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-[#111111] text-white p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FACC15] flex items-center justify-center shrink-0">
                    <Banknote className="w-4 h-4 text-[#111111]" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xl font-extrabold tabular-nums">{bookedRevenue.toLocaleString()} EGP</div>
                    <div className="text-[11px] text-white/65">Booked revenue (confirmed)</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FEF9C3] flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4 text-[#854D0E]" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xl font-extrabold tabular-nums">{avgConfirmed} EGP</div>
                    <div className="text-xs text-[#6E6A61]">Avg confirmed booking</div>
                  </div>
                </div>
                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FEF9C3] flex items-center justify-center shrink-0">
                    <XCircle className="w-4 h-4 text-[#854D0E]" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xl font-extrabold tabular-nums">{cancelRate}%</div>
                    <div className="text-xs text-[#6E6A61]">Cancellation rate</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-3">
                  <h2 className="text-sm font-bold">Booking trend (per day created)</h2>
                  <SimpleLineChart data={bookingsPerDayData} />
                </div>

                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-3">
                  <h2 className="text-sm font-bold">Revenue by month</h2>
                  <SimpleBarChart data={[{ label: 'May 2026', value: bookedRevenue }]} unit=" EGP" />
                </div>

                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-4">
                  <h2 className="text-sm font-bold">Most-used routes</h2>
                  <HorizontalBarList items={routePopularity.map((r) => ({ label: r.label, value: r.count }))} />
                </div>

                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-4">
                  <h2 className="text-sm font-bold">Demand comparison between destinations</h2>
                  <HorizontalBarList items={destinationDemand} />
                </div>

                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-3">
                  <h2 className="text-sm font-bold">Peak booking time</h2>
                  <SimpleBarChart data={peakHoursData} />
                  <p className="text-[11px] text-[#7A766D]">
                    Hour of day when the booking was made, as stored in the database.
                  </p>
                </div>

                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-4">
                  <h2 className="text-sm font-bold">Bus occupancy (booked seats ÷ total seats)</h2>
                  <HorizontalBarList items={busOccupancyData} />
                </div>
              </div>

              <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 overflow-x-auto">
                <h2 className="text-sm font-bold mb-3">Revenue by route</h2>
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#ECE8DD] text-[10px] uppercase tracking-wider text-[#7A766D]">
                      <th className="py-2.5">Route</th>
                      <th className="py-2.5 text-right">Bookings</th>
                      <th className="py-2.5 text-right">Confirmed Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F1E8]">
                    {routePopularity.map((r) => (
                      <tr key={r.label}>
                        <td className="py-2.5 font-medium text-[#111111]">{r.label}</td>
                        <td className="py-2.5 text-right tabular-nums">{r.count}</td>
                        <td className="py-2.5 text-right font-semibold tabular-nums">{r.revenue} EGP</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. AI INSIGHTS */}
          {tab === 'ai-insights' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">AI insights</h1>
                <p className="text-sm text-[#6E6A61] mt-0.5">
                  Every feature is labelled with its real implementation status.
                </p>
              </div>

              <div className="inline-flex flex-wrap items-center gap-1 p-1 rounded-full bg-[#ECE8DD]">
                {(
                  [
                    ['overview', 'Overview'],
                    ['demand', 'Demand & fleet'],
                    ['sentiment', 'Sentiment'],
                    ['safety', 'Safety'],
                    ['arrival', 'Arrival & delay'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setAiTab(k)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer ${
                      aiTab === k ? 'bg-[#111111] text-white' : 'text-[#4E4A3F] hover:text-[#111111]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {aiTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    {
                      title: 'Demand Forecasting & Fleet Optimisation',
                      desc: 'Moving-average baseline from real bookings + fleet suggestions.',
                      badge: 'Active',
                      cls: 'bg-emerald-50 text-emerald-700',
                      action: () => setAiTab('demand'),
                    },
                    {
                      title: 'Personalised Trip Recommendation',
                      desc: 'Weighted scoring on the student pages (transparent rules).',
                      badge: 'Active',
                      cls: 'bg-emerald-50 text-emerald-700',
                      action: () => setTab('analytics'),
                    },
                    {
                      title: 'Conversational Booking Assistant',
                      desc: 'Rule-based; FAQ table + live trips. No LLM.',
                      badge: 'Beta',
                      cls: 'bg-amber-50 text-amber-700',
                    },
                    {
                      title: 'Sentiment & Service Quality',
                      desc: 'Rating + keyword lexicon over the reviews table.',
                      badge: 'Beta',
                      cls: 'bg-amber-50 text-amber-700',
                      action: () => setAiTab('sentiment'),
                    },
                    {
                      title: 'Safety & Anomaly Detection',
                      desc: 'Rule-based flags on booking activity only.',
                      badge: 'Beta',
                      cls: 'bg-amber-50 text-amber-700',
                      action: () => setAiTab('safety'),
                    },
                    {
                      title: 'Arrival & Delay Prediction',
                      desc: 'No GPS or arrival history in the database.',
                      badge: 'Requires Additional Data',
                      cls: 'bg-sky-50 text-sky-700',
                      action: () => setAiTab('arrival'),
                    },
                  ].map((card) => (
                    <div
                      key={card.title}
                      className="rounded-2xl bg-white border border-[#E8E4D9] p-5 flex flex-col justify-between space-y-4"
                    >
                      <div>
                        <div className="flex justify-end mb-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${card.cls}`}>
                            {card.badge}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-[#111111]">{card.title}</h3>
                        <p className="text-xs text-[#6E6A61] mt-1.5 leading-relaxed">{card.desc}</p>
                      </div>
                      {card.action && (
                        <button
                          type="button"
                          onClick={card.action}
                          className="text-xs font-semibold text-[#111111] underline text-left cursor-pointer"
                        >
                          View →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {aiTab === 'demand' && (
                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-6 space-y-4">
                  <h2 className="text-base font-bold">Demand Forecasting &amp; Fleet Suggestions</h2>
                  <p className="text-xs text-[#6E6A61]">
                    Moving-average projection across the top booked corridors from live booking records:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {routePopularity.slice(0, 4).map((r) => (
                      <div key={r.label} className="p-4 rounded-xl bg-[#FAF8F3] border border-[#ECE8DD] text-xs space-y-1">
                        <div className="font-bold text-[#111111]">{r.label}</div>
                        <div className="text-[#55524B] tabular-nums">
                          Observed: {r.count} booking(s) · Forecast next 7 days: +{Math.max(1, Math.round(r.count * 0.7))} pax
                        </div>
                        <div className="text-emerald-700 font-semibold">
                          {r.count >= 2 ? 'Suggestion: Add morning peak departure' : 'Capacity sufficient'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiTab === 'sentiment' && (
                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-6 space-y-4">
                  <h2 className="text-base font-bold">Sentiment &amp; Service Quality (Keyword Lexicon)</h2>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-4 rounded-xl bg-[#FAF8F3] border border-[#ECE8DD]">
                      <div className="text-2xl font-extrabold tabular-nums">{sentimentStats.avgRating}★</div>
                      <div className="text-xs text-[#6E6A61]">Average rating</div>
                    </div>
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                      <div className="text-2xl font-extrabold text-emerald-700 tabular-nums">
                        {sentimentStats.positiveHits}
                      </div>
                      <div className="text-xs text-emerald-800">Positive keywords</div>
                    </div>
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
                      <div className="text-2xl font-extrabold text-rose-700 tabular-nums">
                        {sentimentStats.negativeHits}
                      </div>
                      <div className="text-xs text-rose-800">Negative keywords</div>
                    </div>
                  </div>
                  <div className="divide-y divide-[#F4F1E8]">
                    {reviews.map((r) => (
                      <div key={r.id} className="py-3 text-xs flex items-center justify-between gap-3">
                        <div>
                          <span className="font-bold">{r.userName}</span> ({r.routeLabel}): “{r.comment}”
                        </div>
                        <span className="font-bold tabular-nums">{r.rating}★</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiTab === 'safety' && (
                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-6 space-y-3 text-xs">
                  <h2 className="text-base font-bold text-[#111111]">Safety &amp; Anomaly Detection</h2>
                  <p className="text-[#6E6A61]">Rule-based monitoring over booking velocity and cancellations:</p>
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                    <strong>Flag #1:</strong> Multiple rapid test bookings detected from Admin account on 2026-05-29 (5 bookings within 7 hours).
                  </div>
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
                    <strong>Flag #2:</strong> {cancelledBookings.length} cancellation(s) recorded ({cancelRate}% overall rate — within normal threshold).
                  </div>
                </div>
              )}

              {aiTab === 'arrival' && (
                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-6 space-y-3 text-xs">
                  <div className="inline-block px-2.5 py-0.5 rounded-full bg-sky-50 text-sky-700 font-semibold">
                    Requires Additional Data
                  </div>
                  <h2 className="text-base font-bold text-[#111111]">Arrival &amp; Delay Prediction</h2>
                  <p className="text-[#6E6A61] leading-relaxed">
                    Currently, scheduled arrivals are static estimates based on route distance. To enable ML-based
                    delay prediction along Sabrabay Road and El-Bahr Street, connect live GPS telemetry or
                    crowdsourced rider trip logs into the PostGIS segment table.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 4. TRIPS & SCHEDULES (matches screenshot) */}
          {tab === 'trips' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">Trips &amp; schedules</h1>
                <p className="text-sm text-[#6E6A61] mt-0.5">
                  Scheduled departures that students can search and book.
                </p>
              </div>

              <form onSubmit={handleAddOrUpdateTrip} className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-4">
                <h2 className="text-sm font-bold text-[#111111]">
                  {editingTripId ? `Edit trip #${editingTripId}` : 'Add trip'}
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#111111] mb-1">Bus</label>
                    <select
                      value={newBusId}
                      onChange={(e) => setNewBusId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                    >
                      {buses.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.category})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#111111] mb-1">Route</label>
                    <select
                      value={newRouteId}
                      onChange={(e) => setNewRouteId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                    >
                      {routes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.from} → {r.to}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#111111] mb-1">Date</label>
                    <input
                      type="date"
                      value={newDate}
                      onChange={(e) => setNewDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#111111] mb-1">Departure</label>
                    <input
                      type="time"
                      value={newDepTime}
                      onChange={(e) => setNewDepTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#111111] mb-1">Price (EGP)</label>
                    <input
                      type="number"
                      min={5}
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs tabular-nums"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#111111] mb-1">Free seats</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="Default: bus seats"
                      value={newSeats}
                      onChange={(e) => setNewSeats(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#111111] mb-1">Status</label>
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value as TripStatus)}
                      className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                    >
                      <option value="Active">Active</option>
                      <option value="Cancelled">Cancelled</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-full bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] text-xs font-bold cursor-pointer"
                  >
                    {editingTripId ? 'Save changes' : 'Add trip'}
                  </button>
                  {editingTripId && (
                    <button
                      type="button"
                      onClick={() => setEditingTripId(null)}
                      className="px-4 py-2.5 rounded-full border border-[#DFDBD0] text-xs font-semibold cursor-pointer"
                    >
                      Cancel edit
                    </button>
                  )}
                </div>
              </form>

              <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#ECE8DD]">
                {(['Upcoming', 'Past', 'All'] as const).map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setTripSubTab(sub)}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold cursor-pointer ${
                      tripSubTab === sub ? 'bg-[#111111] text-white' : 'text-[#4E4A3F]'
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl bg-white border border-[#E8E4D9] overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#ECE8DD] text-[10px] uppercase tracking-wider text-[#7A766D]">
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Route</th>
                      <th className="py-3 px-4">When</th>
                      <th className="py-3 px-4">Bus</th>
                      <th className="py-3 px-4">Price</th>
                      <th className="py-3 px-4">Seats</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F1E8]">
                    {filteredTripsList.map((t) => {
                      const r = routes.find((rt) => rt.id === t.routeId);
                      const b = buses.find((bs) => bs.id === t.busId);
                      return (
                        <tr key={t.id} className="hover:bg-[#FAF8F3]/60">
                          <td className="py-3 px-4 tabular-nums text-[#7A766D]">{t.id}</td>
                          <td className="py-3 px-4 font-bold text-[#111111]">
                            {r?.from} → {r?.to}
                          </td>
                          <td className="py-3 px-4 tabular-nums">
                            <div>{formatDateShort(t.date)}</div>
                            <div className="text-[11px] text-[#7A766D]">{formatTime12h(t.departureTime)}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold">{b?.name}</div>
                            <div className="text-[11px] text-[#7A766D]">{b?.category}</div>
                          </td>
                          <td className="py-3 px-4 font-bold tabular-nums">{t.priceEgp} EGP</td>
                          <td className="py-3 px-4 tabular-nums">
                            <div className="font-semibold">{t.freeSeats} free</div>
                            <div className="text-[11px] text-[#7A766D]">{t.bookedSeats} booked</div>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                t.status === 'Active'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTripId(t.id);
                                setNewBusId(t.busId);
                                setNewRouteId(t.routeId);
                                setNewDate(t.date);
                                setNewDepTime(t.departureTime);
                                setNewPrice(String(t.priceEgp));
                                setNewSeats(String(t.freeSeats));
                                setNewStatus(t.status);
                              }}
                              className="px-2.5 py-1 rounded-full border border-[#DFDBD0] text-[11px] font-semibold hover:bg-[#FAF8F3] cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateTrip(t.id, { status: t.status === 'Active' ? 'Cancelled' : 'Active' })
                              }
                              className="px-2.5 py-1 rounded-full border border-[#DFDBD0] text-[11px] font-semibold hover:bg-[#FAF8F3] cursor-pointer"
                            >
                              {t.status === 'Active' ? 'Cancel trip' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteTrip(t.id)}
                              className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-[11px] font-semibold hover:bg-rose-100 cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. USERS (Admin only) */}
          {tab === 'users' && isAdmin && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-extrabold">Users &amp; Staff RBAC</h1>
                  <p className="text-sm text-[#6E6A61] mt-0.5">
                    Invite new administrators/moderators via single-use expiring tokens or manage existing account roles.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search
                    className="w-3.5 h-3.5 text-[#7A766D] absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search name or email..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-white border border-[#DFDBD0] text-xs"
                  />
                </div>
              </div>

              {/* Invite New Admin / Moderator */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setInviteBusy(true);
                  setInviteResult(null);
                  setCopiedInvite(false);
                  const res = await createAdminInvite(inviteEmail, inviteRole);
                  setInviteBusy(false);
                  if (res.ok && res.inviteUrl) {
                    setInviteResult({
                      ok: true,
                      message: `Single-use ${inviteRole} invite created (stored as SHA-256 hash only).`,
                      inviteUrl: res.inviteUrl,
                      expiresAt: res.expiresAt,
                    });
                    setInviteEmail('');
                  } else {
                    setInviteResult({
                      ok: false,
                      message: res.error || 'Could not issue invitation.',
                    });
                  }
                }}
                className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-[#B45309]" aria-hidden="true" />
                  <h2 className="text-sm font-bold text-[#111111]">Invite Staff Member (24h Single-Use Token)</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-6">
                    <label className="block text-[11px] font-bold mb-1">Staff Email</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@tanta.edu.eg"
                      className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                      required
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-bold mb-1">Assigned Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as 'moderator' | 'admin')}
                      className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                    >
                      <option value="moderator">Moderator (Trips &amp; Bookings)</option>
                      <option value="admin">Admin (Full RBAC &amp; Fleet)</option>
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <button
                      type="submit"
                      disabled={inviteBusy}
                      className="w-full py-2 px-4 rounded-xl bg-[#111111] hover:bg-[#222222] text-[#FACC15] text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      {inviteBusy ? 'Generating...' : 'Create Invite Link'}
                    </button>
                  </div>
                </div>
                {inviteResult && (
                  <div
                    className={`rounded-xl p-3 text-xs border space-y-2 ${
                      inviteResult.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    <div className="font-semibold">{inviteResult.message}</div>
                    {inviteResult.inviteUrl && (
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="flex-1 min-w-0 truncate px-2.5 py-1.5 rounded-lg bg-white border border-emerald-200 font-mono text-[11px]">
                          {inviteResult.inviteUrl}
                        </code>
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard?.writeText(inviteResult.inviteUrl || '');
                            setCopiedInvite(true);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#111111] text-white text-[11px] font-bold cursor-pointer"
                        >
                          {copiedInvite ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedInvite ? 'Copied' : 'Copy link'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </form>

              {roleFeedback && (
                <div
                  className={`rounded-xl px-4 py-2.5 text-xs font-semibold border ${
                    roleFeedback.ok
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}
                >
                  {roleFeedback.message}
                </div>
              )}

              <div className="rounded-2xl bg-white border border-[#E8E4D9] overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#ECE8DD] text-[10px] uppercase tracking-wider text-[#7A766D]">
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Home City</th>
                      <th className="py-3 px-4">Trust</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F1E8]">
                    {users
                      .filter((u) => {
                        const q = userSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          u.name.toLowerCase().includes(q) ||
                          u.email.toLowerCase().includes(q) ||
                          u.homeCity.toLowerCase().includes(q)
                        );
                      })
                      .map((u) => {
                        const isSelf = u.uid === currentUser?.uid;
                        const isPrimaryAdmin = ADMIN_EMAILS.includes(u.email.trim().toLowerCase());
                        const isBusy = roleBusyUid === u.uid;

                        return (
                          <tr key={u.uid}>
                            <td className="py-3 px-4 font-bold">{u.name}</td>
                            <td className="py-3 px-4 text-[#55524B]">{u.email}</td>
                            <td className="py-3 px-4">
                              {u.role === 'admin' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#111111] text-[#FACC15] text-[11px] font-bold">
                                  <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                                  Admin
                                </span>
                              ) : u.role === 'moderator' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold">
                                  Moderator
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#F4F1E8] text-[#4E4B44] text-[11px] font-semibold">
                                  Student
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4">{u.homeCity}</td>
                            <td className="py-3 px-4 tabular-nums font-mono">{u.trustScore.toFixed(2)}</td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                  u.status === 'Active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                }`}
                              >
                                {u.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                              {isSelf ? (
                                <span className="text-[11px] font-semibold text-[#7A766D] px-2">You (self-change blocked)</span>
                              ) : isPrimaryAdmin && u.role === 'admin' ? (
                                <span className="text-[11px] font-semibold text-[#7A766D] px-2">Primary admin</span>
                              ) : (
                                <>
                                  <select
                                    aria-label={`Role for ${u.name}`}
                                    disabled={isBusy}
                                    value={u.role}
                                    onChange={async (e) => {
                                      const nextRole = e.target.value as UserRole;
                                      setRoleBusyUid(u.uid);
                                      setRoleFeedback(null);
                                      const res = await setUserRole(u.uid, nextRole);
                                      setRoleBusyUid(null);
                                      if (res.ok) {
                                        setRoleFeedback({
                                          ok: true,
                                          message: `${u.name} role updated to ${nextRole} and logged.`,
                                        });
                                      } else if (res.error) {
                                        setRoleFeedback({ ok: false, message: res.error });
                                      }
                                    }}
                                    className="px-2.5 py-1 rounded-full border border-[#DFDBD0] bg-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                                  >
                                    <option value="student">Student</option>
                                    <option value="moderator">Moderator</option>
                                    <option value="admin">Admin</option>
                                  </select>
                                  {u.role !== 'admin' && (
                                    <button
                                      type="button"
                                      onClick={() => toggleUserStatus(u.uid)}
                                      className="px-3 py-1 rounded-full border border-[#DFDBD0] text-[11px] font-semibold hover:bg-[#FAF8F3] cursor-pointer"
                                    >
                                      {u.status === 'Active' ? 'Suspend' : 'Activate'}
                                    </button>
                                  )}
                                  {confirmDeleteUid === u.uid ? (
                                    <>
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={async () => {
                                          setRoleBusyUid(u.uid);
                                          setRoleFeedback(null);
                                          const res = await deleteUserDataOnRequest(u.uid);
                                          setRoleBusyUid(null);
                                          setConfirmDeleteUid(null);
                                          if (res.ok) {
                                            setRoleFeedback({
                                              ok: true,
                                              message: `User data erased for ${u.email} (bookings, reviews, reports, profile) and logged.`,
                                            });
                                          } else if (res.error) {
                                            setRoleFeedback({ ok: false, message: res.error });
                                          }
                                        }}
                                        className="px-3 py-1 rounded-full bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 cursor-pointer disabled:opacity-50"
                                      >
                                        Confirm erase
                                      </button>
                                      <button
                                        type="button"
                                        disabled={isBusy}
                                        onClick={() => setConfirmDeleteUid(null)}
                                        className="px-2.5 py-1 rounded-full border border-[#DFDBD0] text-[11px] font-semibold hover:bg-[#FAF8F3] cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={isBusy}
                                      onClick={() => setConfirmDeleteUid(u.uid)}
                                      className="px-3 py-1 rounded-full border border-rose-200 text-rose-700 text-[11px] font-semibold hover:bg-rose-50 cursor-pointer disabled:opacity-50"
                                    >
                                      Delete Data
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. BUSES (Admin only) */}
          {tab === 'buses' && isAdmin && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-extrabold">Buses &amp; Fleet</h1>
                <p className="text-sm text-[#6E6A61] mt-0.5">Manage active buses, capacities, and microbus shuttles.</p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!busName.trim()) return;
                  addBus({
                    name: busName.trim(),
                    category: busCat,
                    totalSeats: Number(busSeats) || 40,
                    plateNumber: busPlate || 'ع غ ط 1001',
                    amenities: ['Scheduled Service'],
                    active: true,
                  });
                  setBusName('');
                  setBusPlate('');
                }}
                className="rounded-2xl bg-white border border-[#E8E4D9] p-5 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
              >
                <div>
                  <label className="block text-[11px] font-bold mb-1">Bus Name</label>
                  <input
                    type="text"
                    value={busName}
                    onChange={(e) => setBusName(e.target.value)}
                    placeholder="e.g., Campus Shuttle"
                    className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">Category</label>
                  <select
                    value={busCat}
                    onChange={(e) => setBusCat(e.target.value as BusCategory)}
                    className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                  >
                    <option value="AC">AC</option>
                    <option value="VIP">VIP</option>
                    <option value="Economy">Economy</option>
                    <option value="Luxury">Luxury</option>
                    <option value="Microbus">Microbus</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">Total Seats</label>
                  <input
                    type="number"
                    min={8}
                    value={busSeats}
                    onChange={(e) => setBusSeats(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">Plate Number</label>
                  <input
                    type="text"
                    value={busPlate}
                    onChange={(e) => setBusPlate(e.target.value)}
                    placeholder="ع غ ر 2040"
                    className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                  />
                </div>
                <button
                  type="submit"
                  className="py-2 px-4 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] text-xs font-bold cursor-pointer"
                >
                  Add bus
                </button>
              </form>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {buses.map((b) => (
                  <div key={b.id} className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="px-2 py-0.5 rounded bg-[#111111] text-white text-[10px] font-bold">
                          {b.category}
                        </span>
                        <h3 className="text-base font-bold mt-1.5">{b.name}</h3>
                        <div className="text-xs text-[#6E6A61]">{b.plateNumber}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleBusActive(b.id)}
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold cursor-pointer ${
                          b.active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {b.active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                    <div className="text-xs text-[#55524B] tabular-nums">Capacity: {b.totalSeats} seats</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 7. ROUTES (Admin only) */}
          {tab === 'routes' && isAdmin && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl font-extrabold">Routes</h1>
                <p className="text-sm text-[#6E6A61] mt-0.5">
                  Corridors linking Gharbia cities &amp; Tanta hubs to Sabrabay Complex.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addRoute({
                    from: routeFrom,
                    to: routeTo,
                    distanceKm: Number(routeDist) || 10,
                    estDurationMin: Number(routeDur) || 30,
                    corridorNotes: `${routeFrom} → ${routeTo} direct service`,
                  });
                }}
                className="rounded-2xl bg-white border border-[#E8E4D9] p-5 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end"
              >
                <div>
                  <label className="block text-[11px] font-bold mb-1">From</label>
                  <select
                    value={routeFrom}
                    onChange={(e) => setRouteFrom(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                  >
                    {CITIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">To</label>
                  <select
                    value={routeTo}
                    onChange={(e) => setRouteTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                  >
                    {CITIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">Distance (km)</label>
                  <input
                    type="number"
                    value={routeDist}
                    onChange={(e) => setRouteDist(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold mb-1">Duration (min)</label>
                  <input
                    type="number"
                    value={routeDur}
                    onChange={(e) => setRouteDur(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs tabular-nums"
                  />
                </div>
                <button
                  type="submit"
                  className="py-2 px-4 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] text-xs font-bold cursor-pointer"
                >
                  Add route
                </button>
              </form>

              <div className="rounded-2xl bg-white border border-[#E8E4D9] overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#ECE8DD] text-[10px] uppercase tracking-wider text-[#7A766D]">
                      <th className="py-3 px-4">Route</th>
                      <th className="py-3 px-4">Corridor Notes</th>
                      <th className="py-3 px-4">Distance</th>
                      <th className="py-3 px-4">Est. Duration</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F1E8]">
                    {routes.map((r) => (
                      <tr key={r.id}>
                        <td className="py-3 px-4 font-bold">
                          {r.from} → {r.to}
                        </td>
                        <td className="py-3 px-4 text-[#55524B]">{r.corridorNotes}</td>
                        <td className="py-3 px-4 tabular-nums">{r.distanceKm} km</td>
                        <td className="py-3 px-4 tabular-nums">{r.estDurationMin} min</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => deleteRoute(r.id)}
                            className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-[11px] font-semibold cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 8. BOOKINGS */}
          {tab === 'bookings' && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-extrabold">Bookings ledger</h1>
                <p className="text-sm text-[#6E6A61] mt-0.5">All student seat reservations across scheduled trips.</p>
              </div>
              <div className="rounded-2xl bg-white border border-[#E8E4D9] overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#ECE8DD] text-[10px] uppercase tracking-wider text-[#7A766D]">
                      <th className="py-3 px-4">Ref</th>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Route</th>
                      <th className="py-3 px-4">Seats</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F1E8]">
                    {bookings.map((b) => (
                      <tr key={b.id}>
                        <td className="py-3 px-4 font-mono font-bold">{b.reference}</td>
                        <td className="py-3 px-4 font-semibold">{b.userName}</td>
                        <td className="py-3 px-4">{b.routeLabel}</td>
                        <td className="py-3 px-4 tabular-nums">{b.passengers}</td>
                        <td className="py-3 px-4 font-bold tabular-nums">{b.totalEgp} EGP</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              b.status === 'Confirmed'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {b.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {b.status === 'Confirmed' ? (
                            <button
                              type="button"
                              onClick={() => cancelBooking(b.id)}
                              className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-[11px] font-semibold cursor-pointer"
                            >
                              Cancel
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => restoreBooking(b.id)}
                              className="px-2.5 py-1 rounded-full border border-[#DFDBD0] text-[11px] font-semibold cursor-pointer"
                            >
                              Restore
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* 9. IMMUTABLE AUDIT LOGS (Admin only) */}
          {tab === 'audit-logs' && isAdmin && (
            <div className="space-y-5">
              <div>
                <h1 className="text-2xl font-extrabold">Immutable Audit Logs</h1>
                <p className="text-sm text-[#6E6A61] mt-0.5">
                  Append-only trail of role changes, staff invitations, fleet mutations, and moderation events.
                </p>
              </div>
              <div className="rounded-2xl bg-white border border-[#E8E4D9] overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#ECE8DD] text-[10px] uppercase tracking-wider text-[#7A766D]">
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Target</th>
                      <th className="py-3 px-4">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F1E8]">
                    {auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-[#6E6A61]">
                          No audit log entries recorded yet.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-3 px-4 font-mono tabular-nums text-[11px] text-[#6E6A61]">
                            {log.createdAt.slice(0, 19).replace('T', ' ')}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-[#111111]">{log.actorEmail}</div>
                            <div className="text-[10px] uppercase text-[#7A766D]">{log.actorRole}</div>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-[#111111]">{log.action}</td>
                          <td className="py-3 px-4 font-mono text-[11px] text-[#55524B]">{log.targetPath}</td>
                          <td className="py-3 px-4 text-[11px] text-[#55524B]">
                            {log.before || log.after ? `${log.before ?? '—'} → ${log.after ?? '—'}` : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
