// FleetStatistics.tsx
import React from 'react';
import { BarChart3, Plane, AlertTriangle, Wrench, History, Percent, Users } from 'lucide-react';
import type { FleetStatistics as FleetStatsType } from './fleetService';

interface FleetStatisticsProps {
  stats: FleetStatsType | null;
  isLoading: boolean;
}

export const FleetStatistics: React.FC<FleetStatisticsProps> = ({ stats, isLoading }) => {
  if (isLoading || !stats) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50 h-24"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-100 bg-slate-50/60 h-20"></div>
          ))}
        </div>
      </div>
    );
  }

  const totalAircrafts = Number(stats.totalAircrafts) || 0;
  const activeAircrafts = Number(stats.activeAircrafts) || 0;
  const inMaintenanceAircrafts = Number(stats.inMaintenanceAircrafts) || 0;
  const outOfServiceAircrafts = Number(stats.outOfServiceAircrafts) || 0;
  
  const totalFlightHours = Number(stats.totalFlightHours) || 0;
  const averageFlightHours = Number(stats.averageFlightHours) || 0;
  const averageCapacity = Number(stats.averageCapacity) || 0;

  const availabilityRate = totalAircrafts > 0 
    ? Math.round((activeAircrafts / totalAircrafts) * 100) 
    : 0;

  // Harmonisation des thèmes de couleur vert / menthe / émeraude de l'image sibar
  const primaryStats = [
    {
      label: 'Flotte Totale',
      value: totalAircrafts,
      icon: Plane,
      styles: { border: 'border-slate-100', bg: 'bg-[#063a36]/10', text: 'text-[#063a36]' }
    },
    {
      label: 'En Service Actif',
      value: activeAircrafts,
      icon: BarChart3,
      styles: { border: 'border-slate-100', bg: 'bg-emerald-500/10', text: 'text-emerald-600' }
    },
    {
      label: 'En Maintenance',
      value: inMaintenanceAircrafts,
      icon: Wrench,
      styles: { border: 'border-slate-100', bg: 'bg-amber-500/10', text: 'text-amber-600' }
    },
    {
      label: 'Hors Service (IROPS)',
      value: outOfServiceAircrafts,
      icon: AlertTriangle,
      styles: { border: 'border-slate-100', bg: 'bg-rose-500/10', text: 'text-rose-600' }
    },
    {
      label: 'Disponibilité',
      value: `${availabilityRate}%`,
      icon: Percent,
      styles: { 
        border: 'border-slate-100', 
        bg: 'bg-[#3ae7a6]/10', 
        text: 'text-[#0e524b]' 
      }
    },
  ];

  const secondaryStats = [
    {
      label: 'Heures de Vol Cumulées',
      value: `${totalFlightHours.toLocaleString()} h`,
      icon: History,
    },
    {
      label: 'Moyenne Vol / Appareil',
      value: `${averageFlightHours.toLocaleString()} h`,
      icon: BarChart3,
    },
    {
      label: 'Capacité Moyenne',
      value: `${averageCapacity} PAX`,
      icon: Users,
    },
  ];

  return (
    <div className="space-y-4 transition-all duration-300 ease-in-out">
      {/* Statistiques principales à barres de style de l'image (Widgets) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {primaryStats.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div 
              key={idx} 
              className={`rounded-2xl border bg-white p-4 shadow-sm hover:shadow-md/5 transition-all duration-200 ${item.styles.border} ${idx === 4 ? 'col-span-2 sm:col-span-1' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                    {item.label}
                  </p>
                  <p className={`text-2xl sm:text-3xl font-black tracking-tight ${item.styles.text}`}>
                    {item.value}
                  </p>
                </div>
                <div className={`p-2.5 rounded-xl shrink-0 ${item.styles.bg} ${item.styles.text}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reste des sous-indicateurs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {secondaryStats.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div 
              key={idx} 
              className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm flex items-center gap-4 hover:border-slate-200 transition-colors"
            >
              <div className="p-2.5 rounded-xl bg-slate-50 text-slate-500 shrink-0">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
                  {item.label}
                </p>
                <p className="text-xl font-black text-slate-800 tracking-tight mt-0.5">
                  {item.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};