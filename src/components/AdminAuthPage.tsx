import { useEffect, useState } from 'react';
import { KeyRound, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useUniBus } from '../context/UniBusContext';
import { UniBusLogo } from './Logo';

export function AdminAuthPage({
  mode,
  mfaChallengeOnly = false,
  onSwitchMode,
  onSuccess,
  onBackHome,
}: {
  mode: 'admin-login' | 'admin-accept-invite';
  mfaChallengeOnly?: boolean;
  onSwitchMode: (m: 'admin-login' | 'admin-accept-invite') => void;
  onSuccess: () => void;
  onBackHome: () => void;
}) {
  const {
    currentUser,
    adminMfaNeedsEnrollment,
    loginWithEmail,
    loginWithGoogle,
    acceptAdminInvite,
    enrollAdminMfa,
    completeAdminMfa,
    logout,
  } = useUniBus();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [mfaStep, setMfaStep] = useState(mfaChallengeOnly);
  const [mfaCode, setMfaCode] = useState('');
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMfaStep(mfaChallengeOnly);
  }, [mfaChallengeOnly]);

  useEffect(() => {
    if (mfaStep && adminMfaNeedsEnrollment && !totpSecret) {
      void (async () => {
        const res = await enrollAdminMfa();
        if (res.ok && !res.enrolled && res.secret) {
          setTotpSecret(res.secret);
          setTotpUri(res.otpauthUri || null);
        } else if (!res.ok && res.error) {
          setError(res.error);
        }
      })();
    }
  }, [mfaStep, adminMfaNeedsEnrollment, totpSecret, enrollAdminMfa]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tokenParam = params.get('token');
      if (tokenParam) {
        setInviteToken(tokenParam);
      }
    }
  }, []);

  const handleStaffEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await loginWithEmail(email, password, 'admin');
    setLoading(false);
    if (!res.ok) {
      setError(res.error || 'Staff login failed.');
      return;
    }
    if (res.needsMfa) {
      setMfaStep(true);
    } else {
      onSuccess();
    }
  };

  const handleStaffGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    const res = await loginWithGoogle('admin');
    setLoading(false);
    if (!res.ok) {
      setError(res.error || 'Google staff sign-in failed.');
      return;
    }
    if (res.needsMfa) {
      setMfaStep(true);
    } else {
      onSuccess();
    }
  };

  const handleAcceptInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!inviteToken.trim()) {
      setError('A valid single-use invitation token is required.');
      return;
    }
    setLoading(true);
    const res = await acceptAdminInvite({
      token: inviteToken.trim(),
      name,
      email,
      password,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.error || 'Could not activate invitation.');
      return;
    }
    setMfaStep(true);
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await completeAdminMfa(mfaCode);
    setLoading(false);
    if (!res.ok) {
      setError(res.error || 'Invalid MFA code.');
      return;
    }
    setTotpSecret(null);
    setTotpUri(null);
    onSuccess();
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left dark panel */}
      <div className="relative bg-[#0F0F0F] text-white p-8 sm:p-12 lg:p-16 flex flex-col justify-between overflow-hidden">
        <div
          className="absolute -top-32 left-1/3 w-96 h-96 rounded-full bg-[#FACC15]/15 blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative z-10">
          <button type="button" onClick={onBackHome} className="cursor-pointer">
            <UniBusLogo dark size="md" />
          </button>
        </div>

        <div className="relative z-10 my-12 max-w-md space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FACC15] text-[#111111] text-[10px] font-extrabold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Restricted Staff Portal</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.15]">
            Operations &amp; Security <span className="text-[#FACC15]">Command</span>
          </h1>
          <ul className="space-y-2.5 text-sm text-white/70">
            <li>Isolated authentication audience (unibus-admin)</li>
            <li>Invite-only onboarding with 24-hour single-use hashed tokens</li>
            <li>Server-verified RFC 6238 TOTP MFA (otplib) and immutable audit logs</li>
          </ul>
        </div>

        <div className="relative z-10 text-xs text-white/45">
          Tanta University · Sabrabay Complex · No public admin registration
        </div>
      </div>

      {/* Right form panel */}
      <div className="bg-[#FAF8F3] flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {mfaStep ? (
            <div className="space-y-5">
              <div className="w-11 h-11 rounded-2xl bg-[#111111] text-[#FACC15] flex items-center justify-center">
                <KeyRound className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold text-[#111111]">
                  {adminMfaNeedsEnrollment ? 'Enroll Staff TOTP MFA' : 'Two-Factor Verification'}
                </h2>
                <p className="text-xs text-[#6E6A61] mt-1.5 leading-relaxed">
                  {adminMfaNeedsEnrollment
                    ? 'Add the secret key below to Google Authenticator, Authy, or 1Password, then verify your first 6-digit TOTP code.'
                    : `Enter the current 6-digit TOTP code from your authenticator app for ${currentUser?.email || 'your staff account'}.`}
                </p>
              </div>

              {(adminMfaNeedsEnrollment || totpSecret) && totpSecret && (
                <div className="rounded-xl bg-white border border-[#DFDBD0] p-3.5 text-xs space-y-2">
                  <div className="font-bold text-[#111111]">Authenticator Setup Key (Base32 · shown once)</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#FAF8F3] border border-[#E8E4D9] font-mono text-[11px] break-all">
                      {totpSecret}
                    </code>
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard?.writeText(totpSecret);
                        setCopiedSecret(true);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-[#111111] text-white text-[11px] font-bold cursor-pointer shrink-0"
                    >
                      {copiedSecret ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  {totpUri && (
                    <div className="text-[11px] text-[#6E6A61] break-all">
                      Provisioning URI: <span className="font-mono">{totpUri}</span>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
                  {error}
                </div>
              )}

              <form onSubmit={handleVerifyMfa} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1.5">6-Digit TOTP Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#DFDBD0] text-center font-mono text-lg tracking-[0.35em] focus:outline-none focus:border-[#111111]"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading || mfaCode.length !== 6}
                  className="w-full py-3 rounded-full bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] font-bold text-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Verifying TOTP...' : 'Verify & enter console'}
                </button>
              </form>

              <div className="flex items-center justify-between text-xs text-[#6E6A61] pt-2 border-t border-[#E8E4D9]">
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                    setTotpSecret(null);
                    setTotpUri(null);
                    setMfaStep(false);
                  }}
                  className="underline hover:text-[#111111] cursor-pointer"
                >
                  Sign out
                </button>
                <button
                  type="button"
                  onClick={onBackHome}
                  className="underline hover:text-[#111111] cursor-pointer"
                >
                  Back to public site
                </button>
              </div>
            </div>
          ) : mode === 'admin-login' ? (
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#B45309] uppercase tracking-wider">
                <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>/admin/login</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111111] mt-1">
                Admin &amp; Moderator Login
              </h2>
              <p className="text-xs text-[#6E6A61] mt-1.5">
                Rate-limited staff access (5 failed attempts triggers a 15-minute lockout).
              </p>

              <button
                type="button"
                disabled={loading}
                onClick={handleStaffGoogleLogin}
                className="mt-6 w-full py-2.5 px-4 rounded-full bg-white border border-[#DFDBD0] hover:border-[#111111] text-sm font-bold text-[#111111] flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60"
              >
                <span>Continue with Staff Google Account</span>
              </button>

              <div className="my-5 flex items-center gap-3 text-[11px] text-[#8E8A80]">
                <div className="h-[1px] flex-1 bg-[#E5E0D5]" />
                <span>or staff email &amp; password</span>
                <div className="h-[1px] flex-1 bg-[#E5E0D5]" />
              </div>

              {error && (
                <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleStaffEmailLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1.5">Staff Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="staff@tanta.edu.eg"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#DFDBD0] text-sm focus:outline-none focus:border-[#111111]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1.5">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 12 characters"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#DFDBD0] text-sm focus:outline-none focus:border-[#111111]"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-full bg-[#111111] hover:bg-[#222222] text-[#FACC15] font-bold text-sm transition-colors cursor-pointer disabled:opacity-60"
                >
                  {loading ? 'Authenticating...' : 'Authenticate to Admin Console'}
                </button>
              </form>

              <div className="mt-6 pt-4 border-t border-[#E8E4D9] flex items-center justify-between text-xs text-[#6E6A61]">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    onSwitchMode('admin-accept-invite');
                  }}
                  className="font-bold text-[#111111] underline cursor-pointer"
                >
                  Have a staff invite token?
                </button>
                <button type="button" onClick={onBackHome} className="underline hover:text-[#111111] cursor-pointer">
                  Back to home
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-[#B45309] uppercase tracking-wider">
                <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
                <span>/admin/accept-invite</span>
              </div>
              <h2 className="text-2xl font-extrabold text-[#111111] mt-1">Activate Staff Invitation</h2>
              <p className="text-xs text-[#6E6A61] mt-1.5">
                Single-use invitation tokens expire after 24 hours. Minimum 12-character password and MFA required.
              </p>

              {error && (
                <div className="mt-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleAcceptInvite} className="mt-5 space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1">Invitation Token</label>
                  <input
                    type="text"
                    value={inviteToken}
                    onChange={(e) => setInviteToken(e.target.value)}
                    placeholder="Paste 48-char single-use token"
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#DFDBD0] text-xs font-mono focus:outline-none focus:border-[#111111]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Dr. Sara Nabil"
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#DFDBD0] text-sm focus:outline-none focus:border-[#111111]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1">Invited Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Must match invited email"
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#DFDBD0] text-sm focus:outline-none focus:border-[#111111]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1">
                    Strong Password (12+ chars, upper, lower, number, symbol)
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create strong staff password"
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-[#DFDBD0] text-sm focus:outline-none focus:border-[#111111]"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-full bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] font-bold text-sm transition-colors cursor-pointer disabled:opacity-60"
                >
                  {loading ? 'Validating token...' : 'Activate staff account & setup MFA'}
                </button>
              </form>

              <div className="mt-5 pt-4 border-t border-[#E8E4D9] flex items-center justify-between text-xs text-[#6E6A61]">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    onSwitchMode('admin-login');
                  }}
                  className="font-bold text-[#111111] underline cursor-pointer"
                >
                  Back to staff login
                </button>
                <button type="button" onClick={onBackHome} className="underline hover:text-[#111111] cursor-pointer">
                  Back to home
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
