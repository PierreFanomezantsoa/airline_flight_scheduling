import { useEffect, useState, useRef } from 'react';
import { ShieldCheck, LogOut, User, Bell, ChevronDown } from 'lucide-react';
import { DashboardGantt } from './features/dashboard/DashboardGantt';
import { FlightSchedulerDashboard } from './features/dashboard/FlightSchedulerDashboard';
import { FlightsPlanning } from './features/flights/FlightsPlanning';
import { CrewAssignment } from './features/crew/CrewAssignment';
import { FleetManagement } from './features/fleet/FleetManagement';
import { MaintenancePlanning } from './features/maintenance/MaintenancePlanning';
import { DisruptionCenter } from './features/disruptions/DisruptionCenter';
import { NetworkSettings } from './features/settings/NetworkSettings';
import { FlightOptimizationDashboard } from './features/dashboard/FlightOptimizationDashboard';

import { Sidebar } from './features/dashboard/Sidebar';
import type { ActiveScreen } from './features/dashboard/Sidebar';
import { AuthPage } from './features/auth/AuthPage';

function App() {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const roleScreenPermissions: Record<string, ActiveScreen[]> = {
    Admin: ['dashboard', 'scheduling', 'fleet', 'flights', 'crew', 'maintenance', 'disruptions', 'optimization', 'settings'],
    Planificateur: ['dashboard', 'scheduling', 'fleet', 'flights', 'crew', 'optimization'],
    Regulator: ['dashboard', 'scheduling', 'flights', 'crew', 'disruptions', 'optimization', 'settings'],
    Maintenance_Engineer: ['dashboard', 'scheduling', 'fleet', 'maintenance', 'optimization'],
    Crew_Member: ['dashboard', 'flights', 'crew'],
    Product_Owner: ['dashboard', 'scheduling', 'fleet', 'maintenance', 'disruptions', 'optimization', 'settings'],
  };

  const getDefaultScreenForRole = (role?: string): ActiveScreen => {
    if (role === 'Maintenance_Engineer') return 'maintenance';
    if (role === 'Crew_Member') return 'flights';
    return 'dashboard';
  };

  const [user, setUser] = useState<{ nom: string; email: string; role?: string; avatarUrl?: string } | null>(() => {
    const storedUser = localStorage.getItem('airline-user');
    return storedUser ? JSON.parse(storedUser) : null;
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('airline-user') !== null;
  });

  const [activeScreen, setActiveScreenState] = useState<ActiveScreen>(() => {
    const savedScreen = localStorage.getItem('activeScreen') as ActiveScreen;
    const storedUser = localStorage.getItem('airline-user');

    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      if (savedScreen && parsedUser.role && roleScreenPermissions[parsedUser.role]?.includes(savedScreen)) {
        return savedScreen;
      }
      return getDefaultScreenForRole(parsedUser.role);
    }

    return savedScreen || 'dashboard';
  });

  const setActiveScreen = (screen: ActiveScreen) => {
    setActiveScreenState(screen);
    localStorage.setItem('activeScreen', screen);
  };

  const screenMeta: Record<ActiveScreen, { title: string }> = {
    dashboard: { title: 'Tableau de bord opérationnel' },
    scheduling: { title: 'Ordonnancement & Matrice' },
    fleet: { title: 'Gestion des Avions' },
    flights: { title: 'Planification des Vols' },
    crew: { title: 'Affectation Équipages' },
    maintenance: { title: 'Planification Maintenance' },
    disruptions: { title: 'Centre de Crise (IROPS)' },
    optimization: { title: 'Optimisation Automatique' },
    settings: { title: 'Configuration Réseau' },
  };

  const renderScreen: Record<ActiveScreen, React.ReactNode> = {
    dashboard: <DashboardGantt />,
    scheduling: <FlightSchedulerDashboard />,
    fleet: <FleetManagement />,
    flights: <FlightsPlanning />,
    crew: <CrewAssignment />,
    maintenance: <MaintenancePlanning />,
    disruptions: <DisruptionCenter />,
    optimization: <FlightOptimizationDashboard />,
    settings: <NetworkSettings />,
  };

  const userRoleLabel = user?.role === 'Regulator'
    ? 'Régulateur'
    : user?.role === 'Maintenance_Engineer'
      ? 'Ingénieur Maintenance'
      : user?.role === 'Crew_Member'
        ? 'Membre d’équipe'
        : user?.role === 'Product_Owner' || user?.role === 'Product Owner'
          ? 'Product Owner'
          : user?.role === 'Admin'
            ? 'Administrateur'
            : user?.role === 'Planificateur'
              ? 'Planificateur'
              : '';

  useEffect(() => {
    if (user?.role && !roleScreenPermissions[user.role]?.includes(activeScreen)) {
      setActiveScreen(getDefaultScreenForRole(user.role));
    }
  }, [user, activeScreen]);

  // Ferme le menu profil quand on clique en dehors
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAuthenticate = (nextUser: { nom: string; email: string; role?: string; avatarUrl?: string }) => {
    localStorage.setItem('airline-user', JSON.stringify(nextUser));
    setUser(nextUser);
    setIsAuthenticated(true);

    const targetScreen = nextUser.role && roleScreenPermissions[nextUser.role]?.includes(activeScreen)
      ? activeScreen
      : getDefaultScreenForRole(nextUser.role);

    setActiveScreen(targetScreen);
  };

  const handleLogout = () => {
    localStorage.removeItem('airline-user');
    localStorage.removeItem('activeScreen');
    setUser(null);
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <AuthPage onAuthenticate={handleAuthenticate} />;
  }

  return (
    <div className="min-h-screen bg-gray-100 antialiased selection:bg-emerald-500/20 selection:text-emerald-900 flex flex-col md:flex-row font-sans">
      <Sidebar 
        activeScreen={activeScreen} 
        setActiveScreen={setActiveScreen} 
        user={user} 
        onLogout={handleLogout} 
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-screen mb-16 md:mb-0">
        {/* Top bar unifiée en bg-gray-100 */}
        <header className="sticky top-0 z-30 bg-gray-100/90 backdrop-blur-md border-b border-gray-200 px-4 sm:px-8 py-5 transition-all">
          <div className="max-w-375 mx-auto flex items-center justify-between gap-4">
            
            {/* Titre de l'écran */}
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-800 tracking-tight truncate">
                {screenMeta[activeScreen]?.title ?? ''}
              </h2>
            </div>

            {/* Actions & Profil à droite */}
            <div className="flex items-center gap-3 shrink-0">
              <button 
                type="button" 
                className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-gray-200/80 transition-colors border-none bg-transparent cursor-pointer"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-600 rounded-full ring-2 ring-gray-100" />
              </button>

              <div className="h-6 w-px bg-gray-300" />

              <div className="relative shrink-0" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
                  aria-label="Voir les détails du compte"
                  className="flex items-center gap-3 p-1.5 rounded-xl hover:bg-gray-200/80 transition-all cursor-pointer border-none bg-transparent outline-none group"
                >
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                    {user?.avatarUrl ? (
                      <img 
                        src={user.avatarUrl} 
                        alt={user?.nom ?? 'User'} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-emerald-700 font-extrabold text-sm">
                        {user?.nom?.charAt(0).toUpperCase() ?? <User className="w-4 h-4 text-emerald-700" />}
                      </span>
                    )}
                  </div>

                  <div className="hidden sm:flex flex-col text-left">
                    <span className="text-xs font-bold text-slate-800 truncate max-w-30 leading-tight">
                      {user?.nom ?? 'Utilisateur'}
                    </span>
                    <span className="text-[10px] font-medium text-slate-500 truncate max-w-30 mt-0.5">
                      {userRoleLabel || 'Membre'}
                    </span>
                  </div>

                  <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-transform duration-200" />
                </button>

                {isProfileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white text-slate-900 rounded-2xl shadow-xl border border-gray-200 py-3 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-4 pb-3 pt-1 border-b border-gray-100 flex flex-col items-center text-center">
                      <div className="w-14 h-14 rounded-full overflow-hidden bg-emerald-100 border-2 border-emerald-200 flex items-center justify-center shadow-xs mb-2.5">
                        {user?.avatarUrl ? (
                          <img 
                            src={user.avatarUrl} 
                            alt={user?.nom ?? 'User'} 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-emerald-700 font-black text-xl">
                            {user?.nom?.charAt(0).toUpperCase() ?? <User className="w-7 h-7 text-emerald-700" />}
                          </span>
                        )}
                      </div>

                      <p className="text-sm font-bold text-slate-900 truncate max-w-full">
                        {user?.nom ?? 'Utilisateur'}
                      </p>
                      <p className="text-xs text-slate-500 truncate max-w-full mt-0.5">
                        {user?.email ?? ''}
                      </p>

                      {userRoleLabel && (
                        <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200/60">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          {userRoleLabel}
                        </span>
                      )}
                    </div>

                    <div className="pt-2 px-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsProfileMenuOpen(false);
                          handleLogout();
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer border-none bg-transparent"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Déconnexion</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </header>

        {/* Zone de contenu principale sur le fond bg-gray-100 */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-375 w-full mx-auto">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {renderScreen[activeScreen]}
          </div>
        </main>
        
      </div>
    </div>
  );
}

export default App;