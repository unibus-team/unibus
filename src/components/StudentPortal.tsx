import { useMemo, useState } from 'react';
import {
  Banknote,
  CalendarCheck,
  Compass,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Search,
  Ticket,
  User as UserIcon,
  X,
  XCircle,
} from 'lucide-react';
import { CITIES } from '../data/seedData';
import { useUniBus } from '../context/UniBusContext';
import { ScoredTrip, StudentTab } from '../types/unibus';
import { formatTime12h, scoreTrips } from '../utils/scoring';
import { BookTripModal, RateTripModal, TripDetailsModal } from './BookingModals';
import { UniBusLogo } from './Logo';
import { StationsView } from './StationsView';
import { TripCard } from './TripCard';

export function StudentPortal({
  onOpenAssistant,
  onLogout,
}: {
  onOpenAssistant: () => void;
  onLogout: () => void;
}) {
  const {
    currentUser,
    trips,
    buses,
    routes,
    bookings,
    bookTrip,
    cancelBooking,
    restoreBooking,
    addReview,
    updateProfile,
  } = useUniBus();

  const [tab, setTab] = useState<StudentTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filters
  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [travelDate, setTravelDate] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [busFilter, setBusFilter] = useState('All');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState<'match' | 'cheapest' | 'earliest'>('match');

  // Bookings sub-tab
  const [bookingFilter, setBookingFilter] = useState<'Upcoming' | 'Past' | 'Cancelled'>('Upcoming');

  // Modals
  const [detailsTrip, setDetailsTrip] = useState<ScoredTrip | null>(null);
  const [bookModalTrip, setBookModalTrip] = useState<ScoredTrip | null>(null);
  const [rateTargetRoute, setRateTargetRoute] = useState<string | null>(null);

  // Profile form
  const [profileName, setProfileName] = useState(currentUser?.name || '');
  const [profileCity, setProfileCity] = useState(currentUser?.homeCity || 'Tanta');
  const [profileSaved, setProfileSaved] = useState(false);

  const myBookings = useMemo(
    () => bookings.filter((b) => b.userId === currentUser?.uid),
    [bookings, currentUser]
  );

  const confirmedBookings = myBookings.filter((b) => b.status === 'Confirmed');
  const cancelledBookings = myBookings.filter((b) => b.status === 'Cancelled');
  const egpBooked = confirmedBookings.reduce((s, b) => s + b.totalEgp, 0);

  const scoredAll = useMemo(
    () => scoreTrips(trips, buses, routes, myBookings, currentUser?.homeCity),
    [trips, buses, routes, myBookings, currentUser]
  );

  const filteredTrips = useMemo(() => {
    const res = scoredAll.filter(({ trip, bus, route }) => {
      if (fromCity && route.from !== fromCity) return false;
      if (toCity && route.to !== toCity) return false;
      if (travelDate && trip.date !== travelDate) return false;
      if (trip.freeSeats < passengers) return false;
      if (busFilter !== 'All' && bus.category !== busFilter) return false;
      if (maxPrice && trip.priceEgp > Number(maxPrice)) return false;
      return true;
    });

    if (sortBy === 'cheapest') return [...res].sort((a, b) => a.trip.priceEgp - b.trip.priceEgp);
    if (sortBy === 'earliest') return [...res].sort((a, b) => a.trip.departureTime.localeCompare(b.trip.departureTime));
    return res;
  }, [scoredAll, fromCity, toCity, travelDate, passengers, busFilter, maxPrice, sortBy]);

  const firstName = currentUser?.name.split(' ')[0] || 'Student';
  const initials = (currentUser?.name || 'S').charAt(0).toUpperCase();

  const tabTitles: Record<StudentTab, string> = {
    dashboard: 'Dashboard',
    'find-trips': 'Find trips',
    bookings: 'My bookings',
    stations: 'Stations',
    profile: 'Profile',
  };

  const displayedBookings = useMemo(() => {
    if (bookingFilter === 'Cancelled') return cancelledBookings;
    if (bookingFilter === 'Past') {
      return confirmedBookings.filter((b) => b.createdAt < '2026-06-01');
    }
    return confirmedBookings;
  }, [bookingFilter, confirmedBookings, cancelledBookings]);

  return (
    <div className="min-h-screen flex bg-[#FAF8F3] text-[#111111]">
      {/* Dark Left Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 bg-[#0F0F0F] text-white flex flex-col justify-between p-4 transition-transform lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between px-2 pt-1">
            <UniBusLogo dark size="md" />
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 text-white/60 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div>
            <div className="px-3 text-[10px] font-bold tracking-wider uppercase text-white/40 mb-2">
              Student
            </div>
            <nav className="space-y-1">
              {(
                [
                  ['dashboard', 'Dashboard', LayoutDashboard],
                  ['find-trips', 'Find Trips', Compass],
                  ['bookings', 'My Bookings', CalendarCheck],
                  ['stations', 'Stations', MapPin],
                  ['profile', 'Profile', UserIcon],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setTab(key);
                    setSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
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

        <div className="space-y-1 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onOpenAssistant}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-white/75 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Trip assistant</span>
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

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top contextual bar */}
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

          <button
            type="button"
            onClick={() => setTab('profile')}
            className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white border border-[#E5E0D5] text-xs font-semibold cursor-pointer"
          >
            <span className="w-6 h-6 rounded-full bg-[#111111] text-white text-[11px] font-bold flex items-center justify-center">
              {initials}
            </span>
            <span className="hidden sm:inline">{currentUser?.name}</span>
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto">
          {tab === 'dashboard' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">
                    Hi {firstName} 👋
                  </h1>
                  <p className="text-sm text-[#6E6A61] mt-0.5">Where are you heading next?</p>
                </div>
                <button
                  type="button"
                  onClick={onOpenAssistant}
                  className="self-start sm:self-auto px-4 py-2 rounded-full bg-white border border-[#DFDBD0] hover:border-[#111111] text-xs font-semibold cursor-pointer"
                >
                  Ask the assistant
                </button>
              </div>

              {/* Dark quick search bar matching screenshot */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setTab('find-trips');
                }}
                className="rounded-2xl bg-[#111111] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end"
              >
                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-semibold text-white/60 mb-1">From</label>
                  <select
                    value={fromCity}
                    onChange={(e) => setFromCity(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white text-[#111111] text-xs font-medium"
                  >
                    <option value="">Select city</option>
                    {CITIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-semibold text-white/60 mb-1">To</label>
                  <select
                    value={toCity}
                    onChange={(e) => setToCity(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white text-[#111111] text-xs font-medium"
                  >
                    <option value="">Select city</option>
                    {CITIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lg:col-span-3">
                  <label className="block text-[11px] font-semibold text-white/60 mb-1">Travel date</label>
                  <input
                    type="date"
                    value={travelDate}
                    onChange={(e) => setTravelDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-white text-[#111111] text-xs font-medium"
                  />
                </div>
                <div className="lg:col-span-1">
                  <label className="block text-[11px] font-semibold text-white/60 mb-1">Passengers</label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={passengers}
                    onChange={(e) => setPassengers(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2.5 rounded-xl bg-white text-[#111111] text-xs font-medium tabular-nums"
                  />
                </div>
                <div className="lg:col-span-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 px-4 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Search</span>
                  </button>
                </div>
              </form>

              {/* 4 KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { val: myBookings.length, label: 'Total bookings', Icon: Ticket },
                  { val: confirmedBookings.length, label: 'Upcoming trips', Icon: CalendarCheck },
                  { val: egpBooked, label: 'EGP booked', Icon: Banknote },
                  { val: cancelledBookings.length, label: 'Cancelled', Icon: XCircle },
                ].map(({ val, label, Icon }) => (
                  <div key={label} className="rounded-2xl bg-white border border-[#E8E4D9] p-4 flex items-center gap-3.5">
                    <div className="w-9 h-9 rounded-xl bg-[#FEF9C3] flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-[#854D0E]" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="text-xl font-extrabold text-[#111111] tabular-nums">{val}</div>
                      <div className="text-xs text-[#6E6A61]">{label}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 2-Column Main Body */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recommended for you */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-extrabold text-[#111111]">Recommended for you</h2>
                      <p className="text-xs text-[#6E6A61] mt-0.5">
                        Based on price, soonest departure and seats left — book a trip to personalise this.{' '}
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">Beta</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTab('find-trips')}
                      className="px-3 py-1.5 rounded-full bg-white border border-[#DFDBD0] text-xs font-semibold whitespace-nowrap cursor-pointer"
                    >
                      All trips
                    </button>
                  </div>

                  <div className="space-y-4">
                    {scoredAll.slice(0, 3).map((st, idx) => (
                      <TripCard
                        key={st.trip.id}
                        scored={st}
                        highlightBest={idx === 0}
                        onDetails={setDetailsTrip}
                        onBook={setBookModalTrip}
                      />
                    ))}
                  </div>

                  <p className="text-[11px] text-[#8E8A80]">
                    Match % comes from a transparent weighted scoring rule (see “How this score is calculated”).
                    It is an initial recommendation engine, not a trained AI model.
                  </p>
                </div>

                {/* Right rail */}
                <div className="space-y-4">
                  <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-2">
                    <h3 className="text-sm font-bold text-[#111111]">Notifications</h3>
                    {confirmedBookings.length === 0 ? (
                      <>
                        <div className="text-xs font-semibold text-[#2C2A25]">You’re all caught up.</div>
                        <p className="text-xs text-[#6E6A61]">
                          Delay alerts will arrive once live bus GPS data is available.
                        </p>
                        <span className="inline-block px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 text-[10px] font-semibold">
                          Requires Additional Data
                        </span>
                      </>
                    ) : (
                      <div className="space-y-2 text-xs text-[#55524B]">
                        <div className="p-2.5 rounded-xl bg-[#FAF8F3] border border-[#ECE8DD]">
                          Upcoming ride confirmed: <strong>{confirmedBookings[0].routeLabel}</strong> (Ref{' '}
                          <span className="font-mono">{confirmedBookings[0].reference}</span>).
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-2">
                    <h3 className="text-sm font-bold text-[#111111]">Your travel insights</h3>
                    <p className="text-xs text-[#6E6A61] leading-relaxed">
                      {confirmedBookings.length === 0
                        ? 'Book your first trip and UniBus will learn your usual route and time.'
                        : `Your most frequent corridor is ${confirmedBookings[0].routeLabel}. Total spent: ${egpBooked} EGP.`}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-[#111111]">Recent bookings</h3>
                      <button
                        type="button"
                        onClick={() => setTab('bookings')}
                        className="text-xs font-semibold text-[#111111] underline cursor-pointer"
                      >
                        View all
                      </button>
                    </div>
                    {myBookings.length === 0 ? (
                      <p className="text-xs text-[#7A766D]">No bookings yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {myBookings.slice(0, 3).map((b) => (
                          <div key={b.id} className="text-xs flex items-center justify-between gap-2">
                            <span className="truncate font-medium">{b.routeLabel}</span>
                            <span className="tabular-nums font-bold">{b.totalEgp} EGP</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-2.5">
                    <h3 className="text-sm font-bold text-[#111111]">Quick actions</h3>
                    <button
                      type="button"
                      onClick={() => setTab('find-trips')}
                      className="w-full py-2.5 rounded-full bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] text-xs font-bold cursor-pointer"
                    >
                      Find a trip
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('bookings')}
                      className="w-full py-2.5 rounded-full border border-[#DFDBD0] hover:bg-[#FAF8F3] text-xs font-semibold cursor-pointer"
                    >
                      My bookings
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('profile')}
                      className="w-full py-2.5 rounded-full border border-[#DFDBD0] hover:bg-[#FAF8F3] text-xs font-semibold cursor-pointer"
                    >
                      Edit profile
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'find-trips' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">Find a trip</h1>
                <p className="text-sm text-[#6E6A61] mt-1">Real upcoming departures, ranked for you.</p>
              </div>

              <div className="rounded-2xl bg-white border border-[#E8E4D9] p-4 sm:p-5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-[#6E6A61] mb-1">From</label>
                    <select
                      value={fromCity}
                      onChange={(e) => setFromCity(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                    >
                      <option value="">Any city</option>
                      {CITIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#6E6A61] mb-1">To</label>
                    <select
                      value={toCity}
                      onChange={(e) => setToCity(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                    >
                      <option value="">Any city</option>
                      {CITIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#6E6A61] mb-1">Travel date</label>
                    <input
                      type="date"
                      value={travelDate}
                      onChange={(e) => setTravelDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#6E6A61] mb-1">Passengers</label>
                    <input
                      type="number"
                      min={1}
                      max={6}
                      value={passengers}
                      onChange={(e) => setPassengers(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs tabular-nums"
                    />
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => {
                        setFromCity('');
                        setToCity('');
                        setTravelDate('');
                        setBusFilter('All');
                        setMaxPrice('');
                      }}
                      className="w-full py-2 rounded-xl bg-[#111111] text-white text-xs font-bold cursor-pointer"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-[#F4F1E8]">
                  <select
                    value={busFilter}
                    onChange={(e) => setBusFilter(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-[#DFDBD0] text-xs"
                  >
                    <option value="All">All bus types</option>
                    <option value="AC">AC</option>
                    <option value="VIP">VIP</option>
                    <option value="Economy">Economy</option>
                    <option value="Luxury">Luxury</option>
                    <option value="Microbus">Microbus</option>
                  </select>

                  <input
                    type="number"
                    placeholder="Max price (EGP)"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="w-36 px-3 py-1.5 rounded-xl border border-[#DFDBD0] text-xs tabular-nums"
                  />

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'match' | 'cheapest' | 'earliest')}
                    className="px-3 py-1.5 rounded-xl border border-[#DFDBD0] text-xs"
                  >
                    <option value="match">Sort: Best match</option>
                    <option value="cheapest">Sort: Lowest price</option>
                    <option value="earliest">Sort: Earliest departure</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#6E6A61]">
                <span className="font-bold text-[#111111] tabular-nums">{filteredTrips.length} trips found</span>
                <span>
                  Match % = transparent weighted score (price, seats, time, your history) ·{' '}
                  <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">Beta</span> not a trained model
                </span>
              </div>

              <div className="space-y-4">
                {filteredTrips.map((st, idx) => (
                  <TripCard
                    key={st.trip.id}
                    scored={st}
                    highlightBest={idx === 0 && sortBy === 'match'}
                    onDetails={setDetailsTrip}
                    onBook={setBookModalTrip}
                  />
                ))}
              </div>
            </div>
          )}

          {tab === 'bookings' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">My bookings</h1>
                  <p className="text-sm text-[#6E6A61] mt-1">Upcoming trips, history and cancellations.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTab('find-trips')}
                  className="px-4 py-2 rounded-full bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] text-xs font-bold cursor-pointer"
                >
                  New booking
                </button>
              </div>

              <div className="inline-flex items-center gap-1 p-1 rounded-full bg-[#ECE8DD]">
                {(
                  [
                    ['Upcoming', confirmedBookings.length],
                    ['Past', 0],
                    ['Cancelled', cancelledBookings.length],
                  ] as const
                ).map(([label, count]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setBookingFilter(label)}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer tabular-nums ${
                      bookingFilter === label ? 'bg-[#111111] text-white' : 'text-[#55524B] hover:text-[#111111]'
                    }`}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>

              {displayedBookings.length === 0 ? (
                <div className="rounded-2xl bg-white border border-[#E8E4D9] p-12 text-center space-y-3">
                  <div className="text-base font-bold text-[#111111]">Nothing here yet</div>
                  <p className="text-xs text-[#6E6A61]">Book a trip to see it listed here.</p>
                  <button
                    type="button"
                    onClick={() => setTab('find-trips')}
                    className="px-5 py-2.5 rounded-full bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] text-xs font-bold cursor-pointer"
                  >
                    Find a trip
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {displayedBookings.map((bk) => {
                    const trip = trips.find((t) => t.id === bk.tripId);
                    const bus = buses.find((bs) => bs.id === trip?.busId);
                    return (
                      <div
                        key={bk.id}
                        className="rounded-2xl bg-white border border-[#E8E4D9] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[#FAF8F3] border border-[#E8E4D9]">
                              {bk.reference}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                bk.status === 'Confirmed'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-rose-50 text-rose-700'
                              }`}
                            >
                              {bk.status}
                            </span>
                          </div>
                          <div className="text-base font-bold text-[#111111]">{bk.routeLabel}</div>
                          <div className="text-xs text-[#6E6A61]">
                            {bus?.name || 'Bus'} · {trip ? `${trip.date} at ${formatTime12h(trip.departureTime)}` : ''}{' '}
                            · {bk.passengers} seat(s) · <strong className="tabular-nums">{bk.totalEgp} EGP</strong>
                          </div>
                          {bk.pickupNote && (
                            <div className="text-[11px] text-[#7A766D]">Pickup note: {bk.pickupNote}</div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {bk.status === 'Confirmed' ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setRateTargetRoute(bk.routeLabel)}
                                className="px-3.5 py-2 rounded-xl border border-[#DFDBD0] text-xs font-semibold hover:bg-[#FAF8F3] cursor-pointer"
                              >
                                Rate trip
                              </button>
                              <button
                                type="button"
                                onClick={() => cancelBooking(bk.id)}
                                className="px-3.5 py-2 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => restoreBooking(bk.id)}
                              className="px-3.5 py-2 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] text-xs font-bold cursor-pointer"
                            >
                              Restore booking
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'stations' && (
            <StationsView
              onFindFromCity={(city) => {
                setFromCity(city);
                setToCity('');
                setTab('find-trips');
              }}
            />
          )}

          {tab === 'profile' && (
            <div className="max-w-xl space-y-6">
              <div>
                <h1 className="text-2xl font-extrabold text-[#111111]">Student Profile</h1>
                <p className="text-sm text-[#6E6A61] mt-1">
                  Manage your home terminal preferences and crowdsourced trust reputation.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  updateProfile({ name: profileName, homeCity: profileCity });
                  setProfileSaved(true);
                  setTimeout(() => setProfileSaved(false), 2500);
                }}
                className="rounded-2xl bg-white border border-[#E8E4D9] p-6 space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1">Full Name</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#DFDBD0] text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1">Email</label>
                  <input
                    type="email"
                    value={currentUser?.email || ''}
                    disabled
                    className="w-full px-3.5 py-2 rounded-xl border border-[#ECE8DD] bg-[#FAF8F3] text-sm text-[#7A766D]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1">Home City / Terminal</label>
                  <select
                    value={profileCity}
                    onChange={(e) => setProfileCity(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-[#DFDBD0] text-sm"
                  >
                    {CITIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3.5 rounded-xl bg-[#FAF8F3] border border-[#ECE8DD] flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#111111]">Crowdsourcing Trust Score</span>
                  <span className="font-mono font-bold text-emerald-700 tabular-nums">
                    {(currentUser?.trustScore ?? 0.5).toFixed(2)} / 1.00
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] text-xs font-bold cursor-pointer"
                  >
                    Save changes
                  </button>
                  {profileSaved && <span className="text-xs text-emerald-700 font-semibold">Saved!</span>}
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {detailsTrip && (
        <TripDetailsModal
          scored={detailsTrip}
          onClose={() => setDetailsTrip(null)}
          onBook={(s) => setBookModalTrip(s)}
        />
      )}

      {bookModalTrip && (
        <BookTripModal
          scored={bookModalTrip}
          initialPassengers={passengers}
          onClose={() => setBookModalTrip(null)}
          onConfirm={async (tripId, pax, note) => {
            const res = await bookTrip(tripId, pax, note);
            return { ok: res.ok, reference: res.booking?.reference, error: res.error };
          }}
        />
      )}

      {rateTargetRoute && (
        <RateTripModal
          routeLabel={rateTargetRoute}
          onClose={() => setRateTargetRoute(null)}
          onSubmit={(rating, comment) => addReview(rateTargetRoute, rating, comment)}
        />
      )}
    </div>
  );
}
