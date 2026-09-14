import React, { useMemo } from 'react';
import {
  Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { Layers } from 'lucide-react';
import type { FlightStatus } from './FlightSchedulerGantt';

export interface Flight {
  id: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  localDeparture?: string | null;
  localArrival?: string | null;
  durationMinutes?: number | null;
  status: FlightStatus | string;
  aircraft?: string | null;
  aircraftModel?: string | null;
  weatherSeverity?: number | null;
}

export interface AnalyticsMetrics {
  totalFlights: number;
  otpRate: number;
  onTimeCount: number;
  delayedCount: number;
  inFlightCount: number;
  cancelledCount: number;
  completedCount: number;
}

export interface AutoScheduleMetrics {
  totalFlights: number;
  assignedFlights: number;
  unassignedFlights: number;
  shiftedFlights?: number;
  directAssignments?: number;
  operationalAircraft?: number;
}

export interface AutoScheduleUnassigned {
  flightId: string;
  flightNumber?: string | null;
  origin?: string | null;
  destination?: string | null;
  departure?: string;
  arrival?: string;
  reason?: string;
}

export interface AutoScheduleResponse {
  status: string;
  message?: string;
  generatedAt?: string;
  strategy?: string;
  applied?: boolean;
  turnaroundMinutes?: number;
  shiftStepMinutes?: number;
  maxShiftMinutes?: number;
  assignments?: unknown[];
  unassigned?: AutoScheduleUnassigned[];
  metrics: AutoScheduleMetrics;
  gantt: unknown;
}

interface FlightSchedulerDetailsProps {
  flights: Flight[];
  analytics: AnalyticsMetrics;
  previewScenario: AutoScheduleResponse | null;
}

interface StatusConfigItem {
  bar: string;
  badgeBg: string;
  dot: string;
}

const STATUS_CONFIG: Record<FlightStatus, StatusConfigItem> = {
  Planifié: {
    bar: '#2563eb',
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  'En Vol': {
    bar: '#d97706',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500 animate-pulse',
  },
  Retardé: {
    bar: '#ea580c',
    badgeBg: 'bg-orange-50 text-orange-700 border-orange-200',
    dot: 'bg-orange-500',
  },
  Annulé: {
    bar: '#dc2626',
    badgeBg: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
  Effectué: {
    bar: '#10b981',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
};

const normalizeFlightStatus = (value?: string | null): FlightStatus => {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/_/g, ' ');
  if (['IN-FLIGHT', 'IN FLIGHT', 'EN VOL'].includes(normalized)) return 'En Vol';
  if (['DELAYED', 'RETARDÉ', 'RETARDE', 'SHIFTED'].includes(normalized)) return 'Retardé';
  if (['CANCELLED', 'CANCELED', 'ANNULÉ', 'ANNULE'].includes(normalized)) return 'Annulé';
  if (['EFFECTUÉ', 'EFFECTUE', 'DONE', 'COMPLETED', 'LANDED'].includes(normalized)) return 'Effectué';
  return 'Planifié';
};

const safeDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateTime = (value?: string | null): string => {
  const date = safeDate(value);
  if (!date) return '--';
  return date.toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

const FlightSchedulerDetails: React.FC<FlightSchedulerDetailsProps> = ({
  flights,
  analytics,
  previewScenario,
}) => {
  const pieChartData = useMemo(
    () =>
      [
        { name: 'Planifiés', value: analytics.onTimeCount, color: STATUS_CONFIG.Planifié.bar },
        { name: 'En Vol', value: analytics.inFlightCount, color: STATUS_CONFIG['En Vol'].bar },
        { name: 'Retardés', value: analytics.delayedCount, color: STATUS_CONFIG.Retardé.bar },
        { name: 'Annulés', value: analytics.cancelledCount, color: STATUS_CONFIG.Annulé.bar },
        { name: 'Effectués', value: analytics.completedCount, color: STATUS_CONFIG.Effectué.bar },
      ].filter(item => item.value > 0),
    [analytics],
  );

  const barChartData = useMemo(() => {
    const hourly: Record<string, number> = {};
    flights.forEach(flight => {
      const departure = safeDate(flight.departure);
      if (!departure) return;
      const hour = `${departure.getHours().toString().padStart(2, '0')}h`;
      hourly[hour] = (hourly[hour] ?? 0) + 1;
    });
    return Object.keys(hourly)
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
      .map(hour => ({ hour, vols: hourly[hour] }));
  }, [flights]);

  const scenarioUnassigned = previewScenario?.metrics.unassignedFlights ?? 0;

  return (
    <>
      {previewScenario && (
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-4 sm:p-5">
            <h3 className="text-sm font-black text-sky-900">Résultat du générateur</h3>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <SmallValue
                label="Affectations directes"
                value={previewScenario.metrics.directAssignments ?? 0}
              />
              <SmallValue
                label="Vols décalés"
                value={previewScenario.metrics.shiftedFlights ?? 0}
              />
              <SmallValue
                label="Avions opérationnels"
                value={previewScenario.metrics.operationalAircraft ?? 0}
              />
              <SmallValue
                label="Stratégie"
                value={previewScenario.strategy ?? 'deterministic-greedy-v1'}
              />
            </div>
          </div>

          <div
            className={`rounded-2xl border p-4 sm:p-5 ${
              scenarioUnassigned > 0
                ? 'border-amber-200 bg-amber-50/60'
                : 'border-emerald-200 bg-emerald-50/60'
            }`}
          >
            <h3
              className={`text-sm font-black ${
                scenarioUnassigned > 0 ? 'text-amber-900' : 'text-emerald-900'
              }`}
            >
              Vols non affectés
            </h3>

            {(previewScenario.unassigned ?? []).length === 0 ? (
              <p className="mt-3 text-xs font-semibold text-emerald-700">
                Tous les vols du scénario ont reçu une affectation.
              </p>
            ) : (
              <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">
                {(previewScenario.unassigned ?? []).map(item => (
                  <div
                    key={item.flightId}
                    className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-black text-slate-900">
                        {item.flightNumber}
                      </span>
                      <span className="ml-2 text-[10px] font-semibold text-slate-500">
                        {item.origin} → {item.destination}
                      </span>
                    </div>
                    <span className="shrink-0 text-[9px] font-black uppercase text-amber-700">
                      {item.reason}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="mb-2 text-sm font-bold text-slate-900">Répartition par statut</h3>
          <div className="relative h-56 w-full sm:h-60">
            {pieChartData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={78}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell
                          key={`status-${entry.name}-${index}`}
                          fill={entry.color}
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-slate-800">
                    {analytics.totalFlights}
                  </span>
                  <span className="text-[10px] font-semibold uppercase text-slate-400">
                    Vols
                  </span>
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Aucune donnée disponible
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <h3 className="mb-2 text-sm font-bold text-slate-900">Départs par tranche horaire</h3>
          <div className="h-56 w-full sm:h-60">
            {barChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barChartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <XAxis
                    dataKey="hour"
                    stroke="#94a3b8"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="vols"
                    fill="#047857"
                    radius={[6, 6, 0, 0]}
                    barSize={24}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Aucun départ enregistré
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5 sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 sm:text-base">
            <Layers className="h-4 w-4 text-emerald-700" />
            Registre des vols
          </h3>
          <span className="text-[11px] font-semibold text-slate-400">
            {flights.length} vol(s)
          </span>
        </div>

        {/* MOBILE */}
        <div className="space-y-2 bg-slate-50 p-2.5 md:hidden">
          {flights.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-400">
              Aucun vol trouvé
            </div>
          ) : (
            flights.map(flight => {
              const status = normalizeFlightStatus(flight.status);
              const config = STATUS_CONFIG[status];

              return (
                <article
                  key={flight.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-black text-slate-900">
                        {flight.flightNumber}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-600">
                        {flight.origin} ➔ {flight.destination}
                      </p>
                    </div>

                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${config.badgeBg}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
                      {status}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-slate-50 p-2">
                      <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">
                        Départ
                      </span>
                      <span className="mt-1 block text-[11px] font-semibold text-slate-700">
                        {formatDateTime(
                          flight.localDeparture ?? flight.departure,
                        )}
                      </span>
                    </div>

                    <div className="rounded-lg bg-slate-50 p-2">
                      <span className="block text-[9px] font-bold uppercase tracking-wide text-slate-400">
                        Arrivée
                      </span>
                      <span className="mt-1 block text-[11px] font-semibold text-slate-700">
                        {formatDateTime(
                          flight.localArrival ?? flight.arrival,
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
                    <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                      Appareil
                    </span>
                    <span className="min-w-0 truncate text-right text-[11px] font-bold text-slate-700">
                      {flight.aircraftModel || flight.aircraft || 'Non assigné'}
                    </span>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* DESKTOP */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-225 text-left text-xs text-slate-600 sm:text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Vol</th>
                <th className="px-4 py-3">Itinéraire</th>
                <th className="px-4 py-3">Départ</th>
                <th className="px-4 py-3">Arrivée</th>
                <th className="px-4 py-3">Appareil</th>
                <th className="px-4 py-3 text-right">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {flights.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-xs text-slate-400"
                  >
                    Aucun vol trouvé
                  </td>
                </tr>
              ) : (
                flights.map(flight => {
                  const status = normalizeFlightStatus(flight.status);
                  const config = STATUS_CONFIG[status];

                  return (
                    <tr
                      key={flight.id}
                      className="transition hover:bg-slate-50/80"
                    >
                      <td className="px-4 py-3.5 font-bold text-slate-900">
                        {flight.flightNumber}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-700">
                        {flight.origin} ➔ {flight.destination}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500">
                        {formatDateTime(
                          flight.localDeparture ?? flight.departure,
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500">
                        {formatDateTime(
                          flight.localArrival ?? flight.arrival,
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">
                        {flight.aircraftModel ||
                          flight.aircraft ||
                          'Non assigné'}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.badgeBg}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
                          {status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};

function SmallValue({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-white/80 bg-white p-3">
      <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
        {label}
      </span>
      <strong className="mt-1 block truncate text-sm font-black text-slate-800">
        {value}
      </strong>
    </div>
  );
}

export default FlightSchedulerDetails;