// App.tsx
import { useEffect, useState } from 'react';
import { ShieldCheck, LogOut } from 'lucide-react';
import { DashboardGantt } from './features/dashboard/DashboardGantt';
import { FlightSchedulerDashboard } from './features/dashboard/FlightSchedulerDashboard'; // <-- Mis à jour
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

  const [user, setUser] = useState<{ nom: string; email: string; role?: string } | null>(() => {
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

  const screenMeta: Record<ActiveScreen, { title: string;  }> = {
    dashboard: { title: 'Tableau de bord opérationnel' },
    scheduling: { title: 'Ordonnancement & Matrice de Chevauchement' },
    fleet: { title: 'Gestion des Avions' },
    flights: { title: 'Planification des Vols' },
    crew: { title: 'Affectation Équipages' },
    maintenance: { title: 'Planification Maintenance' },
    disruptions: { title: 'Centre de Crise (IROPS)' },
    optimization: { title: "Optimisation Automatique des Vols & Conflits" },
    settings: { title: 'Configuration Réseau' },
  };

  const renderScreen: Record<ActiveScreen, React.ReactNode> = {
    dashboard: <DashboardGantt />,
    scheduling: <FlightSchedulerDashboard />, // <-- Utilisation de FlightSchedulerDashboard
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

  const handleAuthenticate = (nextUser: { nom: string; email: string; role?: string }) => {
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
    <div className="min-h-screen bg-slate-900/5 antialiased selection:bg-emerald-500/20 selection:text-emerald-900 flex flex-col md:flex-row font-sans">
      <Sidebar 
        activeScreen={activeScreen} 
        setActiveScreen={setActiveScreen} 
        user={user} 
        onLogout={handleLogout} 
      />

      <div className="flex-1 flex flex-col min-w-0 min-h-screen mb-16 md:mb-0">
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-8 py-4 transition-all">
          <div className="max-w-[1500px] mx-auto flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            
            <div className="space-y-0.5">
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight leading-none">
                  {screenMeta[activeScreen]?.title ?? ''}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end lg:self-auto shrink-0">
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200/80 rounded-2xl p-1.5 pr-3 shadow-xs">
                
                <div className="flex h-9 w-9 items-center justify-center rounded-4xl bg-gradient-to-tr from-emerald-900 to-teal-800 text-sm font-black text-emerald-300 shadow-sm shrink-0">
                  {user?.nom?.charAt(0).toUpperCase() ?? 'U'}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-slate-900 truncate tracking-tight">
                      {user?.nom ?? 'Utilisateur'}
                    </p>
                  </div>
                  
                  {userRoleLabel ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                      <ShieldCheck className="w-3 h-4 text-emerald-600" />
                      {userRoleLabel}
                    </span>
                  ) : (
                    <p className="truncate text-[11px] text-slate-400 font-medium">
                      {user?.email ?? ''}
                    </p>
                  )}
                </div>

                <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

                <button
                  type="button"
                  onClick={handleLogout}
                  title="Se déconnecter"
                  className="hidden sm:flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 transition-all duration-150 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 cursor-pointer shadow-2xs"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Déconnecter</span>
                </button>
              </div>
            </div>

          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1500px] w-full mx-auto">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {renderScreen[activeScreen]}
          </div>
        </main>
        
      </div>
    </div>
  );
}

export default App;