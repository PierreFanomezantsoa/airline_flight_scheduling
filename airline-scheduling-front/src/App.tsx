// src/App.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { ReactNode } from 'react';

import { ChevronDown, LoaderCircle, LogOut, Mail, ShieldCheck, User } from 'lucide-react';

// =============================================================================
// DASHBOARD
// =============================================================================

import { DashboardGantt } from './features/dashboard/DashboardGantt';

// =============================================================================
// FLIGHT SCHEDULER
// =============================================================================

import { FlightSchedulerDashboard } from './features/FlightSchedulingDashboard/FlightSchedulerDashboard';

// =============================================================================
// FLIGHTS
// =============================================================================

import { FlightsPlanning } from './features/flights/FlightsPlanning';
import FlightHistory from './features/flights/FlightHistory';

// =============================================================================
// CREW
// =============================================================================

import CrewAssignmentsPage from './features/crew/CrewAssignmentsPage';
import CrewNotificationBell from './features/notifications/CrewNotificationBell';

import { AircraftManagement } from './features/Aircraft/AircraftManagement';
import { AirportManagement } from './features/airports/AirportManagement';

// =============================================================================
// MAINTENANCE
// =============================================================================

import { MaintenancePlanning } from './features/maintenance/MaintenancePlanning';

// =============================================================================
// DISRUPTIONS
// =============================================================================

import { DisruptionCenter } from './features/disruptions/DisruptionCenter';

// =============================================================================
// OPTIMIZATION
// =============================================================================

import { FlightOptimizationDashboard } from './features/dashboard/FlightOptimizationDashboard';

// =============================================================================
// HELP
// =============================================================================

import HelpSupportPage from './features/Aide/HelpSupportPage';

// =============================================================================
// SIDEBAR
// =============================================================================

import { Sidebar } from './features/dashboard/Sidebar';
import type { ActiveScreen } from './features/dashboard/Sidebar';

// =============================================================================
// AUTHENTIFICATION
// =============================================================================

import { AuthPage } from './features/auth/AuthPage';
import { AdminDashboard } from './features/auth/AdminDashboard';
import UsersManagementPage from './features/auth/UsersManagementPage';

// =============================================================================
// API AUTH
// =============================================================================

import {
  clearAuthSession,
  getAuthSession,
  type PublicUser,
  type UserRole,
} from './features/Api/apiService';

// =============================================================================
// TYPES
// =============================================================================

type AppUser = Pick<PublicUser, 'refUser' | 'userName' | 'email' | 'role'> & {
  avatarUrl?: string;
};

type AuthenticationPage = 'user' | 'admin';

// =============================================================================
// CONSTANTES — STORAGE KEYS
// =============================================================================

const STORAGE_KEYS = {
  ACTIVE_SCREEN: 'airline.activeScreen',
  SESSION: 'airline.session',
} as const;

// Animation courte de sortie : 1,8 s, donc largement sous la limite de 5 s.
const LOGOUT_ANIMATION_MS = 1800;

// =============================================================================
// AUTORISATIONS PAR RÔLE
// =============================================================================

const ROLE_SCREEN_PERMISSIONS: Record<UserRole, ActiveScreen[]> = {
  Admin: [
    'dashboard', 'users', 'scheduling', 'aircraft', 'airports', 'flights',
    'flight-history', 'crew', 'maintenance', 'optimization', 'help',
  ],
  Planificateur: [
    'dashboard', 'scheduling', 'aircraft', 'airports', 'flights',
    'flight-history', 'crew', 'optimization', 'help',
  ],
  Regulator: [
    'dashboard', 'scheduling', 'airports', 'flights', 'flight-history', 'crew', 'optimization', 'help',
  ],
  Maintenance_Engineer: [
    'dashboard', 'scheduling', 'aircraft', 'maintenance',
    'optimization', 'help',
  ],
  Crew_Member: [
    'dashboard', 'flights', 'flight-history', 'crew', 'help',
  ],
  Product_Owner: [
    'dashboard', 'scheduling', 'aircraft', 'flight-history',
    'maintenance', 'optimization', 'help',
  ],
};

// =============================================================================
// LABELS DES RÔLES
// =============================================================================

const ROLE_LABELS: Record<UserRole, string> = {
  Admin: 'Administrateur',
  Planificateur: 'Planificateur',
  Regulator: 'Régulateur OCC',
  Maintenance_Engineer: 'Ingénieur Maintenance',
  Crew_Member: "Membre d'équipage",
  Product_Owner: 'Product Owner',
};

// =============================================================================
// TITRES + SOUS-TITRES DES ÉCRANS
// =============================================================================

const SCREEN_META: Record<
  ActiveScreen,
  { title?: string; subtitle?: string }
> = {
  dashboard: {
    title: 'Tableau de bord opérationnel',
    subtitle: 'Suivi global des vols, des rotations et des alertes opérationnelles',
  },
  users: {
    title: 'Gestion des utilisateurs',
    subtitle: 'Comptes, rôles et permissions',
  },
  scheduling: {
    title: 'Programmation des vols',
    subtitle: 'Génération, affectation et validation du programme de vols',
  },
  aircraft: {
    title: 'Gestion des aéronefs',
    subtitle: 'Aéronefs physiques et immatriculations',
  },
  airports: {
    title: 'Gestion des aéroports',
    subtitle: 'Référentiel des aéroports et fuseaux horaires',
  },
  flights: {
    title: 'Gestion des vols',
    subtitle: 'Création, affectation et suivi des rotations',
  },
  'flight-history': {
    title: 'Historique des vols',
    subtitle: 'Archive des vols passés et indicateurs',
  },
  crew: {
    title: 'Affectation équipages',
    subtitle: 'Disponibilité, repos et rotation',
  },
  maintenance: {
    title: 'Planification maintenance',
    subtitle: 'Créneaux techniques et échéances',
  },
  optimization: {
    title: 'Optimisation automatique',
    subtitle: 'Algorithmes de génération et d’ajustement',
  },
  help: {
    title: 'Aide et support',
    subtitle: 'Documentation et assistance utilisateur',
  },
};

// =============================================================================
// HELPERS AUTORISATION
// =============================================================================

function isUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && role in ROLE_SCREEN_PERMISSIONS;
}

function getDefaultScreenForRole(role: UserRole): ActiveScreen {
  switch (role) {
    case 'Maintenance_Engineer':
      return 'maintenance';
    case 'Crew_Member':
      return 'flights';
    case 'Planificateur':
      return 'scheduling';
    case 'Admin':
      return 'dashboard';
    case 'Regulator':
    case 'Product_Owner':
    default:
      return 'dashboard';
  }
}

function isScreenAllowed(role: UserRole, screen: ActiveScreen): boolean {
  return ROLE_SCREEN_PERMISSIONS[role]?.includes(screen) ?? false;
}

function getStoredScreen(role: UserRole): ActiveScreen {
  const stored = localStorage.getItem(
    STORAGE_KEYS.ACTIVE_SCREEN
  ) as ActiveScreen | null;

  if (stored && isScreenAllowed(role, stored)) {
    return stored;
  }

  return getDefaultScreenForRole(role);
}

function normalizeAuthenticatedUser(user: PublicUser): AppUser | null {
  if (!user || !isUserRole(user.role)) {
    return null;
  }

  return {
    refUser: user.refUser,
    userName: user.userName,
    email: user.email,
    role: user.role,
  };
}

// =============================================================================
// AVATAR UTILISATEUR
// =============================================================================

interface UserAvatarProps {
  user: AppUser;
  size: 'sm' | 'lg';
}

const UserAvatar: React.FC<UserAvatarProps> = ({ user, size }) => {
  const dimension = size === 'sm' ? 'h-9 w-9' : 'h-14 w-14';

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-emerald-50 to-emerald-100 ring-2 ring-white shadow-sm ${dimension}`}
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.userName}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className={`font-bold text-emerald-700 ${
            size === 'sm' ? 'text-sm' : 'text-xl'
          }`}
        >
          {user.userName?.charAt(0)?.toUpperCase() || (
            <User className={size === 'sm' ? 'h-4 w-4' : 'h-7 w-7'} />
          )}
        </span>
      )}
    </div>
  );
};

// =============================================================================
// APP
// =============================================================================

function App() {
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const logoutTimerRef = useRef<number | null>(null);

  const initialSession = useMemo(() => getAuthSession(), []);

  const initialUser = useMemo(() => {
    if (!initialSession?.user) return null;
    return normalizeAuthenticatedUser(initialSession.user);
  }, [initialSession]);

  // ===========================================================================
  // STATE
  // ===========================================================================

  const [user, setUser] = useState<AppUser | null>(initialUser);

  const [activeScreen, setActiveScreenState] = useState<ActiveScreen>(() => {
    if (!initialUser) return 'dashboard';
    return getStoredScreen(initialUser.role);
  });

  const [authenticationPage, setAuthenticationPage] =
    useState<AuthenticationPage>('user');

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Un seul abonnement aux notifications selon le format d'écran.
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobileViewport(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  /** Modal de confirmation de déconnexion */
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  /** Affiche l'animation de fermeture de session. */
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isAuthenticated = user !== null;

  // ===========================================================================
  // NAVIGATION
  // ===========================================================================

  const setActiveScreen = useCallback(
    (screen: ActiveScreen) => {
      if (!user) return;
      if (!isScreenAllowed(user.role, screen)) return;

      setActiveScreenState(screen);
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SCREEN, screen);
      setIsProfileMenuOpen(false);
    },
    [user]
  );

  // ===========================================================================
  // CONTRÔLE DES AUTORISATIONS
  // ===========================================================================

  useEffect(() => {
    if (!user) return;
    if (isScreenAllowed(user.role, activeScreen)) return;

    const fallback = getDefaultScreenForRole(user.role);
    setActiveScreenState(fallback);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SCREEN, fallback);
  }, [user, activeScreen]);

  // ===========================================================================
  // FERMETURE MENU PROFIL
  // ===========================================================================

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node)
      ) {
        setIsProfileMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsProfileMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // ===========================================================================
  // SYNCHRONISATION ENTRE ONGLETS
  // ===========================================================================

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEYS.ACTIVE_SCREEN) return;
      if (!event.newValue || !user) return;

      const newScreen = event.newValue as ActiveScreen;
      if (isScreenAllowed(user.role, newScreen)) {
        setActiveScreenState(newScreen);
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [user]);

  // ===========================================================================
  // AUTHENTIFICATION RÉUSSIE
  // ===========================================================================

  const handleAuthenticate = useCallback((nextUser: AppUser) => {
    if (!nextUser || !isUserRole(nextUser.role)) {
      clearAuthSession();
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SCREEN);
      setUser(null);
      setActiveScreenState('dashboard');
      setAuthenticationPage('user');
      return;
    }

    setUser(nextUser);
    setIsProfileMenuOpen(false);
    setAuthenticationPage('user');

    if (nextUser.role === 'Admin') {
      setActiveScreenState('dashboard');
      localStorage.setItem(STORAGE_KEYS.ACTIVE_SCREEN, 'dashboard');
      return;
    }

    const targetScreen = getStoredScreen(nextUser.role);
    setActiveScreenState(targetScreen);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SCREEN, targetScreen);
  }, []);

  // ===========================================================================
  // AUTH ADMIN
  // ===========================================================================

  const handleOpenAdminAuthentication = useCallback(() => {
    setAuthenticationPage('admin');
  }, []);

  const handleBackToUserAuthentication = useCallback(() => {
    setAuthenticationPage('user');
  }, []);

  const handleAdminAuthenticate = useCallback(
    (adminUser: AppUser) => {
      if (!adminUser || adminUser.role !== 'Admin') return;
      handleAuthenticate(adminUser);
    },
    [handleAuthenticate]
  );

  // ===========================================================================
  // LOGOUT
  // ===========================================================================

  const askLogout = useCallback(() => {
    setIsProfileMenuOpen(false);
    setIsLogoutModalOpen(true);
  }, []);

  const closeLogoutModal = useCallback(() => {
    if (isLoggingOut) return;
    setIsLogoutModalOpen(false);
  }, [isLoggingOut]);

  const confirmLogout = useCallback(() => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setIsProfileMenuOpen(false);

    if (logoutTimerRef.current !== null) {
      window.clearTimeout(logoutTimerRef.current);
    }

    logoutTimerRef.current = window.setTimeout(() => {
      clearAuthSession();
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SCREEN);
      setUser(null);
      setActiveScreenState('dashboard');
      setAuthenticationPage('user');
      setIsLogoutModalOpen(false);
      setIsLoggingOut(false);
      logoutTimerRef.current = null;
    }, LOGOUT_ANIMATION_MS);
  }, [isLoggingOut]);

  useEffect(() => {
    return () => {
      if (logoutTimerRef.current !== null) {
        window.clearTimeout(logoutTimerRef.current);
      }
    };
  }, []);

  // ===========================================================================
  // FERMETURE DU MODAL VIA ÉCHAP
  // ===========================================================================

  useEffect(() => {
    if (!isLogoutModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isLoggingOut) {
        setIsLogoutModalOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isLogoutModalOpen, isLoggingOut]);

  // ===========================================================================
  // ROUTAGE DES ÉCRANS
  // ===========================================================================

  const renderScreen: Record<ActiveScreen, ReactNode> = useMemo(
    () => ({
      dashboard: <DashboardGantt />,
      users: <UsersManagementPage />,
      scheduling: <FlightSchedulerDashboard />,
      aircraft: <AircraftManagement />,
      airports: <AirportManagement />,
      flights: <FlightsPlanning />,
      'flight-history': <FlightHistory />,
      crew: <CrewAssignmentsPage />,
      maintenance: <MaintenancePlanning />,
      disruptions: <DisruptionCenter />,
      optimization: <FlightOptimizationDashboard />,
      help: <HelpSupportPage />,
    }),
    []
  );

  // ===========================================================================
  // PAGE AUTH
  // ===========================================================================

  if (!isAuthenticated || !user) {
    if (authenticationPage === 'admin') {
      return (
        <AdminDashboard
          onAuthenticate={handleAdminAuthenticate}
          onBack={handleBackToUserAuthentication}
        />
      );
    }

    return (
      <AuthPage
        onAuthenticate={handleAuthenticate}
        onAdminDashboard={handleOpenAdminAuthentication}
      />
    );
  }

  // ===========================================================================
  // USER ROLE
  // ===========================================================================

  const userRoleLabel = ROLE_LABELS[user.role] ?? user.role;
  const screenMeta = SCREEN_META[activeScreen] ?? { title: '', subtitle: '' };

  // ===========================================================================
  // APPLICATION
  // ===========================================================================

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans antialiased selection:bg-emerald-500/20 selection:text-emerald-900">
      {/* SIDEBAR */}
      <Sidebar
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        user={user}
        onLogout={askLogout}
        isCollapsed={isSidebarCollapsed}
        onCollapsedChange={setIsSidebarCollapsed}
        isMobileViewport={isMobileViewport}
      />

      {/* CONTENU PRINCIPAL */}
      <div
        className={`flex min-h-screen w-full min-w-0 flex-col transition-[padding] duration-300 ${
          isSidebarCollapsed ? 'md:pl-19' : 'md:pl-64'
        }`}
      >
        {/* HEADER */}
        <header className="relative z-20 md:border-b md:border-slate-200/80 md:bg-white/85 px-4 md:backdrop-blur-xl sm:px-6 md:sticky md:top-0 lg:px-8">
          <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                {screenMeta.title && (
                  <h1 className="truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg">
                    {screenMeta.title}
                  </h1>
                )}
                {screenMeta.subtitle && (
                  <p className="truncate text-xs text-slate-500">{screenMeta.subtitle}</p>
                )}
              </div>
            </div>

            {/* ACTIONS DE LA BARRE SUPÉRIEURE */}
            <div className="flex shrink-0 items-center gap-2">
              {user.role === 'Crew_Member' && !isMobileViewport && (
                <CrewNotificationBell userRef={user.refUser} />
              )}

              {/* PROFIL */}
              <div className="relative hidden shrink-0 md:block" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen((previous) => !previous)}
                  aria-expanded={isProfileMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Voir les détails du compte"
                  className={`group flex cursor-pointer items-center gap-3 rounded-2xl py-1.5 pl-1.5 pr-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
                    isProfileMenuOpen ? 'bg-emerald-50' : 'hover:bg-slate-100/80'
                  }`}
                >
                  <span className="relative shrink-0">
                    <UserAvatar user={user} size="sm" />
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
                      aria-hidden="true"
                    />
                  </span>

                  <div className="hidden flex-col text-left sm:flex">
                    <span className="max-w-36 truncate text-[13px] font-bold leading-tight text-slate-900">
                      {user.userName}
                    </span>
                    <span className="mt-0.5 max-w-36 truncate text-[11px] font-medium text-slate-500">
                      {userRoleLabel}
                    </span>
                  </div>

                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors ${
                      isProfileMenuOpen
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 group-hover:bg-white group-hover:text-slate-600'
                    }`}
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-200 ${
                        isProfileMenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </span>
                </button>

                {/* MENU PROFIL */}
                {isProfileMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Compte"
                    className="absolute right-0 z-50 mt-2 w-[290px] origin-top-right overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl shadow-slate-900/10 ring-1 ring-slate-200 animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150"
                  >
                    {/* Bandeau fin avec dégradé */}
                    <div
                      className="h-1.5 bg-linear-to-r from-emerald-400 via-emerald-500 to-teal-500"
                      aria-hidden="true"
                    />

                    {/* Identité : avatar à gauche, infos à droite */}
                    <div className="flex items-center gap-3.5 px-4 pb-3 pt-4">
                      <div className="relative shrink-0">
                        <UserAvatar user={user} size="lg" />
                        <span
                          className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-emerald-500 ring-[3px] ring-white"
                          title="En ligne"
                          aria-label="En ligne"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-bold leading-tight tracking-tight text-slate-900">
                          {user.userName}
                        </p>
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200/70">
                          <ShieldCheck className="h-3 w-3" />
                          {userRoleLabel}
                        </span>
                      </div>
                    </div>

                    {/* Email */}
                    <div className="mx-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-100">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="truncate text-xs text-slate-600" title={user.email}>
                        {user.email}
                      </span>
                    </div>

                    <div className="my-3 h-px bg-slate-100" aria-hidden="true" />

                    {/* Action */}
                    <div className="px-2 pb-2">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={askLogout}
                        className="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold text-slate-700 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition-colors group-hover:bg-rose-100 group-hover:text-rose-600">
                          <LogOut className="h-4 w-4" />
                        </span>
                        <span className="flex-1">Déconnexion</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* MAIN */}
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-3 sm:p-5 lg:p-6">
          <div key={activeScreen} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {renderScreen[activeScreen] ?? <DashboardGantt />}
          </div>
        </main>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL DE DÉCONNEXION
      ═════════════════════════════════════════════════════════════════════ */}
      {isLogoutModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-blue-950/45 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          aria-describedby="logout-dialog-desc"
          onClick={closeLogoutModal}
        >
          <section
            className={`w-full max-w-[430px] overflow-hidden rounded-3xl border border-blue-100 bg-white text-left shadow-2xl shadow-blue-950/20 animate-in zoom-in-95 duration-200 ${
              isLoggingOut ? 'pointer-events-none' : ''
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="h-1.5 bg-linear-to-r from-blue-400 via-blue-600 to-blue-800" aria-hidden="true" />
            <div className="p-6 sm:p-7">
              {isLoggingOut ? (
                <div role="status" aria-live="polite">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100">
                      <LoaderCircle className="h-7 w-7 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <h2 id="logout-dialog-title" className="text-lg font-bold tracking-tight text-slate-900">
                        Déconnexion en cours
                      </h2>
                      <p id="logout-dialog-desc" className="mt-1 text-sm leading-5 text-slate-500">
                        Fermeture de votre session…
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-200 bg-blue-50 text-blue-600">
                      <LogOut className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <h2 id="logout-dialog-title" className="text-xl font-bold tracking-tight text-slate-900">
                        Se déconnecter ?
                      </h2>
                      <p id="logout-dialog-desc" className="mt-1 text-sm leading-6 text-slate-500">
                        Votre session sera fermée et vous reviendrez à la page de connexion.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex items-center gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3">
                    <UserAvatar user={user} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{user.userName}</p>
                      <p className="truncate text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closeLogoutModal}
                      autoFocus
                      className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 sm:w-auto"
                    >
                      Rester connecté
                    </button>
                    <button
                      type="button"
                      onClick={confirmLogout}
                      className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 sm:w-auto"
                    >
                      <LogOut className="h-4 w-4 shrink-0" />
                      <span>Se déconnecter</span>
                    </button>
                  </div>
                </>
              )}
            </div>

          </section>
        </div>
      )}
    </div>
  );
}

export default App;
