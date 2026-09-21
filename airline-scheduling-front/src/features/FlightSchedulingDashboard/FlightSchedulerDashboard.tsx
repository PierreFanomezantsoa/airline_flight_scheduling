import React, { useEffect, useMemo, useState } from 'react';
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

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof globalThis !== 'undefined' &&
    (globalThis as any).process?.env?.REACT_APP_API_BASE_URL) ||
  'http://localhost:5000';

const AUTO_SCHEDULE_GENERATE_ENDPOINT = '/flights/auto-schedule/generate';
const AUTO_SCHEDULE_GANTT_ENDPOINT = '/flights/auto-schedule/gantt';

const FOCUS_RING =
  'outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';

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

const OPTIONS: AutoScheduleOptions = {
  horizonDays: 7,
  turnaroundMinutes: 45,
  shiftStepMinutes: 15,
  maxShiftMinutes: 360,
};

const normalizeFlightStatus = (value?: string | null) => {
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

const flightBelongsToAircraft = (flight: Flight, row: GanttRow): boolean => {
  const aircraftId = String(flight.aircraft ?? '').trim().toUpperCase();
  const registration = String(flight.aircraftModel ?? '').trim().toUpperCase();
  const rowId = String(row.aircraftId ?? '').trim().toUpperCase();
  const rowRegistration = String(row.aircraftRegistration ?? '').trim().toUpperCase();
  return Boolean(
    (aircraftId && rowId && aircraftId === rowId) ||
      (registration && rowRegistration && registration === rowRegistration),
  );
};

const inferAircraftPosition = (row: GanttRow, flights: Flight[]): string | null => {
  if (row.aircraftId === 'UNASSIGNED') return null;
  const aircraftFlights = flights.filter(flight => flightBelongsToAircraft(flight, row));
  const now = Date.now();
  const inFlight = aircraftFlights.find(flight => normalizeFlightStatus(flight.status) === 'En Vol');
  if (inFlight?.destination) return inFlight.destination;
  const completed = aircraftFlights
    .filter(flight => {
      const arrival = safeDate(flight.arrival);
      return normalizeFlightStatus(flight.status) === 'Effectué' || Boolean(arrival && arrival.getTime() <= now);
    })
    .sort((a, b) => (safeDate(b.arrival)?.getTime() ?? 0) - (safeDate(a.arrival)?.getTime() ?? 0))[0];
  if (completed?.destination) return completed.destination;
  const next = aircraftFlights
    .filter(flight => {
      const departure = safeDate(flight.departure);
      return Boolean(departure && departure.getTime() > now);
    })
    .sort((a, b) => (safeDate(a.departure)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (safeDate(b.departure)?.getTime() ?? Number.MAX_SAFE_INTEGER))[0];
  return next?.origin ?? null;
};

const normalizeGanttPayload = (payload: any, flights: Flight[]): GanttPayload => {
  const gantt = payload?.gantt ?? payload ?? {};
  const rows: RawGanttRow[] = Array.isArray(gantt.rows) ? gantt.rows : [];
  return {
    timezone: gantt.timezone ?? 'UTC',
    items: Array.isArray(gantt.items) ? gantt.items : [],
    rows: rows.map(row => {
      const base = row.base || row.baseAttache || row.homeBase || row.baseAirport || null;
      const currentPosition = row.currentPosition || row.positionActuelle || row.currentAirport || null;
      const normalized: GanttRow = {
        aircraftId: row.aircraftId,
        aircraftRegistration: row.aircraftRegistration,
        capacity: row.capacity ?? null,
        base,
        currentPosition,
        status: row.status ?? null,
      };
      if (!normalized.currentPosition) normalized.currentPosition = inferAircraftPosition(normalized, flights);
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
  const denominator = Math.max(0, flights.length - cancelledCount - inFlightCount);
  return {
    totalFlights: flights.length,
    otpRate: denominator > 0 ? Number(((onTimeCount / denominator) * 100).toFixed(1)) : 0,
    onTimeCount,
    delayedCount,
    inFlightCount,
    cancelledCount,
    completedCount,
  };
};

const getErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const payload = await response.json();
    return payload?.message || payload?.error || fallback;
  } catch {
    return fallback;
  }
};

export const FlightSchedulerDashboard: React.FC = () => {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsMetrics | null>(null);
  const [currentGantt, setCurrentGantt] = useState<GanttPayload>({ rows: [], items: [], timezone: 'UTC' });
  const [currentMetrics, setCurrentMetrics] = useState<AutoScheduleMetrics>({
    totalFlights: 0,
    assignedFlights: 0,
    unassignedFlights: 0,
  });
  const [previewScenario, setPreviewScenario] = useState<AutoScheduleResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('TOUS');

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const flightsResponse = await fetch(`${API_BASE_URL}/flights`);
      if (!flightsResponse.ok) throw new Error('Impossible de charger les vols.');
      const flightPayload = await flightsResponse.json();
      const flightList: Flight[] = Array.isArray(flightPayload) ? flightPayload : [];
      setFlights(flightList);

      const ganttUrl = `${API_BASE_URL}${AUTO_SCHEDULE_GANTT_ENDPOINT}?horizonDays=${OPTIONS.horizonDays}&includeTerminal=1`;
      const [analyticsResponse, ganttResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/flights/analytics`),
        fetch(ganttUrl),
      ]);

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
          completedCount: Number(metrics.completedCount ?? metrics.effectueCount) || 0,
        });
      } else {
        setAnalytics(buildFallbackAnalytics(flightList));
      }

      if (ganttResponse.ok) {
        const payload = await ganttResponse.json();
        const gantt = normalizeGanttPayload(payload, flightList);
        setCurrentGantt(gantt);
        setCurrentMetrics(
          payload?.metrics ?? {
            totalFlights: gantt.items.length,
            assignedFlights: gantt.items.filter(item => item.rowId !== 'UNASSIGNED').length,
            unassignedFlights: gantt.items.filter(item => item.rowId === 'UNASSIGNED').length,
          },
        );
      }

    } catch (error: unknown) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Erreur lors du chargement.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const runAutomaticGeneration = async (apply: boolean) => {
    if (generating || applying) return;
    if (apply) setApplying(true);
    else setGenerating(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE_URL}${AUTO_SCHEDULE_GENERATE_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ ...OPTIONS, apply }),
      });

      if (!response.ok) throw new Error(await getErrorMessage(response, 'Impossible de générer le planning.'));

      const rawResult = await response.json();
      const result = { ...rawResult, gantt: normalizeGanttPayload(rawResult, flights) } as AutoScheduleResponse;

      if (apply) {
        setPreviewScenario(null);
        setMessage({ type: 'success', text: result.message || 'La programmation a été appliquée.' });
        await fetchData();
        return;
      }

      setPreviewScenario(result);
      const unassigned = result.metrics.unassignedFlights ?? 0;
      setMessage({
        type: unassigned > 0 ? 'info' : 'success',
        text: unassigned > 0
          ? `Scénario : ${result.metrics.assignedFlights}/${result.metrics.totalFlights} vols affectés.`
          : 'Scénario généré avec succès.',
      });
    } catch (error: unknown) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Erreur de génération.' });
    } finally {
      setGenerating(false);
      setApplying(false);
    }
  };

  const normalizedFlights = useMemo(
    () => flights.map(flight => ({ ...flight, status: normalizeFlightStatus(flight.status) })),
    [flights],
  );

  const filteredFlights = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const result = normalizedFlights.filter(flight => {
      const matchesSearch =
        !term ||
        [flight.flightNumber, flight.origin, flight.destination, flight.aircraft, flight.aircraftModel]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(term));
      const matchesStatus = selectedStatus === 'TOUS' || flight.status === selectedStatus;
      return matchesSearch && matchesStatus;
    });
    result.sort((a, b) => {
      const da = safeDate(a.departure)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = safeDate(b.departure)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      return String(a.flightNumber ?? '').localeCompare(String(b.flightNumber ?? ''));
    });
    return result;
  }, [normalizedFlights, searchTerm, selectedStatus]);

  const effectiveAnalytics = analytics ?? buildFallbackAnalytics(flights);

  const activeSchedule = useMemo<GanttPayload>(() => {
    const previewGantt = previewScenario?.gantt as GanttPayload | undefined;
    if (previewGantt?.rows && previewGantt?.items) return previewGantt;
    return currentGantt;
  }, [previewScenario, currentGantt]);

  const activeMetrics = previewScenario?.metrics ?? currentMetrics;
  const isPreview = Boolean(previewScenario);

  const assignmentLookup = useMemo(() => {
    const map = new Map<string, AutoScheduleAssignment>();
    const assignments = previewScenario?.assignments as AutoScheduleAssignment[] | undefined;
    assignments?.forEach(assignment => map.set(assignment.flightId, assignment));
    return map;
  }, [previewScenario]);

  const tabs = [
    { id: 'TOUS', label: 'Tous' },
    { id: 'Planifié', label: 'Planifiés' },
    { id: 'En Vol', label: 'En Vol' },
    { id: 'Retardé', label: 'Retardés' },
    { id: 'Effectué', label: 'Effectués' },
    { id: 'Annulé', label: 'Annulés' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-375 space-y-5">
        {/* ═══════════════ HEADER (sans Météo) ═══════════════ */}
        <header className="flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading || generating || applying}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 ${FOCUS_RING}`}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
          {previewScenario ? (
            <button
              type="button"
              onClick={() => void runAutomaticGeneration(true)}
              disabled={applying}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 ${FOCUS_RING}`}
            >
              <Play className={`h-4 w-4 ${applying ? 'animate-pulse' : ''}`} />
              {applying ? 'Application...' : 'Appliquer le scénario'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void runAutomaticGeneration(false)}
              disabled={generating || applying}
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 ${FOCUS_RING}`}
            >
              <WandSparkles className={`h-4 w-4 ${generating ? 'animate-pulse' : ''}`} />
              {generating ? 'Génération...' : 'Générer le scénario'}
            </button>
          )}
        </header>

        {message && (
          <AlertBanner type={message.type} message={message.text} onClose={() => setMessage(null)} />
        )}

        {/* ═══════════════ KPI CARDS ═══════════════ */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <KpiCard
            label="Vols horizon"
            value={activeMetrics.totalFlights}
            hint="Fenêtre courante"
            icon={<Calendar className="h-4 w-4" />}
          />
          <KpiCard
            label="Affectés"
            value={activeMetrics.assignedFlights}
            hint="Avec appareil"
            icon={<CheckCircle2 className="h-4 w-4" />}
          />
          <KpiCard
            label="Non affectés"
            value={activeMetrics.unassignedFlights}
            hint="Action requise"
            icon={<AlertTriangle className="h-4 w-4" />}
            isWarning={activeMetrics.unassignedFlights > 0}
          />
          <KpiCard
            label="Décalés"
            value={previewScenario?.metrics.shiftedFlights ?? 0}
            hint="Scénario"
            icon={<RefreshCw className="h-4 w-4" />}
          />
          <KpiCard
            label="Appareils actifs"
            value={
              previewScenario?.metrics.operationalAircraft ??
              activeSchedule.rows.filter(row => row.aircraftId !== 'UNASSIGNED').length
            }
            hint="En opération"
            icon={<Plane className="h-4 w-4" />}
          />
          <KpiCard
            label="OTP"
            value={`${effectiveAnalytics.otpRate}%`}
            hint="Ponctualité"
            icon={<ShieldCheck className="h-4 w-4" />}
          />
        </section>

        {!loading && filteredFlights.length === 0 && flights.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-amber-100">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <p className="mt-3 text-sm font-medium text-amber-900">
              Aucun vol ne correspond à vos filtres
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Ajustez la recherche ou le statut pour élargir les résultats.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setSelectedStatus('TOUS');
              }}
              className="mt-3 inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
            >
              <RotateCcw className="h-3 w-3" />
              Réinitialiser
            </button>
          </div>
        )}

        {/* ═══════════════ SEARCH + GANTT (même div) ═══════════════ */}
        <section className="rounded-xl border border-slate-200 bg-white">
          {/* Search + Filtres */}
          <div className="border-b border-slate-100 p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-[320px]">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={event => setSearchTerm(event.target.value)}
                  placeholder="Rechercher un vol, appareil..."
                  className={`h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-9 text-sm text-slate-700 placeholder:text-slate-400 ${FOCUS_RING}`}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Effacer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:overflow-visible lg:pb-0">
                <span className="hidden items-center gap-1.5 text-xs font-medium text-slate-500 sm:inline-flex">
                  Filtrer :
                </span>
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedStatus(tab.id)}
                    className={`h-8 shrink-0 rounded-full px-4 text-xs font-medium transition ${
                      selectedStatus === tab.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Gantt */}
          <FlightSchedulerGantt
            schedule={activeSchedule}
            searchTerm={searchTerm}
            selectedStatus={selectedStatus}
            isPreview={isPreview}
            assignmentLookup={assignmentLookup}
          />
        </section>

        {/* ═══════════════ TABLEAU (section séparée) ═══════════════ */}
        <section className="rounded-xl border border-slate-200 bg-white">
          <FlightSchedulerDetails
            flights={filteredFlights}
            analytics={effectiveAnalytics}
            previewScenario={previewScenario}
          />
        </section>
      </div>
    </div>
  );
};

/* ═══════════════ KPI CARD ═══════════════ */
function KpiCard({
  label,
  value,
  hint,
  icon,
  isWarning = false,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: React.ReactNode;
  isWarning?: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium text-slate-600">{label}</span>
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
            isWarning ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
          }`}
        >
          {icon}
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-2">
        <span
          className={`text-3xl font-bold tabular-nums tracking-tight ${
            isWarning ? 'text-amber-600' : 'text-slate-900'
          }`}
        >
          {value}
        </span>
        <span className="text-xs font-medium text-slate-400">{hint}</span>
      </div>
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
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 ${config.ring}`} role="alert">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.icon}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${config.title}`}>
          {type === 'success' ? 'Opération réussie' : type === 'error' ? 'Erreur' : 'Information'}
        </p>
        <p className={`mt-0.5 text-xs leading-5 ${config.text}`}>{message}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition ${
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