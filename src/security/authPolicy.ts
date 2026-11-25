import type { AdminInvite, User, UserRole } from '../types/unibus.ts';

export type SessionAudience = 'unibus-student' | 'unibus-admin';

export interface ScopedSessionClaims {
  sub: string;
  email: string;
  role: UserRole;
  aud: SessionAudience;
  mfaVerified: boolean;
}

/**
 * Prevents Mass Assignment on public student registration:
 * ignores any client-supplied role, isAdmin, permissions, trustScore, or status.
 */
export function sanitizeStudentRegistrationInput(
  rawPayload: Record<string, unknown>,
  uid: string,
  nowIso = new Date().toISOString()
): User {
  const name = typeof rawPayload.name === 'string' && rawPayload.name.trim()
    ? rawPayload.name.trim().slice(0, 80)
    : 'Student';
  const email = typeof rawPayload.email === 'string'
    ? rawPayload.email.trim().toLowerCase().slice(0, 150)
    : '';
  const homeCity = typeof rawPayload.homeCity === 'string' && rawPayload.homeCity.trim()
    ? rawPayload.homeCity.trim().slice(0, 60)
    : 'Tanta';

  return {
    uid,
    name,
    email,
    role: 'student',
    homeCity,
    trustScore: 0.5,
    status: 'Active',
    createdAt: nowIso,
  };
}

/**
 * Issues strictly scoped session claims for either the Student portal or Admin/Moderator portal.
 * Cross-portal login is rejected at claim-issuance time.
 */
export function issueScopedSessionClaims(
  user: Pick<User, 'uid' | 'email' | 'role'>,
  portal: 'student' | 'admin',
  mfaVerified = false
): { ok: true; claims: ScopedSessionClaims } | { ok: false; error: string } {
  if (portal === 'student') {
    if (user.role !== 'student') {
      return {
        ok: false,
        error: 'Admins and moderators must sign in through the dedicated Admin Portal (/admin/login).',
      };
    }
    return {
      ok: true,
      claims: {
        sub: user.uid,
        email: user.email,
        role: 'student',
        aud: 'unibus-student',
        mfaVerified: false,
      },
    };
  }

  if (user.role !== 'admin' && user.role !== 'moderator') {
    return {
      ok: false,
      error: 'Access denied: student accounts cannot access the Admin/Moderator portal.',
    };
  }

  return {
    ok: true,
    claims: {
      sub: user.uid,
      email: user.email,
      role: user.role,
      aud: 'unibus-admin',
      mfaVerified,
    },
  };
}

/**
 * Server-side / endpoint guard verifying both token audience and RBAC role.
 */
export function verifySessionAccess(
  claims: ScopedSessionClaims | null,
  requiredAudience: SessionAudience,
  allowedRoles: UserRole[]
): { ok: true } | { ok: false; status: 401 | 403; error: string } {
  if (!claims) {
    return { ok: false, status: 401, error: 'Authentication required.' };
  }
  if (claims.aud !== requiredAudience) {
    return {
      ok: false,
      status: 403,
      error: `Invalid token audience '${claims.aud}' for '${requiredAudience}' endpoint.`,
    };
  }
  if (!allowedRoles.includes(claims.role)) {
    return {
      ok: false,
      status: 403,
      error: `Role '${claims.role}' is not permitted to perform this action.`,
    };
  }
  if (requiredAudience === 'unibus-admin' && !claims.mfaVerified) {
    return {
      ok: false,
      status: 403,
      error: 'MFA verification is required for admin/moderator sessions.',
    };
  }
  return { ok: true };
}

/**
 * Cryptographic SHA-256 hashing of invite tokens so raw tokens are never stored in Firestore/DB.
 */
export async function hashInviteToken(rawToken: string): Promise<string> {
  const bytes = new TextEncoder().encode(rawToken.trim());
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateInviteToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Validates single-use, non-expired, email-bound admin/moderator invitation tokens.
 */
export function validateInviteConsumption(
  invite: AdminInvite | null,
  acceptingEmail: string,
  nowMs = Date.now()
): { ok: true } | { ok: false; error: string } {
  if (!invite) {
    return { ok: false, error: 'Invitation token is invalid or does not exist.' };
  }
  if (invite.usedAt !== null) {
    return { ok: false, error: 'Invitation token has already been used.' };
  }
  if (nowMs >= new Date(invite.expiresAt).getTime()) {
    return { ok: false, error: 'Invitation token has expired.' };
  }
  if (invite.email.trim().toLowerCase() !== acceptingEmail.trim().toLowerCase()) {
    return { ok: false, error: 'Invitation token does not match this email address.' };
  }
  return { ok: true };
}

/**
 * Prevents privilege escalation: only admins may change roles,
 * blocks self-promotion/self-change, and blocks demoting the last remaining admin.
 */
export function validateRoleChange(
  actor: Pick<User, 'uid' | 'role'>,
  target: Pick<User, 'uid' | 'email' | 'role'>,
  nextRole: UserRole,
  allUsers: Pick<User, 'uid' | 'role' | 'status'>[],
  protectedAdminEmails: string[] = []
): { ok: true } | { ok: false; error: string } {
  if (actor.role !== 'admin') {
    return { ok: false, error: 'Only administrators can change user roles.' };
  }
  if (actor.uid === target.uid) {
    return { ok: false, error: 'Self-promotion or self-demotion is prohibited.' };
  }
  if (protectedAdminEmails.includes(target.email.trim().toLowerCase()) && nextRole !== 'admin') {
    return { ok: false, error: 'Primary bootstrapped admin cannot be demoted.' };
  }
  if (target.role === 'admin' && nextRole !== 'admin') {
    const activeAdmins = allUsers.filter((u) => u.role === 'admin' && u.status === 'Active');
    if (activeAdmins.length <= 1) {
      return { ok: false, error: 'Cannot demote the last active administrator.' };
    }
  }
  return { ok: true };
}

export function validateAdminPasswordStrength(password: string): string | null {
  if (password.length < 12) return 'Admin password must be at least 12 characters long.';
  if (!/[A-Z]/.test(password)) return 'Admin password must include an uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Admin password must include a lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Admin password must include a number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Admin password must include a special character.';
  return null;
}

interface LockoutRecord {
  failures: number[];
  lockedUntil: number;
}

/**
 * Sliding-window rate limiter & account lockout for admin login attempts.
 * Locks out for 15 minutes after 5 failed attempts within 15 minutes.
 */
export class LoginRateLimiter {
  private readonly maxAttempts: number;
  private readonly windowMs: number;
  private readonly lockoutMs: number;
  private readonly memoryStore = new Map<string, LockoutRecord>();

  constructor(maxAttempts = 5, windowMs = 15 * 60 * 1000, lockoutMs = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.lockoutMs = lockoutMs;
  }

  private getKey(identifier: string): string {
    return identifier.trim().toLowerCase();
  }

  private load(key: string): LockoutRecord {
    const mem = this.memoryStore.get(key);
    if (mem) return mem;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(`unibus_lock_${key}`);
        if (raw) {
          const parsed = JSON.parse(raw) as LockoutRecord;
          this.memoryStore.set(key, parsed);
          return parsed;
        }
      } catch {
        // Ignore storage access errors
      }
    }
    return { failures: [], lockedUntil: 0 };
  }

  private save(key: string, record: LockoutRecord): void {
    this.memoryStore.set(key, record);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(`unibus_lock_${key}`, JSON.stringify(record));
      } catch {
        // Ignore storage quota errors
      }
    }
  }

  check(identifier: string, nowMs = Date.now()): { allowed: boolean; retryAfterSec: number } {
    const key = this.getKey(identifier);
    const rec = this.load(key);
    if (rec.lockedUntil > nowMs) {
      return {
        allowed: false,
        retryAfterSec: Math.ceil((rec.lockedUntil - nowMs) / 1000),
      };
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  recordFailure(identifier: string, nowMs = Date.now()): { locked: boolean; remainingAttempts: number } {
    const key = this.getKey(identifier);
    const rec = this.load(key);
    const recent = rec.failures.filter((ts) => nowMs - ts <= this.windowMs);
    recent.push(nowMs);
    const locked = recent.length >= this.maxAttempts;
    const updated: LockoutRecord = {
      failures: recent,
      lockedUntil: locked ? nowMs + this.lockoutMs : 0,
    };
    this.save(key, updated);
    return {
      locked,
      remainingAttempts: Math.max(0, this.maxAttempts - recent.length),
    };
  }

  reset(identifier: string): void {
    const key = this.getKey(identifier);
    this.memoryStore.delete(key);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.removeItem(`unibus_lock_${key}`);
      } catch {
        // Ignore
      }
    }
  }
}

/**
 * Per-user, per-corridor cooldown limiter for crowdsourced traffic/fare reports.
 * Strictly keyed by (userId, corridorOrStationId) so one abusive account
 * can NEVER block other commuters from reporting on the same corridor.
 */
export class CrowdsourcingCooldownLimiter {
  private readonly cooldownMs: number;
  private readonly lastReportByUserCorridor = new Map<string, number>();

  constructor(cooldownMs = 15 * 60 * 1000) {
    this.cooldownMs = cooldownMs;
  }

  private key(userId: string, corridorId: string): string {
    return `${userId.trim()}::${corridorId.trim().toLowerCase()}`;
  }

  canSubmit(userId: string, corridorId: string, nowMs = Date.now()): { allowed: boolean; retryAfterSec: number } {
    if (!userId.trim() || !corridorId.trim()) {
      return { allowed: false, retryAfterSec: 0 };
    }
    const last = this.lastReportByUserCorridor.get(this.key(userId, corridorId));
    if (!last) return { allowed: true, retryAfterSec: 0 };
    const elapsed = nowMs - last;
    if (elapsed < this.cooldownMs) {
      return {
        allowed: false,
        retryAfterSec: Math.ceil((this.cooldownMs - elapsed) / 1000),
      };
    }
    return { allowed: true, retryAfterSec: 0 };
  }

  recordReport(userId: string, corridorId: string, nowMs = Date.now()): void {
    this.lastReportByUserCorridor.set(this.key(userId, corridorId), nowMs);
  }
}

/**
 * Validates admin-triggered erasure of a user's personal data (Egypt PDPL MVP compliance).
 * Blocks non-admins, self-deletion, and deletion of protected primary admin accounts.
 */
export function validateUserDataDeletion(
  actor: Pick<User, 'uid' | 'role'>,
  target: Pick<User, 'uid' | 'email' | 'role'>,
  protectedAdminEmails: string[] = []
): { ok: true } | { ok: false; error: string } {
  if (actor.role !== 'admin') {
    return { ok: false, error: 'Only administrators can fulfill user data deletion requests.' };
  }
  if (actor.uid === target.uid) {
    return { ok: false, error: 'Cannot delete your own active administrator account.' };
  }
  if (protectedAdminEmails.includes(target.email.trim().toLowerCase())) {
    return { ok: false, error: 'Primary bootstrapped administrator account cannot be deleted.' };
  }
  return { ok: true };
}

