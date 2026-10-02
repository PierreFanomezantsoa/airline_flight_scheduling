// src/App.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { ReactNode } from 'react';

import { ChevronDown, LogOut, ShieldCheck, User } from 'lucide-react';

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
// SETTINGS
// =============================================================================

import { NetworkSettings } from './features/settings/NetworkSettings';

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

type AppUser = Pick<PublicUser, 'id' | 'nom' | 'email' | 'role'> & {
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

// =============================================================================
// AUTORISATIONS PAR RÔLE
// =============================================================================

const ROLE_SCREEN_PERMISSIONS: Record<UserRole, ActiveScreen[]> = {
  Admin: [
    'dashboard', 'users', 'scheduling', 'aircraft', 'flights',
    'flight-history', 'crew', 'maintenance', 'optimization',
    'settings', 'help',
  ],
  Planificateur: [
    'dashboard', 'scheduling', 'aircraft', 'airports', 'flights',
    'flight-history', 'crew', 'optimization', 'help',
  ],
  Regulator: [
    'dashboard', 'scheduling', 'airports', 'flights', 'flight-history', 'crew', 'optimization', 'settings', 'help',
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
    'maintenance', 'optimization', 'settings', 'help',
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
    subtitle: 'Vue synthétique des opérations aériennes',
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
    title: 'Gestion des avions',
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
  settings: {
    title: 'Configuration réseau',
    subtitle: 'Liaisons, fournisseurs et paramètres',
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
    id: user.id,
    nom: user.nom,
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
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-emerald-100 to-emerald-200 ring-2 ring-white shadow-sm ${dimension}`}
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.nom}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className={`font-bold text-emerald-700 ${
            size === 'sm' ? 'text-sm' : 'text-xl'
          }`}
        >
          {user.nom?.charAt(0)?.toUpperCase() || (
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

  /** Modal de confirmation de déconnexion */
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

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
    setIsLogoutModalOpen(false);
  }, []);

  const confirmLogout = useCallback(() => {
    clearAuthSession();
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SCREEN);
    setIsProfileMenuOpen(false);
    setIsLogoutModalOpen(false);
    setUser(null);
    setActiveScreenState('dashboard');
    setAuthenticationPage('user');
  }, []);

  // ===========================================================================
  // FERMETURE DU MODAL VIA ÉCHAP
  // ===========================================================================

  useEffect(() => {
    if (!isLogoutModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLogoutModalOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isLogoutModalOpen]);

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
      settings: <NetworkSettings />,
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
    <div className="min-h-screen bg-slate-50 font-sans antialiased selection:bg-emerald-500/20 selection:text-emerald-900">
      {/* SIDEBAR */}
      <Sidebar
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        user={user}
        onLogout={askLogout}
        isCollapsed={isSidebarCollapsed}
        onCollapsedChange={setIsSidebarCollapsed}
      />

      {/* CONTENU PRINCIPAL */}
      <div
        className={`flex min-h-screen w-full min-w-0 flex-col transition-[padding] duration-300 ${
          isSidebarCollapsed ? 'md:pl-19' : 'md:pl-64'
        }`}
      >
        {/* HEADER */}
        <header className="relative z-20 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-xl sm:px-6 md:sticky md:top-0 lg:px-8">
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
                    {user.nom}
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
                  className="absolute right-0 z-50 mt-2.5 w-[300px] origin-top-right overflow-hidden rounded-3xl bg-white text-slate-900 shadow-2xl shadow-emerald-950/15 ring-1 ring-slate-900/5 animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200"
                >
                  {/* Couverture */}
                  <div className="relative h-20 overflow-hidden bg-linear-to-br from-emerald-500 via-emerald-600 to-emerald-800">
                    <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/10" aria-hidden="true" />
                    <div className="absolute -left-8 -bottom-14 h-28 w-28 rounded-full bg-emerald-300/20" aria-hidden="true" />
                    <svg
                      className="absolute inset-x-0 top-6 h-10 w-full text-white/20"
                      viewBox="0 0 300 40"
                      fill="none"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path d="M-5 35 C 80 30, 170 5, 305 8" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 6" />
                    </svg>
                    <span className="absolute left-4 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/20 backdrop-blur-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-200" aria-hidden="true" />
                      En ligne
                    </span>
                  </div>

                  {/* Identité */}
                  <div className="relative z-10 -mt-9 flex flex-col items-center px-5 text-center">
                    <div className="rounded-full bg-white p-1 shadow-lg shadow-emerald-900/15">
                      <UserAvatar user={user} size="lg" />
                    </div>
                    <p className="mt-2.5 max-w-full truncate text-base font-bold tracking-tight text-slate-900">
                      {user.nom}
                    </p>
                    <p className="max-w-full truncate text-xs text-slate-500" title={user.email}>
                      {user.email}
                    </p>
                    <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200/80">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      {userRoleLabel}
                    </span>
                  </div>

                  {/* Action */}
                  <div className="p-3 pt-4">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={askLogout}
                      className="group flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/70 text-[13px] font-semibold text-slate-700 transition-all hover:border-emerald-600 hover:bg-emerald-600 hover:text-white hover:shadow-md hover:shadow-emerald-600/25 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20"
                    >
                      <LogOut className="h-4 w-4 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-white" />
                      Déconnexion
                    </button>
                  </div>
                </div>
              )}
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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          aria-describedby="logout-dialog-desc"
          onClick={closeLogoutModal}
        >
          <section
            className="w-full max-w-[360px] rounded-3xl bg-white p-6 text-center shadow-2xl shadow-emerald-950/15 ring-1 ring-slate-900/5 animate-in zoom-in-95 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 ring-8 ring-emerald-50/50">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-700/30">
                <LogOut className="h-[18px] w-[18px]" />
              </div>
            </div>

            <h2 id="logout-dialog-title" className="mt-5 text-lg font-bold tracking-tight text-slate-900">
              Se déconnecter ?
            </h2>
            <p id="logout-dialog-desc" className="mt-1.5 text-sm leading-6 text-slate-500">
              Vous allez quitter la session de{' '}
              <span className="font-semibold text-slate-800">{user.nom}</span>.
            </p>

            <div className="mt-6 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeLogoutModal}
                autoFocus
                className="inline-flex h-11 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmLogout}
                className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-md shadow-emerald-600/25 transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/30"
              >
                Se déconnecter
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;