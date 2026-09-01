// src/App.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  ReactNode,
} from 'react';

import {
  ChevronDown,
  LogOut,
  ShieldCheck,
  User,
} from 'lucide-react';

// =============================================================================
// DASHBOARD
// =============================================================================

import {
  DashboardGantt,
} from './features/dashboard/DashboardGantt';

import {
  FlightSchedulerDashboard,
} from './features/dashboard/FlightSchedulerDashboard';

// =============================================================================
// FLIGHTS
// =============================================================================

import {
  FlightsPlanning,
} from './features/flights/FlightsPlanning';

import FlightHistory
  from './features/flights/FlightHistory';

// =============================================================================
// CREW
// =============================================================================

import CrewAssignmentsPage
  from './features/crew/CrewAssignmentsPage';

// =============================================================================
// FLEET
// =============================================================================

import {
  FleetManagement,
} from './features/fleet/FleetManagement';

import {
  AircraftManagement,
} from './features/Aircraft/AircraftManagement';

// =============================================================================
// MAINTENANCE
// =============================================================================

import {
  MaintenancePlanning,
} from './features/maintenance/MaintenancePlanning';

// =============================================================================
// DISRUPTIONS
// =============================================================================

import {
  DisruptionCenter,
} from './features/disruptions/DisruptionCenter';

// =============================================================================
// SETTINGS
// =============================================================================

import {
  NetworkSettings,
} from './features/settings/NetworkSettings';

// =============================================================================
// OPTIMIZATION
// =============================================================================

import {
  FlightOptimizationDashboard,
} from './features/dashboard/FlightOptimizationDashboard';

// =============================================================================
// HELP
// =============================================================================

import HelpSupportPage
  from './features/Aide/HelpSupportPage';

// =============================================================================
// SIDEBAR
// =============================================================================

import {
  Sidebar,
} from './features/dashboard/Sidebar';

import type {
  ActiveScreen,
} from './features/dashboard/Sidebar';

// =============================================================================
// AUTHENTIFICATION UTILISATEUR
// =============================================================================

import {
  AuthPage,
} from './features/auth/AuthPage';

// =============================================================================
// AUTHENTIFICATION ADMIN
// =============================================================================

import {
  AdminDashboard,
} from './features/auth/AdminDashboard';

// =============================================================================
// GESTION UTILISATEURS ADMIN
// =============================================================================

import UsersManagementPage
  from './features/auth/UsersManagementPage';

// =============================================================================
// API AUTH
// =============================================================================
//
// D'après ton dernier fichier :
// src/Api/authApi.ts
//

import {
  clearAuthSession,
  getAuthSession,
  type PublicUser,
  type UserRole,
} from './features/Api/apiService';

// =============================================================================
// TYPES
// =============================================================================

type AppUser = Pick<
  PublicUser,
  | 'id'
  | 'nom'
  | 'email'
  | 'role'
> & {
  avatarUrl?: string;
};

// =============================================================================
// TYPE PAGE AUTH
// =============================================================================

type AuthenticationPage =
  | 'user'
  | 'admin';

// =============================================================================
// AUTORISATIONS
// =============================================================================

const ROLE_SCREEN_PERMISSIONS:
Record<
  UserRole,
  ActiveScreen[]
> = {
  // ===========================================================================
  // ADMIN
  // ===========================================================================

  Admin: [
    'dashboard',

    // Gestion / validation des utilisateurs
    'users',

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
    'help',
  ],

  // ===========================================================================
  // PLANIFICATEUR
  // ===========================================================================

  Planificateur: [
    'dashboard',
    'scheduling',
    'fleet',
    'aircraft',
    'flights',
    'flight-history',
    'crew',
    'optimization',
    'help',
  ],

  // ===========================================================================
  // REGULATOR
  // ===========================================================================

  Regulator: [
    'dashboard',
    'scheduling',
    'flights',
    'flight-history',
    'crew',
    'disruptions',
    'optimization',
    'settings',
    'help',
  ],

  // ===========================================================================
  // MAINTENANCE
  // ===========================================================================

  Maintenance_Engineer: [
    'dashboard',
    'scheduling',
    'fleet',
    'aircraft',
    'maintenance',
    'optimization',
    'help',
  ],

  // ===========================================================================
  // CREW
  // ===========================================================================

  Crew_Member: [
    'dashboard',
    'flights',
    'flight-history',
    'crew',
    'help',
  ],

  // ===========================================================================
  // PRODUCT OWNER
  // ===========================================================================

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
    'help',
  ],
};

// =============================================================================
// RÔLES
// =============================================================================

const ROLE_LABELS:
Record<
  UserRole,
  string
> = {
  Admin:
    'Administrateur',

  Planificateur:
    'Planificateur',

  Regulator:
    'Régulateur OCC',

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

const SCREEN_META:
Record<
  ActiveScreen,
  {
    title: string;
  }
> = {
  dashboard: {
    title:
      'Tableau de bord opérationnel',
  },

  // ===========================================================================
  // ADMIN - USERS
  // ===========================================================================

  users: {
    title:
      'Gestion des utilisateurs',
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

  help: {
    title:
      'Aide et support',
  },
};

// =============================================================================
// VÉRIFICATION RÔLE
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
// ÉCRAN PAR DÉFAUT
// =============================================================================

function getDefaultScreenForRole(
  role: UserRole,
): ActiveScreen {
  switch (
    role
  ) {
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

// =============================================================================
// AUTORISATION ÉCRAN
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
// DERNIER ÉCRAN
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
    !user ||
    !isUserRole(
      user.role,
    )
  ) {
    return null;
  }

  return {
    id:
      user.id,

    nom:
      user.nom,

    email:
      user.email,

    role:
      user.role,
  };
}

// =============================================================================
// FLOTTE
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
    <section
      className="space-y-5"
    >
      <div
        className="
          flex
          flex-wrap
          items-center
          gap-2
          rounded-2xl
          border
          border-slate-200
          bg-white
          p-2
          shadow-xs
        "
      >
        <button
          type="button"
          onClick={() =>
            setFleetView(
              'aircrafts',
            )
          }
          className={`
            rounded-xl
            px-4
            py-2
            text-xs
            font-bold
            transition

            ${
              fleetView ===
              'aircrafts'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }
          `}
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
          className={`
            rounded-xl
            px-4
            py-2
            text-xs
            font-bold
            transition

            ${
              fleetView ===
              'aircraft-types'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }
          `}
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
    useMemo(
      () => {
        if (
          !initialSession?.user
        ) {
          return null;
        }

        return normalizeAuthenticatedUser(
          initialSession.user,
        );
      },
      [
        initialSession,
      ],
    );

  // ===========================================================================
  // USER
  // ===========================================================================

  const [
    user,
    setUser,
  ] =
    useState<AppUser | null>(
      initialUser,
    );

  // ===========================================================================
  // ÉCRAN ACTIF
  // ===========================================================================

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

  // ===========================================================================
  // PAGE AUTH
  // ===========================================================================

  /**
   * user  = AuthPage classique
   * admin = AdminDashboard
   *
   * IMPORTANT :
   * AdminDashboard est uniquement
   * une page d'authentification Admin.
   *
   * Après authentification :
   * l'Admin entre dans l'application normale.
   */
  const [
    authenticationPage,
    setAuthenticationPage,
  ] =
    useState<AuthenticationPage>(
      'user',
    );

  // ===========================================================================
  // MENU PROFIL
  // ===========================================================================

  const [
    isProfileMenuOpen,
    setIsProfileMenuOpen,
  ] =
    useState(
      false,
    );

  // ===========================================================================
  // AUTH
  // ===========================================================================

  const isAuthenticated =
    user !== null;

  // ===========================================================================
  // NAVIGATION
  // ===========================================================================

  const setActiveScreen =
    useCallback(
      (
        screen:
          ActiveScreen,
      ) => {
        if (
          !user
        ) {
          return;
        }

        if (
          !isScreenAllowed(
            user.role,
            screen,
          )
        ) {
          console.warn(
            `[AUTHORIZATION] Accès interdit à ${screen} pour ${user.role}.`,
          );

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
  // CONTRÔLE DES AUTORISATIONS
  // ===========================================================================

  useEffect(
    () => {
      if (
        !user
      ) {
        return;
      }

      if (
        isScreenAllowed(
          user.role,
          activeScreen,
        )
      ) {
        return;
      }

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
    },
    [
      user,
      activeScreen,
    ],
  );

  // ===========================================================================
  // MENU PROFIL
  // ===========================================================================

  useEffect(
    () => {
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
    },
    [],
  );

  // ===========================================================================
  // AUTHENTIFICATION RÉUSSIE
  // ===========================================================================

  const handleAuthenticate =
    useCallback(
      (
        nextUser:
          AppUser,
      ) => {
        if (
          !nextUser ||
          !isUserRole(
            nextUser.role,
          )
        ) {
          clearAuthSession();

          localStorage.removeItem(
            'airline.activeScreen',
          );

          setUser(
            null,
          );

          setActiveScreenState(
            'dashboard',
          );

          setAuthenticationPage(
            'user',
          );

          return;
        }

        // ---------------------------------------------------------------------
        // UTILISATEUR AUTHENTIFIÉ
        // ---------------------------------------------------------------------

        setUser(
          nextUser,
        );

        setIsProfileMenuOpen(
          false,
        );

        setAuthenticationPage(
          'user',
        );

        // ---------------------------------------------------------------------
        // ADMIN
        // ---------------------------------------------------------------------

        if (
          nextUser.role ===
          'Admin'
        ) {
          /**
           * L'Admin arrive d'abord sur le dashboard.
           *
           * Il pourra ensuite ouvrir :
           *
           * "Gestion des utilisateurs"
           *
           * depuis la Sidebar.
           */

          setActiveScreenState(
            'dashboard',
          );

          localStorage.setItem(
            'airline.activeScreen',
            'dashboard',
          );

          return;
        }

        // ---------------------------------------------------------------------
        // AUTRES RÔLES
        // ---------------------------------------------------------------------

        const targetScreen =
          getStoredScreen(
            nextUser.role,
          );

        setActiveScreenState(
          targetScreen,
        );

        localStorage.setItem(
          'airline.activeScreen',
          targetScreen,
        );
      },
      [],
    );

  // ===========================================================================
  // OUVRIR AUTH ADMIN
  // ===========================================================================

  const handleOpenAdminAuthentication =
    useCallback(
      () => {
        setAuthenticationPage(
          'admin',
        );
      },
      [],
    );

  // ===========================================================================
  // RETOUR AUTH UTILISATEUR
  // ===========================================================================

  const handleBackToUserAuthentication =
    useCallback(
      () => {
        setAuthenticationPage(
          'user',
        );
      },
      [],
    );

  // ===========================================================================
  // AUTHENTIFICATION ADMIN RÉUSSIE
  // ===========================================================================

  const handleAdminAuthenticate =
    useCallback(
      (
        adminUser:
          AppUser,
      ) => {
        if (
          !adminUser ||
          adminUser.role !==
            'Admin'
        ) {
          console.warn(
            '[ADMIN] Authentification refusée : rôle Admin requis.',
          );

          return;
        }

        handleAuthenticate(
          adminUser,
        );
      },
      [
        handleAuthenticate,
      ],
    );

  // ===========================================================================
  // LOGOUT
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

        setAuthenticationPage(
          'user',
        );
      },
      [],
    );

  // ===========================================================================
  // ROUTAGE DES ÉCRANS
  // ===========================================================================

  const renderScreen:
    Record<
      ActiveScreen,
      ReactNode
    > = {
      // =========================================================================
      // DASHBOARD
      // =========================================================================

      dashboard: (
        <DashboardGantt />
      ),

      // =========================================================================
      // USERS - ADMIN UNIQUEMENT
      // =========================================================================

      users: (
        <UsersManagementPage />
      ),

      // =========================================================================
      // SCHEDULING
      // =========================================================================

      scheduling: (
        <FlightSchedulerDashboard />
      ),

      // =========================================================================
      // FLEET
      // =========================================================================

      fleet: (
        <FleetWorkspace />
      ),

      // =========================================================================
      // AIRCRAFT
      // =========================================================================

      aircraft: (
        <AircraftManagement />
      ),

      // =========================================================================
      // FLIGHTS
      // =========================================================================

      flights: (
        <FlightsPlanning />
      ),

      // =========================================================================
      // FLIGHT HISTORY
      // =========================================================================

      'flight-history': (
        <FlightHistory />
      ),

      // =========================================================================
      // CREW
      // =========================================================================

      crew: (
        <CrewAssignmentsPage />
      ),

      // =========================================================================
      // MAINTENANCE
      // =========================================================================

      maintenance: (
        <MaintenancePlanning />
      ),

      // =========================================================================
      // DISRUPTIONS
      // =========================================================================

      disruptions: (
        <DisruptionCenter />
      ),

      // =========================================================================
      // OPTIMIZATION
      // =========================================================================

      optimization: (
        <FlightOptimizationDashboard />
      ),

      // =========================================================================
      // SETTINGS
      // =========================================================================

      settings: (
        <NetworkSettings />
      ),

      // =========================================================================
      // HELP
      // =========================================================================

      help: (
        <HelpSupportPage />
      ),
    };

  // ===========================================================================
  // AUTHENTIFICATION
  // ===========================================================================

  if (
    !isAuthenticated ||
    !user
  ) {
    // =========================================================================
    // PAGE AUTH ADMIN
    // =========================================================================

    if (
      authenticationPage ===
      'admin'
    ) {
      return (
        <AdminDashboard
          onAuthenticate={
            handleAdminAuthenticate
          }
          onBack={
            handleBackToUserAuthentication
          }
        />
      );
    }

    // =========================================================================
    // PAGE AUTH UTILISATEUR
    // =========================================================================

    return (
      <AuthPage
        onAuthenticate={
          handleAuthenticate
        }
        onAdminDashboard={
          handleOpenAdminAuthentication
        }
      />
    );
  }

  // ===========================================================================
  // À PARTIR D'ICI :
  // UTILISATEUR AUTHENTIFIÉ
  // ===========================================================================

  const userRoleLabel =
    ROLE_LABELS[
      user.role
    ] ??
    user.role;

  // ===========================================================================
  // APPLICATION
  // ===========================================================================

  return (
    <div
      className="
        flex
        min-h-screen
        flex-col
        bg-gray-100
        font-sans
        antialiased
        selection:bg-emerald-500/20
        selection:text-emerald-900
        md:flex-row
      "
    >
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
          CONTENT
      ===================================================================== */}

      <div
        className="
          mb-16
          flex
          min-h-screen
          min-w-0
          flex-1
          flex-col
          md:mb-0
        "
      >
        {/* ===================================================================
            HEADER
        =================================================================== */}

        <header
          className="
            sticky
            top-0
            z-30
            border-b
            border-gray-200
            bg-gray-100/90
            px-4
            py-5
            backdrop-blur-md
            transition-all
            sm:px-8
          "
        >
          <div
            className="
              mx-auto
              flex
              max-w-7xl
              items-center
              justify-between
              gap-4
            "
          >
            {/* ===============================================================
                TITRE
            =============================================================== */}

            <div
              className="
                min-w-0
              "
            >
              <h2
                className="
                  truncate
                  text-lg
                  font-extrabold
                  tracking-tight
                  text-slate-800
                  sm:text-xl
                "
              >
                {
                  SCREEN_META[
                    activeScreen
                  ]?.title ??
                  'Tableau de bord'
                }
              </h2>
            </div>

            {/* ===============================================================
                PROFIL
            =============================================================== */}

            <div
              className="
                flex
                shrink-0
                items-center
                gap-3
              "
            >
              <div
                className="
                  relative
                  shrink-0
                "
                ref={
                  profileMenuRef
                }
              >
                <button
                  type="button"
                  onClick={() =>
                    setIsProfileMenuOpen(
                      (
                        previous,
                      ) =>
                        !previous,
                    )
                  }
                  aria-expanded={
                    isProfileMenuOpen
                  }
                  aria-label="Voir les détails du compte"
                  className="
                    group
                    flex
                    cursor-pointer
                    items-center
                    gap-3
                    rounded-xl
                    border-none
                    bg-transparent
                    p-1.5
                    outline-hidden
                    transition-all
                    hover:bg-gray-200/80
                  "
                >
                  {/* =========================================================
                      AVATAR
                  ========================================================= */}

                  <div
                    className="
                      flex
                      h-9
                      w-9
                      shrink-0
                      items-center
                      justify-center
                      overflow-hidden
                      rounded-full
                      border
                      border-emerald-200
                      bg-emerald-100
                      shadow-xs
                      transition-transform
                      group-hover:scale-105
                    "
                  >
                    {user.avatarUrl ? (
                      <img
                        src={
                          user.avatarUrl
                        }
                        alt={
                          user.nom
                        }
                        className="
                          h-full
                          w-full
                          object-cover
                        "
                      />
                    ) : (
                      <span
                        className="
                          text-sm
                          font-extrabold
                          text-emerald-700
                        "
                      >
                        {
                          user.nom
                            ?.charAt(
                              0,
                            )
                            ?.toUpperCase() ||
                          (
                            <User
                              className="
                                h-4
                                w-4
                              "
                            />
                          )
                        }
                      </span>
                    )}
                  </div>

                  {/* =========================================================
                      USER
                  ========================================================= */}

                  <div
                    className="
                      hidden
                      flex-col
                      text-left
                      sm:flex
                    "
                  >
                    <span
                      className="
                        max-w-30
                        truncate
                        text-xs
                        font-bold
                        leading-tight
                        text-slate-800
                      "
                    >
                      {
                        user.nom
                      }
                    </span>

                    <span
                      className="
                        mt-0.5
                        max-w-30
                        truncate
                        text-[10px]
                        font-medium
                        text-slate-500
                      "
                    >
                      {
                        userRoleLabel
                      }
                    </span>
                  </div>

                  <ChevronDown
                    className={`
                      h-4
                      w-4
                      text-slate-400
                      transition-transform
                      duration-200
                      group-hover:text-slate-600

                      ${
                        isProfileMenuOpen
                          ? 'rotate-180'
                          : ''
                      }
                    `}
                  />
                </button>

                {/* =============================================================
                    MENU PROFIL
                ============================================================= */}

                {isProfileMenuOpen && (
                  <div
                    className="
                      animate-in
                      fade-in
                      slide-in-from-top-2
                      absolute
                      right-0
                      z-50
                      mt-2
                      w-64
                      rounded-2xl
                      border
                      border-gray-200
                      bg-white
                      py-3
                      text-slate-900
                      shadow-xl
                      duration-150
                    "
                  >
                    <div
                      className="
                        flex
                        flex-col
                        items-center
                        border-b
                        border-gray-100
                        px-4
                        pb-3
                        pt-1
                        text-center
                      "
                    >
                      {/* =======================================================
                          AVATAR
                      ======================================================= */}

                      <div
                        className="
                          mb-2.5
                          flex
                          h-14
                          w-14
                          items-center
                          justify-center
                          overflow-hidden
                          rounded-full
                          border-2
                          border-emerald-200
                          bg-emerald-100
                          shadow-xs
                        "
                      >
                        {user.avatarUrl ? (
                          <img
                            src={
                              user.avatarUrl
                            }
                            alt={
                              user.nom
                            }
                            className="
                              h-full
                              w-full
                              object-cover
                            "
                          />
                        ) : (
                          <span
                            className="
                              text-xl
                              font-black
                              text-emerald-700
                            "
                          >
                            {
                              user.nom
                                ?.charAt(
                                  0,
                                )
                                ?.toUpperCase() ||
                              (
                                <User
                                  className="
                                    h-7
                                    w-7
                                  "
                                />
                              )
                            }
                          </span>
                        )}
                      </div>

                      {/* =======================================================
                          NOM
                      ======================================================= */}

                      <p
                        className="
                          max-w-full
                          truncate
                          text-sm
                          font-bold
                          text-slate-900
                        "
                      >
                        {
                          user.nom
                        }
                      </p>

                      {/* =======================================================
                          EMAIL
                      ======================================================= */}

                      <p
                        className="
                          mt-0.5
                          max-w-full
                          truncate
                          text-xs
                          text-slate-500
                        "
                      >
                        {
                          user.email
                        }
                      </p>

                      {/* =======================================================
                          ROLE
                      ======================================================= */}

                      <span
                        className="
                          mt-2
                          inline-flex
                          items-center
                          gap-1
                          rounded-md
                          border
                          border-emerald-200/60
                          bg-emerald-50
                          px-2.5
                          py-1
                          text-[10px]
                          font-extrabold
                          uppercase
                          tracking-wider
                          text-emerald-700
                        "
                      >
                        <ShieldCheck
                          className="
                            h-3.5
                            w-3.5
                            text-emerald-600
                          "
                        />

                        {
                          userRoleLabel
                        }
                      </span>
                    </div>

                    {/* =========================================================
                        LOGOUT
                    ========================================================= */}

                    <div
                      className="
                        px-2
                        pt-2
                      "
                    >
                      <button
                        type="button"
                        onClick={
                          handleLogout
                        }
                        className="
                          flex
                          w-full
                          cursor-pointer
                          items-center
                          justify-center
                          gap-2
                          rounded-xl
                          border-none
                          bg-transparent
                          px-4
                          py-2
                          text-xs
                          font-semibold
                          text-rose-600
                          transition-colors
                          hover:bg-rose-50
                        "
                      >
                        <LogOut
                          className="
                            h-4
                            w-4
                          "
                        />

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

        <main
          className="
            mx-auto
            w-full
            max-w-7xl
            flex-1
            p-4
            sm:p-6
            lg:p-8
          "
        >
          <div
            className="
              animate-in
              fade-in
              slide-in-from-bottom-2
              duration-300
            "
          >
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