import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSecret, generate as generateTotp, verify as verifyTotp } from 'otplib';
import {
  CrowdsourcingCooldownLimiter,
  LoginRateLimiter,
  generateInviteToken,
  hashInviteToken,
  issueScopedSessionClaims,
  sanitizeStudentRegistrationInput,
  validateAdminPasswordStrength,
  validateInviteConsumption,
  validateRoleChange,
  validateUserDataDeletion,
  verifySessionAccess,
} from '../src/security/authPolicy.ts';
import type { AdminInvite, User } from '../src/types/unibus.ts';

test('1. Student token/role cannot call admin endpoints or log into admin portal', () => {
  const student: User = {
    uid: 'stu-1',
    name: 'Test Student',
    email: 'student@tanta.edu.eg',
    role: 'student',
    homeCity: 'Zifta',
    trustScore: 0.5,
    status: 'Active',
    createdAt: '2026-11-01T08:00:00.000Z',
  };

  // Cross-portal login rejected
  const adminPortalAttempt = issueScopedSessionClaims(student, 'admin', true);
  assert.equal(adminPortalAttempt.ok, false);

  // Valid student session claims
  const studentSession = issueScopedSessionClaims(student, 'student');
  assert.equal(studentSession.ok, true);
  if (!studentSession.ok) throw new Error('Expected valid student session');
  assert.equal(studentSession.claims.aud, 'unibus-student');

  // Calling an admin endpoint with student claims is rejected with 403
  const adminEndpointAccess = verifySessionAccess(studentSession.claims, 'unibus-admin', ['admin', 'moderator']);
  assert.equal(adminEndpointAccess.ok, false);
  if (!adminEndpointAccess.ok) {
    assert.equal(adminEndpointAccess.status, 403);
  }
});

test('2. Admin session requires unibus-admin audience and MFA verification; cannot cross-call student audience', () => {
  const admin: User = {
    uid: 'adm-1',
    name: 'Admin User',
    email: 'admin@tanta.edu.eg',
    role: 'admin',
    homeCity: 'Tanta',
    trustScore: 1.0,
    status: 'Active',
    createdAt: '2026-11-01T08:00:00.000Z',
  };

  // Admin cannot log in via student login portal
  const studentPortalAttempt = issueScopedSessionClaims(admin, 'student');
  assert.equal(studentPortalAttempt.ok, false);

  // Unverified MFA admin claims are blocked from admin endpoints
  const preMfa = issueScopedSessionClaims(admin, 'admin', false);
  assert.equal(preMfa.ok, true);
  if (!preMfa.ok) throw new Error('Expected pre-MFA admin claims');
  const blockedWithoutMfa = verifySessionAccess(preMfa.claims, 'unibus-admin', ['admin']);
  assert.equal(blockedWithoutMfa.ok, false);

  // Verified MFA admin claims succeed on admin endpoints, rejected on student-audience endpoints
  const postMfa = issueScopedSessionClaims(admin, 'admin', true);
  assert.equal(postMfa.ok, true);
  if (!postMfa.ok) throw new Error('Expected post-MFA admin claims');
  assert.equal(verifySessionAccess(postMfa.claims, 'unibus-admin', ['admin']).ok, true);
  assert.equal(verifySessionAccess(postMfa.claims, 'unibus-student', ['student']).ok, false);
});

test('3. Registration payload attempting role="admin" / isAdmin=true still creates a student (anti-mass-assignment)', () => {
  const maliciousPayload: Record<string, unknown> = {
    name: 'Attacker',
    email: 'attacker@tanta.edu.eg',
    homeCity: 'El-Mahalla El-Kubra',
    role: 'admin',
    isAdmin: true,
    permissions: ['*', 'manage:users'],
    trustScore: 1.0,
    status: 'Suspended',
  };

  const created = sanitizeStudentRegistrationInput(maliciousPayload, 'uid-attacker');
  assert.equal(created.role, 'student');
  assert.equal(created.trustScore, 0.5);
  assert.equal(created.status, 'Active');
  assert.equal(created.uid, 'uid-attacker');
});

test('4. Expired and reused admin invite tokens are rejected, and tokens are SHA-256 hashed', async () => {
  const rawToken = generateInviteToken();
  const tokenHash = await hashInviteToken(rawToken);
  assert.notEqual(tokenHash, rawToken);
  assert.equal(tokenHash.length, 64);

  const now = Date.parse('2026-11-25T12:00:00.000Z');
  const validInvite: AdminInvite = {
    id: tokenHash,
    tokenHash,
    email: 'mod@tanta.edu.eg',
    role: 'moderator',
    createdByUid: 'adm-1',
    createdByEmail: 'admin@tanta.edu.eg',
    createdAt: '2026-11-24T12:00:00.000Z',
    expiresAt: '2026-11-25T18:00:00.000Z',
    usedAt: null,
  };
  assert.equal(validateInviteConsumption(validInvite, 'mod@tanta.edu.eg', now).ok, true);

  // Expired invite rejected
  const expiredInvite: AdminInvite = {
    ...validInvite,
    expiresAt: '2026-11-25T11:59:59.000Z',
  };
  const expiredRes = validateInviteConsumption(expiredInvite, 'mod@tanta.edu.eg', now);
  assert.equal(expiredRes.ok, false);
  if (!expiredRes.ok) assert.match(expiredRes.error, /expired/i);

  // Reused invite rejected
  const reusedInvite: AdminInvite = {
    ...validInvite,
    usedAt: '2026-11-25T10:00:00.000Z',
  };
  const reusedRes = validateInviteConsumption(reusedInvite, 'mod@tanta.edu.eg', now);
  assert.equal(reusedRes.ok, false);
  if (!reusedRes.ok) assert.match(reusedRes.error, /already been used/i);

  // Email mismatch rejected
  const mismatchRes = validateInviteConsumption(validInvite, 'other@tanta.edu.eg', now);
  assert.equal(mismatchRes.ok, false);
});

test('5. Role change blocks self-promotion, non-admin actors, and demoting the last active admin', () => {
  const onlyAdmin: User = {
    uid: 'adm-1',
    name: 'Super Admin',
    email: 'super@tanta.edu.eg',
    role: 'admin',
    homeCity: 'Tanta',
    trustScore: 1,
    status: 'Active',
    createdAt: '2026-11-01T00:00:00Z',
  };
  const secondAdmin: User = {
    uid: 'adm-2',
    name: 'Second Admin',
    email: 'second@tanta.edu.eg',
    role: 'admin',
    homeCity: 'Tanta',
    trustScore: 1,
    status: 'Active',
    createdAt: '2026-11-01T00:00:00Z',
  };
  const student: User = {
    uid: 'stu-1',
    name: 'Student',
    email: 'stu@tanta.edu.eg',
    role: 'student',
    homeCity: 'Zifta',
    trustScore: 0.5,
    status: 'Active',
    createdAt: '2026-11-01T00:00:00Z',
  };

  // Self-demotion / self-change blocked
  assert.equal(validateRoleChange(onlyAdmin, onlyAdmin, 'student', [onlyAdmin, student]).ok, false);

  // Student or moderator cannot change roles
  assert.equal(validateRoleChange(student, student, 'admin', [onlyAdmin, student]).ok, false);

  // Demoting the last active admin is blocked
  const lastAdminRes = validateRoleChange(secondAdmin, onlyAdmin, 'student', [onlyAdmin, student]);
  assert.equal(lastAdminRes.ok, false);

  // Demoting one admin when another active admin exists succeeds
  const validDemote = validateRoleChange(onlyAdmin, secondAdmin, 'moderator', [onlyAdmin, secondAdmin, student]);
  assert.equal(validDemote.ok, true);
});

test('6. Admin login rate limiter locks out after 5 failed attempts and validates password policy', () => {
  const limiter = new LoginRateLimiter(5, 15 * 60 * 1000, 15 * 60 * 1000);
  const start = 1_700_000_000_000;

  for (let i = 0; i < 4; i++) {
    const res = limiter.recordFailure('admin@tanta.edu.eg', start + i * 1000);
    assert.equal(res.locked, false);
  }
  const fifth = limiter.recordFailure('admin@tanta.edu.eg', start + 5000);
  assert.equal(fifth.locked, true);

  const checkLocked = limiter.check('admin@tanta.edu.eg', start + 10_000);
  assert.equal(checkLocked.allowed, false);
  assert.ok(checkLocked.retryAfterSec > 0);

  limiter.reset('admin@tanta.edu.eg');
  assert.equal(limiter.check('admin@tanta.edu.eg', start + 10_000).allowed, true);

  assert.notEqual(validateAdminPasswordStrength('short123'), null);
  assert.equal(validateAdminPasswordStrength('TantaUni@2026!'), null);
});

test('7. Real otplib TOTP verifies valid codes and rejects forged codes', async () => {
  const secret = generateSecret();
  const token = await generateTotp({ secret });
  assert.equal(token.length, 6);

  const validRes = await verifyTotp({ secret, token, epochTolerance: 30 });
  assert.equal(validRes.valid, true);

  const forged = token === '000000' ? '111111' : '000000';
  const forgedRes = await verifyTotp({ secret, token: forged, epochTolerance: 30 });
  assert.equal(forgedRes.valid, false);
});

test('8. Crowdsourcing cooldown is enforced per-user per-corridor (never global per-corridor)', () => {
  const limiter = new CrowdsourcingCooldownLimiter(15 * 60 * 1000);
  const t0 = 1_700_000_000_000;

  // Student A reports on st-tanta
  assert.equal(limiter.canSubmit('stu-a', 'st-tanta', t0).allowed, true);
  limiter.recordReport('stu-a', 'st-tanta', t0);

  // Student A cannot spam st-tanta immediately
  const repeatSame = limiter.canSubmit('stu-a', 'st-tanta', t0 + 60_000);
  assert.equal(repeatSame.allowed, false);
  assert.ok(repeatSame.retryAfterSec > 0);

  // Student B is NOT blocked on st-tanta (not global per-corridor!)
  assert.equal(limiter.canSubmit('stu-b', 'st-tanta', t0 + 60_000).allowed, true);

  // Student A is NOT blocked on a different corridor st-zifta
  assert.equal(limiter.canSubmit('stu-a', 'st-zifta', t0 + 60_000).allowed, true);

  // Student A is allowed again after 15 minutes
  assert.equal(limiter.canSubmit('stu-a', 'st-tanta', t0 + 15 * 60 * 1000 + 1).allowed, true);
});

test('9. User data deletion enforces admin-only authorization and protects self and primary admin', () => {
  const primaryAdmin: User = {
    uid: 'adm-primary',
    name: 'Primary Admin',
    email: 'mohamedalkawaity@gmail.com',
    role: 'admin',
    homeCity: 'Tanta',
    trustScore: 1,
    status: 'Active',
    createdAt: '2026-11-01T00:00:00Z',
  };
  const moderator: User = {
    uid: 'mod-1',
    name: 'Moderator',
    email: 'mod@tanta.edu.eg',
    role: 'moderator',
    homeCity: 'Tanta',
    trustScore: 1,
    status: 'Active',
    createdAt: '2026-11-01T00:00:00Z',
  };
  const student: User = {
    uid: 'stu-9',
    name: 'Student Nine',
    email: 'stu9@tanta.edu.eg',
    role: 'student',
    homeCity: 'Zifta',
    trustScore: 0.5,
    status: 'Active',
    createdAt: '2026-11-01T00:00:00Z',
  };

  assert.equal(validateUserDataDeletion(moderator, student).ok, false);
  assert.equal(validateUserDataDeletion(primaryAdmin, primaryAdmin).ok, false);
  assert.equal(validateUserDataDeletion(primaryAdmin, student).ok, true);
});

