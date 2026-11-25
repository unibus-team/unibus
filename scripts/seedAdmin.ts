/**
 * One-time Super-Admin Bootstrap Script (CLI only)
 * Usage:
 *   SEED_ADMIN_EMAIL=admin@tanta.edu.eg SEED_ADMIN_PASSWORD='...' npx tsx scripts/seedAdmin.ts
 *
 * Credentials are read strictly from environment variables and never hardcoded.
 */
import 'dotenv/config';
import { initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth, sendEmailVerification, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getFirestore, setDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { validateAdminPasswordStrength } from '../src/security/authPolicy';

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Error: SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD environment variables are required.');
    process.exit(1);
  }

  const strengthError = validateAdminPasswordStrength(password);
  if (strengthError) {
    console.error(`Weak password rejected: ${strengthError}`);
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

  let userCred;
  try {
    userCred = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(userCred.user);
    console.log(`Created super-admin Auth user (${email}). Verification email dispatched.`);
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/email-already-in-use') {
      userCred = await signInWithEmailAndPassword(auth, email, password);
      console.log(`Authenticated existing super-admin (${email}).`);
    } else {
      throw err;
    }
  }

  const uid = userCred.user.uid;
  const now = new Date().toISOString();

  await setDoc(
    doc(db, 'admins', uid),
    {
      uid,
      email,
      role: 'admin',
      mfaEnrolled: false,
      createdAt: now,
    },
    { merge: true }
  );

  await setDoc(
    doc(db, 'users', uid),
    {
      uid,
      name: 'Super Admin',
      email,
      role: 'admin',
      homeCity: 'Tanta',
      trustScore: 1.0,
      status: 'Active',
      createdAt: now,
    },
    { merge: true }
  );

  console.log(`Super-admin records synced for UID ${uid}. Complete email verification and MFA enrollment on first login.`);
}

main().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
