import { useEffect, useState } from 'react';
import { AdminAuthPage } from './components/AdminAuthPage';
import { AdminConsole } from './components/AdminConsole';
import { AuthPage } from './components/AuthPage';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './components/LandingPage';
import { StudentPortal } from './components/StudentPortal';
import { TripAssistantWidget } from './components/TripAssistantWidget';
import { UniBusProvider, useUniBus } from './context/UniBusContext';
import { PublicPage } from './types/unibus';

function resolveInitialPublicPage(): PublicPage {
  if (typeof window === 'undefined') return 'home';
  const p = window.location.pathname.toLowerCase();
  if (p === '/admin/accept-invite') return 'admin-accept-invite';
  if (p === '/admin/login' || p === '/admin') return 'admin-login';
  if (p === '/login') return 'login';
  if (p === '/signup') return 'signup';
  return 'home';
}

function pageToPath(page: PublicPage): string {
  switch (page) {
    case 'admin-login':
      return '/admin/login';
    case 'admin-accept-invite':
      return '/admin/accept-invite';
    case 'login':
      return '/login';
    case 'signup':
      return '/signup';
    default:
      return '/';
  }
}

function UniBusRouter() {
  const { authReady, currentUser, adminMfaVerified, logout } = useUniBus();
  const [surface, setSurface] = useState<'public' | 'portal'>('public');
  const [publicPage, setPublicPage] = useState<PublicPage>(() => resolveInitialPublicPage());
  const [assistantOpen, setAssistantOpen] = useState(false);

  useEffect(() => {
    const onPopState = () => {
      setPublicPage(resolveInitialPublicPage());
      setSurface('public');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handlePublicNav = (page: PublicPage) => {
    setPublicPage(page);
    setSurface('public');
    if (typeof window !== 'undefined') {
      const targetPath = pageToPath(page);
      if (window.location.pathname !== targetPath) {
        window.history.pushState({}, '', targetPath);
      }
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#FAF8F3] flex items-center justify-center">
        <div className="text-sm font-semibold text-[#6E6A61]">Connecting to UniBus database...</div>
      </div>
    );
  }

  if (surface === 'portal' && currentUser) {
    if (currentUser.role === 'admin' || currentUser.role === 'moderator') {
      if (!adminMfaVerified) {
        return (
          <AdminAuthPage
            mode="admin-login"
            mfaChallengeOnly={true}
            onSwitchMode={(m) => handlePublicNav(m)}
            onSuccess={() => setSurface('portal')}
            onBackHome={() => handlePublicNav('home')}
          />
        );
      }

      return (
        <AdminConsole
          onViewPublicSite={() => handlePublicNav('home')}
          onLogout={async () => {
            await logout();
            handlePublicNav('home');
          }}
        />
      );
    }

    return (
      <>
        <StudentPortal
          onOpenAssistant={() => setAssistantOpen(true)}
          onLogout={async () => {
            await logout();
            handlePublicNav('home');
          }}
        />
        <TripAssistantWidget open={assistantOpen} onToggle={setAssistantOpen} />
      </>
    );
  }

  if (publicPage === 'admin-login' || publicPage === 'admin-accept-invite') {
    return (
      <AdminAuthPage
        mode={publicPage}
        mfaChallengeOnly={false}
        onSwitchMode={(m) => handlePublicNav(m)}
        onSuccess={() => setSurface('portal')}
        onBackHome={() => handlePublicNav('home')}
      />
    );
  }

  if (publicPage === 'login' || publicPage === 'signup') {
    return (
      <AuthPage
        mode={publicPage}
        onSwitchMode={(m) => handlePublicNav(m)}
        onSuccess={() => {
          setSurface('portal');
        }}
        onBackHome={() => handlePublicNav('home')}
        onGoAdminLogin={() => handlePublicNav('admin-login')}
      />
    );
  }

  return (
    <>
      <LandingPage
        page={publicPage}
        onNavigate={handlePublicNav}
        onGoPortal={() => setSurface('portal')}
      />
      <TripAssistantWidget open={assistantOpen} onToggle={setAssistantOpen} />
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <UniBusProvider>
        <UniBusRouter />
      </UniBusProvider>
    </ErrorBoundary>
  );
}
