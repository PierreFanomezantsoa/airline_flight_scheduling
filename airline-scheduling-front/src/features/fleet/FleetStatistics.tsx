// FleetStatistics.tsx

import { useMemo } from 'react';
import type { FC } from 'react';
import {
  BarChart3,
  Plane,
  AlertTriangle,
  Wrench,
  History,
  Percent,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { FleetStatistics as FleetStatsType } from './fleetService';

/* ============================================================================
 * TYPES
 * ========================================================================== */

interface FleetStatisticsProps {
  stats: FleetStatsType | null;
  isLoading: boolean;
}

interface PrimaryStat {
  label: string;
  value: string | number;
  icon: LucideIcon;
  styles: {
    border: string;
    bg: string;
    text: string;
  };
}

interface SecondaryStat {
  label: string;
  value: string;
  icon: LucideIcon;
}

/* ============================================================================
 * CONSTANTES
 * ========================================================================== */

const PRIMARY_SKELETON_COUNT = 5;
const SECONDARY_SKELETON_COUNT = 3;

/* ============================================================================
 * SOUS-COMPOSANTS
 * ========================================================================== */

const LoadingSkeleton: FC = () => (
  <div className="animate-pulse space-y-4" aria-hidden="true">
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: PRIMARY_SKELETON_COUNT }).map((_, i) => (
        <div
          key={`primary-skeleton-${i}`}
          className="h-24 rounded-2xl border border-slate-100 bg-slate-50"
        />
      ))}
    </div>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {Array.from({ length: SECONDARY_SKELETON_COUNT }).map((_, i) => (
        <div
          key={`secondary-skeleton-${i}`}
          className="h-20 rounded-2xl border border-slate-100 bg-slate-50/60"
        />
      ))}
    </div>
  </div>
);

/* ============================================================================
 * COMPOSANT
 * ========================================================================== */

export const FleetStatistics: FC<FleetStatisticsProps> = ({
  stats,
  isLoading,
}) => {
  /* -------------------------------------------------------------------------
   * VALEURS DÉRIVÉES
   * ----------------------------------------------------------------------- */

  const derived = useMemo(() => {
    if (!stats) {
      return {
        totalAircrafts: 0,
        activeAircrafts: 0,
        inMaintenanceAircrafts: 0,
        outOfServiceAircrafts: 0,
        totalFlightHours: 0,
        averageFlightHours: 0,
        averageCapacity: 0,
        availabilityRate: 0,
      };
    }

    const totalAircrafts = Number(stats.totalAircrafts) || 0;
    const activeAircrafts = Number(stats.activeAircrafts) || 0;

    return {
      totalAircrafts,
      activeAircrafts,
      inMaintenanceAircrafts: Number(stats.inMaintenanceAircrafts) || 0,
      outOfServiceAircrafts: Number(stats.outOfServiceAircrafts) || 0,
      totalFlightHours: Number(stats.totalFlightHours) || 0,
      averageFlightHours: Number(stats.averageFlightHours) || 0,
      averageCapacity: Number(stats.averageCapacity) || 0,
      availabilityRate:
        totalAircrafts > 0
          ? Math.round((activeAircrafts / totalAircrafts) * 100)
          : 0,
    };
  }, [stats]);

  /* -------------------------------------------------------------------------
   * KPI PRINCIPAUX
   * ----------------------------------------------------------------------- */

  const primaryStats: PrimaryStat[] = useMemo(
    () => [
      {
        label: 'Flotte Totale',
        value: derived.totalAircrafts,
        icon: Plane,
        styles: {
          border: 'border-slate-100',
          bg: 'bg-[#063a36]/10',
          text: 'text-[#063a36]',
        },
      },
      {
        label: 'En Service Actif',
        value: derived.activeAircrafts,
        icon: BarChart3,
        styles: {
          border: 'border-slate-100',
          bg: 'bg-emerald-500/10',
          text: 'text-emerald-600',
        },
      },
      {
        label: 'En Maintenance',
        value: derived.inMaintenanceAircrafts,
        icon: Wrench,
        styles: {
          border: 'border-slate-100',
          bg: 'bg-amber-500/10',
          text: 'text-amber-600',
        },
      },
      {
        label: 'Hors Service (IROPS)',
        value: derived.outOfServiceAircrafts,
        icon: AlertTriangle,
        styles: {
          border: 'border-slate-100',
          bg: 'bg-rose-500/10',
          text: 'text-rose-600',
        },
      },
      {
        label: 'Disponibilité',
        value: `${derived.availabilityRate}%`,
        icon: Percent,
        styles: {
          border: 'border-slate-100',
          bg: 'bg-[#3ae7a6]/10',
          text: 'text-[#0e524b]',
        },
      },
    ],
    [derived],
  );

  /* -------------------------------------------------------------------------
   * KPI SECONDAIRES
   * ----------------------------------------------------------------------- */

  const secondaryStats: SecondaryStat[] = useMemo(
    () => [
      {
        label: 'Heures de Vol Cumulées',
        value: `${derived.totalFlightHours.toLocaleString()} h`,
        icon: History,
      },
      {
        label: 'Moyenne Vol / Appareil',
        value: `${derived.averageFlightHours.toLocaleString()} h`,
        icon: BarChart3,
      },
      {
        label: 'Capacité Moyenne',
        value: `${derived.averageCapacity} PAX`,
        icon: Users,
      },
    ],
    [derived],
  );

  /* -------------------------------------------------------------------------
   * LOADING
   * ----------------------------------------------------------------------- */

  if (isLoading || !stats) {
    return <LoadingSkeleton />;
  }

  /* -------------------------------------------------------------------------
   * RENDER
   * ----------------------------------------------------------------------- */

  return (
    <div className="space-y-4 transition-all duration-300 ease-in-out">
      {/* KPI PRINCIPAUX */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {primaryStats.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`rounded-2xl border bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md ${
                item.styles.border
              } ${idx === 4 ? 'col-span-2 sm:col-span-1' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {item.label}
                  </p>
                  <p
                    className={`text-2xl font-black tracking-tight sm:text-3xl ${item.styles.text}`}
                  >
                    {item.value}
                  </p>
                </div>
                <div
                  className={`shrink-0 rounded-xl p-2.5 ${item.styles.bg} ${item.styles.text}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* KPI SECONDAIRES */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {secondaryStats.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition-colors hover:border-slate-200"
            >
              <div className="shrink-0 rounded-xl bg-slate-50 p-2.5 text-slate-500">
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {item.label}
                </p>
                <p className="mt-0.5 text-xl font-black tracking-tight text-slate-800">
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

export default FleetStatistics;