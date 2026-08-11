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
  AlignLeft
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';

export type ActiveScreen =
  | 'dashboard'
  | 'scheduling'
  | 'fleet'
  | 'aircraft'
  | 'flights'
  | 'crew'
  | 'maintenance'
  | 'disruptions'
  | 'optimization'
  | 'settings';

type LucideComponent = React.ForwardRefExoticComponent<
  Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>
>;

interface MenuItem {
  id: ActiveScreen;
  label: string;
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
  | 'Administrateur Système'
  | 'Planificateur de Vol'
  | 'Gestionnaire Ops Center'
  | 'Membre d’Équipage'
  | 'Ingénieur Maintenance'
  | 'Product Owner';

const mobileMenuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Suivi', icon: LayoutDashboard },
  { id: 'scheduling', label: 'Ordonn.', icon: Layers },
  { id: 'optimization', label: 'Auto-Opti', icon: Sparkles },
  { id: 'fleet', label: 'Flotte', icon: PlaneTakeoff },
  { id: 'aircraft', label: 'Avions', icon: Plane },
  { id: 'flights', label: 'Vols', icon: CalendarDays },
  { id: 'crew', label: 'Équipes', icon: Users },
  { id: 'maintenance', label: 'Maint.', icon: Wrench },
  { id: 'disruptions', label: 'Crise', icon: AlertTriangle },
  { id: 'settings', label: 'Réseau', icon: Settings },
];

const coreMenuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { id: 'scheduling', label: 'Ordonnancement', icon: Layers },
  { id: 'fleet', label: 'Gestion de la Flotte', icon: PlaneTakeoff },
  { id: 'aircraft', label: 'Gestion Avion', icon: Plane },
  { id: 'flights', label: 'Planification des Vols', icon: CalendarDays },
];

const advancedMenuItems: MenuItem[] = [
  { id: 'optimization', label: 'Optimisation Automatique', icon: Sparkles },
  { id: 'crew', label: 'Affectation Équipages', icon: Users },
  { id: 'maintenance', label: 'Planification Maintenance', icon: Wrench },
  { id: 'settings', label: 'Configuration Réseau', icon: Settings },
];

const allowedScreens: Record<AvailableRoles, ActiveScreen[]> = {
  Admin: ['dashboard', 'scheduling', 'fleet', 'aircraft', 'flights', 'crew', 'maintenance', 'disruptions', 'optimization', 'settings'],
  Planificateur: ['dashboard', 'scheduling', 'fleet', 'aircraft', 'flights', 'crew', 'optimization'],
  Regulator: ['dashboard', 'scheduling', 'flights', 'crew', 'disruptions', 'optimization', 'settings'],
  Crew_Member: ['dashboard', 'flights', 'crew'],
  Maintenance_Engineer: ['dashboard', 'scheduling', 'fleet', 'aircraft', 'maintenance', 'optimization'],
  Product_Owner: ['dashboard', 'scheduling', 'fleet', 'aircraft', 'maintenance', 'disruptions', 'optimization', 'settings'],
};

const roleLabels: Record<AvailableRoles, UserRoleLabel> = {
  Admin: 'Administrateur Système',
  Planificateur: 'Planificateur de Vol',
  Regulator: 'Gestionnaire Ops Center',
  Crew_Member: 'Membre d’Équipage',
  Maintenance_Engineer: 'Ingénieur Maintenance',
  Product_Owner: 'Product Owner',
};

const normalizeRole = (role?: string): AvailableRoles | undefined => {
  if (!role) return undefined;
  const cleanRole = role.trim();
  return (Object.keys(roleLabels) as AvailableRoles[]).find(
    (key) => key.toLowerCase() === cleanRole.toLowerCase()
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

  const currentRole = normalizeRole(user?.role);
  const userRoleLabel: UserRoleLabel = currentRole && roleLabels[currentRole]
    ? roleLabels[currentRole]
    : 'Utilisateur';

  const getVisibleItems = (items: MenuItem[]) => {
    if (!currentRole || !allowedScreens[currentRole]) return items;
    return items.filter((item) => allowedScreens[currentRole].includes(item.id));
  };

  const visibleCoreMenuItems = getVisibleItems(coreMenuItems);
  const visibleAdvancedMenuItems = getVisibleItems(advancedMenuItems);
  const visibleMobileMenuItems = getVisibleItems(mobileMenuItems);

  const renderDesktopButton = (item: MenuItem) => {
    const Icon = item.icon;
    const isActive = activeScreen === item.id;

    return (
      <button
        key={item.id}
        onClick={() => setActiveScreen(item.id)}
        title={isCollapsed ? item.label : undefined}
        className={`group relative flex items-center ${
          isCollapsed ? 'justify-center px-0' : 'justify-between px-4'
        } py-2.5 rounded-xl transition-all duration-200 font-semibold text-sm cursor-pointer select-none outline-none border-none text-left w-full
          ${
            isActive
              ? 'bg-emerald-700 text-white shadow-sm shadow-emerald-700/20'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
          }`}
      >
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'min-w-0 gap-3'}`}>
          <Icon
            className={`w-4 h-4 shrink-0 transition-colors duration-150 ${
              isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-600'
            }`}
          />
          {!isCollapsed && <span className="truncate transition-all duration-200">{item.label}</span>}
        </div>

        {!isCollapsed && item.badge && (
          <span
            className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold transition-all ${
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
      {/* VUE MOBILE */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-slate-200 bg-white/95 backdrop-blur-lg px-1 flex items-center gap-1 overflow-x-auto justify-between md:hidden select-none scrollbar-none shadow-lg">
        {visibleMobileMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveScreen(item.id)}
              className={`relative flex flex-col items-center justify-center min-w-14 h-12 rounded-xl transition-all duration-150 shrink-0 outline-none border-none ${
                isActive
                  ? 'text-emerald-700 bg-emerald-50 font-bold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon
                className={`w-5 h-5 shrink-0 ${
                  isActive ? 'scale-110 text-emerald-700' : ''
                } transition-transform duration-150`}
              />
              <span className="text-[10px] mt-1 tracking-tight whitespace-nowrap">
                {item.label}
              </span>

              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-emerald-700 rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

      {/* VUE DESKTOP */}
      <div className="hidden md:block p-3 sticky top-0 h-screen shrink-0">
        <aside
          className={`${
            isCollapsed ? 'w-20' : 'w-72'
          } h-full bg-white rounded-3xl border border-gray-200/80 shadow-xs text-slate-800 flex flex-col select-none justify-between overflow-hidden transition-all duration-300 ease-in-out`}
        >
          <div className="overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
            {/* Header / Logo */}
            <div
              className={`py-5 border-b border-gray-100 flex items-center ${
                isCollapsed ? 'justify-center px-0' : 'justify-between px-5'
              } transition-all duration-300`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                <div className="w-9 h-9 rounded-2xl bg-emerald-700 flex items-center justify-center shadow-md shadow-emerald-700/20 shrink-0">
                  <Plane className="w-5 h-5 text-white" />
                </div>
                {!isCollapsed && (
                  <div className="overflow-hidden transition-opacity duration-200">
                    <h1 className="text-base font-extrabold text-slate-800 tracking-tight m-0 leading-none">
                      Flight Ops
                    </h1>
                    <p className="text-[11px] font-medium text-slate-400 m-0 mt-1 truncate">
                      Scheduling Center
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                title={isCollapsed ? 'Agrandir la sidebar' : 'Réduire la sidebar'}
                className={`text-slate-400 hover:text-slate-600 border-none bg-transparent cursor-pointer p-1.5 rounded-lg hover:bg-slate-100 transition-colors ${
                  isCollapsed ? 'mt-3' : ''
                }`}
              >
                <AlignLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="p-3 space-y-5">
              {visibleCoreMenuItems.length > 0 && (
                <div className="space-y-1">
                  {!isCollapsed && (
                    <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 transition-all">
                      Overview
                    </p>
                  )}
                  {visibleCoreMenuItems.map(renderDesktopButton)}
                </div>
              )}

              {visibleAdvancedMenuItems.length > 0 && (
                <div className="space-y-1">
                  {!isCollapsed && (
                    <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 transition-all">
                      Management
                    </p>
                  )}
                  {visibleAdvancedMenuItems.map(renderDesktopButton)}
                </div>
              )}
            </nav>
          </div>

          {/* Footer / Carte Utilisateur & Déconnexion */}
          <div className="p-3 border-t border-gray-100 bg-slate-50/50">
            <div className="mb-2 px-2">
              <button
                title={isCollapsed ? 'Aide & Support' : undefined}
                className={`flex items-center ${
                  isCollapsed ? 'justify-center' : 'gap-2.5'
                } text-slate-500 hover:text-slate-800 text-xs font-semibold border-none bg-transparent cursor-pointer py-1.5 w-full`}
              >
                <HelpCircle className="w-4 h-4 text-slate-400 shrink-0" />
                {!isCollapsed && <span>Aide & Support</span>}
              </button>
            </div>

            <div
              className={`pt-2 border-t border-gray-200/60 flex items-center ${
                isCollapsed ? 'flex-col gap-2' : 'justify-between px-2'
              }`}
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5 min-w-0'}`}>
                <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center font-extrabold text-xs shrink-0 overflow-hidden">
                  {user ? userInitial : <User className="w-4 h-4 text-emerald-700" />}
                </div>
                {!isCollapsed && (
                  <div className="overflow-hidden">
                    <h3 className="text-xs font-bold text-slate-800 truncate m-0 leading-tight">
                      {userDisplayName}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-medium truncate m-0 mt-0.5">
                      {userRoleLabel}
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={onLogout}
                title="Déconnexion"
                className="text-slate-400 hover:text-red-600 bg-transparent border-none cursor-pointer p-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
};