import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { FlightStatus } from './FlightSchedulerGantt';

/* ============================================================================
 * TYPES
 * ========================================================================== */

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

/* ============================================================================
 * DESIGN TOKENS
 * ========================================================================== */

const SURFACE =
  'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)]';

/* ============================================================================
 * PALETTE STATUTS
 * ========================================================================== */

interface StatusConfigItem {
  bar: string;
  badgeBg: string;
  dot: string;
}

const STATUS_CONFIG: Record<FlightStatus, StatusConfigItem> = {
  Planifié: {
    bar: 'from-blue-500 to-blue-600',
    badgeBg: 'border-blue-200 bg-blue-50 text-blue-700',
    dot: 'bg-blue-500',
  },
  'En Vol': {
    bar: 'from-amber-500 to-amber-600',
    badgeBg: 'border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500 animate-pulse',
  },
  Retardé: {
    bar: 'from-orange-500 to-orange-600',
    badgeBg: 'border-orange-200 bg-orange-50 text-orange-700',
    dot: 'bg-orange-500',
  },
  Annulé: {
    bar: 'from-rose-500 to-rose-600',
    badgeBg: 'border-rose-200 bg-rose-50 text-rose-700',
    dot: 'bg-rose-500',
  },
  Effectué: {
    bar: 'from-emerald-500 to-emerald-600',
    badgeBg: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
};

/* ============================================================================
 * HELPERS
 * ========================================================================== */

const normalizeFlightStatus = (value?: string | null): FlightStatus => {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/_/g, ' ');
  if (['IN-FLIGHT', 'IN FLIGHT', 'EN VOL'].includes(normalized)) return 'En Vol';
  if (['DELAYED', 'RETARDÉ', 'RETARDE', 'SHIFTED'].includes(normalized))
    return 'Retardé';
  if (['CANCELLED', 'CANCELED', 'ANNULÉ', 'ANNULE'].includes(normalized))
    return 'Annulé';
  if (['EFFECTUÉ', 'EFFECTUE', 'DONE', 'COMPLETED', 'LANDED'].includes(normalized))
    return 'Effectué';
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

const getWeatherBadgeClass = (severity: number): string => {
  if (severity >= 0.85) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (severity >= 0.70) return 'border-orange-200 bg-orange-50 text-orange-700';
  if (severity >= 0.50) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (severity >= 0.30) return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
};

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

const FlightSchedulerDetails: React.FC<FlightSchedulerDetailsProps> = ({
  flights,
  previewScenario,
}) => {
  const scenarioUnassigned = previewScenario?.metrics.unassignedFlights ?? 0;

  return (
    <div className="space-y-4">
      {/* ═══════════════ SCENARIO RESULT ═══════════════ */}
      {previewScenario && (
        <section className="grid gap-3 xl:grid-cols-2">
          {/* Left : métriques du générateur */}
          <div className={`${SURFACE} overflow-hidden p-4 sm:p-5`}>
            <header className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-sm shadow-sky-500/30">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Résultat du générateur
                </h3>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Statistiques du scénario prévisualisé
                </p>
              </div>
            </header>

            <div className="grid grid-cols-2 gap-2.5">
              <SmallValue
                label="Affectations directes"
                value={previewScenario.metrics.directAssignments ?? 0}
                variant="success"
              />
              <SmallValue
                label="Vols décalés"
                value={previewScenario.metrics.shiftedFlights ?? 0}
                variant="warning"
              />
              <SmallValue
                label="Avions opérationnels"
                value={previewScenario.metrics.operationalAircraft ?? 0}
                variant="info"
              />
              <SmallValue
                label="Stratégie"
                value={previewScenario.strategy ?? 'Deterministic greedy'}
                variant="neutral"
              />
            </div>
          </div>

          {/* Right : vols non affectés */}
          <div
            className={`overflow-hidden rounded-2xl border shadow-[0_1px_3px_rgba(15,23,42,0.04)] p-4 sm:p-5 ${
              scenarioUnassigned > 0
                ? 'border-amber-200 bg-gradient-to-br from-amber-50/80 to-white'
                : 'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white'
            }`}
          >
            <header className="mb-4 flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${
                  scenarioUnassigned > 0
                    ? 'bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-amber-500/30'
                    : 'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-emerald-500/30'
                }`}
              >
                {scenarioUnassigned > 0 ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">
                  Vols non affectés
                </h3>
                <p className="mt-0.5 text-[10px] text-slate-500">
                  {scenarioUnassigned > 0
                    ? `${scenarioUnassigned} vol${scenarioUnassigned > 1 ? 's' : ''} à traiter`
                    : 'Tous les vols ont reçu une affectation'}
                </p>
              </div>
            </header>

            {(previewScenario.unassigned ?? []).length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-white/60 px-3 py-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <p className="text-xs font-medium text-emerald-800">
                  Aucun vol en attente d'affectation dans ce scénario.
                </p>
              </div>
            ) : (
              <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                {(previewScenario.unassigned ?? []).map(item => (
                  <div
                    key={item.flightId}
                    className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 shadow-sm transition hover:border-amber-300 hover:shadow"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {item.flightNumber}
                      </span>
                      <span className="ml-2 font-mono text-[10px] font-medium text-slate-500">
                        {item.origin} → {item.destination}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                      {item.reason}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══════════════ REGISTRE ═══════════════ */}
      <section className={`${SURFACE} overflow-hidden`}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/40 px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Registre des vols
              </h3>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {flights.length} vol{flights.length > 1 ? 's' : ''} affiché
                {flights.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </header>

        {/* MOBILE */}
        <div className="space-y-2 bg-slate-50/60 p-3 md:hidden">
          {flights.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
              <p className="text-xs text-slate-400">Aucun vol trouvé</p>
            </div>
          ) : (
            flights.map(flight => {
              const status = normalizeFlightStatus(flight.status);
              const config = STATUS_CONFIG[status];

              return (
                <article
                  key={flight.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                >
                  <span
                    className={`block h-1 bg-gradient-to-r ${config.bar}`}
                  />

                  <div className="p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-bold text-slate-900">
                          {flight.flightNumber}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] font-medium text-slate-600">
                          {flight.origin} → {flight.destination}
                        </p>
                      </div>

                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${config.badgeBg}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${config.dot}`}
                        />
                        {status}
                      </span>
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-slate-50 p-2">
                        <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                          Départ
                        </span>
                        <span className="mt-1 block font-mono text-[11px] font-semibold text-slate-700">
                          {formatDateTime(
                            flight.localDeparture ?? flight.departure,
                          )}
                        </span>
                      </div>

                      <div className="rounded-lg bg-slate-50 p-2">
                        <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                          Arrivée
                        </span>
                        <span className="mt-1 block font-mono text-[11px] font-semibold text-slate-700">
                          {formatDateTime(
                            flight.localArrival ?? flight.arrival,
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                      <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                        Appareil
                      </span>
                      <span className="min-w-0 truncate font-mono text-[11px] font-bold text-slate-700">
                        {flight.aircraftModel ||
                          flight.aircraft ||
                          'Non assigné'}
                      </span>
                    </div>

                    {typeof flight.weatherSeverity === 'number' && (
                      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                          Météo
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${getWeatherBadgeClass(
                            flight.weatherSeverity,
                          )}`}
                        >
                          {Math.round(flight.weatherSeverity * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </div>

        {/* DESKTOP */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1000px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50/70">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Vol</th>
                <th className="px-4 py-3">Itinéraire</th>
                <th className="px-4 py-3">Départ</th>
                <th className="px-4 py-3">Arrivée</th>
                <th className="px-4 py-3">Appareil</th>
                <th className="px-4 py-3">Météo</th>
                <th className="px-5 py-3 text-right">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {flights.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-xs text-slate-400"
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
                      className="group transition hover:bg-emerald-50/30"
                    >
                      <td className="px-5 py-3.5 font-mono text-xs font-bold text-slate-900">
                        {flight.flightNumber}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs font-semibold text-slate-700">
                        {flight.origin} → {flight.destination}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500">
                        {formatDateTime(
                          flight.localDeparture ?? flight.departure,
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500">
                        {formatDateTime(
                          flight.localArrival ?? flight.arrival,
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-600">
                        {flight.aircraftModel ||
                          flight.aircraft ||
                          'Non assigné'}
                      </td>
                      <td className="px-4 py-3.5">
                        {typeof flight.weatherSeverity === 'number' ? (
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${getWeatherBadgeClass(
                              flight.weatherSeverity,
                            )}`}
                          >
                            {Math.round(flight.weatherSeverity * 100)}%
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-semibold ${config.badgeBg}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${config.dot}`}
                          />
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
    </div>
  );
};

/* ============================================================================
 * SOUS-COMPOSANT
 * ========================================================================== */

function SmallValue({
  label,
  value,
  variant = 'neutral',
}: {
  label: string;
  value: string | number;
  variant?: 'neutral' | 'success' | 'warning' | 'info';
}) {
  const tones = {
    neutral: 'border-slate-200 bg-white text-slate-800',
    success:
      'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white text-emerald-800',
    warning:
      'border-amber-200 bg-gradient-to-br from-amber-50/80 to-white text-amber-800',
    info: 'border-sky-200 bg-gradient-to-br from-sky-50/80 to-white text-sky-800',
  } as const;

  return (
    <div
      className={`rounded-xl border p-3 shadow-sm transition hover:shadow-md ${tones[variant]}`}
    >
      <span className="block truncate text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <strong
        className="mt-1 block truncate text-sm font-bold tabular-nums text-slate-800"
        title={String(value)}
      >
        {value}
      </strong>
    </div>
  );
}

export default FlightSchedulerDetails;