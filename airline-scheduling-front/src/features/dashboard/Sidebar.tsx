// features/dashboard/Sidebar.tsx
import React from 'react';
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
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import type { LucideProps } from 'lucide-react';

export type ActiveScreen =
  | 'dashboard'
  | 'scheduling'
  | 'fleet'
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
  { id: 'fleet', label: 'Avions', icon: Plane },
  { id: 'flights', label: 'Vols', icon: CalendarDays },
  { id: 'crew', label: 'Équipes', icon: Users },
  { id: 'maintenance', label: 'Maint.', icon: Wrench },
  { id: 'disruptions', label: 'Crise', icon: AlertTriangle },
  { id: 'settings', label: 'Réseau', icon: Settings },
];

const coreMenuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Tableau de bord (Gantt)', icon: LayoutDashboard },
  { id: 'scheduling', label: 'Ordonnancement (Matrice)', icon: Layers },
  { id: 'fleet', label: 'Gestion de la Flotte', icon: Plane },
  { id: 'flights', label: 'Planification des Vols', icon: CalendarDays },
];

const advancedMenuItems: MenuItem[] = [
  { id: 'optimization', label: 'Optimisation Automatique', icon: Sparkles },
  { id: 'crew', label: 'Affectation Équipages', icon: Users },
  { id: 'maintenance', label: 'Planification Maintenance', icon: Wrench },
  { id: 'settings', label: 'Configuration Réseau', icon: Settings },
];

const allowedScreens: Record<AvailableRoles, ActiveScreen[]> = {
  Admin: ['dashboard', 'scheduling', 'fleet', 'flights', 'crew', 'maintenance', 'disruptions', 'optimization', 'settings'],
  Planificateur: ['dashboard', 'scheduling', 'fleet', 'flights', 'crew', 'optimization'],
  Regulator: ['dashboard', 'scheduling', 'flights', 'crew', 'disruptions', 'optimization', 'settings'],
  Crew_Member: ['dashboard', 'flights', 'crew'],
  Maintenance_Engineer: ['dashboard', 'scheduling', 'fleet', 'maintenance', 'optimization'],
  Product_Owner: ['dashboard', 'scheduling', 'fleet', 'maintenance', 'disruptions', 'optimization', 'settings'],
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
        className={`group relative flex items-center justify-between w-full px-3.5 py-2.5 rounded-xl
          transition-all duration-200 text-sm font-bold border-none cursor-pointer select-none outline-none text-white
          ${isActive 
            ? 'bg-white/20 shadow-sm' 
            : 'hover:bg-white/10'}`}
      >
        {isActive && (
          <div className="absolute left-0 top-2 bottom-2 w-1 bg-white rounded-r-full shadow-sm" />
        )}

        <div className="flex items-center min-w-0">
          <Icon className="w-5 h-5 mr-3 shrink-0 text-white transition-colors duration-200" />
          <span className="truncate">{item.label}</span>
        </div>

        {item.badge && (
          <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide transition-all ${
            isActive
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'bg-emerald-700/50 text-white border border-emerald-400/30'
          }`}>
            {item.badge}
          </span>
        )}

        {!item.badge && isActive && (
          <ChevronRight className="w-4 h-4 text-white shrink-0 ml-1" />
        )}
      </button>
    );
  };

  return (
    <>
      {/* VUE MOBILE */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 h-16 border-t border-emerald-500 bg-emerald-700 px-3 flex items-center gap-1 overflow-x-auto justify-between md:hidden select-none scrollbar-none shadow-lg">
        {visibleMobileMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeScreen === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveScreen(item.id)}
              className={`relative flex flex-col items-center justify-center min-w-[3.75rem] h-12 rounded-xl transition-all duration-200 shrink-0 outline-none border-none text-white font-bold ${
                isActive 
                  ? 'bg-white/20' 
                  : 'hover:text-white'
              }`}
            >
              <Icon className={`w-5 h-5 shrink-0 text-white ${isActive ? 'scale-110' : ''} transition-transform duration-200`} />
              <span className="text-[10px] mt-1 tracking-tight whitespace-nowrap">{item.label}</span>
              
              {isActive && (
                <div className="absolute -bottom-1 w-4 h-1 bg-white rounded-full" />
              )}
              
              {item.badge && !isActive && (
                <span className="absolute top-1.5 right-2 flex h-2 w-2 rounded-full bg-white ring-2 ring-emerald-600" />
              )}
            </button>
          );
        })}
      </nav>

      {/* VUE DESKTOP */}
      <aside className="hidden md:flex sticky top-0 h-screen w-72 shrink-0 bg-emerald-700 border-r border-emerald-500 text-white flex-col shadow-xl select-none">
        
        {/* Header / Logo */}
        <div className="px-6 py-6 border-b border-emerald-500/80">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center shadow-md shrink-0 group">
              <Plane className="w-5 h-5 text-white rotate-45 transition-transform group-hover:scale-110 duration-200" />
            </div>
            <div className="overflow-hidden">
              <h1 className="text-sm font-black text-white tracking-wider uppercase m-0 leading-tight">
                Flight Ops
              </h1>
              <span className="text-[10px] font-bold text-white tracking-widest uppercase">
                Scheduling Center
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto scrollbar-thin scrollbar-thumb-emerald-500">
          {visibleCoreMenuItems.length > 0 && (
            <div className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-white mb-2">
                Navigation
              </p>
              {visibleCoreMenuItems.map(renderDesktopButton)}
            </div>
          )}

          {visibleAdvancedMenuItems.length > 0 && (
            <div className="space-y-1">
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-white mb-2">
                Régulation &amp; Maintenance
              </p>
              {visibleAdvancedMenuItems.map(renderDesktopButton)}
            </div>
          )}
        </nav>

        {/* User Card & Logout */}
        <div className="p-3 border-t border-emerald-500/80 bg-emerald-700/30">
          <div className="flex items-center justify-between p-2 rounded-xl bg-white/10 border border-white/10 mb-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-full bg-white text-emerald-700 flex items-center justify-center text-sm font-bold shadow-sm">
                  {user ? userInitial : <User className="w-4 h-4 text-emerald-700" />}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-300 border-2 border-emerald-600 rounded-full" />
              </div>
              <div className="overflow-hidden">
                <h3 className="text-xs font-bold text-white truncate m-0 leading-tight">
                  {userDisplayName}
                </h3>
                <p className="text-[10px] text-white font-bold truncate m-0 mt-0.5">
                  {userRoleLabel}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-white bg-emerald-700/60 hover:bg-red-300 border border-emerald-500/50 hover:text-black hover:border-red-200 transition-all duration-150 cursor-pointer outline-none"
          >
            <LogOut className="w-3.5 h-3.5 text-white" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>
    </>
  );
};