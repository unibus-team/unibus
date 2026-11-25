import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';
import { CrowdsourcingCooldownLimiter, LoginRateLimiter } from './src/security/authPolicy.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8-hour staff session timeout

// Load projectId for verifyIdToken() (requires zero IAM per Firebase Admin SDK guidance)
const firebaseConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
const firebaseConfig = fs.existsSync(firebaseConfigPath)
  ? (JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8')) as { projectId?: string })
  : {};

const adminApp = getApps().length
  ? getApp()
  : initializeApp({
      projectId: firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID || 'strategic-outlook-02w8r',
    });
const adminAuth = getAuth(adminApp);

// Server-side rate limiters (cannot be bypassed by clearing browser localStorage)
const adminLoginLimiter = new LoginRateLimiter(5, 15 * 60 * 1000, 15 * 60 * 1000);
const crowdsourcingLimiter = new CrowdsourcingCooldownLimiter(15 * 60 * 1000);

// AES-256-GCM encrypted TOTP vault persisted locally in .data/mfa-vault.json
const DATA_DIR = path.resolve(__dirname, '.data');
const VAULT_FILE = path.join(DATA_DIR, 'mfa-vault.json');
const SESSION_KEY_FILE = path.join(DATA_DIR, 'session-key.hex');

function getOrCreateServerSecret(): Buffer {
  if (process.env.MFA_STORAGE_SECRET && process.env.MFA_STORAGE_SECRET.length >= 32) {
    return crypto.createHash('sha256').update(process.env.MFA_STORAGE_SECRET).digest();
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  if (fs.existsSync(SESSION_KEY_FILE)) {
    return Buffer.from(fs.readFileSync(SESSION_KEY_FILE, 'utf8').trim(), 'hex');
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(SESSION_KEY_FILE, key.toString('hex'), { mode: 0o600 });
  return key;
}

const SERVER_KEY = getOrCreateServerSecret();

interface VaultEntry {
  encryptedSecret: string; // iv:tag:ciphertext (hex)
  enrolled: boolean;
  updatedAt: string;
}

function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', SERVER_KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decryptSecret(payload: string): string {
  const [ivHex, tagHex, encHex] = payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', SERVER_KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}

function loadVault(): Record<string, VaultEntry> {
  if (!fs.existsSync(VAULT_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8')) as Record<string, VaultEntry>;
  } catch {
    return {};
  }
}

function saveVault(vault: Record<string, VaultEntry>): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(VAULT_FILE, JSON.stringify(vault, null, 2), { mode: 0o600 });
}

function parseCookies(req: Request): Record<string, string> {
  const raw = req.headers.cookie || '';
  const out: Record<string, string> = {};
  raw.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function signMfaCookie(uid: string, expMs: number): string {
  const payload = `${uid}.${expMs}`;
  const sig = crypto.createHmac('sha256', SERVER_KEY).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyMfaCookie(cookieVal: string | undefined, expectedUid: string): boolean {
  if (!cookieVal) return false;
  const parts = cookieVal.split('.');
  if (parts.length !== 3) return false;
  const [uid, expStr, sig] = parts;
  if (uid !== expectedUid) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() >= exp) return false;
  const expectedSig = crypto.createHmac('sha256', SERVER_KEY).update(`${uid}.${expStr}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'));
}

interface AuthedRequest extends Request {
  firebaseUser?: {
    uid: string;
    email: string;
    emailVerified: boolean;
  };
}

async function requireFirebaseToken(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Authorization Bearer token required.' });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.firebaseUser = {
      uid: decoded.uid,
      email: decoded.email || '',
      emailVerified: Boolean(decoded.email_verified),
    };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
  }
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  // Hardened HTTP security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    if (IS_PROD) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // Strict same-origin / allowlisted CORS for /api/*
  app.use('/api', (req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigins = [process.env.APP_URL, `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`].filter(Boolean);
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  });

  // 1. Server-side Admin Login Brute-Force Guard
  app.post('/api/admin/login-guard', (req, res) => {
    const { email, outcome } = req.body as { email?: string; outcome?: 'check' | 'failure' | 'success' };
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    const clientIp = req.ip || 'unknown';
    const key = `${clientIp}::${cleanEmail}`;

    if (outcome === 'failure') {
      const fail = adminLoginLimiter.recordFailure(key);
      return res.json(fail);
    }
    if (outcome === 'success') {
      adminLoginLimiter.reset(key);
      return res.json({ ok: true });
    }
    const status = adminLoginLimiter.check(key);
    if (!status.allowed) {
      return res.status(429).json(status);
    }
    return res.json(status);
  });

  // 2. Server-side MFA Status (checks TOTP enrollment + HttpOnly signed session cookie)
  app.get('/api/mfa/status', requireFirebaseToken, (req: AuthedRequest, res: Response) => {
    const uid = req.firebaseUser!.uid;
    const vault = loadVault();
    const entry = vault[uid];
    const cookies = parseCookies(req);
    const verified = Boolean(entry?.enrolled && verifyMfaCookie(cookies.unibus_mfa_session, uid));
    return res.json({
      enrolled: Boolean(entry?.enrolled),
      verified,
    });
  });

  // 3. Server-side TOTP Enrollment (returns secret & otpauth:// URI ONCE before confirmation)
  app.post('/api/mfa/enroll', requireFirebaseToken, (req: AuthedRequest, res: Response) => {
    const { uid, email } = req.firebaseUser!;
    const vault = loadVault();
    const existing = vault[uid];
    if (existing?.enrolled) {
      return res.status(409).json({
        enrolled: true,
        error: 'MFA is already enrolled for this account. Enter your 6-digit authenticator code.',
      });
    }

    const secret = generateSecret();
    vault[uid] = {
      encryptedSecret: encryptSecret(secret),
      enrolled: false,
      updatedAt: new Date().toISOString(),
    };
    saveVault(vault);

    const otpauthUri = generateURI({
      issuer: 'UniBus Sabrabay',
      label: email || uid,
      secret,
    });

    return res.json({
      enrolled: false,
      secret,
      otpauthUri,
    });
  });

  // 4. Server-side RFC 6238 TOTP Verification via otplib
  app.post('/api/mfa/verify', requireFirebaseToken, async (req: AuthedRequest, res: Response) => {
    const { uid } = req.firebaseUser!;
    const { token } = req.body as { token?: string };
    const cleanToken = String(token || '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleanToken)) {
      return res.status(400).json({ ok: false, error: 'Enter a 6-digit numeric TOTP code.' });
    }

    const vault = loadVault();
    const entry = vault[uid];
    if (!entry) {
      return res.status(400).json({ ok: false, error: 'TOTP secret not initialized. Reload MFA enrollment.' });
    }

    const secret = decryptSecret(entry.encryptedSecret);
    const result = await verifyTotp({ secret, token: cleanToken, epochTolerance: 30 });
    if (!result.valid) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired authenticator code.' });
    }

    if (!entry.enrolled) {
      vault[uid] = {
        ...entry,
        enrolled: true,
        updatedAt: new Date().toISOString(),
      };
      saveVault(vault);
    }

    const expMs = Date.now() + ADMIN_SESSION_TTL_MS;
    const signedCookie = signMfaCookie(uid, expMs);
    res.cookie('unibus_mfa_session', signedCookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
      maxAge: ADMIN_SESSION_TTL_MS,
      path: '/',
    });

    return res.json({ ok: true, mfaVerified: true, expiresAt: new Date(expMs).toISOString() });
  });

  // 5. Clear MFA HttpOnly cookie on logout
  app.post('/api/mfa/logout', (_req, res) => {
    res.clearCookie('unibus_mfa_session', { path: '/' });
    return res.json({ ok: true });
  });

  // 6. Server-side Crowdsourcing Per-User Per-Corridor Validation
  app.post('/api/reports/validate', requireFirebaseToken, (req: AuthedRequest, res: Response) => {
    const { uid, emailVerified } = req.firebaseUser!;
    if (!emailVerified) {
      return res.status(403).json({ ok: false, error: 'Verify your university email before submitting traffic reports.' });
    }
    const { stationId, congestion, fareNote } = req.body as {
      stationId?: string;
      congestion?: string;
      fareNote?: string;
    };
    if (!stationId || typeof stationId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Valid stationId is required.' });
    }
    if (!['Smooth', 'Moderate', 'Heavy'].includes(String(congestion))) {
      return res.status(400).json({ ok: false, error: 'Invalid congestion level.' });
    }
    if (fareNote && String(fareNote).length > 200) {
      return res.status(400).json({ ok: false, error: 'Fare note exceeds 200 characters.' });
    }

    const check = crowdsourcingLimiter.canSubmit(uid, stationId);
    if (!check.allowed) {
      const mins = Math.max(1, Math.ceil(check.retryAfterSec / 60));
      return res.status(429).json({
        ok: false,
        retryAfterSec: check.retryAfterSec,
        error: `Cooldown active for this station: you can submit another update in ~${mins} min.`,
      });
    }

    crowdsourcingLimiter.recordReport(uid, stationId);
    return res.json({ ok: true });
  });

  if (IS_PROD) {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`UniBus server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
