// features/dashboard/Sidebar.tsx

import React, { useState } from 'react';

import {
  LayoutDashboard,
  Layers,
  Plane,
  CalendarDays,
  Users,
  Wrench,
  AlertTriangle,
  Settings,
  User,
  LogOut,
  Sparkles,
  HelpCircle,
  PlaneTakeoff,
  AlignLeft,
  History,
} from 'lucide-react';

import type { LucideProps } from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

export type ActiveScreen =
  | 'dashboard'
  | 'scheduling'
  | 'fleet'
  | 'aircraft'
  | 'flights'
  | 'flight-history'
  | 'crew'
  | 'maintenance'
  | 'disruptions'
  | 'optimization'
  | 'settings';

type LucideComponent = React.ForwardRefExoticComponent<
  Omit<LucideProps, 'ref'> &
    React.RefAttributes<SVGSVGElement>
>;

interface MenuItem {
  id: ActiveScreen;
  label: string;
  icon: LucideComponent;
  badge?: string;
}

interface SidebarProps {
  activeScreen: ActiveScreen;

  setActiveScreen: (
    screen: ActiveScreen,
  ) => void;

  user: {
    nom: string;
    email: string;
    role?: string;
  } | null;

  onLogout: () => void;
}

// =============================================================================
// RÔLES
// =============================================================================

export type AvailableRoles =
  | 'Admin'
  | 'Planificateur'
  | 'Regulator'
  | 'Crew_Member'
  | 'Maintenance_Engineer'
  | 'Product_Owner';

type UserRoleLabel =
  | 'Utilisateur'
  | 'Administrateur Système'
  | 'Planificateur de Vol'
  | 'Gestionnaire Ops Center'
  | 'Membre d’Équipage'
  | 'Ingénieur Maintenance'
  | 'Product Owner';

// =============================================================================
// MENU MOBILE
// =============================================================================

const mobileMenuItems: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'Suivi',
    icon: LayoutDashboard,
  },

  {
    id: 'scheduling',
    label: 'Ordonn.',
    icon: Layers,
  },

  {
    id: 'optimization',
    label: 'Auto-Opti',
    icon: Sparkles,
  },

  {
    id: 'fleet',
    label: 'Flotte',
    icon: PlaneTakeoff,
  },

  {
    id: 'aircraft',
    label: 'Avions',
    icon: Plane,
  },

  {
    id: 'flights',
    label: 'Vols',
    icon: CalendarDays,
  },

  {
    id: 'flight-history',
    label: 'Historique',
    icon: History,
  },

  {
    id: 'crew',
    label: 'Équipes',
    icon: Users,
  },

  {
    id: 'maintenance',
    label: 'Maint.',
    icon: Wrench,
  },

  {
    id: 'disruptions',
    label: 'Crise',
    icon: AlertTriangle,
  },

  {
    id: 'settings',
    label: 'Réseau',
    icon: Settings,
  },
];

// =============================================================================
// MENU PRINCIPAL
// =============================================================================

const coreMenuItems: MenuItem[] = [
  {
    id: 'dashboard',
    label: 'Tableau de bord',
    icon: LayoutDashboard,
  },

  {
    id: 'scheduling',
    label: 'Ordonnancement',
    icon: Layers,
  },

  {
    id: 'fleet',
    label: 'Gestion de la Flotte',
    icon: PlaneTakeoff,
  },

  {
    id: 'aircraft',
    label: 'Gestion Avion',
    icon: Plane,
  },

  {
    id: 'flights',
    label: 'Planification des Vols',
    icon: CalendarDays,
  },

  {
    id: 'flight-history',
    label: 'Historique des Vols',
    icon: History,
  },
];

// =============================================================================
// MENU AVANCÉ
// =============================================================================

const advancedMenuItems: MenuItem[] = [
  {
    id: 'optimization',
    label: 'Optimisation Automatique',
    icon: Sparkles,
  },

  {
    id: 'crew',
    label: 'Affectation Équipages',
    icon: Users,
  },

  {
    id: 'maintenance',
    label: 'Planification Maintenance',
    icon: Wrench,
  },

  {
    id: 'settings',
    label: 'Configuration Réseau',
    icon: Settings,
  },
];

// =============================================================================
// AUTORISATIONS
// =============================================================================

const allowedScreens: Record<
  AvailableRoles,
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

  Crew_Member: [
    'dashboard',
    'flights',
    'flight-history',
    'crew',
  ],

  Maintenance_Engineer: [
    'dashboard',
    'scheduling',
    'fleet',
    'aircraft',
    'maintenance',
    'optimization',
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
// LABELS DES RÔLES
// =============================================================================

const roleLabels: Record<
  AvailableRoles,
  UserRoleLabel
> = {
  Admin: 'Administrateur Système',

  Planificateur:
    'Planificateur de Vol',

  Regulator:
    'Gestionnaire Ops Center',

  Crew_Member:
    'Membre d’Équipage',

  Maintenance_Engineer:
    'Ingénieur Maintenance',

  Product_Owner:
    'Product Owner',
};

// =============================================================================
// NORMALISATION DU RÔLE
// =============================================================================

const normalizeRole = (
  role?: string,
): AvailableRoles | undefined => {
  if (!role) {
    return undefined;
  }

  const cleanRole =
    role.trim();

  return (
    Object.keys(
      roleLabels,
    ) as AvailableRoles[]
  ).find(
    (key) =>
      key.toLowerCase() ===
      cleanRole.toLowerCase(),
  );
};

// =============================================================================
// SIDEBAR
// =============================================================================

export const Sidebar: React.FC<
  SidebarProps
> = ({
  activeScreen,
  setActiveScreen,
  user,
  onLogout,
}) => {
  const [
    isCollapsed,
    setIsCollapsed,
  ] = useState(false);

  // ===========================================================================
  // UTILISATEUR
  // ===========================================================================

  const userDisplayName =
    user?.nom?.trim() ||
    'Utilisateur';

  const userInitial =
    userDisplayName
      .charAt(0)
      .toUpperCase();

  const currentRole =
    normalizeRole(
      user?.role,
    );

  const userRoleLabel:
    UserRoleLabel =
      currentRole &&
      roleLabels[currentRole]
        ? roleLabels[currentRole]
        : 'Utilisateur';

  // ===========================================================================
  // FILTRAGE PAR RÔLE
  // ===========================================================================

  const getVisibleItems = (
    items: MenuItem[],
  ) => {
    if (
      !currentRole ||
      !allowedScreens[
        currentRole
      ]
    ) {
      return items;
    }

    return items.filter(
      (item) =>
        allowedScreens[
          currentRole
        ].includes(
          item.id,
        ),
    );
  };

  const visibleCoreMenuItems =
    getVisibleItems(
      coreMenuItems,
    );

  const visibleAdvancedMenuItems =
    getVisibleItems(
      advancedMenuItems,
    );

  const visibleMobileMenuItems =
    getVisibleItems(
      mobileMenuItems,
    );

  // ===========================================================================
  // BOUTON DESKTOP
  // ===========================================================================

  const renderDesktopButton = (
    item: MenuItem,
  ) => {
    const Icon =
      item.icon;

    const isActive =
      activeScreen ===
      item.id;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() =>
          setActiveScreen(
            item.id,
          )
        }
        title={
          isCollapsed
            ? item.label
            : undefined
        }
        className={`group relative flex w-full cursor-pointer select-none items-center rounded-xl border-none py-2.5 text-left text-sm font-semibold outline-none transition-all duration-200 ${
          isCollapsed
            ? 'justify-center px-0'
            : 'justify-between px-4'
        } ${
          isActive
            ? 'bg-emerald-700 text-white shadow-sm shadow-emerald-700/20'
            : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900'
        }`}
      >
        <div
          className={`flex items-center ${
            isCollapsed
              ? 'justify-center'
              : 'min-w-0 gap-3'
          }`}
        >
          <Icon
            className={`h-4 w-4 shrink-0 transition-colors duration-150 ${
              isActive
                ? 'text-white'
                : 'text-slate-400 group-hover:text-slate-600'
            }`}
          />

          {!isCollapsed && (
            <span className="truncate transition-all duration-200">
              {item.label}
            </span>
          )}
        </div>

        {!isCollapsed &&
          item.badge && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold transition-all ${
                isActive
                  ? 'bg-white text-emerald-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {
                item.badge
              }
            </span>
          )}
      </button>
    );
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <>
      {/* =====================================================================
          VUE MOBILE
      ===================================================================== */}

      <nav className="scrollbar-none fixed bottom-0 left-0 right-0 z-50 flex h-16 select-none items-center justify-between gap-1 overflow-x-auto border-t border-slate-200 bg-white/95 px-1 shadow-lg backdrop-blur-lg md:hidden">

        {visibleMobileMenuItems.map(
          (item) => {
            const Icon =
              item.icon;

            const isActive =
              activeScreen ===
              item.id;

            return (
              <button
                key={
                  item.id
                }
                type="button"
                onClick={() =>
                  setActiveScreen(
                    item.id,
                  )
                }
                className={`relative flex h-12 min-w-14 shrink-0 flex-col items-center justify-center rounded-xl border-none outline-none transition-all duration-150 ${
                  isActive
                    ? 'bg-emerald-50 font-bold text-emerald-700'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >

                <Icon
                  className={`h-5 w-5 shrink-0 transition-transform duration-150 ${
                    isActive
                      ? 'scale-110 text-emerald-700'
                      : ''
                  }`}
                />

                <span className="mt-1 whitespace-nowrap text-[10px] tracking-tight">
                  {
                    item.label
                  }
                </span>

                {isActive && (
                  <div className="absolute left-1/2 top-0 h-0.5 w-6 -translate-x-1/2 rounded-full bg-emerald-700" />
                )}

              </button>
            );
          },
        )}

      </nav>

      {/* =====================================================================
          VUE DESKTOP
      ===================================================================== */}

      <div className="sticky top-0 hidden h-screen shrink-0 p-3 md:block">

        <aside
          className={`flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-gray-200/80 bg-white text-slate-800 shadow-xs transition-all duration-300 ease-in-out ${
            isCollapsed
              ? 'w-20'
              : 'w-72'
          }`}
        >

          {/* =================================================================
              CONTENU SCROLLABLE
          ================================================================= */}

          <div className="scrollbar-thin scrollbar-thumb-slate-200 overflow-y-auto">

            {/* ===============================================================
                HEADER / LOGO
            =============================================================== */}

            <div
              className={`flex items-center border-b border-gray-100 py-5 transition-all duration-300 ${
                isCollapsed
                  ? 'justify-center px-0'
                  : 'justify-between px-5'
              }`}
            >

              <div
                className={`flex items-center ${
                  isCollapsed
                    ? 'justify-center'
                    : 'gap-3'
                }`}
              >

                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 shadow-md shadow-emerald-700/20">
                  <Plane className="h-5 w-5 text-white" />
                </div>

                {!isCollapsed && (
                  <div className="overflow-hidden transition-opacity duration-200">

                    <h1 className="m-0 text-base font-extrabold leading-none tracking-tight text-slate-800">
                      Flight Ops
                    </h1>

                    <p className="m-0 mt-1 truncate text-[11px] font-medium text-slate-400">
                      Scheduling Center
                    </p>

                  </div>
                )}

              </div>

              <button
                type="button"
                onClick={() =>
                  setIsCollapsed(
                    !isCollapsed,
                  )
                }
                title={
                  isCollapsed
                    ? 'Agrandir la sidebar'
                    : 'Réduire la sidebar'
                }
                className={`cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 ${
                  isCollapsed
                    ? 'mt-3'
                    : ''
                }`}
              >
                <AlignLeft className="h-4 w-4" />
              </button>

            </div>

            {/* ===============================================================
                NAVIGATION
            =============================================================== */}

            <nav className="space-y-5 p-3">

              {/* =============================================================
                  OVERVIEW
              ============================================================= */}

              {visibleCoreMenuItems.length >
                0 && (
                <div className="space-y-1">

                  {!isCollapsed && (
                    <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-all">
                      Overview
                    </p>
                  )}

                  {visibleCoreMenuItems.map(
                    renderDesktopButton,
                  )}

                </div>
              )}

              {/* =============================================================
                  MANAGEMENT
              ============================================================= */}

              {visibleAdvancedMenuItems.length >
                0 && (
                <div className="space-y-1">

                  {!isCollapsed && (
                    <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 transition-all">
                      Management
                    </p>
                  )}

                  {visibleAdvancedMenuItems.map(
                    renderDesktopButton,
                  )}

                </div>
              )}

            </nav>

          </div>

          {/* =================================================================
              FOOTER
          ================================================================= */}

          <div className="border-t border-gray-100 bg-slate-50/50 p-3">

            {/* AIDE */}

            <div className="mb-2 px-2">

              <button
                type="button"
                title={
                  isCollapsed
                    ? 'Aide & Support'
                    : undefined
                }
                className={`flex w-full cursor-pointer items-center border-none bg-transparent py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 ${
                  isCollapsed
                    ? 'justify-center'
                    : 'gap-2.5'
                }`}
              >

                <HelpCircle className="h-4 w-4 shrink-0 text-slate-400" />

                {!isCollapsed && (
                  <span>
                    Aide & Support
                  </span>
                )}

              </button>

            </div>

            {/* ===============================================================
                UTILISATEUR
            =============================================================== */}

            <div
              className={`flex items-center border-t border-gray-200/60 pt-2 ${
                isCollapsed
                  ? 'flex-col gap-2'
                  : 'justify-between px-2'
              }`}
            >

              <div
                className={`flex items-center ${
                  isCollapsed
                    ? 'justify-center'
                    : 'min-w-0 gap-2.5'
                }`}
              >

                {/* AVATAR */}

                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-200 bg-emerald-100 text-xs font-extrabold text-emerald-700">

                  {user
                    ? userInitial
                    : (
                      <User className="h-4 w-4 text-emerald-700" />
                    )}

                </div>

                {!isCollapsed && (
                  <div className="overflow-hidden">

                    <h3 className="m-0 truncate text-xs font-bold leading-tight text-slate-800">
                      {
                        userDisplayName
                      }
                    </h3>

                    <p className="m-0 mt-0.5 truncate text-[10px] font-medium text-slate-400">
                      {
                        userRoleLabel
                      }
                    </p>

                  </div>
                )}

              </div>

              {/* =============================================================
                  DÉCONNEXION
              ============================================================= */}

              <button
                type="button"
                onClick={
                  onLogout
                }
                title="Déconnexion"
                className="cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                <LogOut className="h-4 w-4" />
              </button>

            </div>

          </div>

        </aside>

      </div>
    </>
  );
};