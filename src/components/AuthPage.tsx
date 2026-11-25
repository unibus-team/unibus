import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { CITIES } from '../data/seedData';
import { useUniBus } from '../context/UniBusContext';
import { User } from '../types/unibus';
import { UniBusLogo } from './Logo';

export function AuthPage({
  mode,
  onSwitchMode,
  onSuccess,
  onBackHome,
  onGoAdminLogin,
}: {
  mode: 'login' | 'signup';
  onSwitchMode: (mode: 'login' | 'signup') => void;
  onSuccess: (user: User) => void;
  onBackHome: () => void;
  onGoAdminLogin?: () => void;
}) {
  const { loginWithGoogle, loginWithEmail, signupWithEmail } = useUniBus();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [homeCity, setHomeCity] = useState('Zifta');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsEmailProviderSetup, setNeedsEmailProviderSetup] = useState(false);

  const handleGoogle = async () => {
    setError(null);
    setNeedsEmailProviderSetup(false);
    setLoading(true);
    const res = await loginWithGoogle('student');
    setLoading(false);
    if (res.ok && res.user) {
      onSuccess(res.user);
    } else {
      setError(res.error || 'Google sign-in failed.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNeedsEmailProviderSetup(false);
    setLoading(true);

    if (mode === 'login') {
      const res = await loginWithEmail(email, password, 'student');
      setLoading(false);
      if (res.ok && res.user) {
        onSuccess(res.user);
      } else {
        if (res.errorCode === 'operation-not-allowed') {
          setNeedsEmailProviderSetup(true);
        }
        setError(res.error || 'Login failed');
      }
    } else {
      if (!name.trim() || !email.trim() || password.length < 6) {
        setLoading(false);
        setError('Please enter your name, email, and a password (min 6 characters).');
        return;
      }
      const res = await signupWithEmail({ name, email, password, homeCity });
      setLoading(false);
      if (res.ok && res.user) {
        onSuccess(res.user);
      } else {
        if (res.errorCode === 'operation-not-allowed') {
          setNeedsEmailProviderSetup(true);
        }
        setError(res.error || 'Sign up failed');
      }
    }
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

        <div className="relative z-10 my-12 max-w-md">
          <div className="inline-block px-3 py-1 rounded-full bg-white/10 text-[#FACC15] text-[10px] font-bold uppercase tracking-wider mb-4">
            Student Portal
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.15]">
            Your ride to campus, <span className="text-[#FACC15]">booked</span> in seconds.
          </h1>
          <ul className="mt-6 space-y-3 text-sm text-white/70">
            <li>Search real trips by route and date</li>
            <li>Get recommendations that fit your routine</li>
            <li>Reserve seats and manage bookings in live Firestore</li>
          </ul>
        </div>

        <div className="relative z-10 text-xs text-white/45">
          Tanta University · Smart Commute Navigator · Sabrabay Complex
        </div>
      </div>

      {/* Right cream form panel */}
      <div className="bg-[#FAF8F3] flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#111111]">
            {mode === 'login' ? 'Student sign in' : 'Create your student account'}
          </h2>
          <p className="text-sm text-[#6E6A61] mt-1.5">
            {mode === 'login'
              ? 'Log in to search trips and manage your bookings.'
              : 'Public registration always creates a standard student account.'}
          </p>

          {/* Google Sign-In */}
          <button
            type="button"
            disabled={loading}
            onClick={handleGoogle}
            className="mt-6 w-full py-2.5 px-4 rounded-full bg-white border border-[#DFDBD0] hover:border-[#111111] text-sm font-bold text-[#111111] flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="my-5 flex items-center gap-3 text-[11px] text-[#8E8A80]">
            <div className="h-[1px] flex-1 bg-[#E5E0D5]" />
            <span>or with email &amp; password</span>
            <div className="h-[1px] flex-1 bg-[#E5E0D5]" />
          </div>

          {error && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 space-y-2">
              <div>{error}</div>
              {needsEmailProviderSetup && (
                <div className="pt-2 border-t border-rose-200 text-[#111111] space-y-1">
                  <div className="font-bold">لتفعيل تسجيل الدخول بالإيميل والباسورد في Firebase:</div>
                  <ol className="list-decimal list-inside space-y-0.5 text-[11px]">
                    <li>افتح Firebase Authentication Providers من الرابط التالي:</li>
                    <li>اختر <strong>Email/Password</strong> ثم فعّل <strong>Enable</strong> واضغط <strong>Save</strong>.</li>
                  </ol>
                  <a
                    href="https://console.firebase.google.com/project/strategic-outlook-02w8r/authentication/providers"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-bold underline text-[#B45309] pt-1"
                  >
                    <span>Open Firebase Auth Providers</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Ahmed Hassan"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#DFDBD0] text-sm focus:outline-none focus:border-[#111111]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#111111] mb-1.5">Home City / Terminal</label>
                  <select
                    value={homeCity}
                    onChange={(e) => setHomeCity(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#DFDBD0] text-sm focus:outline-none focus:border-[#111111]"
                  >
                    {CITIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-bold text-[#111111] mb-1.5">Student Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@science.tanta.edu.eg"
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
                placeholder="Your password"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#DFDBD0] text-sm focus:outline-none focus:border-[#111111]"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-full bg-[#FACC15] hover:bg-[#EAB308] text-[#111111] font-bold text-sm transition-colors cursor-pointer disabled:opacity-60"
            >
              {loading ? 'Signing in...' : mode === 'login' ? 'Log in as student' : 'Create student account'}
            </button>
          </form>

          <div className="mt-6 space-y-2 text-xs text-[#6E6A61]">
            <div>
              {mode === 'login' ? 'New to UniBus? ' : 'Already have an account? '}
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setNeedsEmailProviderSetup(false);
                  onSwitchMode(mode === 'login' ? 'signup' : 'login');
                }}
                className="font-bold text-[#111111] underline cursor-pointer"
              >
                {mode === 'login' ? 'Create an account' : 'Log in'}
              </button>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-[#E8E4D9]">
              <button
                type="button"
                onClick={onBackHome}
                className="underline hover:text-[#111111] cursor-pointer"
              >
                Back to home
              </button>
              {onGoAdminLogin && (
                <button
                  type="button"
                  onClick={onGoAdminLogin}
                  className="text-[11px] text-[#7A766D] hover:text-[#111111] underline cursor-pointer"
                >
                  Staff portal (/admin/login)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
