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

// =============================================================================
// FLEET
// =============================================================================

import { AircraftManagement } from './features/Aircraft/AircraftManagement';

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
    'dashboard', 'users', 'scheduling', 'fleet', 'aircraft', 'flights',
    'flight-history', 'crew', 'maintenance', 'optimization',
    'settings', 'help',
  ],
  Planificateur: [
    'dashboard', 'scheduling', 'fleet', 'aircraft', 'flights',
    'flight-history', 'crew', 'optimization', 'help',
  ],
  Regulator: [
    'dashboard', 'scheduling', 'flights', 'flight-history', 'crew', 'optimization', 'settings', 'help',
  ],
  Maintenance_Engineer: [
    'dashboard', 'scheduling', 'fleet', 'aircraft', 'maintenance',
    'optimization', 'help',
  ],
  Crew_Member: [
    'dashboard', 'flights', 'flight-history', 'crew', 'help',
  ],
  Product_Owner: [
    'dashboard', 'scheduling', 'fleet', 'aircraft', 'flight-history',
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
    title: 'Planification et programmation des vols',
    subtitle: 'Génération automatique et validation des scénarios',
  },
  fleet: { title: '', subtitle: '' },
  aircraft: {
    title: 'Gestion des avions',
    subtitle: 'Aéronefs physiques et immatriculations',
  },
  flights: {
    title: 'Planification des vols',
    subtitle: 'Création, affectation et suivi',
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
// WORKSPACE FLOTTE (SANS ONGLETS)
// =============================================================================

function FleetWorkspace() {
  return (
    <section className="space-y-5">
      <AircraftManagement />
    </section>
  );
}

// =============================================================================
// AVATAR UTILISATEUR (émeraude)
// =============================================================================

interface UserAvatarProps {
  user: AppUser;
  size: 'sm' | 'lg';
}

const UserAvatar: React.FC<UserAvatarProps> = ({ user, size }) => {
  const dimension = size === 'sm' ? 'h-9 w-9' : 'h-14 w-14';

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-200 bg-emerald-100 shadow-sm ${dimension}`}
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

  // ===========================================================================
  // SESSION INITIALE
  // ===========================================================================

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

  /** ✅ État de collapse de la sidebar (contrôlé ici, partagé avec Sidebar) */
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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

  const handleLogout = useCallback(() => {
    clearAuthSession();
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_SCREEN);
    setIsProfileMenuOpen(false);
    setUser(null);
    setActiveScreenState('dashboard');
    setAuthenticationPage('user');
  }, []);

  // ===========================================================================
  // ROUTAGE DES ÉCRANS
  // ===========================================================================

  const renderScreen: Record<ActiveScreen, ReactNode> = useMemo(
    () => ({
      dashboard: <DashboardGantt />,
      users: <UsersManagementPage />,
      scheduling: <FlightSchedulerDashboard />,
      fleet: <FleetWorkspace />,
      aircraft: <AircraftManagement />,
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
      {/* =====================================================================
          SIDEBAR (position fixed, largeur dynamique)
      ===================================================================== */}
      <Sidebar
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        user={user}
        onLogout={handleLogout}
        isCollapsed={isSidebarCollapsed}
        onCollapsedChange={setIsSidebarCollapsed}
      />

      {/* =====================================================================
          CONTENU PRINCIPAL — padding-left dynamique selon l'état de la sidebar
      ===================================================================== */}
      <div
        className={`flex min-h-screen w-full min-w-0 flex-col transition-[padding] duration-300 ${
          isSidebarCollapsed ? 'md:pl-[76px]' : 'md:pl-[240px]'
        }`}
      >
        {/* HEADER */}
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3.5 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4">
            {/* TITRE + SOUS-TITRE */}
            <div className="min-w-0">
              {screenMeta.title && (
                <h2 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">
                  {screenMeta.title}
                </h2>
              )}
              {screenMeta.subtitle && (
                <p className="mt-0.5 truncate text-xs text-slate-500 sm:text-[13px]">
                  {screenMeta.subtitle}
                </p>
              )}
            </div>

            {/* PROFIL */}
            <div className="flex shrink-0 items-center gap-3">
              <div className="relative shrink-0" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() =>
                    setIsProfileMenuOpen((previous) => !previous)
                  }
                  aria-expanded={isProfileMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Voir les détails du compte"
                  className="group flex cursor-pointer items-center gap-3 rounded-xl bg-transparent p-1.5 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                >
                  <div className="transition-transform group-hover:scale-105">
                    <UserAvatar user={user} size="sm" />
                  </div>

                  <div className="hidden flex-col text-left sm:flex">
                    <span className="max-w-36 truncate text-[13px] font-semibold leading-tight text-slate-900">
                      {user.nom}
                    </span>
                    <span className="mt-0.5 max-w-36 truncate text-[11px] text-slate-500">
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
                    className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white py-3 text-slate-900 shadow-xl"
                  >
                    <div className="flex flex-col items-center border-b border-slate-100 px-4 pb-3 pt-1 text-center">
                      <div className="mb-2.5">
                        <UserAvatar user={user} size="lg" />
                      </div>

                      <p className="max-w-full truncate text-sm font-semibold text-slate-900">
                        {user.nom}
                      </p>

                      <p className="mt-0.5 max-w-full truncate text-xs text-slate-500">
                        {user.email}
                      </p>

                      <span className="mt-2 inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                        {userRoleLabel}
                      </span>
                    </div>

                    <div className="px-2 pt-2">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleLogout}
                        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-transparent px-4 py-2 text-[13px] font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <LogOut className="h-4 w-4" />
                        Déconnexion
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
          <div
            key={activeScreen}
            className="animate-in fade-in slide-in-from-bottom-2 duration-300"
          >
            {renderScreen[activeScreen] ?? <DashboardGantt />}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;