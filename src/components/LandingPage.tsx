import { useMemo, useState } from 'react';
import { Calendar, Check, MapPin, Menu, Star, X } from 'lucide-react';
import { CITIES } from '../data/seedData';
import { useUniBus } from '../context/UniBusContext';
import { PublicPage, ScoredTrip } from '../types/unibus';
import { scoreTrips } from '../utils/scoring';
import { BookTripModal, TripDetailsModal } from './BookingModals';
import { UniBusLogo } from './Logo';
import { StationsView } from './StationsView';
import { TripCard } from './TripCard';

export function LandingPage({
  page,
  onNavigate,
  onGoPortal,
}: {
  page: PublicPage;
  onNavigate: (p: PublicPage) => void;
  onGoPortal: () => void;
}) {
  const { trips, buses, routes, bookings, reviews, publicStats, currentUser, bookTrip } = useUniBus();

  // Search filter state
  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [travelDate, setTravelDate] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [busFilter, setBusFilter] = useState('All');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState<'match' | 'cheapest' | 'earliest'>('match');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [detailsTrip, setDetailsTrip] = useState<ScoredTrip | null>(null);
  const [bookModalTrip, setBookModalTrip] = useState<ScoredTrip | null>(null);

  const studentCount = publicStats.studentCount;
  const upcomingCount = trips.filter((t) => t.status === 'Active').length;
  const confirmedOrAllBookings = Math.max(publicStats.bookingsCount, bookings.filter((b) => b.status === 'Confirmed').length);

  const mostBookedRoutes = useMemo(() => {
    const counts: Record<string, number> = {};
    bookings
      .filter((b) => b.status === 'Confirmed')
      .forEach((b) => {
        counts[b.routeLabel] = (counts[b.routeLabel] || 0) + 1;
      });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [bookings]);

  const scoredTrips = useMemo(() => {
    const base = scoreTrips(trips, buses, routes, [], currentUser?.homeCity);
    const filtered = base.filter(({ trip, bus, route }) => {
      if (fromCity && route.from !== fromCity) return false;
      if (toCity && route.to !== toCity) return false;
      if (travelDate && trip.date !== travelDate) return false;
      if (trip.freeSeats < passengers) return false;
      if (busFilter !== 'All' && bus.category !== busFilter) return false;
      if (maxPrice && trip.priceEgp > Number(maxPrice)) return false;
      return true;
    });

    if (sortBy === 'cheapest') {
      return [...filtered].sort((a, b) => a.trip.priceEgp - b.trip.priceEgp);
    }
    if (sortBy === 'earliest') {
      return [...filtered].sort((a, b) => a.trip.departureTime.localeCompare(b.trip.departureTime));
    }
    return filtered;
  }, [trips, buses, routes, currentUser, fromCity, toCity, travelDate, passengers, busFilter, maxPrice, sortBy]);

  const handleBookClick = (scored: ScoredTrip) => {
    if (!currentUser) {
      onNavigate('login');
      return;
    }
    setBookModalTrip(scored);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigate('find-trips');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F3] text-[#111111]">
      {/* 3-zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-[#ECE8DD]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <button type="button" onClick={() => onNavigate('home')} className="cursor-pointer shrink-0">
            <UniBusLogo dark={false} size="md" />
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {(
              [
                ['home', 'Home'],
                ['find-trips', 'Find Trips'],
                ['stations', 'Stations'],
                ['about', 'About'],
              ] as [PublicPage, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onNavigate(key)}
                className={`px-3 py-1.5 rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  page === key
                    ? 'bg-[#111111] text-white font-semibold'
                    : 'text-[#55524B] hover:text-[#111111]'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3 shrink-0">
            {currentUser ? (
              <button
                type="button"
                onClick={onGoPortal}
                className="px-4 py-2 rounded-full bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] text-xs font-bold whitespace-nowrap cursor-pointer"
              >
                {currentUser.role === 'admin' || currentUser.role === 'moderator'
                  ? 'Staff Console'
                  : 'Student Dashboard'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="px-3.5 py-2 text-xs font-semibold text-[#111111] hover:underline whitespace-nowrap cursor-pointer"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('signup')}
                  className="px-4 py-2 rounded-full bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] text-xs font-bold whitespace-nowrap cursor-pointer"
                >
                  Sign up
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="md:hidden p-2 rounded-lg border border-[#E5E0D5] cursor-pointer"
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileNavOpen && (
          <div className="md:hidden border-t border-[#ECE8DD] bg-white px-4 py-3 space-y-2">
            {(
              [
                ['home', 'Home'],
                ['find-trips', 'Find Trips'],
                ['stations', 'Stations'],
                ['about', 'About'],
              ] as [PublicPage, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onNavigate(key);
                  setMobileNavOpen(false);
                }}
                className={`block w-full text-left px-3 py-2 rounded-xl text-sm font-semibold ${
                  page === key ? 'bg-[#111111] text-white' : 'text-[#2C2A25]'
                }`}
              >
                {label}
              </button>
            ))}
            <div className="pt-2 border-t border-[#ECE8DD] flex gap-2">
              {currentUser ? (
                <button
                  type="button"
                  onClick={onGoPortal}
                  className="flex-1 py-2 rounded-xl bg-[#FACC15] text-[#111111] text-xs font-bold"
                >
                  Open Portal
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onNavigate('login')}
                    className="flex-1 py-2 rounded-xl border border-[#DFDBD0] text-xs font-semibold"
                  >
                    Log in
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('signup')}
                    className="flex-1 py-2 rounded-xl bg-[#FACC15] text-xs font-bold"
                  >
                    Sign up
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* PAGE CONTENT */}
      {page === 'home' && (
        <main className="flex-1">
          {/* HERO SECTION */}
          <section className="relative bg-[#0F0F0F] text-white pt-12 sm:pt-16 pb-24 sm:pb-28 overflow-hidden">
            <div
              className="absolute -top-24 right-1/4 w-[480px] h-[480px] rounded-full bg-[#FACC15]/12 blur-3xl pointer-events-none"
              aria-hidden="true"
            />
            <div className="max-w-6xl mx-auto px-4 sm:px-6 relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-block px-3 py-1 rounded-full bg-[#FACC15] text-[#111111] text-[10px] font-extrabold tracking-wider uppercase">
                  Built for Tanta University students
                </div>

                <h1 className="text-4xl sm:text-5xl lg:text-[54px] font-extrabold tracking-tight leading-[1.08] max-w-xl">
                  Book your ride to campus <span className="text-[#FACC15]">without the queue.</span>
                </h1>

                <p className="text-sm sm:text-base text-white/70 max-w-xl leading-relaxed">
                  UniBus is a university transportation platform: search real trips, compare prices and
                  seats, reserve in minutes and keep every booking in one place.
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onNavigate('find-trips')}
                    className="px-6 py-3 rounded-full bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] text-sm font-bold transition-colors cursor-pointer"
                  >
                    Find a trip
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate(currentUser ? 'find-trips' : 'signup')}
                    className="px-6 py-3 rounded-full border border-white/25 hover:border-white/60 text-white text-sm font-semibold transition-colors cursor-pointer"
                  >
                    {currentUser ? 'Browse live routes' : 'Create free account'}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-xs text-white/60">
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-[#FACC15]" /> Live seat counts
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-[#FACC15]" /> Cancel anytime before departure
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-[#FACC15]" /> Personalised suggestions
                  </span>
                </div>
              </div>

              {/* Right Live Route card */}
              <div className="lg:col-span-5">
                <div className="rounded-2xl bg-[#1A1A1A] border border-white/10 p-6 shadow-2xl">
                  <div className="flex items-center justify-between text-[11px] font-bold tracking-wider uppercase text-white/50 mb-5">
                    <span>UniBus Route</span>
                    <span>Scheduled Service</span>
                  </div>

                  <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-white/15">
                    <div className="relative">
                      <span className="absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-[#FACC15] bg-[#1A1A1A]" />
                      <div className="text-sm font-bold text-white">Your city</div>
                      <div className="text-xs text-white/50 mt-0.5">Board at the station</div>
                    </div>

                    <div className="relative">
                      <span className="absolute -left-6 top-1 w-4 h-4 rounded-full border-2 border-white/30 bg-[#1A1A1A]" />
                      <div className="text-sm font-bold text-white">On the way</div>
                      <div className="text-xs text-white/50 mt-0.5">
                        Scheduled arrival shown on each trip
                      </div>
                    </div>

                    <div className="relative flex items-end justify-between gap-3">
                      <div>
                        <span className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-[#FACC15]" />
                        <div className="text-sm font-bold text-white">Tanta University</div>
                        <div className="text-xs text-white/50 mt-0.5">Sabrabay Complex · Arrive for class</div>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-[#FACC15] shrink-0" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* FLOATING SEARCH BAR OVERLAPPING HERO */}
          <section className="max-w-5xl mx-auto px-4 sm:px-6 -mt-12 relative z-20">
            <form
              onSubmit={handleSearchSubmit}
              className="rounded-2xl bg-white border border-[#E8E4D9] shadow-lg p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end"
            >
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-bold text-[#6E6A61] mb-1">From</label>
                <select
                  value={fromCity}
                  onChange={(e) => setFromCity(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#DFDBD0] bg-[#FAF8F3] text-sm font-medium focus:outline-none focus:border-[#111111]"
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
                <label className="block text-[11px] font-bold text-[#6E6A61] mb-1">To</label>
                <select
                  value={toCity}
                  onChange={(e) => setToCity(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#DFDBD0] bg-[#FAF8F3] text-sm font-medium focus:outline-none focus:border-[#111111]"
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
                <label className="block text-[11px] font-bold text-[#6E6A61] mb-1">Travel date</label>
                <input
                  type="date"
                  value={travelDate}
                  onChange={(e) => setTravelDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#DFDBD0] bg-[#FAF8F3] text-sm font-medium focus:outline-none focus:border-[#111111]"
                />
              </div>

              <div className="lg:col-span-1">
                <label className="block text-[11px] font-bold text-[#6E6A61] mb-1">Passengers</label>
                <input
                  type="number"
                  min={1}
                  max={6}
                  value={passengers}
                  onChange={(e) => setPassengers(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2.5 rounded-xl border border-[#DFDBD0] bg-[#FAF8F3] text-sm font-medium tabular-nums focus:outline-none focus:border-[#111111]"
                />
              </div>

              <div className="lg:col-span-2">
                <button
                  type="submit"
                  className="w-full py-2.5 px-4 rounded-xl bg-[#111111] hover:bg-[#222222] text-white text-sm font-bold transition-colors cursor-pointer"
                >
                  Search
                </button>
              </div>
            </form>
          </section>

          {/* 4 LIVE STAT CARDS */}
          <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-10">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { val: studentCount, label: 'Registered students' },
                { val: upcomingCount, label: 'Upcoming trips' },
                { val: confirmedOrAllBookings, label: 'Bookings made' },
                { val: CITIES.length, label: 'Cities connected' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl bg-white border border-[#E8E4D9] p-5">
                  <div className="text-2xl sm:text-3xl font-extrabold text-[#111111] tabular-nums">{stat.val}</div>
                  <div className="text-xs text-[#6E6A61] mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-[#8E8A80] mt-2">Live figures from the UniBus database.</p>
          </section>

          {/* POPULAR ROUTES */}
          <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
            <div className="text-[11px] font-bold tracking-wider uppercase text-[#B45309]">Popular routes</div>
            <h2 className="text-2xl font-extrabold text-[#111111] mt-1">Most booked routes</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
              {mostBookedRoutes.map(([label, count]) => {
                const [fromPart, toPart] = label.split(' → ');
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setFromCity(fromPart || '');
                      setToCity(toPart || '');
                      onNavigate('find-trips');
                    }}
                    className="text-left rounded-2xl bg-white border border-[#E8E4D9] hover:border-[#111111] p-4 transition-colors cursor-pointer"
                  >
                    <div className="text-sm font-bold text-[#111111]">{label}</div>
                    <div className="text-xs text-[#6E6A61] mt-1 tabular-nums">{count} booking(s)</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* WHY UNIBUS */}
          <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
            <div className="text-[11px] font-bold tracking-wider uppercase text-[#B45309]">Why UniBus</div>
            <h2 className="text-2xl font-extrabold text-[#111111] mt-1">
              Everything a commuting student needs
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
              {[
                {
                  title: 'Simple booking',
                  desc: 'Pick a trip, choose passengers and confirm. Seat counts update instantly.',
                },
                {
                  title: 'Recommended for you',
                  desc: 'Trips are ranked by route, price, departure time and seats, with the reasons shown.',
                  badge: 'Beta',
                },
                {
                  title: 'Manage in one place',
                  desc: 'See upcoming and past trips, cancel or restore bookings and rate your journeys.',
                },
                {
                  title: 'Trip assistant',
                  desc: 'Ask about trips, prices and seats. A rule-based helper answers from live data.',
                  badge: 'Beta',
                },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#FACC15]" />
                  <h3 className="text-sm font-bold text-[#111111]">{item.title}</h3>
                  <p className="text-xs text-[#6E6A61] leading-relaxed">
                    {item.desc}{' '}
                    {item.badge && (
                      <span className="inline-block ml-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[10px] font-semibold">
                        {item.badge}
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* HOW IT WORKS */}
          <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
            <div className="text-[11px] font-bold tracking-wider uppercase text-[#B45309]">How it works</div>
            <h2 className="text-2xl font-extrabold text-[#111111] mt-1">From search to seat in four steps</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
              {[
                { step: '1', title: 'Search', desc: 'Choose your route and travel date.' },
                { step: '2', title: 'Compare', desc: 'Check times, price, bus type and free seats.' },
                { step: '3', title: 'Book', desc: 'Confirm passengers and payment method.' },
                { step: '4', title: 'Travel', desc: 'Show your booking reference and board.' },
              ].map((s) => (
                <div key={s.step} className="rounded-2xl bg-white border border-[#E8E4D9] p-5">
                  <div className="w-6 h-6 rounded-full bg-[#111111] text-[#FACC15] text-xs font-extrabold flex items-center justify-center tabular-nums">
                    {s.step}
                  </div>
                  <h3 className="text-sm font-bold text-[#111111] mt-3">{s.title}</h3>
                  <p className="text-xs text-[#6E6A61] mt-1">{s.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* STUDENT FEEDBACK */}
          <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
            <div className="text-[11px] font-bold tracking-wider uppercase text-[#B45309]">Student feedback</div>
            <h2 className="text-2xl font-extrabold text-[#111111] mt-1">What riders say</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
              {reviews.slice(0, 3).map((r) => (
                <div key={r.id} className="rounded-2xl bg-white border border-[#E8E4D9] p-5 space-y-2">
                  <div className="flex items-center gap-0.5 text-[#FACC15]">
                    {Array.from({ length: r.rating }).map((_, idx) => (
                      <Star key={idx} className="w-3.5 h-3.5 fill-[#FACC15]" />
                    ))}
                  </div>
                  <p className="text-xs text-[#2C2A25] leading-relaxed">“{r.comment}”</p>
                  <div className="text-[11px] font-semibold text-[#6E6A61]">— {r.userName}</div>
                </div>
              ))}
            </div>
          </section>

          {/* YELLOW CTA BANNER */}
          <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 pt-6">
            <div className="rounded-2xl bg-[#FACC15] p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-[#111111]">Ready for your next trip?</h2>
                <p className="text-xs sm:text-sm text-[#111111]/75 mt-1">
                  Search upcoming departures and reserve your seat today.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('find-trips')}
                className="px-6 py-3 rounded-full bg-[#111111] hover:bg-[#222222] text-white text-xs font-bold whitespace-nowrap cursor-pointer self-start sm:self-auto"
              >
                Browse trips
              </button>
            </div>
          </section>
        </main>
      )}

      {page === 'find-trips' && (
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
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
                  className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs font-medium"
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
                  className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs font-medium"
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
                  className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs font-medium"
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
                  className="w-full px-3 py-2 rounded-xl border border-[#DFDBD0] text-xs font-medium tabular-nums"
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
                  className="w-full py-2 px-3 rounded-xl bg-[#111111] text-white text-xs font-bold cursor-pointer"
                >
                  Reset filters
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
            <span className="font-bold text-[#111111] tabular-nums">{scoredTrips.length} trips found</span>
            <span>
              Match % = transparent weighted score (price, seats, time, your history) ·{' '}
              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">Beta</span> not a trained AI model
            </span>
          </div>

          {scoredTrips.length === 0 ? (
            <div className="rounded-2xl bg-white border border-[#E8E4D9] p-10 text-center space-y-3">
              <Calendar className="w-8 h-8 text-[#B45309] mx-auto" />
              <div className="text-sm font-bold text-[#111111]">No matching departures</div>
              <p className="text-xs text-[#6E6A61]">Try clearing date or city filters to see all available rides.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {scoredTrips.map((st, idx) => (
                <TripCard
                  key={st.trip.id}
                  scored={st}
                  highlightBest={idx === 0 && sortBy === 'match'}
                  onDetails={(item) => setDetailsTrip(item)}
                  onBook={handleBookClick}
                />
              ))}
            </div>
          )}
        </main>
      )}

      {page === 'stations' && (
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-8">
          <StationsView
            onFindFromCity={(city) => {
              setFromCity(city);
              setToCity('');
              onNavigate('find-trips');
            }}
          />
        </main>
      )}

      {page === 'about' && (
        <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-10 space-y-6">
          <div className="rounded-2xl bg-[#111111] text-white p-8">
            <div className="text-xs font-bold uppercase tracking-wider text-[#FACC15]">
              Tanta University Graduation Project
            </div>
            <h1 className="text-3xl font-extrabold mt-2">
              Smart Commute Navigator for Sabrabay Complex
            </h1>
            <p className="text-sm text-white/75 mt-3 leading-relaxed">
              UniBus unifies inter-city buses, railway transfers, and Sabrabay Complex microbus corridors
              into one transparent platform. Students can compare fares, check seat counts, view weighted
              recommendations, and share real-time station congestion updates.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white border border-[#E8E4D9] p-6 space-y-2">
              <MapPin className="w-5 h-5 text-[#B45309]" />
              <h2 className="text-base font-bold text-[#111111]">Sabrabay-First Scope</h2>
              <p className="text-xs text-[#6E6A61] leading-relaxed">
                Covers routes connecting Tanta Railway Station, El-Mawkaf El-Gedeed, Kafr El Zayat, Zifta,
                Santa, and El-Mahalla El-Kubra directly to Sabrabay Complex gates.
              </p>
            </div>
            <div className="rounded-2xl bg-white border border-[#E8E4D9] p-6 space-y-2">
              <Check className="w-5 h-5 text-[#B45309]" />
              <h2 className="text-base font-bold text-[#111111]">Honest, Transparent Logic</h2>
              <p className="text-xs text-[#6E6A61] leading-relaxed">
                Every recommendation score, analytics chart, and assistant answer is computed directly from
                live booking and route records—no opaque black-box guesses.
              </p>
            </div>
          </div>
        </main>
      )}

      {/* DARK FOOTER */}
      <footer className="bg-[#0F0F0F] text-white py-12 mt-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-xs">
          <div className="space-y-3">
            <UniBusLogo dark size="sm" />
            <p className="text-white/55 leading-relaxed">
              University transportation booking for Tanta University students — search trips, reserve seats
              and manage your bookings in one place.
            </p>
          </div>

          <div className="space-y-2">
            <div className="font-bold tracking-wider uppercase text-white/40 text-[10px]">Explore</div>
            <ul className="space-y-1.5 text-white/70">
              <li>
                <button type="button" onClick={() => onNavigate('home')} className="hover:text-white cursor-pointer">
                  Home
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('find-trips')} className="hover:text-white cursor-pointer">
                  Find trips
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('stations')} className="hover:text-white cursor-pointer">
                  Stations
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('about')} className="hover:text-white cursor-pointer">
                  About UniBus
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <div className="font-bold tracking-wider uppercase text-white/40 text-[10px]">Account</div>
            <ul className="space-y-1.5 text-white/70">
              <li>
                <button type="button" onClick={() => onNavigate('login')} className="hover:text-white cursor-pointer">
                  Log in
                </button>
              </li>
              <li>
                <button type="button" onClick={() => onNavigate('signup')} className="hover:text-white cursor-pointer">
                  Create account
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => (currentUser ? onGoPortal() : onNavigate('login'))}
                  className="hover:text-white cursor-pointer"
                >
                  My bookings
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('admin-login')}
                  className="text-white/50 hover:text-[#FACC15] cursor-pointer"
                >
                  Staff Portal (/admin/login)
                </button>
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <div className="font-bold tracking-wider uppercase text-white/40 text-[10px]">About the project</div>
            <p className="text-white/60 leading-relaxed">
              Graduation project — Tanta University · Smart Commute Navigator (Sabrabay Complex).
            </p>
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 mt-10 pt-6 border-t border-white/10 text-[11px] text-white/40">
          © 2026 UniBus. All rights reserved.
        </div>
      </footer>

      {detailsTrip && (
        <TripDetailsModal
          scored={detailsTrip}
          onClose={() => setDetailsTrip(null)}
          onBook={handleBookClick}
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
    </div>
  );
}
