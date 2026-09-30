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
    title: 'Ordonnancement des vols',
    subtitle: 'Génération automatique et validation des rotations',
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
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="hidden h-8 w-1 shrink-0 rounded-full bg-linear-to-b from-emerald-500 to-emerald-700 sm:block"
                aria-hidden="true"
              />
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
            <div className="relative shrink-0" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setIsProfileMenuOpen((previous) => !previous)}
                aria-expanded={isProfileMenuOpen}
                aria-haspopup="menu"
                aria-label="Voir les détails du compte"
                className={`group flex cursor-pointer items-center gap-2.5 rounded-full border py-1 pl-1 pr-2.5 outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
                  isProfileMenuOpen
                    ? 'border-emerald-200 bg-emerald-50/60'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <UserAvatar user={user} size="sm" />

                <div className="hidden flex-col text-left sm:flex">
                  <span className="max-w-36 truncate text-[13px] font-semibold leading-tight text-slate-900">
                    {user.nom}
                  </span>
                  <span className="max-w-36 truncate text-[11px] font-medium text-emerald-700">
                    {userRoleLabel}
                  </span>
                </div>

                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform duration-200 group-hover:text-slate-600 ${
                    isProfileMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* MENU PROFIL */}
              {isProfileMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 z-50 mt-2 w-72 origin-top-right overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-slate-900 shadow-xl shadow-slate-900/10 animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="relative px-4 pb-4 pt-5">
                    <div
                      className="absolute inset-x-0 top-0 h-14 bg-linear-to-br from-emerald-600 to-emerald-800"
                      aria-hidden="true"
                    />
                    <div className="relative flex flex-col items-center text-center">
                      <div className="rounded-full ring-4 ring-white">
                        <UserAvatar user={user} size="lg" />
                      </div>
                      <p className="mt-2.5 max-w-full truncate text-sm font-bold text-slate-900">
                        {user.nom}
                      </p>
                      <p className="mt-0.5 max-w-full truncate text-xs text-slate-500">
                        {user.email}
                      </p>
                      <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        {userRoleLabel}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 p-2">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={askLogout}
                      className="group flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 transition group-hover:bg-rose-100 group-hover:text-rose-600">
                        <LogOut className="h-4 w-4" />
                      </span>
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
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-dialog-title"
          aria-describedby="logout-dialog-desc"
          onClick={closeLogoutModal}
        >
          <section
            className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="px-6 pb-5 pt-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-8 ring-rose-50/50">
                <LogOut className="h-5 w-5" />
              </div>

              <h2 id="logout-dialog-title" className="mt-4 text-lg font-bold text-slate-900">
                Se déconnecter ?
              </h2>

              <p id="logout-dialog-desc" className="mt-1.5 text-sm leading-6 text-slate-500">
                Votre session sera fermée. Vous devrez vous reconnecter pour accéder de nouveau à la
                plateforme.
              </p>

              {/* Carte utilisateur */}
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 text-left">
                <UserAvatar user={user} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{user.nom}</p>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
                  <ShieldCheck className="h-3 w-3" />
                  {userRoleLabel}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
              <button
                type="button"
                onClick={closeLogoutModal}
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
              >
                Annuler
              </button>

              <button
                type="button"
                onClick={confirmLogout}
                autoFocus
                className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-linear-to-br from-rose-500 to-rose-600 px-4 text-sm font-semibold text-white shadow-md shadow-rose-600/25 transition hover:from-rose-600 hover:to-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/40 focus-visible:ring-offset-2"
              >
                <LogOut className="h-4 w-4" />
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