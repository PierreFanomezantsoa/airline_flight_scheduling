// features/dashboard/Sidebar.tsx
import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, AlignLeft, CalendarDays, HelpCircle, History, LayoutDashboard,
  LogOut, Plane, PlaneTakeoff, Settings, Sparkles, User, UserCog, Users, Wrench,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';

export type ActiveScreen =
  | 'dashboard'
  | 'users'
  | 'scheduling'
  | 'fleet'
  | 'aircraft'
  | 'flights'
  | 'flight-history'
  | 'crew'
  | 'maintenance'
  | 'disruptions'
  | 'optimization'
  | 'settings'
  | 'help';

type LucideComponent = React.ForwardRefExoticComponent<
  Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>
>;

interface MenuItem {
  id: ActiveScreen;
  label: string;
  shortLabel?: string;
  icon: LucideComponent;
  badge?: string;
}

interface SidebarProps {
  activeScreen: ActiveScreen;
  setActiveScreen: (screen: ActiveScreen) => void;
  user: { nom: string; email: string; role?: string } | null;
  onLogout: () => void;
}

export type AvailableRoles =
  | 'Admin'
  | 'Planificateur'
  | 'Regulator'
  | 'Crew_Member'
  | 'Maintenance_Engineer'
  | 'Product_Owner';

type UserRoleLabel =
  | 'Utilisateur'
  | 'Administrateur système'
  | 'Planificateur de vol'
  | 'Régulateur OCC'
  | 'Membre d’équipage'
  | 'Ingénieur maintenance'
  | 'Product Owner';

const mobileMenuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Tableau de bord', shortLabel: 'Suivi', icon: LayoutDashboard },
  { id: 'users', label: 'Gestion des utilisateurs', shortLabel: 'Utilisateurs', icon: UserCog },
  { id: 'scheduling', label: 'Programmation des vols', shortLabel: 'Planning', icon: CalendarDays },
  { id: 'optimization', label: 'Optimisation automatique', shortLabel: 'Optim.', icon: Sparkles },
  { id: 'fleet', label: 'Gestion de la flotte', shortLabel: 'Flotte', icon: PlaneTakeoff },
  { id: 'aircraft', label: 'Gestion des avions', shortLabel: 'Avions', icon: Plane },
  { id: 'flights', label: 'Planification des vols', shortLabel: 'Vols', icon: CalendarDays },
  { id: 'flight-history', label: 'Historique des vols', shortLabel: 'Historique', icon: History },
  { id: 'crew', label: 'Affectation des équipages', shortLabel: 'Équipages', icon: Users },
  { id: 'maintenance', label: 'Planification maintenance', shortLabel: 'Maint.', icon: Wrench },
  { id: 'disruptions', label: 'Centre des perturbations', shortLabel: 'Perturb.', icon: AlertTriangle },
  { id: 'settings', label: 'Configuration réseau', shortLabel: 'Réseau', icon: Settings },
  { id: 'help', label: 'Aide et support', shortLabel: 'Aide', icon: HelpCircle },
];

const coreMenuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'users', label: 'Gestion des utilisateurs', icon: UserCog, badge: 'Admin' },
  { id: 'scheduling', label: 'Programmation des vols', icon: CalendarDays },
  { id: 'fleet', label: 'Gestion de la flotte', icon: PlaneTakeoff },
  { id: 'aircraft', label: 'Gestion des avions', icon: Plane },
  { id: 'flights', label: 'Planification des vols', icon: CalendarDays },
  { id: 'flight-history', label: 'Historique des vols', icon: History },
];

const advancedMenuItems: MenuItem[] = [
  { id: 'optimization', label: 'Optimisation automatique', icon: Sparkles },
  { id: 'crew', label: 'Affectation des équipages', icon: Users },
  { id: 'maintenance', label: 'Planification maintenance', icon: Wrench },
  { id: 'disruptions', label: 'Centre des perturbations', icon: AlertTriangle },
  { id: 'settings', label: 'Configuration réseau', icon: Settings },
];

const allowedScreens: Record<AvailableRoles, ActiveScreen[]> = {
  Admin: [
    'dashboard', 'users', 'scheduling', 'fleet', 'aircraft', 'flights',
    'flight-history', 'crew', 'maintenance', 'disruptions',
    'optimization', 'settings', 'help',
  ],
  Planificateur: [
    'dashboard', 'scheduling', 'fleet', 'aircraft', 'flights',
    'flight-history', 'crew', 'optimization', 'help',
  ],
  Regulator: [
    'dashboard', 'scheduling', 'flights', 'flight-history', 'crew',
    'disruptions', 'optimization', 'settings', 'help',
  ],
  Crew_Member: ['dashboard', 'flights', 'flight-history', 'crew', 'help'],
  Maintenance_Engineer: [
    'dashboard', 'scheduling', 'fleet', 'aircraft',
    'maintenance', 'optimization', 'help',
  ],
  Product_Owner: [
    'dashboard', 'scheduling', 'fleet', 'aircraft', 'flight-history',
    'maintenance', 'disruptions', 'optimization', 'settings', 'help',
  ],
};

const roleLabels: Record<AvailableRoles, UserRoleLabel> = {
  Admin: 'Administrateur système',
  Planificateur: 'Planificateur de vol',
  Regulator: 'Régulateur OCC',
  Crew_Member: 'Membre d’équipage',
  Maintenance_Engineer: 'Ingénieur maintenance',
  Product_Owner: 'Product Owner',
};

const normalizeRole = (role?: string): AvailableRoles | undefined => {
  if (!role) return undefined;
  const cleanRole = role.trim().toLowerCase();
  return (Object.keys(roleLabels) as AvailableRoles[]).find(
    key => key.toLowerCase() === cleanRole,
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeScreen,
  setActiveScreen,
  user,
  onLogout,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const userDisplayName = user?.nom?.trim() || 'Utilisateur';
  const userInitial = userDisplayName.charAt(0).toUpperCase();

  const currentRole = useMemo(
    () => normalizeRole(user?.role),
    [user?.role],
  );

  const userRoleLabel: UserRoleLabel =
    currentRole ? roleLabels[currentRole] : 'Utilisateur';

  const visibleCoreMenuItems = useMemo(
    () =>
      currentRole
        ? coreMenuItems.filter(item =>
            allowedScreens[currentRole].includes(item.id),
          )
        : [],
    [currentRole],
  );

  const visibleAdvancedMenuItems = useMemo(
    () =>
      currentRole
        ? advancedMenuItems.filter(item =>
            allowedScreens[currentRole].includes(item.id),
          )
        : [],
    [currentRole],
  );

  const visibleMobileMenuItems = useMemo(
    () =>
      currentRole
        ? mobileMenuItems.filter(item =>
            allowedScreens[currentRole].includes(item.id),
          )
        : [],
    [currentRole],
  );

  const canAccessHelp = Boolean(
    currentRole &&
      allowedScreens[currentRole].includes('help'),
  );

  const handleNavigate = (screen: ActiveScreen) => {
    if (!currentRole) return;
    if (!allowedScreens[currentRole].includes(screen)) return;
    setActiveScreen(screen);
  };

  const renderDesktopButton = (item: MenuItem) => {
    const Icon = item.icon;
    const isActive = activeScreen === item.id;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => handleNavigate(item.id)}
        title={isCollapsed ? item.label : undefined}
        aria-current={isActive ? 'page' : undefined}
        className={`group relative flex w-full cursor-pointer select-none items-center rounded-xl py-2.5 text-left text-sm font-semibold outline-none transition-all duration-200 ${
          isCollapsed ? 'justify-center px-0' : 'justify-between px-4'
        } ${
          isActive
            ? 'bg-emerald-700 text-white shadow-sm shadow-emerald-700/20'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        <div
          className={`flex items-center ${
            isCollapsed ? 'justify-center' : 'min-w-0 gap-3'
          }`}
        >
          <Icon
            className={`h-4 w-4 shrink-0 transition ${
              isActive
                ? 'text-white'
                : 'text-slate-400 group-hover:text-slate-600'
            }`}
          />
          {!isCollapsed && <span className="truncate">{item.label}</span>}
        </div>

        {!isCollapsed && item.badge && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
              isActive
                ? 'bg-white text-emerald-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      <nav className="scrollbar-none fixed bottom-0 left-0 right-0 z-50 flex h-16 select-none items-center gap-1 overflow-x-auto border-t border-slate-200 bg-white/95 px-1 shadow-lg backdrop-blur-lg md:hidden">
        {visibleMobileMenuItems.map(item => {
          const Icon = item.icon;
          const isActive = activeScreen === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavigate(item.id)}
              title={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex h-12 min-w-16 shrink-0 flex-col items-center justify-center rounded-xl outline-none transition ${
                isActive
                  ? 'bg-emerald-50 font-bold text-emerald-700'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
              }`}
            >
              <Icon
                className={`h-5 w-5 shrink-0 transition-transform ${
                  isActive ? 'scale-110 text-emerald-700' : ''
                }`}
              />
              <span className="mt-1 whitespace-nowrap text-[10px] tracking-tight">
                {item.shortLabel ?? item.label}
              </span>
              {isActive && (
                <span className="absolute left-1/2 top-0 h-0.5 w-6 -translate-x-1/2 rounded-full bg-emerald-700" />
              )}
            </button>
          );
        })}
      </nav>

      <div className="sticky top-0 hidden h-screen shrink-0 p-3 md:block">
        <aside
          className={`flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-800 shadow-sm transition-all duration-300 ${
            isCollapsed ? 'w-20' : 'w-72'
          }`}
        >
          <div className="scrollbar-thin scrollbar-thumb-slate-200 overflow-y-auto">
            <div
              className={`flex items-center border-b border-slate-100 py-5 ${
                isCollapsed
                  ? 'flex-col justify-center gap-2 px-0'
                  : 'justify-between px-5'
              }`}
            >
              <div
                className={`flex items-center ${
                  isCollapsed ? 'justify-center' : 'gap-3'
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 shadow-md shadow-emerald-700/20">
                  <Plane className="h-5 w-5 text-white" />
                </div>

                {!isCollapsed && (
                  <div className="overflow-hidden">
                    <h1 className="m-0 text-base font-extrabold leading-none tracking-tight text-slate-800">
                      Opérations aériennes
                    </h1>
                    <p className="m-0 mt-1 truncate text-[11px] font-medium text-slate-400">
                      Planification et contrôle OCC
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setIsCollapsed(previous => !previous)}
                title={
                  isCollapsed
                    ? 'Agrandir la barre latérale'
                    : 'Réduire la barre latérale'
                }
                aria-label={
                  isCollapsed
                    ? 'Agrandir la barre latérale'
                    : 'Réduire la barre latérale'
                }
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <AlignLeft className="h-4 w-4" />
              </button>
            </div>

            <nav className="space-y-5 p-3">
              {visibleCoreMenuItems.length > 0 && (
                <div className="space-y-1">
                  {!isCollapsed && (
                    <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Général
                    </p>
                  )}
                  {visibleCoreMenuItems.map(renderDesktopButton)}
                </div>
              )}

              {visibleAdvancedMenuItems.length > 0 && (
                <div className="space-y-1">
                  {!isCollapsed && (
                    <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Gestion opérationnelle
                    </p>
                  )}
                  {visibleAdvancedMenuItems.map(renderDesktopButton)}
                </div>
              )}
            </nav>
          </div>

          <div className="border-t border-slate-100 bg-slate-50/50 p-3">
            {canAccessHelp && (
              <div className="mb-2 px-2">
                <button
                  type="button"
                  onClick={() => handleNavigate('help')}
                  title={isCollapsed ? 'Aide et support' : undefined}
                  aria-current={activeScreen === 'help' ? 'page' : undefined}
                  className={`flex w-full cursor-pointer items-center rounded-xl py-2 text-xs font-semibold transition ${
                    isCollapsed ? 'justify-center' : 'gap-2.5 px-2'
                  } ${
                    activeScreen === 'help'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  <HelpCircle
                    className={`h-4 w-4 shrink-0 ${
                      activeScreen === 'help'
                        ? 'text-emerald-700'
                        : 'text-slate-400'
                    }`}
                  />
                  {!isCollapsed && <span>Aide et support</span>}
                </button>
              </div>
            )}

            <div
              className={`flex items-center border-t border-slate-200/60 pt-2 ${
                isCollapsed ? 'flex-col gap-2' : 'justify-between px-2'
              }`}
            >
              <div
                className={`flex items-center ${
                  isCollapsed ? 'justify-center' : 'min-w-0 gap-2.5'
                }`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-200 bg-emerald-100 text-xs font-extrabold text-emerald-700">
                  {user ? userInitial : <User className="h-4 w-4" />}
                </div>

                {!isCollapsed && (
                  <div className="overflow-hidden">
                    <h3 className="m-0 truncate text-xs font-bold leading-tight text-slate-800">
                      {userDisplayName}
                    </h3>
                    <p className="m-0 mt-0.5 truncate text-[10px] font-medium text-slate-400">
                      {userRoleLabel}
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={onLogout}
                title="Déconnexion"
                aria-label="Déconnexion"
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
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

export default Sidebar;