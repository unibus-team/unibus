export type UserRole = 'student' | 'moderator' | 'admin';

export interface User {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  homeCity: string;
  trustScore: number; // 0.0 to 1.0
  status: 'Active' | 'Suspended';
  createdAt: string;
}

export interface AdminInvite {
  id: string;
  tokenHash: string;
  email: string;
  role: 'admin' | 'moderator';
  createdByUid: string;
  createdByEmail: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface AuditLogEntry {
  id: string;
  actorUid: string;
  actorEmail: string;
  actorRole: UserRole;
  action: string;
  targetPath: string;
  before?: string;
  after?: string;
  createdAt: string;
}

export type BusCategory = 'AC' | 'VIP' | 'Economy' | 'Luxury' | 'Microbus';

export interface Bus {
  id: string;
  name: string;
  category: BusCategory;
  totalSeats: number;
  plateNumber: string;
  amenities: string[];
  active: boolean;
}

export interface RouteInfo {
  id: string;
  from: string;
  to: string;
  distanceKm: number;
  estDurationMin: number;
  corridorNotes: string;
}

export type TripStatus = 'Active' | 'Cancelled' | 'Completed';

export interface Trip {
  id: number;
  busId: string;
  routeId: string;
  date: string; // YYYY-MM-DD
  departureTime: string; // HH:MM (24h)
  arrivalTime: string; // HH:MM (24h)
  priceEgp: number;
  freeSeats: number;
  bookedSeats: number;
  status: TripStatus;
  gateDropoff: string;
}

export type BookingStatus = 'Confirmed' | 'Cancelled';

export interface Booking {
  id: string;
  reference: string;
  tripId: number;
  userId: string;
  userName: string;
  routeLabel: string;
  passengers: number;
  totalEgp: number;
  status: BookingStatus;
  createdAt: string; // ISO string
  pickupNote?: string;
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  routeLabel: string;
  rating: number; // 1 to 5
  comment: string;
  createdAt: string;
}

export type CongestionLevel = 'Smooth' | 'Moderate' | 'Heavy';

export interface StationHub {
  id: string;
  name: string;
  nameAr: string;
  city: string;
  type: 'Terminal' | 'Train Station' | 'Campus Gate' | 'Corridor Stop';
  linesCount: number;
  avgHeadwayMin: number;
  congestion: CongestionLevel;
  landmarks: string;
  lastUpdated: string;
  x: number; // schematic map X (0-100)
  y: number; // schematic map Y (0-100)
}

export interface TrafficReport {
  id: string;
  stationId: string;
  stationName: string;
  userId: string;
  userName: string;
  congestion: CongestionLevel;
  fareNote?: string;
  createdAt: string;
}

export interface ScoredTrip {
  trip: Trip;
  bus: Bus;
  route: RouteInfo;
  matchPercent: number;
  tags: string[];
  breakdown: {
    priceScore: number;
    seatsScore: number;
    timingScore: number;
    historyScore: number;
    explanation: string;
  };
}

export type PublicPage =
  | 'home'
  | 'find-trips'
  | 'stations'
  | 'about'
  | 'login'
  | 'signup'
  | 'admin-login'
  | 'admin-accept-invite';
export type StudentTab = 'dashboard' | 'find-trips' | 'bookings' | 'stations' | 'profile';
export type AdminTab =
  | 'dashboard'
  | 'analytics'
  | 'ai-insights'
  | 'users'
  | 'buses'
  | 'routes'
  | 'trips'
  | 'bookings'
  | 'audit-logs';
