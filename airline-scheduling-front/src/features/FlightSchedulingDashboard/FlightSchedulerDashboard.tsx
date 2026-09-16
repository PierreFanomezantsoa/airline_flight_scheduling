import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Info,
  Play,
  Plane,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  WandSparkles,
  X,
} from 'lucide-react';

import FlightSchedulerGantt, {
  type AutoScheduleAssignment,
  type GanttPayload,
  type GanttRow,
} from './FlightSchedulerGantt';

import FlightSchedulerDetails, {
  type AnalyticsMetrics,
  type AutoScheduleMetrics,
  type AutoScheduleResponse,
  type Flight,
} from './FlightSchedulerDetails';

/* ============================================================================
 * API
 * ========================================================================== */

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof globalThis !== 'undefined' &&
    (globalThis as any).process?.env?.REACT_APP_API_BASE_URL) ||
  'http://localhost:5000';

const AUTO_SCHEDULE_GENERATE_ENDPOINT = '/flights/auto-schedule/generate';
const AUTO_SCHEDULE_GANTT_ENDPOINT = '/flights/auto-schedule/gantt';

/* ============================================================================
 * DESIGN TOKENS
 * ========================================================================== */

const SURFACE = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const FOCUS_RING =
  'outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10';
const LABEL_UPPER =
  'text-[10px] font-semibold uppercase tracking-wider text-slate-500';

/* ============================================================================
 * TYPES
 * ========================================================================== */

interface AutoScheduleOptions {
  horizonDays: number;
  turnaroundMinutes: number;
  shiftStepMinutes: number;
  maxShiftMinutes: number;
}

interface MessageState {
  text: string;
  type: 'success' | 'error' | 'info';
}

interface RawGanttRow extends GanttRow {
  baseAttache?: string | null;
  homeBase?: string | null;
  baseAirport?: string | null;
  positionActuelle?: string | null;
  currentAirport?: string | null;
}

/* ============================================================================
 * STATUS
 * ========================================================================== */

const normalizeFlightStatus = (value?: string | null) => {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/_/g, ' ');

  if (['IN-FLIGHT', 'IN FLIGHT', 'EN VOL'].includes(normalized)) return 'En Vol';
  if (['DELAYED', 'RETARDÉ', 'RETARDE', 'SHIFTED'].includes(normalized))
    return 'Retardé';
  if (['CANCELLED', 'CANCELED', 'ANNULÉ', 'ANNULE'].includes(normalized))
    return 'Annulé';
  if (['EFFECTUÉ', 'EFFECTUE', 'DONE', 'COMPLETED', 'LANDED'].includes(normalized))
    return 'Effectué';
  return 'Planifié';
};

/* ============================================================================
 * HELPERS
 * ========================================================================== */

const safeDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const flightBelongsToAircraft = (flight: Flight, row: GanttRow): boolean => {
  const aircraftId = String(flight.aircraft ?? '').trim().toUpperCase();
  const registration = String(flight.aircraftModel ?? '').trim().toUpperCase();
  const rowId = String(row.aircraftId ?? '').trim().toUpperCase();
  const rowRegistration = String(row.aircraftRegistration ?? '')
    .trim()
    .toUpperCase();

  return Boolean(
    (aircraftId && rowId && aircraftId === rowId) ||
      (registration && rowRegistration && registration === rowRegistration),
  );
};

const inferAircraftPosition = (
  row: GanttRow,
  flights: Flight[],
): string | null => {
  if (row.aircraftId === 'UNASSIGNED') return null;

  const aircraftFlights = flights.filter(flight =>
    flightBelongsToAircraft(flight, row),
  );
  const now = Date.now();

  const inFlight = aircraftFlights.find(
    flight => normalizeFlightStatus(flight.status) === 'En Vol',
  );
  if (inFlight?.destination) return inFlight.destination;

  const completed = aircraftFlights
    .filter(flight => {
      const arrival = safeDate(flight.arrival);
      return (
        normalizeFlightStatus(flight.status) === 'Effectué' ||
        Boolean(arrival && arrival.getTime() <= now)
      );
    })
    .sort(
      (first, second) =>
        (safeDate(second.arrival)?.getTime() ?? 0) -
        (safeDate(first.arrival)?.getTime() ?? 0),
    )[0];

  if (completed?.destination) return completed.destination;

  const next = aircraftFlights
    .filter(flight => {
      const departure = safeDate(flight.departure);
      return Boolean(departure && departure.getTime() > now);
    })
    .sort(
      (first, second) =>
        (safeDate(first.departure)?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (safeDate(second.departure)?.getTime() ?? Number.MAX_SAFE_INTEGER),
    )[0];

  return next?.origin ?? null;
};

const normalizeGanttPayload = (
  payload: any,
  flights: Flight[],
): GanttPayload => {
  const gantt = payload?.gantt ?? payload ?? {};
  const rows: RawGanttRow[] = Array.isArray(gantt.rows) ? gantt.rows : [];

  return {
    timezone: gantt.timezone ?? 'UTC',
    items: Array.isArray(gantt.items) ? gantt.items : [],
    rows: rows.map(row => {
      const base =
        row.base ||
        row.baseAttache ||
        row.homeBase ||
        row.baseAirport ||
        null;
      const currentPosition =
        row.currentPosition ||
        row.positionActuelle ||
        row.currentAirport ||
        null;

      const normalized: GanttRow = {
        aircraftId: row.aircraftId,
        aircraftRegistration: row.aircraftRegistration,
        capacity: row.capacity ?? null,
        base,
        currentPosition,
        status: row.status ?? null,
      };

      if (!normalized.currentPosition) {
        normalized.currentPosition = inferAircraftPosition(normalized, flights);
      }
      return normalized;
    }),
  };
};

const buildFallbackAnalytics = (flights: Flight[]): AnalyticsMetrics => {
  const statuses = flights.map(flight => normalizeFlightStatus(flight.status));
  const count = (status: string) => statuses.filter(c => c === status).length;

  const onTimeCount = count('Planifié');
  const delayedCount = count('Retardé');
  const inFlightCount = count('En Vol');
  const cancelledCount = count('Annulé');
  const completedCount = count('Effectué');
  const denominator = Math.max(
    0,
    flights.length - cancelledCount - inFlightCount,
  );

  return {
    totalFlights: flights.length,
    otpRate:
      denominator > 0
        ? Number(((onTimeCount / denominator) * 100).toFixed(1))
        : 0,
    onTimeCount,
    delayedCount,
    inFlightCount,
    cancelledCount,
    completedCount,
  };
};

const getErrorMessage = async (
  response: Response,
  fallback: string,
): Promise<string> => {
  try {
    const payload = await response.json();
    return payload?.message || payload?.error || fallback;
  } catch {
    return fallback;
  }
};

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

export const FlightSchedulerDashboard: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsMetrics | null>(null);
  const [currentGantt, setCurrentGantt] = useState<GanttPayload>({
    rows: [],
    items: [],
    timezone: 'UTC',
  });
  const [currentMetrics, setCurrentMetrics] = useState<AutoScheduleMetrics>({
    totalFlights: 0,
    assignedFlights: 0,
    unassignedFlights: 0,
  });
  const [previewScenario, setPreviewScenario] =
    useState<AutoScheduleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('TOUS');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [options] = useState<AutoScheduleOptions>({
    horizonDays: 7,
    turnaroundMinutes: 45,
    shiftStepMinutes: 15,
    maxShiftMinutes: 360,
  });

  /* ========================================================================
   * LOAD DATA
   * ====================================================================== */

  const fetchData = useCallback(async () => {
    setLoading(true);
    setMessage(null);

    try {
      const ganttUrl =
        `${API_BASE_URL}${AUTO_SCHEDULE_GANTT_ENDPOINT}` +
        `?horizonDays=${options.horizonDays}`;

      const [flightsResponse, analyticsResponse, ganttResponse] =
        await Promise.all([
          fetch(`${API_BASE_URL}/flights`),
          fetch(`${API_BASE_URL}/flights/analytics`),
          fetch(ganttUrl),
        ]);

      if (!flightsResponse.ok) {
        throw new Error('Impossible de charger les vols.');
      }

      const flightPayload = await flightsResponse.json();
      const flightList: Flight[] = Array.isArray(flightPayload)
        ? flightPayload
        : [];
      setFlights(flightList);

      /* ANALYTICS */
      if (analyticsResponse.ok) {
        const payload = await analyticsResponse.json();
        const metrics = payload?.metrics ?? {};

        setAnalytics({
          totalFlights: Number(metrics.totalFlights) || flightList.length,
          otpRate: Number(metrics.otpRate) || 0,
          onTimeCount: Number(metrics.onTimeCount) || 0,
          delayedCount: Number(metrics.delayedCount) || 0,
          inFlightCount: Number(metrics.inFlightCount) || 0,
          cancelledCount: Number(metrics.cancelledCount) || 0,
          completedCount:
            Number(metrics.completedCount ?? metrics.effectueCount) || 0,
        });
      } else {
        setAnalytics(buildFallbackAnalytics(flightList));
      }

      /* GANTT */
      if (ganttResponse.ok) {
        const payload = await ganttResponse.json();
        const gantt = normalizeGanttPayload(payload, flightList);
        setCurrentGantt(gantt);

        setCurrentMetrics(
          payload?.metrics ?? {
            totalFlights: gantt.items.length,
            assignedFlights: gantt.items.filter(
              item => item.rowId !== 'UNASSIGNED',
            ).length,
            unassignedFlights: gantt.items.filter(
              item => item.rowId === 'UNASSIGNED',
            ).length,
          },
        );
      }

      setLastUpdatedAt(new Date());
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Erreur lors du chargement.',
      });
    } finally {
      setLoading(false);
    }
  }, [options.horizonDays]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  /* ========================================================================
   * GENERATION
   * ====================================================================== */

  const runAutomaticGeneration = async (apply: boolean) => {
    if (generating || applying) return;

    if (apply) setApplying(true);
    else setGenerating(true);

    setMessage(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}${AUTO_SCHEDULE_GENERATE_ENDPOINT}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ ...options, apply }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, 'Impossible de générer le planning.'),
        );
      }

      const rawResult = await response.json();
      const result = {
        ...rawResult,
        gantt: normalizeGanttPayload(rawResult, flights),
      } as AutoScheduleResponse;

      if (apply) {
        setPreviewScenario(null);
        setMessage({
          type: 'success',
          text: result.message || 'La programmation a été appliquée.',
        });
        await fetchData();
        return;
      }

      setPreviewScenario(result);
      const unassigned = result.metrics.unassignedFlights ?? 0;

      setMessage({
        type: unassigned > 0 ? 'info' : 'success',
        text:
          unassigned > 0
            ? `Scénario : ${result.metrics.assignedFlights}/${result.metrics.totalFlights} vols affectés.`
            : 'Scénario généré avec succès.',
      });
    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error ? error.message : 'Erreur de génération.',
      });
    } finally {
      setGenerating(false);
      setApplying(false);
    }
  };

  /* ========================================================================
   * DERIVED DATA
   * ====================================================================== */

  const normalizedFlights = useMemo(
    () =>
      flights.map(flight => ({
        ...flight,
        status: normalizeFlightStatus(flight.status),
      })),
    [flights],
  );

  const filteredFlights = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return normalizedFlights.filter(flight => {
      const matchesSearch =
        !term ||
        [
          flight.flightNumber,
          flight.origin,
          flight.destination,
          flight.aircraft,
          flight.aircraftModel,
        ]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(term));

      const matchesStatus =
        selectedStatus === 'TOUS' || flight.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }, [normalizedFlights, searchTerm, selectedStatus]);

  const effectiveAnalytics =
    analytics ?? buildFallbackAnalytics(flights);

  const activeSchedule =
    (previewScenario?.gantt as GanttPayload) ?? currentGantt;

  const activeMetrics = previewScenario?.metrics ?? currentMetrics;
  const isPreview = Boolean(previewScenario);

  const assignmentLookup = useMemo(() => {
    const map = new Map<string, AutoScheduleAssignment>();
    const assignments = previewScenario?.assignments as
      | AutoScheduleAssignment[]
      | undefined;
    assignments?.forEach(assignment =>
      map.set(assignment.flightId, assignment),
    );
    return map;
  }, [previewScenario]);

  /* ========================================================================
   * RENDER
   * ====================================================================== */

  return (
    <div className="min-h-screen bg-slate-50 p-3 text-slate-800 antialiased sm:p-4 lg:p-5">
      <div className="mx-auto max-w-[1600px] space-y-4">
        {/* ═══════════════ HEADER ═══════════════ */}
        <header className={`${SURFACE} p-4 sm:p-5`}>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/20">
                <Plane className="h-5 w-5 rotate-45" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-bold tracking-tight text-slate-950 sm:text-xl">
                    Génération automatique des vols
                  </h1>
                  {isPreview && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[10px] font-semibold text-sky-700">
                      <Sparkles className="h-3 w-3" />
                      Prévisualisation
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Horizon {options.horizonDays} jours · Turnaround{' '}
                  {options.turnaroundMinutes} min · Décalage max{' '}
                  {options.maxShiftMinutes} min
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={() => void fetchData()}
                disabled={loading || generating || applying}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 ${FOCUS_RING}`}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                />
                Actualiser
              </button>

              <button
                type="button"
                onClick={() => void runAutomaticGeneration(false)}
                disabled={generating || applying}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 ${FOCUS_RING}`}
              >
                <WandSparkles
                  className={`h-3.5 w-3.5 ${generating ? 'animate-pulse' : ''}`}
                />
                {generating ? 'Génération...' : 'Générer le scénario'}
              </button>

              {previewScenario && (
                <>
                  <button
                    type="button"
                    onClick={() => void runAutomaticGeneration(true)}
                    disabled={applying}
                    className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50 ${FOCUS_RING}`}
                  >
                    <Play
                      className={`h-3.5 w-3.5 ${applying ? 'animate-pulse' : ''}`}
                    />
                    {applying ? 'Application...' : 'Appliquer'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreviewScenario(null)}
                    className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 ${FOCUS_RING}`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Retour au planning
                  </button>
                </>
              )}
            </div>
          </div>

          {lastUpdatedAt && (
            <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Synchronisé à{' '}
                {lastUpdatedAt.toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}
        </header>

        {/* ═══════════════ MESSAGE ═══════════════ */}
        {message && (
          <AlertBanner
            type={message.type}
            message={message.text}
            onClose={() => setMessage(null)}
          />
        )}

        {/* ═══════════════ KPI ═══════════════ */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            label="Vols horizon"
            value={activeMetrics.totalFlights}
            hint="Fenêtre courante"
            icon={<Calendar className="h-4 w-4" />}
            variant="neutral"
          />
          <MetricCard
            label="Affectés"
            value={activeMetrics.assignedFlights}
            hint="Avec appareil"
            icon={<CheckCircle2 className="h-4 w-4" />}
            variant="success"
          />
          <MetricCard
            label="Non affectés"
            value={activeMetrics.unassignedFlights}
            hint="Action requise"
            icon={<AlertTriangle className="h-4 w-4" />}
            variant={
              activeMetrics.unassignedFlights > 0 ? 'warning' : 'neutral'
            }
          />
          <MetricCard
            label="Décalés"
            value={previewScenario?.metrics.shiftedFlights ?? 0}
            hint="Scénario"
            icon={<RefreshCw className="h-4 w-4" />}
            variant={
              (previewScenario?.metrics.shiftedFlights ?? 0) > 0
                ? 'info'
                : 'neutral'
            }
          />
          <MetricCard
            label="Appareils actifs"
            value={
              previewScenario?.metrics.operationalAircraft ??
              activeSchedule.rows.filter(row => row.aircraftId !== 'UNASSIGNED')
                .length
            }
            hint="En opération"
            icon={<Plane className="h-4 w-4" />}
            variant="info"
          />
          <MetricCard
            label="OTP"
            value={`${effectiveAnalytics.otpRate}%`}
            hint="Ponctualité"
            icon={<ShieldCheck className="h-4 w-4" />}
            variant={
              effectiveAnalytics.otpRate >= 85
                ? 'success'
                : effectiveAnalytics.otpRate >= 60
                  ? 'info'
                  : 'warning'
            }
          />
        </section>

        {/* ═══════════════ FILTRES ═══════════════ */}
        <section className={`${SURFACE} p-3 sm:p-4`}>
          <div className="grid gap-3 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Vol, itinéraire, appareil..."
                className={`h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-9 text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:bg-white ${FOCUS_RING}`}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Effacer la recherche"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="hidden items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:inline-flex">
                Statut
              </span>
              {[
                'TOUS',
                'Planifié',
                'En Vol',
                'Retardé',
                'Effectué',
                'Annulé',
              ].map(status => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelectedStatus(status)}
                  className={`h-8 shrink-0 rounded-lg border px-3 text-[10px] font-semibold transition ${FOCUS_RING} ${
                    selectedStatus === status
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════ GANTT ═══════════════ */}
        <FlightSchedulerGantt
          schedule={activeSchedule}
          searchTerm={searchTerm}
          selectedStatus={selectedStatus}
          isPreview={isPreview}
          assignmentLookup={assignmentLookup}
        />

        {/* ═══════════════ DETAILS ═══════════════ */}
        <FlightSchedulerDetails
          flights={filteredFlights}
          analytics={effectiveAnalytics}
          previewScenario={previewScenario}
        />
      </div>
    </div>
  );
};

/* ============================================================================
 * SOUS-COMPOSANTS
 * ========================================================================== */

type MetricVariant =
  | 'neutral'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger'
  | 'primary';

function MetricCard({
  label,
  value,
  hint,
  icon,
  variant = 'neutral',
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
  variant?: MetricVariant;
}) {
  const styles: Record<
    MetricVariant,
    { ring: string; icon: string; value: string; accent: string | null }
  > = {
    neutral: {
      ring: 'border-slate-200 bg-white',
      icon: 'bg-slate-100 text-slate-600',
      value: 'text-slate-900',
      accent: null,
    },
    primary: {
      ring: 'border-emerald-200 bg-emerald-50/40',
      icon: 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20',
      value: 'text-emerald-900',
      accent: 'bg-emerald-600',
    },
    success: {
      ring: 'border-emerald-200 bg-white',
      icon: 'bg-emerald-100 text-emerald-700',
      value: 'text-emerald-800',
      accent: null,
    },
    info: {
      ring: 'border-sky-200 bg-white',
      icon: 'bg-sky-100 text-sky-700',
      value: 'text-sky-800',
      accent: null,
    },
    warning: {
      ring: 'border-amber-200 bg-amber-50/40',
      icon: 'bg-amber-100 text-amber-700',
      value: 'text-amber-800',
      accent: 'bg-amber-500',
    },
    danger: {
      ring: 'border-rose-200 bg-rose-50/40',
      icon: 'bg-rose-100 text-rose-700',
      value: 'text-rose-800',
      accent: 'bg-rose-500',
    },
  };

  const s = styles[variant];

  return (
    <article
      className={`relative overflow-hidden rounded-2xl border px-4 py-3.5 shadow-sm transition hover:shadow-md ${s.ring}`}
    >
      {s.accent && (
        <span
          className={`absolute inset-x-0 top-0 h-0.5 ${s.accent}`}
          aria-hidden
        />
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={LABEL_UPPER}>{label}</span>
          <strong
            className={`mt-2 block text-2xl font-bold leading-none tabular-nums sm:text-3xl ${s.value}`}
          >
            {value}
          </strong>
        </div>
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.icon}`}
        >
          {icon}
        </div>
      </div>

      <p className="mt-2.5 text-[10px] font-medium text-slate-400">{hint}</p>
    </article>
  );
}

function AlertBanner({
  type,
  message,
  onClose,
}: {
  type: 'success' | 'error' | 'info';
  message: string;
  onClose: () => void;
}) {
  const config = {
    success: {
      ring: 'border-emerald-200 bg-emerald-50/60',
      icon: 'bg-emerald-100 text-emerald-700',
      title: 'text-emerald-800',
      text: 'text-emerald-700',
      Icon: CheckCircle2,
    },
    error: {
      ring: 'border-rose-200 bg-rose-50/60',
      icon: 'bg-rose-100 text-rose-700',
      title: 'text-rose-800',
      text: 'text-rose-700',
      Icon: AlertCircle,
    },
    info: {
      ring: 'border-sky-200 bg-sky-50/60',
      icon: 'bg-sky-100 text-sky-700',
      title: 'text-sky-800',
      text: 'text-sky-700',
      Icon: Info,
    },
  }[type];

  const Icon = config.Icon;

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-sm ${config.ring}`}
      role="alert"
    >
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.icon}`}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${config.title}`}>
          {type === 'success'
            ? 'Opération réussie'
            : type === 'error'
              ? 'Erreur'
              : 'Information'}
        </p>
        <p className={`mt-0.5 text-xs leading-5 ${config.text}`}>{message}</p>
      </div>

      <button
        type="button"
        onClick={onClose}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition ${
          type === 'success'
            ? 'text-emerald-600 hover:bg-emerald-100'
            : type === 'error'
              ? 'text-rose-500 hover:bg-rose-100'
              : 'text-sky-600 hover:bg-sky-100'
        }`}
        aria-label="Fermer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default FlightSchedulerDashboard;