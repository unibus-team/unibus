/**
 * Server-Side Custom Claims & Express RBAC Enforcement Pattern
 * -------------------------------------------------------------------------
 * For user-owned / Blaze Firebase projects with Cloud Functions or dedicated
 * Node/Express API servers, Custom Claims (`role`, `aud`, `mfaVerified`) MUST
 * be written exclusively on the server via Firebase Admin SDK (`setCustomUserClaims`)
 * and verified on every incoming API request.
 *
 * Note: On Google-hosted Starter Tier AI Studio projects where server-side IAM
 * for `setCustomUserClaims` is unavailable, `server.ts` verifies Firebase ID
 * tokens via `verifyIdToken()` (no IAM needed) while Firestore security rules
 * (`firestore.rules`) enforce role truth via `/admins/{uid}` and email verification.
 */
import type { NextFunction, Request, Response } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { UserRole } from '../types/unibus.ts';
import type { SessionAudience } from '../security/authPolicy.ts';

export interface VerifiedStaffRequest extends Request {
  authClaims?: {
    uid: string;
    email: string;
    role: UserRole;
    aud: SessionAudience;
    mfaVerified: boolean;
  };
}

/**
 * Assigns immutable server-side custom claims (`role`, `aud`) on Firebase Auth user.
 * Public student registration ALWAYS calls this with role = 'student' and ignores
 * any client-supplied role/isAdmin/permissions payload.
 */
export async function assignServerCustomClaims(
  adminAuth: Auth,
  uid: string,
  role: UserRole,
  mfaVerified = false
): Promise<void> {
  const aud: SessionAudience = role === 'student' ? 'unibus-student' : 'unibus-admin';
  await adminAuth.setCustomUserClaims(uid, {
    role,
    aud,
    mfaVerified: role === 'student' ? false : mfaVerified,
  });
}

/**
 * Express middleware enforcing Firebase ID token verification, token audience isolation,
 * RBAC role allowlist, and mandatory MFA for staff routes.
 */
export function requireServerRole(
  adminAuth: Auth,
  requiredAudience: SessionAudience,
  allowedRoles: UserRole[]
) {
  return async (req: VerifiedStaffRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'Missing Bearer authentication token.' });
    }

    try {
      const decoded = await adminAuth.verifyIdToken(token, true);
      const role = (decoded.role as UserRole | undefined) || 'student';
      const aud = (decoded.aud_scope as SessionAudience | undefined) || (role === 'student' ? 'unibus-student' : 'unibus-admin');
      const mfaVerified = Boolean(decoded.mfaVerified);

      if (aud !== requiredAudience) {
        return res.status(403).json({ error: 'Token audience is not permitted on this portal.' });
      }
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ error: 'Insufficient role permissions.' });
      }
      if (requiredAudience === 'unibus-admin' && !mfaVerified) {
        return res.status(403).json({ error: 'Server-verified TOTP MFA is required.' });
      }

      req.authClaims = {
        uid: decoded.uid,
        email: decoded.email || '',
        role,
        aud,
        mfaVerified,
      };
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid or revoked authentication token.' });
    }
  };
}
