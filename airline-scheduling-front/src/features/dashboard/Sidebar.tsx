import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronsLeft,
  FolderOpen,
  HelpCircle,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MapPin,
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
  | 'aircraft'
  | 'airports'
  | 'flights'
  | 'flight-history'
  | 'crew'
  | 'maintenance'
  | 'optimization'
  | 'help';

type LucideComponent = React.ForwardRefExoticComponent<
  Omit<LucideProps, 'ref'> & React.RefAttributes<SVGSVGElement>
>;

interface MenuItem {
  id: ActiveScreen;
  label: string;
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

// =============================================================================
// MENU
// =============================================================================

const MENU_SECTIONS: MenuSection[] = [
  {
    id: 'general',
    label: 'Général',
    icon: FolderOpen,
    items: [
      { id: 'dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
      { id: 'users', label: 'Gestion des utilisateurs', icon: UserCog },
      { id: 'scheduling', label: 'Programmation des vols', icon: CalendarClock },
      { id: 'aircraft', label: 'Gestion des avions', icon: Plane },
      { id: 'airports', label: 'Aéroports', icon: MapPin },
      { id: 'flights', label: 'Gestion des vols', icon: CalendarDays },
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
      { id: 'help', label: 'Aide et support', icon: HelpCircle },
    ],
  },
];

const allowedScreens: Record<AvailableRoles, ActiveScreen[]> = {
  Admin: [
    'dashboard', 'users', 'scheduling', 'aircraft', 'flights',
    'flight-history', 'crew', 'maintenance', 'optimization', 'help',
  ],
  Planificateur: [
    'dashboard', 'scheduling', 'aircraft', 'airports', 'flights',
    'flight-history', 'crew', 'optimization', 'help',
  ],
  Regulator: [
    'dashboard', 'scheduling', 'airports', 'flights', 'flight-history',
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

// =============================================================================
// PETITS COMPOSANTS
// =============================================================================

const BrandMark = ({ size = 'md' }: { size?: 'sm' | 'md' }) => (
  <div
    className={`flex shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-emerald-600 to-emerald-800 shadow-md shadow-emerald-700/25 ring-1 ring-emerald-500/30 ${
      size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
    }`}
  >
    <Plane className={`-rotate-45 text-white ${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
  </div>
);

const Avatar = ({
  initial,
  hasUser,
  size = 'md',
}: {
  initial: string;
  hasUser: boolean;
  size?: 'sm' | 'md';
}) => (
  <div className="relative shrink-0">
    <div
      className={`flex items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-emerald-100 to-emerald-200 font-bold text-emerald-800 ring-2 ring-white ${
        size === 'sm' ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm'
      }`}
    >
      {hasUser ? initial : <User className="h-4 w-4" />}
    </div>
    <span
      className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white"
      aria-hidden="true"
    />
  </div>
);

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
  const [isMobileProfileOpen, setIsMobileProfileOpen] = useState(false);
  const mobileProfileRef = useRef<HTMLDivElement>(null);

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
    return MENU_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        allowedScreens[currentRole].includes(item.id)
      ),
    })).filter((section) => section.items.length > 0);
  }, [currentRole]);

  const handleNavigate = (screen: ActiveScreen) => {
    if (!currentRole) return;
    if (!allowedScreens[currentRole].includes(screen)) return;
    setActiveScreen(screen);
    setIsMobileOpen(false);
  };

  const toggleSection = (sectionId: string) => {
    setOpenSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
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
    if (!isMobileProfileOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!mobileProfileRef.current?.contains(event.target as Node)) {
        setIsMobileProfileOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileProfileOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileProfileOpen]);

  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isMobileOpen]);

  // ===========================================================================
  // ÉLÉMENT DE MENU
  // ===========================================================================

  const renderItem = (item: MenuItem, collapsed: boolean) => {
    const Icon = item.icon;
    const isActive = activeScreen === item.id;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => handleNavigate(item.id)}
        aria-current={isActive ? 'page' : undefined}
        title={collapsed ? item.label : undefined}
        className={`group relative flex w-full cursor-pointer select-none items-center rounded-xl text-left text-[13px] outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-emerald-500/40 ${
          collapsed ? 'h-10 justify-center' : 'h-9 gap-3 px-3'
        } ${
          isActive
            ? 'bg-emerald-50 font-semibold text-emerald-800'
            : 'font-medium text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
        }`}
      >
        {isActive && (
          <span
            aria-hidden
            className={`absolute top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-emerald-600 ${
              collapsed ? '-left-3 h-6' : '-left-3 h-5'
            }`}
          />
        )}

        <Icon
          className={`h-4.5 w-4.5 shrink-0 transition-colors ${
            isActive ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'
          }`}
        />

        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.badge && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
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

  // ===========================================================================
  // SECTIONS
  // ===========================================================================

  const renderSections = (collapsed: boolean) => (
    <div className="space-y-5">
      {visibleSections.map((section, index) => {
        const isOpen = collapsed || (openSections[section.id] ?? true);
        const sectionId = `sidebar-section-${section.id}${collapsed ? '-c' : ''}`;

        return (
          <div key={section.id}>
            {collapsed ? (
              index > 0 && <div className="mx-auto mb-3 h-px w-8 bg-slate-200" aria-hidden />
            ) : (
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                aria-expanded={isOpen}
                aria-controls={sectionId}
                className="mb-1 flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-1 text-[10.5px] font-bold uppercase tracking-widest text-slate-400 transition hover:text-slate-600"
              >
                <span className="truncate">{section.label}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                    isOpen ? '' : '-rotate-90'
                  }`}
                />
              </button>
            )}

            <div
              id={sectionId}
              className={`grid transition-[grid-template-rows] duration-200 ${
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="space-y-0.5 overflow-hidden">
                {section.items.map((item) => renderItem(item, collapsed))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  // ===========================================================================
  // CARTE UTILISATEUR
  // ===========================================================================

  const renderUserCard = () => (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-linear-to-br from-slate-50 to-white px-3 py-2.5">
      <Avatar initial={userInitial} hasUser={Boolean(user)} />
      <div className="min-w-0">
        <p className="m-0 truncate text-[13px] font-semibold leading-tight text-slate-900">
          {userDisplayName}
        </p>
        <p className="m-0 mt-0.5 truncate text-[11px] font-medium text-emerald-700">
          {userRoleLabel}
        </p>
      </div>
    </div>
  );

  // ===========================================================================
  // DÉCONNEXION
  // ===========================================================================

  const renderLogout = (collapsed: boolean) => (
    <button
      type="button"
      onClick={onLogout}
      title={collapsed ? 'Déconnexion' : undefined}
      aria-label="Déconnexion"
      className={`group flex w-full cursor-pointer items-center rounded-xl text-[13px] font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30 ${
        collapsed ? 'h-10 justify-center' : 'h-9 gap-3 px-3'
      }`}
    >
      <LogOut className="h-4.5 w-4.5 shrink-0 text-slate-400 transition group-hover:text-rose-500" />
      {!collapsed && <span>Déconnexion</span>}
    </button>
  );

  // ===========================================================================
  // MOBILE : TIROIR
  // ===========================================================================

  const renderMobileDrawer = () => (
    <>
      <div
        onClick={() => setIsMobileOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm transition-opacity duration-300 md:hidden ${
          isMobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
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
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <div className="leading-tight">
              <p className="text-[15px] font-bold tracking-tight text-slate-900">Opérations aériennes</p>
              <p className="text-[11px] font-medium text-slate-400">Centre de contrôle</p>
            </div>
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

        <div className="px-3 pb-3">{renderUserCard()}</div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">{renderSections(false)}</nav>

        <div className="border-t border-slate-100 p-3">{renderLogout(false)}</div>
      </aside>
    </>
  );

  // ===========================================================================
  // MOBILE : BARRE DU HAUT
  // ===========================================================================

  const renderMobileTopbar = () => (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-3 py-2 backdrop-blur-md md:hidden">
      <button
        type="button"
        onClick={() => setIsMobileOpen(true)}
        aria-label="Ouvrir le menu"
        aria-expanded={isMobileOpen}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <BrandMark size="sm" />
        <span className="min-w-0 truncate text-sm font-bold tracking-tight text-slate-900">
          Opérations aériennes
        </span>
      </div>

      <div className="relative shrink-0" ref={mobileProfileRef}>
        <button
          type="button"
          onClick={() => setIsMobileProfileOpen((open) => !open)}
          aria-label={`Compte de ${userDisplayName}`}
          aria-haspopup="menu"
          aria-expanded={isMobileProfileOpen}
          title="Compte et déconnexion"
          className="flex h-10 w-10 items-center justify-center rounded-full outline-none transition hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-500/50"
        >
          <Avatar initial={userInitial} hasUser={Boolean(user)} size="sm" />
        </button>
        {isMobileProfileOpen && (
          <div
            role="menu"
            aria-label="Compte utilisateur"
            className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-xl shadow-slate-900/10"
          >
            <div className="min-w-0 border-b border-slate-100 px-1 pb-3">
              <p className="truncate text-sm font-semibold">{userDisplayName}</p>
              {user?.email && (
                <p className="truncate text-xs text-slate-500">{user.email}</p>
              )}
              <p className="mt-1 text-[11px] font-medium text-emerald-700">
                {userRoleLabel}
              </p>
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsMobileProfileOpen(false);
                onLogout();
              }}
              className="mt-2 flex h-10 w-full items-center gap-2 rounded-lg px-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </header>
  );

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <>
      {renderMobileTopbar()}
      {renderMobileDrawer()}

      <aside
        className={`fixed left-0 top-0 z-30 hidden h-screen flex-col border-r border-slate-200/80 bg-white transition-[width] duration-300 md:flex ${
          isCollapsed ? 'w-19' : 'w-64'
        }`}
      >
        {/* En-tête  pour menu*/}
        <div
          className={`flex h-16 shrink-0 items-center ${
            isCollapsed ? 'justify-center px-2' : 'justify-between pl-4 pr-3'
          }`}
        >
          {isCollapsed ? (
            <button
              type="button"
              onClick={() => onCollapsedChange(false)}
              title="Agrandir le menu"
              aria-label="Agrandir le menu"
              className="cursor-pointer rounded-xl transition hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
            >
              <BrandMark />
            </button>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-2.5">
                <BrandMark />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-[14px] font-bold tracking-tight text-slate-900">
                    Opérations aériennes
                  </p>
                  <p className="truncate text-[11px] font-medium text-slate-400">Centre de contrôle</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onCollapsedChange(true)}
                title="Réduire le menu"
                aria-label="Réduire le menu"
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Utilisateur */}
        <div className={`shrink-0 pb-3 ${isCollapsed ? 'flex justify-center px-2' : 'px-3'}`}>
          {isCollapsed ? (
            <div title={`${userDisplayName} · ${userRoleLabel}`}>
              <Avatar initial={userInitial} hasUser={Boolean(user)} />
            </div>
          ) : (
            renderUserCard()
          )}
        </div>

        <div className="mx-3 h-px shrink-0 bg-slate-100" aria-hidden />

        {/* Navigation */}
        <nav
          className={`flex-1 overflow-y-auto overflow-x-hidden py-4 scrollbar-thin ${
            isCollapsed ? 'px-3' : 'px-3'
          }`}
          aria-label="Navigation principale"
        >
          {renderSections(isCollapsed)}
        </nav>

        {/* Pied */}
        <div className="shrink-0 border-t border-slate-100 p-3">{renderLogout(isCollapsed)}</div>
      </aside>
    </>
  );
};

export default Sidebar;