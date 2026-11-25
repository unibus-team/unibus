import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile as updateFirebaseProfile,
} from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  ADMIN_EMAILS,
  SEED_BOOKINGS,
  SEED_BUSES,
  SEED_REVIEWS,
  SEED_ROUTES,
  SEED_STATIONS,
  SEED_TRAFFIC_REPORTS,
  SEED_TRIPS,
  SEED_USERS,
} from '../data/seedData';
import { OperationType, auth, db, googleProvider, handleFirestoreError } from '../firebase';
import {
  AdminInvite,
  AuditLogEntry,
  Booking,
  Bus,
  CongestionLevel,
  Review,
  RouteInfo,
  StationHub,
  TrafficReport,
  Trip,
  User,
  UserRole,
} from '../types/unibus';
import {
  CrowdsourcingCooldownLimiter,
  LoginRateLimiter,
  ScopedSessionClaims,
  generateInviteToken,
  hashInviteToken,
  issueScopedSessionClaims,
  sanitizeStudentRegistrationInput,
  validateAdminPasswordStrength,
  validateInviteConsumption,
  validateRoleChange,
  validateUserDataDeletion,
} from '../security/authPolicy';

interface PublicStats {
  studentCount: number;
  bookingsCount: number;
}

interface UniBusContextValue {
  authReady: boolean;
  firebaseUser: FirebaseUser | null;
  emailNeedsVerification: boolean;
  firestoreSeeded: boolean;
  sessionClaims: ScopedSessionClaims | null;
  adminMfaVerified: boolean;
  adminMfaNeedsEnrollment: boolean;
  users: User[];
  buses: Bus[];
  routes: RouteInfo[];
  trips: Trip[];
  bookings: Booking[];
  reviews: Review[];
  stations: StationHub[];
  trafficReports: TrafficReport[];
  auditLogs: AuditLogEntry[];
  publicStats: PublicStats;
  currentUser: User | null;
  loginWithGoogle: (portal?: 'student' | 'admin') => Promise<{ ok: boolean; user?: User; needsMfa?: boolean; error?: string }>;
  loginWithEmail: (
    email: string,
    password: string,
    portal?: 'student' | 'admin'
  ) => Promise<{ ok: boolean; user?: User; needsMfa?: boolean; error?: string; errorCode?: string }>;
  signupWithEmail: (data: {
    name: string;
    email: string;
    password: string;
    homeCity: string;
    role?: string;
    isAdmin?: boolean;
    permissions?: string[];
  }) => Promise<{ ok: boolean; user?: User; error?: string; errorCode?: string }>;
  enrollAdminMfa: () => Promise<{ ok: boolean; secret?: string; otpauthUri?: string; enrolled?: boolean; error?: string }>;
  completeAdminMfa: (code: string) => Promise<{ ok: boolean; error?: string }>;
  createAdminInvite: (
    email: string,
    role: 'admin' | 'moderator'
  ) => Promise<{ ok: boolean; rawToken?: string; inviteUrl?: string; expiresAt?: string; error?: string }>;
  acceptAdminInvite: (data: {
    token: string;
    name: string;
    email: string;
    password: string;
  }) => Promise<{ ok: boolean; user?: User; needsMfa?: boolean; error?: string }>;
  resendVerificationEmail: () => Promise<{ ok: boolean; message: string }>;
  refreshAuthUser: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<Pick<User, 'name' | 'homeCity'>>) => Promise<void>;
  toggleUserStatus: (userId: string) => Promise<void>;
  setUserRole: (userId: string, nextRole: UserRole) => Promise<{ ok: boolean; error?: string }>;
  toggleUserRole: (userId: string) => Promise<{ ok: boolean; error?: string }>;
  deleteUserDataOnRequest: (userId: string) => Promise<{ ok: boolean; error?: string }>;
  bookTrip: (
    tripId: number,
    passengers: number,
    pickupNote?: string
  ) => Promise<{ ok: boolean; booking?: Booking; error?: string }>;
  cancelBooking: (bookingId: string) => Promise<void>;
  restoreBooking: (bookingId: string) => Promise<{ ok: boolean; error?: string }>;
  addReview: (routeLabel: string, rating: number, comment: string) => Promise<void>;
  addTrip: (data: Omit<Trip, 'id' | 'bookedSeats'>) => Promise<void>;
  updateTrip: (tripId: number, updates: Partial<Trip>) => Promise<void>;
  deleteTrip: (tripId: number) => Promise<void>;
  addBus: (data: Omit<Bus, 'id'>) => Promise<void>;
  toggleBusActive: (busId: string) => Promise<void>;
  addRoute: (data: Omit<RouteInfo, 'id'>) => Promise<void>;
  deleteRoute: (routeId: string) => Promise<void>;
  submitTrafficReport: (
    stationId: string,
    congestion: CongestionLevel,
    fareNote?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  resetDemoData: () => Promise<void>;
}

const UniBusContext = createContext<UniBusContextValue | null>(null);
const adminLoginLimiter = new LoginRateLimiter(5, 15 * 60 * 1000, 15 * 60 * 1000);
const crowdsourcingLimiter = new CrowdsourcingCooldownLimiter(15 * 60 * 1000);

function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export function UniBusProvider({ children }: { children: React.ReactNode }) {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [users, setUsers] = useState<User[]>(SEED_USERS);
  const [buses, setBuses] = useState<Bus[]>(SEED_BUSES);
  const [routes, setRoutes] = useState<RouteInfo[]>(SEED_ROUTES);
  const [trips, setTrips] = useState<Trip[]>(SEED_TRIPS);
  const [bookings, setBookings] = useState<Booking[]>(SEED_BOOKINGS);
  const [reviews, setReviews] = useState<Review[]>(SEED_REVIEWS);
  const [stations, setStations] = useState<StationHub[]>(SEED_STATIONS);
  const [trafficReports, setTrafficReports] = useState<TrafficReport[]>(SEED_TRAFFIC_REPORTS);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [sessionClaims, setSessionClaims] = useState<ScopedSessionClaims | null>(null);
  const [adminMfaVerified, setAdminMfaVerified] = useState(false);
  const [adminMfaNeedsEnrollment, setAdminMfaNeedsEnrollment] = useState(false);
  const [publicStats, setPublicStats] = useState<PublicStats>({
    studentCount: 4,
    bookingsCount: 9,
  });
  const [firestoreSeeded, setFirestoreSeeded] = useState(false);
  const lastDirKeyRef = useRef<string>('');
  const latestUserIdsRef = useRef<string[]>([]);
  const latestBookingIdsRef = useRef<string[]>([]);
  const latestAuditIdsRef = useRef<string[]>([]);

  const emailNeedsVerification = Boolean(firebaseUser && !firebaseUser.emailVerified);

  const writeAuditLog = async (
    action: string,
    targetPath: string,
    before?: string,
    after?: string,
    actorOverride?: Pick<User, 'uid' | 'email' | 'role'>
  ) => {
    const actor = actorOverride || currentUser;
    if (!actor || (actor.role !== 'admin' && actor.role !== 'moderator')) return;
    const id = `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entry: AuditLogEntry = {
      id,
      actorUid: actor.uid,
      actorEmail: actor.email,
      actorRole: actor.role,
      action,
      targetPath,
      ...(before !== undefined ? { before: before.slice(0, 400) } : {}),
      ...(after !== undefined ? { after: after.slice(0, 400) } : {}),
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'auditLogs', id), entry);
      setAuditLogs((prev) => [entry, ...prev]);
      try {
        await updateDoc(doc(db, 'adminMeta', 'directory'), {
          auditLogIds: arrayUnion(id),
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Ignore if directory not initialized yet
      }
    } catch {
      // Non-fatal if user is unverified in demo mode
    }
  };

  const syncAdminDirectory = async (userIds: string[], bookingIds: string[], auditLogIds: string[]) => {
    const sortedUsers = Array.from(new Set(userIds)).sort();
    const sortedBookings = Array.from(new Set(bookingIds)).sort();
    const sortedAudits = Array.from(new Set(auditLogIds)).sort();
    const key = `${sortedUsers.join(',')}|${sortedBookings.join(',')}|${sortedAudits.join(',')}`;
    if (!key || key === lastDirKeyRef.current) return;
    lastDirKeyRef.current = key;
    try {
      await setDoc(doc(db, 'adminMeta', 'directory'), {
        userIds: sortedUsers.slice(0, 500),
        bookingIds: sortedBookings.slice(0, 500),
        auditLogIds: sortedAudits.slice(0, 500),
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Ignore transient directory sync errors
    }
  };

  const seedFirestoreCatalog = async (force = false) => {
    try {
      const existingTrips = await getDocs(collection(db, 'trips'));
      if (!force && !existingTrips.empty) {
        setFirestoreSeeded(true);
        return;
      }

      const batch = writeBatch(db);
      SEED_BUSES.forEach((b) => batch.set(doc(db, 'buses', b.id), b));
      SEED_ROUTES.forEach((r) => batch.set(doc(db, 'routes', r.id), r));
      SEED_TRIPS.forEach((t) => batch.set(doc(db, 'trips', String(t.id)), t));
      SEED_STATIONS.forEach((s) => batch.set(doc(db, 'stations', s.id), s));
      SEED_REVIEWS.forEach((rev) => batch.set(doc(db, 'reviews', rev.id), rev));
      SEED_TRAFFIC_REPORTS.forEach((tr) => batch.set(doc(db, 'trafficReports', tr.id), tr));
      SEED_BOOKINGS.forEach((bk) => batch.set(doc(db, 'bookings', bk.id), bk));
      batch.set(doc(db, 'publicStats', 'summary'), {
        studentCount: 4,
        bookingsCount: 9,
        updatedAt: new Date().toISOString(),
      });
      batch.set(doc(db, 'adminMeta', 'directory'), {
        userIds: auth.currentUser ? [auth.currentUser.uid] : [],
        bookingIds: SEED_BOOKINGS.map((bk) => bk.id),
        updatedAt: new Date().toISOString(),
      });

      await batch.commit();
      setFirestoreSeeded(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'seed_catalog');
    }
  };

  const ensureUserDocument = async (fbUser: FirebaseUser, preferredName?: string, preferredCity?: string): Promise<User> => {
    const adminByEmail = isAdminEmail(fbUser.email);
    let adminByDoc = false;
    let adminDocRole: 'admin' | 'moderator' = 'admin';
    let mfaEnrolledFlag = false;

    try {
      const adminSnap = await getDoc(doc(db, 'admins', fbUser.uid));
      if (adminSnap.exists()) {
        adminByDoc = true;
        const adminData = adminSnap.data() as { role?: 'admin' | 'moderator'; mfaEnrolled?: boolean };
        adminDocRole = adminData.role === 'moderator' ? 'moderator' : 'admin';
        mfaEnrolledFlag = Boolean(adminData.mfaEnrolled);
      }
    } catch {
      adminByDoc = false;
    }

    const isElevated = adminByEmail || adminByDoc;
    const resolvedRole: UserRole = adminByEmail ? 'admin' : adminByDoc ? adminDocRole : 'student';

    if (isElevated) {
      let enrolled = mfaEnrolledFlag;
      let verified = false;
      try {
        const idToken = await fbUser.getIdToken();
        const res = await fetch('/api/mfa/status', {
          headers: { Authorization: `Bearer ${idToken}` },
          credentials: 'include',
        });
        if (res.ok) {
          const body = (await res.json()) as { enrolled?: boolean; verified?: boolean };
          enrolled = Boolean(body.enrolled);
          verified = Boolean(body.verified);
        }
      } catch {
        // Keep fail-closed default (verified = false) if server status unavailable
      }
      setAdminMfaNeedsEnrollment(!enrolled);
      setAdminMfaVerified(verified);
    } else {
      setAdminMfaNeedsEnrollment(false);
      setAdminMfaVerified(false);
    }

    const sanitizedStudent = sanitizeStudentRegistrationInput(
      {
        name: preferredName || fbUser.displayName || fbUser.email?.split('@')[0] || 'Student',
        email: fbUser.email || '',
        homeCity: preferredCity || 'Tanta',
      },
      fbUser.uid
    );

    const fallbackProfile: User = isElevated
      ? {
          ...sanitizedStudent,
          name: preferredName || fbUser.displayName || (adminByEmail ? 'Mohamed Alkawaity' : 'Staff Member'),
          role: resolvedRole,
          trustScore: 1.0,
        }
      : sanitizedStudent;

    try {
      const userRef = doc(db, 'users', fbUser.uid);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        const existingData = snap.data() as User;
        if (adminByEmail && fbUser.emailVerified && existingData.role !== 'admin') {
          await updateDoc(userRef, { role: 'admin', trustScore: 1.0 });
          await setDoc(
            doc(db, 'admins', fbUser.uid),
            {
              uid: fbUser.uid,
              email: fbUser.email || '',
              role: 'admin',
              mfaEnrolled: mfaEnrolledFlag,
              createdAt: new Date().toISOString(),
            },
            { merge: true }
          );
          return { ...existingData, role: 'admin', trustScore: 1.0 };
        }
        if (adminByEmail && fbUser.emailVerified) {
          await setDoc(
            doc(db, 'admins', fbUser.uid),
            {
              uid: fbUser.uid,
              email: fbUser.email || '',
              role: 'admin',
              mfaEnrolled: mfaEnrolledFlag,
              createdAt: existingData.createdAt || new Date().toISOString(),
            },
            { merge: true }
          );
          await seedFirestoreCatalog(false);
        } else if (adminByDoc && fbUser.emailVerified) {
          if (existingData.role !== adminDocRole) {
            await updateDoc(userRef, { role: adminDocRole, trustScore: 1.0 });
            await seedFirestoreCatalog(false);
            return { ...existingData, role: adminDocRole, trustScore: 1.0 };
          }
          await seedFirestoreCatalog(false);
        } else if ((existingData.role === 'admin' || existingData.role === 'moderator') && fbUser.emailVerified) {
          await seedFirestoreCatalog(false);
        }
        return existingData;
      }

      if (!isElevated || fbUser.emailVerified) {
        await setDoc(userRef, fallbackProfile);
        try {
          await updateDoc(doc(db, 'adminMeta', 'directory'), {
            userIds: arrayUnion(fbUser.uid),
            updatedAt: new Date().toISOString(),
          });
        } catch {
          // Directory may not exist before initial admin seed
        }
        if (isElevated && fbUser.emailVerified) {
          await setDoc(
            doc(db, 'admins', fbUser.uid),
            {
              uid: fbUser.uid,
              email: fbUser.email || '',
              role: resolvedRole,
              mfaEnrolled: mfaEnrolledFlag,
              createdAt: fallbackProfile.createdAt,
            },
            { merge: true }
          );
          await seedFirestoreCatalog(false);
        }
      }
      return fallbackProfile;
    } catch {
      return fallbackProfile;
    }
  };

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (fbUser) {
        const profile = await ensureUserDocument(fbUser);
        setCurrentUser(profile);
        const portal = profile.role === 'student' ? 'student' : 'admin';
        let mfaOk = false;
        if (profile.role !== 'student') {
          try {
            const idToken = await fbUser.getIdToken();
            const res = await fetch('/api/mfa/status', {
              headers: { Authorization: `Bearer ${idToken}` },
              credentials: 'include',
            });
            if (res.ok) {
              const body = (await res.json()) as { enrolled?: boolean; verified?: boolean };
              mfaOk = Boolean(body.verified);
              setAdminMfaNeedsEnrollment(!body.enrolled);
              setAdminMfaVerified(mfaOk);
            }
          } catch {
            mfaOk = false;
          }
        }
        const issued = issueScopedSessionClaims(profile, portal, mfaOk);
        setSessionClaims(issued.ok ? issued.claims : null);
      } else {
        setCurrentUser(null);
        setSessionClaims(null);
        setAdminMfaVerified(false);
        setAdminMfaNeedsEnrollment(false);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Public Firestore catalog listeners (non-PII collections)
  useEffect(() => {
    const unsubBuses = onSnapshot(
      collection(db, 'buses'),
      (snap) => {
        if (!snap.empty) {
          setBuses(snap.docs.map((d) => d.data() as Bus));
          setFirestoreSeeded(true);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'buses')
    );

    const unsubRoutes = onSnapshot(
      collection(db, 'routes'),
      (snap) => {
        if (!snap.empty) setRoutes(snap.docs.map((d) => d.data() as RouteInfo));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'routes')
    );

    const unsubTrips = onSnapshot(
      collection(db, 'trips'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => d.data() as Trip);
          list.sort((a, b) => a.id - b.id);
          setTrips(list);
          setFirestoreSeeded(true);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'trips')
    );

    const unsubStations = onSnapshot(
      collection(db, 'stations'),
      (snap) => {
        if (!snap.empty) setStations(snap.docs.map((d) => d.data() as StationHub));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'stations')
    );

    const unsubReviews = onSnapshot(
      collection(db, 'reviews'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => d.data() as Review);
          list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setReviews(list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'reviews')
    );

    const unsubTraffic = onSnapshot(
      collection(db, 'trafficReports'),
      (snap) => {
        if (!snap.empty) {
          const list = snap.docs.map((d) => d.data() as TrafficReport);
          list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setTrafficReports(list);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'trafficReports')
    );

    const unsubStats = onSnapshot(
      doc(db, 'publicStats', 'summary'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as PublicStats;
          setPublicStats({
            studentCount: data.studentCount ?? 4,
            bookingsCount: data.bookingsCount ?? 9,
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'publicStats/summary')
    );

    return () => {
      unsubBuses();
      unsubRoutes();
      unsubTrips();
      unsubStations();
      unsubReviews();
      unsubTraffic();
      unsubStats();
    };
  }, []);

  // Authenticated private Firestore listeners (users + bookings)
  useEffect(() => {
    if (!authReady || !firebaseUser) {
      setBookings(SEED_BOOKINGS);
      setUsers(SEED_USERS);
      return;
    }

    const isBootstrappedAdmin = Boolean(firebaseUser.emailVerified && isAdminEmail(firebaseUser.email));
    const isPromotedStaff = Boolean(
      firebaseUser.emailVerified &&
        !isBootstrappedAdmin &&
        (currentUser?.role === 'admin' || currentUser?.role === 'moderator')
    );

    if (isBootstrappedAdmin) {
      const unsubBookings = onSnapshot(
        collection(db, 'bookings'),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as Booking);
          list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setBookings(list);
          latestBookingIdsRef.current = list.map((b) => b.id);
          void syncAdminDirectory(
            latestUserIdsRef.current.length > 0 ? latestUserIdsRef.current : [firebaseUser.uid],
            latestBookingIdsRef.current,
            latestAuditIdsRef.current
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'bookings')
      );

      const unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as User);
          list.sort((a, b) => {
            if (a.role !== b.role) return a.role === 'admin' ? -1 : b.role === 'admin' ? 1 : a.role === 'moderator' ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
          if (list.length > 0) {
            setUsers(list);
            latestUserIdsRef.current = list.map((u) => u.uid);
            void syncAdminDirectory(latestUserIdsRef.current, latestBookingIdsRef.current, latestAuditIdsRef.current);
          }
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'users')
      );

      const unsubAudits = onSnapshot(
        collection(db, 'auditLogs'),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as AuditLogEntry);
          list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setAuditLogs(list);
          latestAuditIdsRef.current = list.map((l) => l.id);
          void syncAdminDirectory(
            latestUserIdsRef.current.length > 0 ? latestUserIdsRef.current : [firebaseUser.uid],
            latestBookingIdsRef.current,
            latestAuditIdsRef.current
          );
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'auditLogs')
      );

      return () => {
        unsubBookings();
        unsubUsers();
        unsubAudits();
      };
    }

    if (isPromotedStaff) {
      let fallbackUnsub = () => {};
      const unsubSelf = onSnapshot(
        doc(db, 'users', firebaseUser.uid),
        (snap) => {
          if (snap.exists()) {
            const u = snap.data() as User;
            setCurrentUser(u);
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`)
      );

      const unsubDirectory = onSnapshot(
        doc(db, 'adminMeta', 'directory'),
        async (dirSnap) => {
          if (!dirSnap.exists()) {
            fallbackUnsub();
            fallbackUnsub = onSnapshot(
              query(collection(db, 'bookings'), where('userId', '==', firebaseUser.uid)),
              (snap) => {
                const list = snap.docs.map((d) => d.data() as Booking);
                list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
                setBookings(list);
              },
              (err) => handleFirestoreError(err, OperationType.LIST, 'bookings')
            );
            return;
          }

          fallbackUnsub();
          fallbackUnsub = () => {};
          const data = dirSnap.data() as { userIds?: string[]; bookingIds?: string[]; auditLogIds?: string[] };
          const userIds = Array.from(new Set([...(data.userIds || []), firebaseUser.uid]));
          const bookingIds = Array.from(new Set(data.bookingIds || []));
          const auditIds = currentUser?.role === 'admin' ? Array.from(new Set(data.auditLogIds || [])) : [];

          const [userSnaps, bookingSnaps, auditSnaps] = await Promise.all([
            Promise.all(userIds.map((uid) => getDoc(doc(db, 'users', uid)).catch(() => null))),
            Promise.all(bookingIds.map((id) => getDoc(doc(db, 'bookings', id)).catch(() => null))),
            Promise.all(auditIds.map((id) => getDoc(doc(db, 'auditLogs', id)).catch(() => null))),
          ]);

          const loadedUsers = userSnaps
            .filter((s): s is NonNullable<typeof s> => Boolean(s && s.exists()))
            .map((s) => s.data() as User)
            .sort((a, b) => {
              if (a.role !== b.role) return a.role === 'admin' ? -1 : b.role === 'admin' ? 1 : a.role === 'moderator' ? -1 : 1;
              return a.name.localeCompare(b.name);
            });
          if (loadedUsers.length > 0) setUsers(loadedUsers);

          const loadedBookings = bookingSnaps
            .filter((s): s is NonNullable<typeof s> => Boolean(s && s.exists()))
            .map((s) => s.data() as Booking)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setBookings(loadedBookings);

          const loadedAudits = auditSnaps
            .filter((s): s is NonNullable<typeof s> => Boolean(s && s.exists()))
            .map((s) => s.data() as AuditLogEntry)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          setAuditLogs(loadedAudits);
        },
        (err) => handleFirestoreError(err, OperationType.GET, 'adminMeta/directory')
      );

      return () => {
        unsubSelf();
        unsubDirectory();
        fallbackUnsub();
      };
    }

    const unsubBookings = onSnapshot(
      query(collection(db, 'bookings'), where('userId', '==', firebaseUser.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as Booking);
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setBookings(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bookings')
    );

    const unsubUsers = onSnapshot(
      doc(db, 'users', firebaseUser.uid),
      (snap) => {
        if (snap.exists()) {
          const u = snap.data() as User;
          setCurrentUser(u);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`)
    );

    return () => {
      unsubBookings();
      unsubUsers();
    };
  }, [authReady, firebaseUser, currentUser?.role]);

  const fetchServerMfaStatus = async (fbUser: FirebaseUser): Promise<{ enrolled: boolean; verified: boolean }> => {
    try {
      const idToken = await fbUser.getIdToken();
      const res = await fetch('/api/mfa/status', {
        headers: { Authorization: `Bearer ${idToken}` },
        credentials: 'include',
      });
      if (res.ok) {
        const body = (await res.json()) as { enrolled?: boolean; verified?: boolean };
        return { enrolled: Boolean(body.enrolled), verified: Boolean(body.verified) };
      }
    } catch {
      // Fail-closed
    }
    return { enrolled: false, verified: false };
  };

  const loginWithGoogle = async (portal: 'student' | 'admin' = 'student') => {
    try {
      const res = await signInWithPopup(auth, googleProvider);
      const profile = await ensureUserDocument(res.user);
      const issued = issueScopedSessionClaims(profile, portal, false);
      if (!issued.ok) {
        await signOut(auth);
        setCurrentUser(null);
        setSessionClaims(null);
        return { ok: false, error: issued.error };
      }

      setCurrentUser(profile);
      setSessionClaims(issued.claims);
      if (portal === 'admin') {
        const mfaState = await fetchServerMfaStatus(res.user);
        setAdminMfaNeedsEnrollment(!mfaState.enrolled);
        setAdminMfaVerified(mfaState.verified);
        return { ok: true, user: profile, needsMfa: !mfaState.verified };
      }
      return { ok: true, user: profile };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      return { ok: false, error: msg };
    }
  };

  const loginWithEmail = async (email: string, password: string, portal: 'student' | 'admin' = 'student') => {
    const cleanEmail = email.trim().toLowerCase();

    if (portal === 'admin') {
      const limitCheck = adminLoginLimiter.check(cleanEmail);
      if (!limitCheck.allowed) {
        return {
          ok: false,
          errorCode: 'rate-limited',
          error: `Too many failed login attempts. Account temporarily locked for ${Math.ceil(limitCheck.retryAfterSec / 60)} min.`,
        };
      }
      try {
        const guardRes = await fetch('/api/admin/login-guard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, outcome: 'check' }),
        });
        if (guardRes.status === 429) {
          const data = (await guardRes.json()) as { retryAfterSec?: number };
          return {
            ok: false,
            errorCode: 'rate-limited',
            error: `Too many failed login attempts. Locked for ${Math.ceil((data.retryAfterSec || 900) / 60)} min.`,
          };
        }
      } catch {
        // Fallback to local limiter if offline
      }
    }

    try {
      const res = await signInWithEmailAndPassword(auth, cleanEmail, password);
      const profile = await ensureUserDocument(res.user);
      const issued = issueScopedSessionClaims(profile, portal, false);

      if (!issued.ok) {
        await signOut(auth);
        setCurrentUser(null);
        setSessionClaims(null);
        return { ok: false, error: issued.error };
      }

      if (portal === 'admin') {
        adminLoginLimiter.reset(cleanEmail);
        void fetch('/api/admin/login-guard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, outcome: 'success' }),
        }).catch(() => {});
        const mfaState = await fetchServerMfaStatus(res.user);
        setCurrentUser(profile);
        setSessionClaims(issued.claims);
        setAdminMfaNeedsEnrollment(!mfaState.enrolled);
        setAdminMfaVerified(mfaState.verified);
        return { ok: true, user: profile, needsMfa: !mfaState.verified };
      }

      setCurrentUser(profile);
      setSessionClaims(issued.claims);
      return { ok: true, user: profile };
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (portal === 'admin') {
        const failInfo = adminLoginLimiter.recordFailure(cleanEmail);
        try {
          await fetch('/api/admin/login-guard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, outcome: 'failure' }),
          });
        } catch {
          // Ignore network error
        }
        if (failInfo.locked) {
          return {
            ok: false,
            errorCode: 'rate-limited',
            error: 'Account locked for 15 minutes after 5 failed admin login attempts.',
          };
        }
        return {
          ok: false,
          errorCode: code,
          error: `Invalid staff credentials (${failInfo.remainingAttempts} attempts remaining before lockout).`,
        };
      }

      if (code === 'auth/operation-not-allowed') {
        return {
          ok: false,
          errorCode: 'operation-not-allowed',
          error: 'Email/Password sign-in is not enabled yet in Firebase Console.',
        };
      }
      return {
        ok: false,
        errorCode: code,
        error: 'Invalid email or password. Or use Continue with Google.',
      };
    }
  };

  const signupWithEmail = async (data: {
    name: string;
    email: string;
    password: string;
    homeCity: string;
    role?: string;
    isAdmin?: boolean;
    permissions?: string[];
  }) => {
    // Mass-assignment guard: strictly ignore any role, isAdmin, or permissions sent by client
    const cleanInput = sanitizeStudentRegistrationInput(data as unknown as Record<string, unknown>, 'pending');
    try {
      const res = await createUserWithEmailAndPassword(auth, cleanInput.email, data.password);
      await updateFirebaseProfile(res.user, { displayName: cleanInput.name });
      await sendEmailVerification(res.user);
      const profile = await ensureUserDocument(res.user, cleanInput.name, cleanInput.homeCity);
      const issued = issueScopedSessionClaims(profile, 'student', false);
      setCurrentUser(profile);
      setSessionClaims(issued.ok ? issued.claims : null);
      return { ok: true, user: profile };
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        return {
          ok: false,
          errorCode: 'operation-not-allowed',
          error: 'Email/Password sign-up is not enabled yet in Firebase Console. Use Continue with Google.',
        };
      }
      return {
        ok: false,
        errorCode: code,
        error: err instanceof Error ? err.message : 'Sign up failed.',
      };
    }
  };

  const enrollAdminMfa = async (): Promise<{
    ok: boolean;
    secret?: string;
    otpauthUri?: string;
    enrolled?: boolean;
    error?: string;
  }> => {
    if (!firebaseUser || !currentUser || currentUser.role === 'student') {
      return { ok: false, error: 'Active staff session required.' };
    }
    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/mfa/enroll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        credentials: 'include',
      });
      const body = (await res.json()) as {
        enrolled?: boolean;
        secret?: string;
        otpauthUri?: string;
        error?: string;
      };
      if (res.status === 409 && body.enrolled) {
        setAdminMfaNeedsEnrollment(false);
        return { ok: true, enrolled: true };
      }
      if (!res.ok) {
        return { ok: false, error: body.error || 'Could not initialize TOTP MFA.' };
      }
      return {
        ok: true,
        enrolled: false,
        secret: body.secret,
        otpauthUri: body.otpauthUri,
      };
    } catch {
      return { ok: false, error: 'MFA enrollment server unreachable.' };
    }
  };

  const completeAdminMfa = async (code: string): Promise<{ ok: boolean; error?: string }> => {
    const clean = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(clean)) {
      return { ok: false, error: 'Enter a valid 6-digit TOTP verification code.' };
    }
    if (!firebaseUser || !currentUser || currentUser.role === 'student') {
      return { ok: false, error: 'Active staff session required.' };
    }

    try {
      const idToken = await firebaseUser.getIdToken();
      const res = await fetch('/api/mfa/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        credentials: 'include',
        body: JSON.stringify({ token: clean }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        return { ok: false, error: body.error || 'Invalid or expired TOTP code.' };
      }
    } catch {
      return { ok: false, error: 'Could not reach server MFA verifier.' };
    }

    try {
      await setDoc(doc(db, 'admins', firebaseUser.uid), { mfaEnrolled: true }, { merge: true });
    } catch {
      // Non-fatal if user email verification is still pending
    }

    setAdminMfaNeedsEnrollment(false);
    setAdminMfaVerified(true);
    setSessionClaims({
      sub: currentUser.uid,
      email: currentUser.email,
      role: currentUser.role,
      aud: 'unibus-admin',
      mfaVerified: true,
    });
    await writeAuditLog('ADMIN_MFA_VERIFIED', `admins/${firebaseUser.uid}`);
    return { ok: true };
  };

  const createAdminInvite = async (
    email: string,
    role: 'admin' | 'moderator'
  ): Promise<{ ok: boolean; rawToken?: string; inviteUrl?: string; expiresAt?: string; error?: string }> => {
    if (!currentUser || currentUser.role !== 'admin') {
      return { ok: false, error: 'Only administrators can issue staff invitations.' };
    }
    if (!firebaseUser?.emailVerified) {
      return { ok: false, error: 'Verify your email before issuing invitations.' };
    }
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { ok: false, error: 'Enter a valid email address.' };
    }

    const rawToken = generateInviteToken();
    const tokenHash = await hashInviteToken(rawToken);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const invite: AdminInvite = {
      id: tokenHash,
      tokenHash,
      email: cleanEmail,
      role,
      createdByUid: currentUser.uid,
      createdByEmail: currentUser.email,
      createdAt,
      expiresAt,
      usedAt: null,
    };

    try {
      await setDoc(doc(db, 'adminInvites', tokenHash), invite);
      await writeAuditLog('ADMIN_INVITE_CREATED', `adminInvites/${tokenHash}`, undefined, `${cleanEmail} (${role})`);
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      return {
        ok: true,
        rawToken,
        inviteUrl: `${origin}/admin/accept-invite?token=${rawToken}`,
        expiresAt,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `adminInvites/${tokenHash}`);
      return { ok: false, error: 'Could not create invitation.' };
    }
  };

  const acceptAdminInvite = async (data: {
    token: string;
    name: string;
    email: string;
    password: string;
  }): Promise<{ ok: boolean; user?: User; needsMfa?: boolean; error?: string }> => {
    const cleanEmail = data.email.trim().toLowerCase();
    const strengthErr = validateAdminPasswordStrength(data.password);
    if (strengthErr) return { ok: false, error: strengthErr };
    if (!data.name.trim()) return { ok: false, error: 'Full name is required.' };

    try {
      const cred = await createUserWithEmailAndPassword(auth, cleanEmail, data.password);
      await updateFirebaseProfile(cred.user, { displayName: data.name.trim() });
      await sendEmailVerification(cred.user);

      const tokenHash = await hashInviteToken(data.token);
      const inviteRef = doc(db, 'adminInvites', tokenHash);
      const inviteSnap = await getDoc(inviteRef);
      const inviteData = inviteSnap.exists() ? (inviteSnap.data() as AdminInvite) : null;

      const check = validateInviteConsumption(inviteData, cleanEmail);
      if (!check.ok || !inviteData) {
        await signOut(auth);
        return { ok: false, error: check.ok ? 'Invalid invite.' : check.error };
      }

      const now = new Date().toISOString();
      const staffUser: User = {
        uid: cred.user.uid,
        name: data.name.trim(),
        email: cleanEmail,
        role: inviteData.role,
        homeCity: 'Tanta',
        trustScore: 1.0,
        status: 'Active',
        createdAt: now,
      };

      const batch = writeBatch(db);
      batch.update(inviteRef, { usedAt: now });
      batch.set(doc(db, 'admins', cred.user.uid), {
        uid: cred.user.uid,
        email: cleanEmail,
        role: inviteData.role,
        mfaEnrolled: false,
        inviteTokenHash: tokenHash,
        createdAt: now,
      });
      batch.set(doc(db, 'users', cred.user.uid), staffUser);
      await batch.commit();

      setCurrentUser(staffUser);
      setAdminMfaNeedsEnrollment(true);
      setAdminMfaVerified(false);
      setSessionClaims({
        sub: staffUser.uid,
        email: staffUser.email,
        role: staffUser.role,
        aud: 'unibus-admin',
        mfaVerified: false,
      });
      return { ok: true, user: staffUser, needsMfa: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to accept invitation.',
      };
    }
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) return { ok: false, message: 'Not signed in.' };
    try {
      await sendEmailVerification(auth.currentUser);
      return { ok: true, message: `Verification email sent to ${auth.currentUser.email}.` };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Could not send email.' };
    }
  };

  const refreshAuthUser = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    const refreshed = auth.currentUser;
    setFirebaseUser(refreshed);
    const profile = await ensureUserDocument(refreshed);
    setCurrentUser(profile);
  };

  const logout = async () => {
    await signOut(auth);
    try {
      await fetch('/api/mfa/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Ignore network errors
    }
    setCurrentUser(null);
    setSessionClaims(null);
    setAdminMfaVerified(false);
    setAdminMfaNeedsEnrollment(false);
  };

  const updateProfile = async (updates: Partial<Pick<User, 'name' | 'homeCity'>>) => {
    if (!currentUser) return;
    const path = `users/${currentUser.uid}`;
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), updates);
      setCurrentUser((prev) => (prev ? { ...prev, ...updates } : prev));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  };

  const toggleUserStatus = async (userId: string) => {
    if (!currentUser || currentUser.role !== 'admin') return;
    const target = users.find((u) => u.uid === userId);
    if (!target) return;
    const nextStatus = target.status === 'Active' ? 'Suspended' : 'Active';
    try {
      await updateDoc(doc(db, 'users', userId), { status: nextStatus });
      setUsers((prev) => prev.map((u) => (u.uid === userId ? { ...u, status: nextStatus } : u)));
      await writeAuditLog('USER_STATUS_CHANGE', `users/${userId}`, target.status, nextStatus);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const setUserRole = async (userId: string, nextRole: UserRole): Promise<{ ok: boolean; error?: string }> => {
    const target = users.find((u) => u.uid === userId);
    if (!target) return { ok: false, error: 'User not found.' };
    if (!currentUser) return { ok: false, error: 'Authentication required.' };
    if (!firebaseUser?.emailVerified) {
      return { ok: false, error: 'Verify your email first to manage staff roles.' };
    }

    const validation = validateRoleChange(currentUser, target, nextRole, users, ADMIN_EMAILS);
    if (!validation.ok) {
      return validation;
    }

    if (target.role === nextRole) {
      return { ok: true };
    }

    const nextTrust = nextRole !== 'student' ? 1.0 : target.trustScore;

    try {
      const userRef = doc(db, 'users', userId);
      const adminRef = doc(db, 'admins', userId);
      const existingSnap = await getDoc(userRef);

      const batch = writeBatch(db);
      if (existingSnap.exists()) {
        batch.update(userRef, { role: nextRole, trustScore: nextTrust });
      } else {
        batch.set(userRef, {
          ...target,
          role: nextRole,
          trustScore: nextTrust,
        });
      }

      if (nextRole === 'admin' || nextRole === 'moderator') {
        batch.set(
          adminRef,
          {
            uid: userId,
            email: target.email,
            role: nextRole,
            mfaEnrolled: false,
            createdAt: new Date().toISOString(),
          },
          { merge: true }
        );
      } else {
        batch.delete(adminRef);
      }

      await batch.commit();
      setUsers((prev) =>
        prev.map((u) => (u.uid === userId ? { ...u, role: nextRole, trustScore: nextTrust } : u))
      );
      await writeAuditLog('USER_ROLE_CHANGE', `users/${userId}`, target.role, nextRole);
      try {
        await updateDoc(doc(db, 'adminMeta', 'directory'), {
          userIds: arrayUnion(userId),
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Best effort sync
      }
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${userId}`);
      return { ok: false, error: 'Could not update user role.' };
    }
  };

  const toggleUserRole = async (userId: string): Promise<{ ok: boolean; error?: string }> => {
    const target = users.find((u) => u.uid === userId);
    if (!target) return { ok: false, error: 'User not found.' };
    const nextRole: UserRole = target.role === 'admin' ? 'student' : 'admin';
    return setUserRole(userId, nextRole);
  };

  const deleteUserDataOnRequest = async (userId: string): Promise<{ ok: boolean; error?: string }> => {
    const target = users.find((u) => u.uid === userId);
    if (!target) return { ok: false, error: 'User not found.' };
    if (!currentUser) return { ok: false, error: 'Authentication required.' };
    if (!firebaseUser?.emailVerified) {
      return { ok: false, error: 'Verify your email before deleting user data.' };
    }

    const guard = validateUserDataDeletion(currentUser, target, ADMIN_EMAILS);
    if (!guard.ok) return guard;

    try {
      const [userBookingsSnap, userReviewsSnap, userReportsSnap] = await Promise.all([
        getDocs(query(collection(db, 'bookings'), where('userId', '==', userId))),
        getDocs(query(collection(db, 'reviews'), where('userId', '==', userId))),
        getDocs(query(collection(db, 'trafficReports'), where('userId', '==', userId))),
      ]);

      const batch = writeBatch(db);
      userBookingsSnap.docs.forEach((d) => batch.delete(d.ref));
      userReviewsSnap.docs.forEach((d) => batch.delete(d.ref));
      userReportsSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, 'admins', userId));
      batch.delete(doc(db, 'users', userId));
      await batch.commit();

      try {
        await updateDoc(doc(db, 'adminMeta', 'directory'), {
          userIds: arrayRemove(userId),
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Best-effort directory cleanup
      }

      setUsers((prev) => prev.filter((u) => u.uid !== userId));
      setBookings((prev) => prev.filter((b) => b.userId !== userId));
      setReviews((prev) => prev.filter((r) => r.userId !== userId));
      setTrafficReports((prev) => prev.filter((tr) => tr.userId !== userId));

      await writeAuditLog(
        'USER_DATA_DELETED',
        `users/${userId}`,
        `${target.email} (${target.role})`,
        'erased_on_request'
      );
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${userId}`);
      return { ok: false, error: 'Failed to delete user data.' };
    }
  };

  const bookTrip = async (tripId: number, passengers: number, pickupNote?: string) => {
    if (!currentUser) return { ok: false, error: 'Please log in to book a trip.' };
    const trip = trips.find((t) => t.id === tripId);
    if (!trip || trip.status !== 'Active') return { ok: false, error: 'Trip is no longer active.' };
    if (trip.freeSeats < passengers) return { ok: false, error: `Only ${trip.freeSeats} seats left.` };

    const route = routes.find((r) => r.id === trip.routeId);
    const routeLabel = route ? `${route.from} → ${route.to}` : 'Sabrabay Route';
    const bookingId = `bk-${Date.now()}`;
    const booking: Booking = {
      id: bookingId,
      reference: `UB-${Math.floor(1000 + Math.random() * 9000)}`,
      tripId,
      userId: currentUser.uid,
      userName: currentUser.name,
      routeLabel,
      passengers,
      totalEgp: trip.priceEgp * passengers,
      status: 'Confirmed',
      createdAt: new Date().toISOString(),
      ...(pickupNote?.trim() ? { pickupNote: pickupNote.trim() } : {}),
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'bookings', bookingId), booking);
      batch.update(doc(db, 'trips', String(tripId)), {
        freeSeats: trip.freeSeats - passengers,
        bookedSeats: trip.bookedSeats + passengers,
      });
      batch.set(
        doc(db, 'publicStats', 'summary'),
        {
          studentCount: publicStats.studentCount,
          bookingsCount: publicStats.bookingsCount + 1,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      await batch.commit();
      try {
        await updateDoc(doc(db, 'adminMeta', 'directory'), {
          bookingIds: arrayUnion(bookingId),
          updatedAt: new Date().toISOString(),
        });
      } catch {
        // Directory will sync via admin snapshot
      }
      return { ok: true, booking };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `bookings/${bookingId}`);
    }
  };

  const cancelBooking = async (bookingId: string) => {
    const target = bookings.find((b) => b.id === bookingId);
    if (!target || target.status === 'Cancelled') return;
    const trip = trips.find((t) => t.id === target.tripId);

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'bookings', bookingId), { status: 'Cancelled' });
      if (trip) {
        batch.update(doc(db, 'trips', String(trip.id)), {
          freeSeats: trip.freeSeats + target.passengers,
          bookedSeats: Math.max(0, trip.bookedSeats - target.passengers),
        });
      }
      await batch.commit();
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: 'Cancelled' } : b))
      );
      if (currentUser && currentUser.role !== 'student') {
        await writeAuditLog('BOOKING_CANCELLED', `bookings/${bookingId}`, 'Confirmed', 'Cancelled');
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${bookingId}`);
    }
  };

  const restoreBooking = async (bookingId: string) => {
    const target = bookings.find((b) => b.id === bookingId);
    if (!target || target.status === 'Confirmed') return { ok: false, error: 'Already confirmed.' };
    const trip = trips.find((t) => t.id === target.tripId);
    if (!trip || trip.freeSeats < target.passengers) {
      return { ok: false, error: 'Not enough seats remaining on this departure.' };
    }

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'bookings', bookingId), { status: 'Confirmed' });
      batch.update(doc(db, 'trips', String(trip.id)), {
        freeSeats: trip.freeSeats - target.passengers,
        bookedSeats: trip.bookedSeats + target.passengers,
      });
      await batch.commit();
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: 'Confirmed' } : b))
      );
      if (currentUser && currentUser.role !== 'student') {
        await writeAuditLog('BOOKING_RESTORED', `bookings/${bookingId}`, 'Cancelled', 'Confirmed');
      }
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${bookingId}`);
    }
  };

  const addReview = async (routeLabel: string, rating: number, comment: string) => {
    if (!currentUser) return;
    const id = `rev-${Date.now()}`;
    const rev: Review = {
      id,
      userId: currentUser.uid,
      userName: currentUser.name,
      routeLabel,
      rating,
      comment: comment.trim(),
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'reviews', id), rev);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `reviews/${id}`);
    }
  };

  const addTrip = async (data: Omit<Trip, 'id' | 'bookedSeats'>) => {
    const maxId = trips.reduce((m, t) => Math.max(m, t.id), 20);
    const nextId = maxId + 1;
    const nextTrip: Trip = { ...data, id: nextId, bookedSeats: 0 };
    try {
      await setDoc(doc(db, 'trips', String(nextId)), nextTrip);
      await writeAuditLog('TRIP_CREATED', `trips/${nextId}`, undefined, `${data.routeId} ${data.date} ${data.departureTime}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `trips/${nextId}`);
    }
  };

  const updateTrip = async (tripId: number, updates: Partial<Trip>) => {
    try {
      await updateDoc(doc(db, 'trips', String(tripId)), updates);
      await writeAuditLog('TRIP_UPDATED', `trips/${tripId}`, undefined, JSON.stringify(updates));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `trips/${tripId}`);
    }
  };

  const deleteTrip = async (tripId: number) => {
    try {
      await deleteDoc(doc(db, 'trips', String(tripId)));
      await writeAuditLog('TRIP_DELETED', `trips/${tripId}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `trips/${tripId}`);
    }
  };

  const addBus = async (data: Omit<Bus, 'id'>) => {
    const id = `b-${Date.now()}`;
    try {
      await setDoc(doc(db, 'buses', id), { ...data, id });
      await writeAuditLog('BUS_CREATED', `buses/${id}`, undefined, `${data.name} (${data.category})`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `buses/${id}`);
    }
  };

  const toggleBusActive = async (busId: string) => {
    const target = buses.find((b) => b.id === busId);
    if (!target) return;
    try {
      await updateDoc(doc(db, 'buses', busId), { active: !target.active });
      await writeAuditLog('BUS_STATUS_CHANGE', `buses/${busId}`, String(target.active), String(!target.active));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `buses/${busId}`);
    }
  };

  const addRoute = async (data: Omit<RouteInfo, 'id'>) => {
    const id = `r-${Date.now()}`;
    try {
      await setDoc(doc(db, 'routes', id), { ...data, id });
      await writeAuditLog('ROUTE_CREATED', `routes/${id}`, undefined, `${data.from} -> ${data.to}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `routes/${id}`);
    }
  };

  const deleteRoute = async (routeId: string) => {
    try {
      await deleteDoc(doc(db, 'routes', routeId));
      await writeAuditLog('ROUTE_DELETED', `routes/${routeId}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `routes/${routeId}`);
    }
  };

  const submitTrafficReport = async (
    stationId: string,
    congestion: CongestionLevel,
    fareNote?: string
  ): Promise<{ ok: boolean; error?: string }> => {
    const station = stations.find((s) => s.id === stationId);
    if (!station || !currentUser || !firebaseUser) {
      return { ok: false, error: 'Sign in with a verified university account to report congestion.' };
    }

    const localCheck = crowdsourcingLimiter.canSubmit(currentUser.uid, stationId);
    if (!localCheck.allowed) {
      const mins = Math.max(1, Math.ceil(localCheck.retryAfterSec / 60));
      return {
        ok: false,
        error: `Per-user cooldown active for ${station.name}. Try again in ~${mins} min.`,
      };
    }

    try {
      const idToken = await firebaseUser.getIdToken();
      const guardRes = await fetch('/api/reports/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ stationId, congestion, fareNote }),
      });
      if (!guardRes.ok) {
        const body = (await guardRes.json()) as { error?: string };
        return { ok: false, error: body.error || 'Report blocked by anti-spam cooldown.' };
      }
    } catch {
      // Proceed with local per-user per-corridor check if server unreachable
    }

    const reportId = `tr-${Date.now()}`;
    const report: TrafficReport = {
      id: reportId,
      stationId,
      stationName: station.name,
      userId: currentUser.uid,
      userName: currentUser.name,
      congestion,
      ...(fareNote?.trim() ? { fareNote: fareNote.trim().slice(0, 200) } : {}),
      createdAt: new Date().toISOString(),
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'trafficReports', reportId), report);
      batch.update(doc(db, 'stations', stationId), {
        congestion,
        lastUpdated: 'Just now',
      });
      if (firebaseUser.emailVerified) {
        batch.update(doc(db, 'users', currentUser.uid), {
          trustScore: Math.min(1, Number((currentUser.trustScore + 0.05).toFixed(2))),
        });
      }
      await batch.commit();
      crowdsourcingLimiter.recordReport(currentUser.uid, stationId);
      return { ok: true };
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `trafficReports/${reportId}`);
      return { ok: false, error: 'Could not save report.' };
    }
  };

  const resetDemoData = async () => {
    await seedFirestoreCatalog(true);
  };

  return (
    <UniBusContext.Provider
      value={{
        authReady,
        firebaseUser,
        emailNeedsVerification,
        firestoreSeeded,
        sessionClaims,
        adminMfaVerified,
        adminMfaNeedsEnrollment,
        users,
        buses,
        routes,
        trips,
        bookings,
        reviews,
        stations,
        trafficReports,
        auditLogs,
        publicStats,
        currentUser,
        loginWithGoogle,
        loginWithEmail,
        signupWithEmail,
        enrollAdminMfa,
        completeAdminMfa,
        createAdminInvite,
        acceptAdminInvite,
        resendVerificationEmail,
        refreshAuthUser,
        logout,
        updateProfile,
        toggleUserStatus,
        setUserRole,
        toggleUserRole,
        deleteUserDataOnRequest,
        bookTrip,
        cancelBooking,
        restoreBooking,
        addReview,
        addTrip,
        updateTrip,
        deleteTrip,
        addBus,
        toggleBusActive,
        addRoute,
        deleteRoute,
        submitTrafficReport,
        resetDemoData,
      }}
    >
      {children}
    </UniBusContext.Provider>
  );
}

export function useUniBus() {
  const ctx = useContext(UniBusContext);
  if (!ctx) throw new Error('useUniBus must be used inside UniBusProvider');
  return ctx;
}
