import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  FolderOpen,
  HelpCircle,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Plane,
  SlidersHorizontal,
  Sparkles,
  User,
  UserCog,
  Users,
  Wrench,
  X,
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

interface MenuSection {
  id: 'general' | 'operations';
  label: string;
  icon: LucideComponent;
  items: MenuItem[];
}

interface SidebarProps {
  activeScreen: ActiveScreen;
  setActiveScreen: (screen: ActiveScreen) => void;
  user: { nom: string; email: string; role?: string } | null;
  onLogout: () => void;
  isCollapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
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
  { id: 'aircraft', label: 'Gestion des avions', shortLabel: 'Avions', icon: Plane },
  { id: 'flights', label: 'Planification des vols', shortLabel: 'Vols', icon: CalendarDays },
  { id: 'flight-history', label: 'Historique des vols', shortLabel: 'Historique', icon: History },
  { id: 'crew', label: 'Affectation des équipages', shortLabel: 'Équipages', icon: Users },
  { id: 'maintenance', label: 'Planification maintenance', shortLabel: 'Maint.', icon: Wrench },
  { id: 'help', label: 'Aide et support', shortLabel: 'Aide', icon: HelpCircle },
];

const MENU_SECTIONS: MenuSection[] = [
  {
    id: 'general',
    label: 'Général',
    icon: FolderOpen,
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { id: 'users', label: 'Gestion des utilisateurs', icon: UserCog },
      { id: 'scheduling', label: 'Programmation des vols', icon: CalendarDays },
      { id: 'aircraft', label: 'Gestion des avions', icon: Plane },
      { id: 'flights', label: 'Planification des vols', icon: CalendarDays },
      { id: 'flight-history', label: 'Historique des vols', icon: History },
    ],
  },
  {
    id: 'operations',
    label: 'Gestion opérationnelle',
    icon: SlidersHorizontal,
    items: [
      { id: 'optimization', label: 'Optimisation automatique', icon: Sparkles },
      { id: 'crew', label: 'Affectation des équipages', icon: Users },
      { id: 'maintenance', label: 'Planification maintenance', icon: Wrench },
    ],
  },
];

const allowedScreens: Record<AvailableRoles, ActiveScreen[]> = {
  Admin: [
    'dashboard', 'users', 'scheduling', 'aircraft', 'flights',
    'flight-history', 'crew', 'maintenance', 'optimization', 'help',
  ],
  Planificateur: [
    'dashboard', 'scheduling', 'aircraft', 'flights',
    'flight-history', 'crew', 'optimization', 'help',
  ],
  Regulator: [
    'dashboard', 'scheduling', 'flights', 'flight-history',
    'crew', 'optimization', 'help',
  ],
  Crew_Member: ['dashboard', 'flights', 'flight-history', 'crew', 'help'],
  Maintenance_Engineer: [
    'dashboard', 'scheduling', 'aircraft', 'maintenance',
    'optimization', 'help',
  ],
  Product_Owner: [
    'dashboard', 'scheduling', 'aircraft', 'flight-history',
    'maintenance', 'optimization', 'help',
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
    (key) => key.toLowerCase() === cleanRole
  );
};

/* ============================================================================
 * SIDEBAR
 * ========================================================================== */

export const Sidebar: React.FC<SidebarProps> = ({
  activeScreen,
  setActiveScreen,
  user,
  onLogout,
  isCollapsed,
  onCollapsedChange,
}) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    general: true,
    operations: true,
  });

  const userDisplayName = user?.nom?.trim() || 'Utilisateur';
  const userInitial = userDisplayName.charAt(0).toUpperCase();

  const currentRole = useMemo(() => normalizeRole(user?.role), [user?.role]);

  const userRoleLabel: UserRoleLabel = currentRole
    ? roleLabels[currentRole]
    : 'Utilisateur';

  const visibleSections = useMemo(() => {
    if (!currentRole) return [];
    return MENU_SECTIONS.map(section => ({
      ...section,
      items: section.items.filter(item =>
        allowedScreens[currentRole].includes(item.id)
      ),
    })).filter(section => section.items.length > 0);
  }, [currentRole]);

  const visibleMobileMenuItems = useMemo(
    () =>
      currentRole
        ? mobileMenuItems.filter((item) =>
            allowedScreens[currentRole].includes(item.id)
          )
        : [],
    [currentRole]
  );

  const handleNavigate = (screen: ActiveScreen) => {
    if (!currentRole) return;
    if (!allowedScreens[currentRole].includes(screen)) return;
    setActiveScreen(screen);
    setIsMobileOpen(false);
  };

  const toggleSection = (sectionId: string) => {
    setOpenSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  useEffect(() => {
    if (!isMobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobileOpen]);

  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isMobileOpen]);

  const renderSubItem = (
    item: MenuItem,
    opts?: { onClickOverride?: () => void }
  ) => {
    const Icon = item.icon;
    const isActive = activeScreen === item.id;

    return (
      <button
        key={item.id}
        type="button"
        onClick={opts?.onClickOverride ?? (() => handleNavigate(item.id))}
        aria-current={isActive ? 'page' : undefined}
        title={isCollapsed ? item.label : undefined}
        className={`group relative flex w-full cursor-pointer select-none items-center rounded-lg text-left text-[13px] font-medium outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
          isCollapsed
            ? 'justify-center px-0 py-2.5'
            : 'gap-2.5 py-2 pl-3 pr-3'
        } ${
          isActive
            ? 'bg-emerald-50 text-emerald-700'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
      >
        {isActive && !isCollapsed && (
          <span
            aria-hidden
            className="absolute right-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-l-full bg-emerald-600"
          />
        )}

        <Icon
          className={`h-4.5 w-4.5 shrink-0 transition ${
            isActive
              ? 'text-emerald-600'
              : 'text-slate-400 group-hover:text-slate-600'
          }`}
        />

        {!isCollapsed && (
          <>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>

            {item.badge && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  isActive
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {item.badge}
              </span>
            )}
          </>
        )}
      </button>
    );
  };

  const renderSectionHeader = (
    section: MenuSection,
    isOpen: boolean,
    onToggle: () => void
  ) => {
    const Icon = section.icon;

    return (
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md py-2 text-left text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50 ${
          isCollapsed ? 'justify-center px-0' : 'pl-3 pr-2'
        }`}
        title={isCollapsed ? section.label : undefined}
      >
        <Icon className="h-4.5 w-4.5 shrink-0 text-slate-500" />

        {!isCollapsed && (
          <>
            <span className="min-w-0 flex-1 truncate">{section.label}</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                isOpen ? '' : '-rotate-90'
              }`}
            />
          </>
        )}
      </button>
    );
  };

  const renderMobileDrawer = () => (
    <>
      <div
        onClick={() => setIsMobileOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          isMobileOpen
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0'
        }`}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation principale"
        className={`fixed inset-y-0 left-0 z-50 flex w-[85%] max-w-xs flex-col overflow-hidden bg-white shadow-2xl transition-transform duration-300 ease-out md:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 shadow-sm shadow-emerald-600/20">
              <Plane className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900">
              Opérations aériennes
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            aria-label="Fermer le menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-3 py-3">
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-200 bg-emerald-100 text-xs font-bold text-emerald-700">
              {user ? userInitial : <User className="h-4 w-4" />}
            </div>
            <div className="min-w-0">
              <p className="m-0 truncate text-[13px] font-semibold leading-tight text-slate-900">
                {userDisplayName}
              </p>
              <p className="m-0 mt-0.5 truncate text-[11px] text-slate-500">
                {userRoleLabel}
              </p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          <div className="space-y-1">
            {visibleMobileMenuItems.map(item => (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition ${
                    activeScreen === item.id
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <item.icon className="h-4.5 w-4.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              </div>
            ))}
          </div>
        </nav>

        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium text-red-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4.5 w-4.5" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>
    </>
  );

  const renderMobileTopbar = () => (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 py-2.5 md:hidden">
      <button
        type="button"
        onClick={() => setIsMobileOpen(true)}
        aria-label="Ouvrir le menu"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600">
          <Plane className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="truncate text-sm font-bold tracking-tight text-slate-900">
          Opérations aériennes
        </span>
      </div>

      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-200 bg-emerald-100 text-xs font-bold text-emerald-700"
        title={userDisplayName}
      >
        {user ? userInitial : <User className="h-4 w-4" />}
      </div>
    </header>
  );

  return (
    <>
      {renderMobileTopbar()}
      {renderMobileDrawer()}

      <aside
        className={`fixed left-0 top-0 z-30 hidden h-screen flex-col border-r border-slate-200 bg-white transition-all duration-300 md:flex ${
          isCollapsed ? 'w-19' : 'w-60'
        }`}
      >
        <div
          className={`flex items-center border-b border-slate-100 py-4 ${
            isCollapsed ? 'justify-center px-2' : 'justify-between px-4'
          }`}
        >
          <div className={`flex items-center ${isCollapsed ? '' : 'gap-2.5'}`}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 shadow-sm shadow-emerald-600/20">
              <Plane className="h-4 w-4 text-white" />
            </div>
            {!isCollapsed && (
              <span className="text-[15px] font-bold tracking-tight text-slate-900">
                Opérations aériennes
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => onCollapsedChange(!isCollapsed)}
            title={isCollapsed ? 'Agrandir' : 'Réduire'}
            aria-label={isCollapsed ? 'Agrandir' : 'Réduire'}
            className={`flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 ${
              isCollapsed ? 'mt-2' : ''
            }`}
          >
            <ChevronLeft
              className={`h-4 w-4 transition-transform duration-300 ${
                isCollapsed ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {!isCollapsed && (
          <div className="border-b border-slate-100 px-3 py-3">
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-200 bg-emerald-100 text-xs font-bold text-emerald-700">
                {user ? userInitial : <User className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <p className="m-0 truncate text-[13px] font-semibold leading-tight text-slate-900">
                  {userDisplayName}
                </p>
                <p className="m-0 mt-0.5 truncate text-[11px] text-slate-500">
                  {userRoleLabel}
                </p>
              </div>
            </div>
          </div>
        )}

        <nav className="flex-1 px-3 py-3">
          <div className="space-y-3">
            {visibleSections.map(section => {
              const isOpen = openSections[section.id] ?? true;

              return (
                <div key={section.id} className="space-y-0.5">
                  {renderSectionHeader(section, isOpen, () =>
                    toggleSection(section.id)
                  )}

                  {(isOpen || isCollapsed) && (
                    <div className="space-y-0.5">
                      {section.items.map(item => (
                        <div key={item.id}>
                          {renderSubItem(item, {
                            onClickOverride: () => handleNavigate(item.id),
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={onLogout}
            title={isCollapsed ? 'Déconnexion' : undefined}
            aria-label="Déconnexion"
            className={`flex w-full cursor-pointer items-center rounded-lg text-[13px] font-medium text-red-500 transition hover:bg-red-50 hover:text-red-600 ${
              isCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2'
            }`}
          >
            <LogOut className="h-4.5 w-4.5" />
            {!isCollapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;