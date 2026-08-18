import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ChevronDown,
  LogOut,
  ShieldCheck,
  User,
} from 'lucide-react';

import { DashboardGantt } from './features/dashboard/DashboardGantt';
import { FlightSchedulerDashboard } from './features/dashboard/FlightSchedulerDashboard';

import { FlightsPlanning } from './features/flights/FlightsPlanning';
import FlightHistory from './features/flights/FlightHistory';

import CrewAssignmentsPage from './features/crew/CrewAssignmentsPage';

import { FleetManagement } from './features/fleet/FleetManagement';
import { AircraftManagement } from './features/Aircraft/AircraftManagement';

import { MaintenancePlanning } from './features/maintenance/MaintenancePlanning';
import { DisruptionCenter } from './features/disruptions/DisruptionCenter';
import { NetworkSettings } from './features/settings/NetworkSettings';

import { FlightOptimizationDashboard } from './features/dashboard/FlightOptimizationDashboard';

import { Sidebar } from './features/dashboard/Sidebar';
import type { ActiveScreen } from './features/dashboard/Sidebar';

import { AuthPage } from './features/auth/AuthPage';

import {
  clearAuthSession,
  getAuthSession,
  type PublicUser,
  type UserRole,
} from './features/Api/apiService';

// =============================================================================
// AUTH / AUTORISATIONS
// =============================================================================

type AppUser = Pick<
  PublicUser,
  'id' | 'nom' | 'email' | 'role'
> & {
  avatarUrl?: string;
};

// =============================================================================
// AUTORISATIONS PAR RÔLE
// =============================================================================

const ROLE_SCREEN_PERMISSIONS: Record<
  UserRole,
  ActiveScreen[]
> = {
  Admin: [
    'dashboard',
    'scheduling',
    'fleet',
    'aircraft',
    'flights',
    'flight-history',
    'crew',
    'maintenance',
    'disruptions',
    'optimization',
    'settings',
  ],

  Planificateur: [
    'dashboard',
    'scheduling',
    'fleet',
    'aircraft',
    'flights',
    'flight-history',
    'crew',
    'optimization',
  ],

  Regulator: [
    'dashboard',
    'scheduling',
    'flights',
    'flight-history',
    'crew',
    'disruptions',
    'optimization',
    'settings',
  ],

  Maintenance_Engineer: [
    'dashboard',
    'scheduling',
    'fleet',
    'aircraft',
    'maintenance',
    'optimization',
  ],

  Crew_Member: [
    'dashboard',
    'flights',
    'flight-history',
    'crew',
  ],

  Product_Owner: [
    'dashboard',
    'scheduling',
    'fleet',
    'aircraft',
    'flight-history',
    'maintenance',
    'disruptions',
    'optimization',
    'settings',
  ],
};

// =============================================================================
// LIBELLÉS DES RÔLES
// =============================================================================

const ROLE_LABELS: Record<
  UserRole,
  string
> = {
  Admin: 'Administrateur',

  Planificateur:
    'Planificateur',

  Regulator:
    'Régulateur',

  Maintenance_Engineer:
    'Ingénieur Maintenance',

  Crew_Member:
    "Membre d'équipage",

  Product_Owner:
    'Product Owner',
};

// =============================================================================
// TITRES DES ÉCRANS
// =============================================================================

const SCREEN_META: Record<
  ActiveScreen,
  {
    title: string;
  }
> = {
  dashboard: {
    title:
      'Tableau de bord opérationnel',
  },

  scheduling: {
    title:
      'Ordonnancement et Matrice',
  },

  fleet: {
    title:
      'Flotte — Types d’avion',
  },

  aircraft: {
    title:
      'Gestion des Avions',
  },

  flights: {
    title:
      'Planification des Vols',
  },

  'flight-history': {
    title:
      'Historique des Vols',
  },

  crew: {
    title:
      'Affectation Équipages',
  },

  maintenance: {
    title:
      'Planification Maintenance',
  },

  disruptions: {
    title:
      'Centre de Crise',
  },

  optimization: {
    title:
      'Optimisation Automatique',
  },

  settings: {
    title:
      'Configuration Réseau',
  },
};

// =============================================================================
// VÉRIFICATION DU RÔLE
// =============================================================================

function isUserRole(
  role: unknown,
): role is UserRole {
  return (
    typeof role ===
      'string' &&
    role in
      ROLE_SCREEN_PERMISSIONS
  );
}

// =============================================================================
// ÉCRAN PAR DÉFAUT SELON LE RÔLE
// =============================================================================

function getDefaultScreenForRole(
  role: UserRole,
): ActiveScreen {
  if (
    role ===
    'Maintenance_Engineer'
  ) {
    return 'maintenance';
  }

  if (
    role ===
    'Crew_Member'
  ) {
    return 'flights';
  }

  return 'dashboard';
}

// =============================================================================
// AUTORISATION D'ACCÈS À UN ÉCRAN
// =============================================================================

function isScreenAllowed(
  role: UserRole,
  screen: ActiveScreen,
): boolean {
  return (
    ROLE_SCREEN_PERMISSIONS[
      role
    ]?.includes(
      screen,
    ) ?? false
  );
}

// =============================================================================
// RÉCUPÉRATION DU DERNIER ÉCRAN UTILISÉ
// =============================================================================

function getStoredScreen(
  role: UserRole,
): ActiveScreen {
  const stored =
    localStorage.getItem(
      'airline.activeScreen',
    ) as
      | ActiveScreen
      | null;

  if (
    stored &&
    isScreenAllowed(
      role,
      stored,
    )
  ) {
    return stored;
  }

  return getDefaultScreenForRole(
    role,
  );
}

// =============================================================================
// NORMALISATION UTILISATEUR
// =============================================================================

function normalizeAuthenticatedUser(
  user: PublicUser,
): AppUser | null {
  if (
    !isUserRole(
      user.role,
    )
  ) {
    return null;
  }

  return {
    id: user.id,

    nom: user.nom,

    email:
      user.email,

    role:
      user.role,
  };
}

// =============================================================================
// FLOTTE : AIRCRAFT vs AIRCRAFT TYPE
// =============================================================================

type FleetView =
  | 'aircrafts'
  | 'aircraft-types';

// =============================================================================
// WORKSPACE FLOTTE
// =============================================================================

function FleetWorkspace() {
  const [
    fleetView,
    setFleetView,
  ] =
    useState<FleetView>(
      'aircrafts',
    );

  return (
    <section className="space-y-5">

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xs">

        <button
          type="button"
          onClick={() =>
            setFleetView(
              'aircrafts',
            )
          }
          className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
            fleetView ===
            'aircrafts'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Avions de la flotte
        </button>

        <button
          type="button"
          onClick={() =>
            setFleetView(
              'aircraft-types',
            )
          }
          className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
            fleetView ===
            'aircraft-types'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Types d&apos;avion
        </button>

      </div>

      {fleetView ===
      'aircrafts' ? (
        <AircraftManagement />
      ) : (
        <FleetManagement />
      )}

    </section>
  );
}

// =============================================================================
// APP
// =============================================================================

function App() {
  const profileMenuRef =
    useRef<HTMLDivElement>(
      null,
    );

  // ===========================================================================
  // SESSION INITIALE
  // ===========================================================================

  const initialSession =
    useMemo(
      () =>
        getAuthSession(),
      [],
    );

  const initialUser =
    useMemo(() => {
      return initialSession?.user
        ? normalizeAuthenticatedUser(
            initialSession.user,
          )
        : null;
    }, [
      initialSession,
    ]);

  // ===========================================================================
  // ÉTATS
  // ===========================================================================

  const [
    user,
    setUser,
  ] =
    useState<AppUser | null>(
      initialUser,
    );

  const [
    activeScreen,
    setActiveScreenState,
  ] =
    useState<ActiveScreen>(
      () => {
        if (
          !initialUser
        ) {
          return 'dashboard';
        }

        return getStoredScreen(
          initialUser.role,
        );
      },
    );

  const [
    isProfileMenuOpen,
    setIsProfileMenuOpen,
  ] =
    useState(
      false,
    );

  // ===========================================================================
  // AUTHENTIFICATION
  // ===========================================================================

  const isAuthenticated =
    user !== null &&
    initialSession !==
      null;

  // ===========================================================================
  // CHANGEMENT D'ÉCRAN
  // ===========================================================================

  const setActiveScreen =
    useCallback(
      (
        screen:
          ActiveScreen,
      ) => {
        if (
          !user ||
          !isScreenAllowed(
            user.role,
            screen,
          )
        ) {
          return;
        }

        setActiveScreenState(
          screen,
        );

        localStorage.setItem(
          'airline.activeScreen',
          screen,
        );
      },
      [
        user,
      ],
    );

  // ===========================================================================
  // SYNCHRONISATION DES AUTORISATIONS
  // ===========================================================================

  useEffect(() => {
    if (
      !user
    ) {
      return;
    }

    if (
      !isScreenAllowed(
        user.role,
        activeScreen,
      )
    ) {
      const fallback =
        getDefaultScreenForRole(
          user.role,
        );

      setActiveScreenState(
        fallback,
      );

      localStorage.setItem(
        'airline.activeScreen',
        fallback,
      );
    }
  }, [
    user,
    activeScreen,
  ]);

  // ===========================================================================
  // FERMETURE DU MENU PROFIL
  // CLIC EXTÉRIEUR + TOUCHE ÉCHAP
  // ===========================================================================

  useEffect(() => {
    const handleClickOutside =
      (
        event:
          MouseEvent,
      ) => {
        if (
          profileMenuRef.current &&
          !profileMenuRef.current.contains(
            event.target as Node,
          )
        ) {
          setIsProfileMenuOpen(
            false,
          );
        }
      };

    const handleKeyDown =
      (
        event:
          KeyboardEvent,
      ) => {
        if (
          event.key ===
          'Escape'
        ) {
          setIsProfileMenuOpen(
            false,
          );
        }
      };

    document.addEventListener(
      'mousedown',
      handleClickOutside,
    );

    document.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handleClickOutside,
      );

      document.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, []);

  // ===========================================================================
  // AUTHENTIFICATION RÉUSSIE
  // ===========================================================================

  const handleAuthenticate =
    (
      nextUser:
        AppUser,
    ) => {
      if (
        !isUserRole(
          nextUser.role,
        )
      ) {
        clearAuthSession();

        setUser(
          null,
        );

        return;
      }

      setUser(
        nextUser,
      );

      const targetScreen =
        getStoredScreen(
          nextUser.role,
        );

      setActiveScreenState(
        targetScreen,
      );
    };

  // ===========================================================================
  // DÉCONNEXION
  // ===========================================================================

  const handleLogout =
    useCallback(
      () => {
        clearAuthSession();

        localStorage.removeItem(
          'airline.activeScreen',
        );

        setIsProfileMenuOpen(
          false,
        );

        setUser(
          null,
        );

        setActiveScreenState(
          'dashboard',
        );
      },
      [],
    );

  // ===========================================================================
  // ROUTAGE INTERNE DES COMPOSANTS
  // ===========================================================================

  const renderScreen:
    Record<
      ActiveScreen,
      React.ReactNode
    > = {
      dashboard: (
        <DashboardGantt />
      ),

      scheduling: (
        <FlightSchedulerDashboard />
      ),

      fleet: (
        <FleetWorkspace />
      ),

      aircraft: (
        <AircraftManagement />
      ),

      flights: (
        <FlightsPlanning />
      ),

      'flight-history': (
        <FlightHistory />
      ),

      // =========================================================================
      // NOUVELLE PAGE D'AFFECTATION ÉQUIPAGE
      // =========================================================================

      crew: (
        <CrewAssignmentsPage />
      ),

      maintenance: (
        <MaintenancePlanning />
      ),

      disruptions: (
        <DisruptionCenter />
      ),

      optimization: (
        <FlightOptimizationDashboard />
      ),

      settings: (
        <NetworkSettings />
      ),
    };

  // ===========================================================================
  // PAGE DE CONNEXION
  // ===========================================================================

  if (
    !isAuthenticated ||
    !user
  ) {
    return (
      <AuthPage
        onAuthenticate={
          handleAuthenticate
        }
      />
    );
  }

  // ===========================================================================
  // NOM DU RÔLE
  // ===========================================================================

  const userRoleLabel =
    ROLE_LABELS[
      user.role
    ] ??
    user.role;

  // ===========================================================================
  // AFFICHAGE PRINCIPAL
  // ===========================================================================

  return (
    <div className="flex min-h-screen flex-col bg-gray-100 font-sans antialiased selection:bg-emerald-500/20 selection:text-emerald-900 md:flex-row">

      {/* =====================================================================
          SIDEBAR
      ===================================================================== */}

      <Sidebar
        activeScreen={
          activeScreen
        }
        setActiveScreen={
          setActiveScreen
        }
        user={
          user
        }
        onLogout={
          handleLogout
        }
      />

      {/* =====================================================================
          CONTENU
      ===================================================================== */}

      <div className="mb-16 flex min-h-screen min-w-0 flex-1 flex-col md:mb-0">

        {/* ===================================================================
            HEADER
        =================================================================== */}

        <header className="sticky top-0 z-30 border-b border-gray-200 bg-gray-100/90 px-4 py-5 backdrop-blur-md transition-all sm:px-8">

          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">

            {/* TITRE */}

            <div className="min-w-0">

              <h2 className="truncate text-lg font-extrabold tracking-tight text-slate-800 sm:text-xl">

                {
                  SCREEN_META[
                    activeScreen
                  ]?.title ??
                  'Tableau de bord'
                }

              </h2>

            </div>

            {/* ACTIONS HEADER */}

            <div className="flex shrink-0 items-center gap-3">

              <div />

              {/* PROFIL */}

              <div
                className="relative shrink-0"
                ref={
                  profileMenuRef
                }
              >

                <button
                  type="button"
                  onClick={() =>
                    setIsProfileMenuOpen(
                      (
                        prev,
                      ) =>
                        !prev,
                    )
                  }
                  aria-expanded={
                    isProfileMenuOpen
                  }
                  aria-label="Voir les détails du compte"
                  className="group flex cursor-pointer items-center gap-3 rounded-xl border-none bg-transparent p-1.5 outline-hidden transition-all hover:bg-gray-200/80"
                >

                  {/* AVATAR */}

                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-200 bg-emerald-100 shadow-xs transition-transform group-hover:scale-105">

                    {user.avatarUrl ? (

                      <img
                        src={
                          user.avatarUrl
                        }
                        alt={
                          user.nom
                        }
                        className="h-full w-full object-cover"
                      />

                    ) : (

                      <span className="text-sm font-extrabold text-emerald-700">

                        {
                          user.nom
                            .charAt(
                              0,
                            )
                            .toUpperCase() ||
                          (
                            <User className="h-4 w-4" />
                          )
                        }

                      </span>

                    )}

                  </div>

                  {/* UTILISATEUR */}

                  <div className="hidden flex-col text-left sm:flex">

                    <span className="max-w-30 truncate text-xs font-bold leading-tight text-slate-800">
                      {
                        user.nom
                      }
                    </span>

                    <span className="mt-0.5 max-w-30 truncate text-[10px] font-medium text-slate-500">
                      {
                        userRoleLabel
                      }
                    </span>

                  </div>

                  <ChevronDown className="h-4 w-4 text-slate-400 transition-transform duration-200 group-hover:text-slate-600" />

                </button>

                {/* =============================================================
                    MENU PROFIL
                ============================================================= */}

                {isProfileMenuOpen && (

                  <div className="animate-in fade-in slide-in-from-top-2 absolute right-0 z-50 mt-2 w-64 rounded-2xl border border-gray-200 bg-white py-3 text-slate-900 shadow-xl duration-150">

                    <div className="flex flex-col items-center border-b border-gray-100 px-4 pb-3 pt-1 text-center">

                      {/* AVATAR */}

                      <div className="mb-2.5 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-emerald-200 bg-emerald-100 shadow-xs">

                        {user.avatarUrl ? (

                          <img
                            src={
                              user.avatarUrl
                            }
                            alt={
                              user.nom
                            }
                            className="h-full w-full object-cover"
                          />

                        ) : (

                          <span className="text-xl font-black text-emerald-700">

                            {
                              user.nom
                                .charAt(
                                  0,
                                )
                                .toUpperCase() ||
                              (
                                <User className="h-7 w-7" />
                              )
                            }

                          </span>

                        )}

                      </div>

                      {/* NOM */}

                      <p className="max-w-full truncate text-sm font-bold text-slate-900">
                        {
                          user.nom
                        }
                      </p>

                      {/* EMAIL */}

                      <p className="mt-0.5 max-w-full truncate text-xs text-slate-500">
                        {
                          user.email
                        }
                      </p>

                      {/* RÔLE */}

                      <span className="mt-2 inline-flex items-center gap-1 rounded-md border border-emerald-200/60 bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">

                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />

                        {
                          userRoleLabel
                        }

                      </span>

                    </div>

                    {/* DÉCONNEXION */}

                    <div className="px-2 pt-2">

                      <button
                        type="button"
                        onClick={
                          handleLogout
                        }
                        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-none bg-transparent px-4 py-2 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50"
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

        {/* ===================================================================
            CONTENU PRINCIPAL
        =================================================================== */}

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6 lg:p-8">

          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">

            {
              renderScreen[
                activeScreen
              ] ?? (
                <DashboardGantt />
              )
            }

          </div>

        </main>

      </div>

    </div>
  );
}

export default App;