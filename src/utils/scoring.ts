import { Booking, Bus, Review, RouteInfo, ScoredTrip, StationHub, Trip, User } from '../types/unibus';

export function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

export function scoreTrips(
  trips: Trip[],
  buses: Bus[],
  routes: RouteInfo[],
  userBookings: Booking[],
  homeCity?: string
): ScoredTrip[] {
  const activeTrips = trips.filter((t) => t.status === 'Active' && t.freeSeats > 0);
  if (activeTrips.length === 0) return [];

  const prices = activeTrips.map((t) => t.priceEgp);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

  const userRouteCounts: Record<string, number> = {};
  userBookings.forEach((b) => {
    if (b.status === 'Confirmed') {
      userRouteCounts[b.routeLabel] = (userRouteCounts[b.routeLabel] || 0) + 1;
    }
  });

  const scored: ScoredTrip[] = [];

  for (const trip of activeTrips) {
    const bus = buses.find((b) => b.id === trip.busId);
    const route = routes.find((r) => r.id === trip.routeId);
    if (!bus || !route) continue;

    // 1. Price score (0-40 pts)
    const priceRatio = maxPrice === minPrice ? 1 : 1 - (trip.priceEgp - minPrice) / (maxPrice - minPrice);
    const priceScore = Math.round(15 + priceRatio * 25);

    // 2. Seat availability score (0-25 pts)
    const seatRatio = Math.min(1, trip.freeSeats / Math.max(1, bus.totalSeats));
    const seatsScore = Math.round(8 + seatRatio * 17);

    // 3. Departure timing score (0-20 pts) - sooner/morning commute favored
    const hour = parseInt(trip.departureTime.split(':')[0] || '9', 10);
    const isMorningPeak = hour >= 7 && hour <= 10;
    const isToday = trip.date === '2026-11-25';
    const timingScore = (isToday ? 12 : 8) + (isMorningPeak ? 8 : 5);

    // 4. Personalisation / home city history (0-15 pts)
    const label = `${route.from} → ${route.to}`;
    const hasBookedRoute = (userRouteCounts[label] || 0) > 0;
    const matchesHome = homeCity && (route.from === homeCity || route.to === homeCity);
    const historyScore = hasBookedRoute ? 15 : matchesHome ? 12 : 7;

    const matchPercent = Math.min(98, Math.max(45, priceScore + seatsScore + timingScore + historyScore));

    const tags: string[] = [];
    if (trip.priceEgp === minPrice) {
      tags.push('Best price');
    } else if (trip.priceEgp < avgPrice) {
      tags.push('Below-average price');
    }

    if (trip.freeSeats >= 12) {
      tags.push('More available seats');
    }

    if (trip.date === '2026-11-25' || hour <= 9) {
      tags.push('Leaves soon');
    }

    scored.push({
      trip,
      bus,
      route,
      matchPercent,
      tags,
      breakdown: {
        priceScore,
        seatsScore,
        timingScore,
        historyScore,
        explanation: `Price (${priceScore}/40) + Seats (${seatsScore}/25) + Schedule (${timingScore}/20) + Route fit (${historyScore}/15)`,
      },
    });
  }

  scored.sort((a, b) => b.matchPercent - a.matchPercent || a.trip.priceEgp - b.trip.priceEgp);

  if (scored.length > 0 && !scored[0].tags.includes('Best match')) {
    scored[0].tags = ['Best match', ...scored[0].tags];
  }

  return scored;
}

export function generateAssistantReply(
  query: string,
  params: {
    user: User | null;
    trips: Trip[];
    buses: Bus[];
    routes: RouteInfo[];
    bookings: Booking[];
    stations: StationHub[];
  }
): string {
  const q = query.trim().toLowerCase();
  const { user, trips, buses, routes, bookings, stations } = params;
  const activeTrips = trips.filter((t) => t.status === 'Active' && t.freeSeats > 0);

  if (q.includes('book') || q.includes('how') || q.includes('reserve')) {
    return 'To book a ride: open Find Trips, filter by From/To and date, pick a trip card, and click "Book now". Your booking reference is generated instantly and you can cancel anytime before departure from My Bookings.';
  }

  if (q.includes('cancel') || q.includes('refund')) {
    return 'You can cancel any upcoming confirmed booking in one click under My Bookings. Freed seats return immediately to live inventory.';
  }

  if (q.includes('cheap') || q.includes('price') || q.includes('fare') || q.includes('cost')) {
    const sorted = [...activeTrips].sort((a, b) => a.priceEgp - b.priceEgp);
    const top = sorted.slice(0, 3).map((t) => {
      const r = routes.find((rt) => rt.id === t.routeId);
      const b = buses.find((bs) => bs.id === t.busId);
      return `• ${r?.from} → ${r?.to} (${b?.name}) at ${formatTime12h(t.departureTime)} — ${t.priceEgp} EGP (${t.freeSeats} seats left)`;
    });
    return top.length > 0
      ? `Here are the lowest fares right now:\n${top.join('\n')}`
      : 'No active trips are currently scheduled.';
  }

  if (q.includes('station') || q.includes('sabrabay') || q.includes('gate') || q.includes('traffic')) {
    const sabra = stations.find((s) => s.id === 'st-sabrabay');
    const rail = stations.find((s) => s.id === 'st-tanta-rail');
    return `Key Sabrabay Complex hubs right now:\n• ${sabra?.name}: ${sabra?.congestion} traffic (every ~${sabra?.avgHeadwayMin}m)\n• ${rail?.name}: ${rail?.congestion} traffic (every ~${rail?.avgHeadwayMin}m)\nVisit the Stations tab to view all terminals or submit a live traffic update.`;
  }

  if (q.includes('my booking') || q.includes('upcoming')) {
    if (!user) return 'Please log in to view your personal bookings.';
    const mine = bookings.filter((b) => b.userId === user.uid && b.status === 'Confirmed');
    if (mine.length === 0) return 'You have no confirmed bookings yet. Click "Find a trip" to reserve a seat.';
    return `You currently have ${mine.length} confirmed booking(s): ${mine
      .slice(0, 3)
      .map((b) => `${b.routeLabel} (${b.reference})`)
      .join(', ')}.`;
  }

  if (q.includes('available') || q.includes('trip') || q.includes('schedule') || q.includes('tanta') || q.includes('zifta') || q.includes('kafr')) {
    const matched = activeTrips.filter((t) => {
      const r = routes.find((rt) => rt.id === t.routeId);
      if (!r) return false;
      if (q.includes('tanta') || q.includes('sabrabay') || q.includes('zifta') || q.includes('kafr') || q.includes('mahalla')) {
        return (
          r.from.toLowerCase().includes('tanta') && q.includes('tanta') ||
          r.to.toLowerCase().includes('tanta') && q.includes('tanta') ||
          r.from.toLowerCase().includes('sabrabay') && q.includes('sabrabay') ||
          r.to.toLowerCase().includes('sabrabay') && q.includes('sabrabay') ||
          r.from.toLowerCase().includes('zifta') && q.includes('zifta') ||
          r.to.toLowerCase().includes('zifta') && q.includes('zifta') ||
          r.from.toLowerCase().includes('kafr') && q.includes('kafr') ||
          r.to.toLowerCase().includes('kafr') && q.includes('kafr') ||
          r.from.toLowerCase().includes('mahalla') && q.includes('mahalla')
        );
      }
      return true;
    });

    const list = (matched.length > 0 ? matched : activeTrips).slice(0, 4).map((t) => {
      const r = routes.find((rt) => rt.id === t.routeId);
      const b = buses.find((bs) => bs.id === t.busId);
      return `• ${r?.from} → ${r?.to} · ${formatDateShort(t.date)} at ${formatTime12h(t.departureTime)} (${b?.name}, ${t.priceEgp} EGP, ${t.freeSeats} seats)`;
    });

    return `There are ${activeTrips.length} active departures in the database. Top matches:\n${list.join('\n')}`;
  }

  return `Hi${user ? ` ${user.name.split(' ')[0]}` : ''}! I'm a rule-based helper connected to the live UniBus database (${activeTrips.length} active trips, ${stations.length} stations). Ask me about available trips, cheapest fares, Sabrabay stations, or how booking works.`;
}

export function analyzeSentiment(reviews: Review[]) {
  const positiveWords = ['clean', 'comfortable', 'polite', 'good', 'great', 'fast', 'direct', 'saved', 'nice', 'safe'];
  const negativeWords = ['late', 'crowded', 'dirty', 'expensive', 'slow', 'rude', 'delay', 'bad'];

  let positiveHits = 0;
  let negativeHits = 0;
  const keywordCounts: Record<string, number> = {};

  reviews.forEach((r) => {
    const text = r.comment.toLowerCase();
    positiveWords.forEach((w) => {
      if (text.includes(w)) {
        positiveHits++;
        keywordCounts[w] = (keywordCounts[w] || 0) + 1;
      }
    });
    negativeWords.forEach((w) => {
      if (text.includes(w)) {
        negativeHits++;
        keywordCounts[w] = (keywordCounts[w] || 0) + 1;
      }
    });
  });

  const avgRating =
    reviews.length > 0 ? Number((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(2)) : 0;

  return { avgRating, positiveHits, negativeHits, keywordCounts };
}
