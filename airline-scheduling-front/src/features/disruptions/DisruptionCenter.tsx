import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Filter,
  Gauge,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import ConflictCard from './ConflictCard';

/* ============================================================
 * CONFIG
 * ========================================================== */

const PYTHON_API_URL =
  (typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_PYTHON_API_URL) ||
  'http://localhost:5000';
const CONFLICTS_ENDPOINT = '/flights/conflicts';
const OPTIMIZE_ENDPOINT = '/flights/optimize';
const ML_INFO_ENDPOINT = '/flights/ml/info';

/* ============================================================
 * TYPES
 * ========================================================== */

export type ConflictSeverity =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL'
  | string;
export type ConflictDetector = 'RULE' | 'DECISION_TREE' | string;
export type ScheduleConflictType =
  | 'UNASSIGNED_AIRCRAFT'
  | 'AIRCRAFT_OVERLAP'
  | 'TURNAROUND_TOO_SHORT'
  | 'AIRCRAFT_POSITIONING'
  | 'ML_CONFLICT_RISK'
  | string;

export interface ConflictFlight {
  id: string;
  numeroVol?: string | null;
  aeroportDepart?: string | null;
  aeroportArrivee?: string | null;
  heureDepart?: string | null;
  heureArrivee?: string | null;
  statut?: string | null;
  avionId?: string | null;
  aircraftRegistration?: string | null;
}

export interface MLConflict {
  id: string;
  type: ScheduleConflictType;
  severity: ConflictSeverity;
  probability: number;
  detector: ConflictDetector;
  aircraftId?: string | null;
  aircraftRegistration?: string | null;
  flightA: ConflictFlight;
  flightB?: ConflictFlight | null;
  overlapMinutes?: number | null;
  gapMinutes?: number | null;
  reason: string;
  recommendation: string;
}

interface ConflictModelInfo {
  algorithm: string;
  version: string;
  externalDependencies?: string[];
  minTurnaroundMinutes?: number;
  positioningMinutes?: number;
}

interface ConflictsResponse {
  timestamp: string;
  totalConflicts: number;
  criticalConflicts: number;
  highConflicts: number;
  mediumConflicts: number;
  model: ConflictModelInfo;
  conflicts: MLConflict[];
}

interface MLInfoResponse {
  status: string;
  model: {
    algorithm: string;
    version: string;
    type: string;
    externalDependencies?: string[];
    tree?: {
      root?: string;
      turnaroundNode?: string;
      positionNode?: string;
      positionGapNode?: string;
      delayedContextNode?: string;
    };
  };
}

interface OptimizationDetail {
  flightNumber: string;
  status: 'REASSIGNED' | 'UNRESOLVED' | string;
  from?: string;
  to?: string;
  reason?: string;
}

interface OptimizationResponse {
  timestamp: string;
  resolvedConflicts: number;
  unresolvedConflicts: number;
  details: OptimizationDetail[];
  conflictsBefore: number;
  conflictsAfter: number;
  remainingConflicts: MLConflict[];
  model: { algorithm: string; version: string };
}

interface MessageState {
  type: 'success' | 'error' | 'info';
  text: string;
}

/* ============================================================
 * HELPERS
 * ========================================================== */

function normalizeText(value?: string | null): string {
  return String(value ?? '').trim().toUpperCase();
}

function clampProbability(value?: number | null): number {
  const numberValue = Number(value ?? 0);
  if (!Number.isFinite(numberValue)) return 0;
  return Math.min(1, Math.max(0, numberValue));
}

function formatProbability(value?: number | null): string {
  return `${Math.round(clampProbability(value) * 100)}%`;
}

function getSeverityRank(severity: string): number {
  switch (normalizeText(severity)) {
    case 'CRITICAL': return 4;
    case 'HIGH': return 3;
    case 'MEDIUM': return 2;
    case 'LOW': return 1;
    default: return 0;
  }
}

function getSeverityLabel(severity: string): string {
  switch (normalizeText(severity)) {
    case 'CRITICAL': return 'Critique';
    case 'HIGH': return 'Élevée';
    case 'MEDIUM': return 'Modérée';
    case 'LOW': return 'Faible';
    default: return severity || 'Inconnue';
  }
}

function getSeverityStyle(severity: string): string {
  switch (normalizeText(severity)) {
    case 'CRITICAL': return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'HIGH': return 'border-orange-200 bg-orange-50 text-orange-700';
    case 'MEDIUM': return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'LOW': return 'border-sky-200 bg-sky-50 text-sky-700';
    default: return 'border-slate-200 bg-slate-50 text-slate-600';
  }
}

function getProbabilityStyle(probability: number): string {
  const score = clampProbability(probability);
  if (score >= 0.85) return 'text-rose-700';
  if (score >= 0.7) return 'text-orange-700';
  if (score >= 0.5) return 'text-amber-700';
  return 'text-emerald-700';
}

function getProbabilityBarStyle(probability: number): string {
  const score = clampProbability(probability);
  if (score >= 0.85) return 'bg-rose-500';
  if (score >= 0.7) return 'bg-orange-500';
  if (score >= 0.5) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function getConflictTypeLabel(type: ScheduleConflictType): string {
  switch (type) {
    case 'UNASSIGNED_AIRCRAFT': return 'Appareil non affecté';
    case 'AIRCRAFT_OVERLAP': return 'Chevauchement appareil';
    case 'TURNAROUND_TOO_SHORT': return 'Turnaround insuffisant';
    case 'AIRCRAFT_POSITIONING': return 'Positionnement incompatible';
    case 'ML_CONFLICT_RISK': return 'Risque de conflit ML';
    default: return type.replace(/_/g, ' ').toLowerCase();
  }
}

function getDetectorLabel(detector: ConflictDetector): string {
  switch (detector) {
    case 'DECISION_TREE': return 'Arbre de décision';
    case 'RULE': return 'Règle métier';
    default: return detector;
  }
}

function getDetectorStyle(detector: ConflictDetector): string {
  if (detector === 'DECISION_TREE') {
    return 'border-violet-200 bg-violet-50 text-violet-700';
  }
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

/* ============================================================
 * KPI CARD
 * ========================================================== */

interface MetricCardProps {
  label: string;
  value: number | string;
  subtitle: string;
  icon: React.ReactNode;
  tone?: 'default' | 'danger' | 'warning' | 'success' | 'info';
}

const toneMap: Record<
  NonNullable<MetricCardProps['tone']>,
  { wrap: string; icon: string; value: string }
> = {
  default: {
    wrap: 'border-slate-200',
    icon: 'bg-slate-50 text-slate-600',
    value: 'text-slate-950',
  },
  danger: {
    wrap: 'border-rose-200',
    icon: 'bg-rose-50 text-rose-600',
    value: 'text-rose-600',
  },
  warning: {
    wrap: 'border-orange-200',
    icon: 'bg-orange-50 text-orange-600',
    value: 'text-orange-600',
  },
  success: {
    wrap: 'border-emerald-200',
    icon: 'bg-emerald-50 text-emerald-600',
    value: 'text-emerald-700',
  },
  info: {
    wrap: 'border-sky-200',
    icon: 'bg-sky-50 text-sky-600',
    value: 'text-sky-700',
  },
};

const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subtitle,
  icon,
  tone = 'default',
}) => {
  const styles = toneMap[tone];

  return (
    <article
      className={`rounded-2xl border bg-white p-3.5 shadow-sm transition hover:shadow-md sm:p-4 ${styles.wrap}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-xs">
            {label}
          </span>
          <p
            className={`mt-1 text-2xl font-black tabular-nums sm:text-3xl ${styles.value}`}
          >
            {value}
          </p>
          <p className="mt-1 text-[11px] font-medium leading-4 text-slate-500 sm:text-xs">
            {subtitle}
          </p>
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.icon}`}
        >
          {icon}
        </div>
      </div>
    </article>
  );
};

/* ============================================================
 * MAIN COMPONENT
 * ========================================================== */

export const DisruptionCenter: React.FC = () => {
  const [conflicts, setConflicts] = useState<MLConflict[]>([]);
  const [model, setModel] = useState<ConflictModelInfo | null>(null);
  const [modelInfo, setModelInfo] = useState<MLInfoResponse['model'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');
  const [optimizationResult, setOptimizationResult] =
    useState<OptimizationResponse | null>(null);

  /* LOAD CONFLICTS */

  const loadConflicts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(
        `${PYTHON_API_URL}${CONFLICTS_ENDPOINT}`,
        { method: 'GET', headers: { Accept: 'application/json' } },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const backendMessage =
          payload && typeof payload === 'object' && 'message' in payload
            ? String((payload as { message?: unknown }).message)
            : null;
        throw new Error(
          backendMessage ||
            `Détection Python indisponible (HTTP ${response.status}).`,
        );
      }
      const payload = (await response.json()) as ConflictsResponse;
      const nextConflicts = Array.isArray(payload.conflicts) ? payload.conflicts : [];
      nextConflicts.sort((first, second) => {
        const severityDifference =
          getSeverityRank(second.severity) - getSeverityRank(first.severity);
        if (severityDifference !== 0) return severityDifference;
        return (
          clampProbability(second.probability) -
          clampProbability(first.probability)
        );
      });
      setConflicts(nextConflicts);
      setModel(payload.model ?? null);
      setError(null);
    } catch (currentError: unknown) {
      setError(
        currentError instanceof Error
          ? currentError.message
          : 'Impossible de joindre le moteur ML Python.',
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  /* LOAD ML INFO */

  const loadMLInfo = useCallback(async () => {
    try {
      const response = await fetch(
        `${PYTHON_API_URL}${ML_INFO_ENDPOINT}`,
        { method: 'GET', headers: { Accept: 'application/json' } },
      );
      if (!response.ok) return;
      const payload = (await response.json()) as MLInfoResponse;
      setModelInfo(payload.model ?? null);
    } catch {
      setModelInfo(null);
    }
  }, []);

  /* REFRESH */

  const refreshAll = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([loadConflicts(true), loadMLInfo()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadConflicts, loadMLInfo, refreshing]);

  /* OPTIMIZE */

  const handleOptimize = async () => {
    if (optimizing) return;
    setOptimizing(true);
    setMessage(null);
    setOptimizationResult(null);
    try {
      const response = await fetch(
        `${PYTHON_API_URL}${OPTIMIZE_ENDPOINT}`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const backendMessage =
          payload && typeof payload === 'object' && 'message' in payload
            ? String((payload as { message?: unknown }).message)
            : null;
        throw new Error(
          backendMessage ||
            `Optimisation impossible (HTTP ${response.status}).`,
        );
      }
      const payload = (await response.json()) as OptimizationResponse;
      setOptimizationResult(payload);
      setConflicts(
        Array.isArray(payload.remainingConflicts)
          ? payload.remainingConflicts
          : [],
      );
      setMessage({
        type: payload.unresolvedConflicts > 0 ? 'info' : 'success',
        text:
          `${payload.resolvedConflicts} conflit(s) résolu(s), ` +
          `${payload.unresolvedConflicts} non résolu(s). ` +
          `${payload.conflictsBefore} → ${payload.conflictsAfter} conflit(s).`,
      });
    } catch (currentError: unknown) {
      setMessage({
        type: 'error',
        text:
          currentError instanceof Error
            ? currentError.message
            : 'Impossible de lancer l’optimisation Python.',
      });
    } finally {
      setOptimizing(false);
    }
  };

  /* INITIAL LOAD */

  useEffect(() => {
    const initialize = async () => {
      await Promise.all([loadConflicts(), loadMLInfo()]);
    };
    void initialize();
  }, [loadConflicts, loadMLInfo]);

  /* AUTO REFRESH */

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadConflicts(true);
      }
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadConflicts]);

  /* DERIVED STATS */

  const stats = useMemo(() => {
    const critical = conflicts.filter(
      (c) => normalizeText(c.severity) === 'CRITICAL',
    ).length;
    const high = conflicts.filter(
      (c) => normalizeText(c.severity) === 'HIGH',
    ).length;
    const medium = conflicts.filter(
      (c) => normalizeText(c.severity) === 'MEDIUM',
    ).length;
    const decisionTree = conflicts.filter(
      (c) => c.detector === 'DECISION_TREE',
    ).length;
    const averageProbability =
      conflicts.length > 0
        ? Math.round(
            (conflicts.reduce(
              (total, c) => total + clampProbability(c.probability),
              0,
            ) /
              conflicts.length) *
              100,
          )
        : 0;
    return {
      total: conflicts.length,
      critical,
      high,
      medium,
      decisionTree,
      averageProbability,
    };
  }, [conflicts]);

  /* TYPES */

  const availableTypes = useMemo(
    () => Array.from(new Set(conflicts.map((c) => c.type))).sort(),
    [conflicts],
  );

  /* FILTER */

  const filteredConflicts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return conflicts.filter((conflict) => {
      const searchable = [
        conflict.type,
        conflict.reason,
        conflict.recommendation,
        conflict.aircraftRegistration,
        conflict.flightA?.numeroVol,
        conflict.flightA?.aeroportDepart,
        conflict.flightA?.aeroportArrivee,
        conflict.flightB?.numeroVol,
        conflict.flightB?.aeroportDepart,
        conflict.flightB?.aeroportArrivee,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesSearch = !term || searchable.includes(term);
      const matchesSeverity =
        selectedSeverity === 'ALL' ||
        normalizeText(conflict.severity) === selectedSeverity;
      const matchesType =
        selectedType === 'ALL' || conflict.type === selectedType;
      return matchesSearch && matchesSeverity && matchesType;
    });
  }, [conflicts, searchTerm, selectedSeverity, selectedType]);

  /* LOADING */

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center bg-slate-50">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100">
          <BrainCircuit className="h-8 w-8 text-violet-700" />
          <Loader2 className="absolute h-14 w-14 animate-spin text-violet-200" />
        </div>
        <p className="mt-4 text-xs font-bold uppercase tracking-widest text-slate-500">
          Analyse ML des conflits
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Arbre de décision Python en cours d’exécution...
        </p>
      </div>
    );
  }

  /* ERROR */

  if (error && conflicts.length === 0) {
    return (
      <div className="mx-auto mt-12 flex min-h-85 max-w-xl flex-col items-center justify-center rounded-3xl border border-rose-200 bg-white p-6 text-center shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-black text-slate-900">
          Moteur ML indisponible
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void refreshAll()}
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-600/20"
        >
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </button>
      </div>
    );
  }

  /* RENDER */

  return (
    <div className="min-h-screen bg-slate-50 p-2.5 text-slate-800 sm:p-5 lg:p-6">
      <div className="mx-auto max-w-375 space-y-4">

        {/* HEADER */}
        <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">

            <div className="flex items-start gap-3">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-emerald-600 to-emerald-700 text-white shadow-sm">
                <Activity className="h-6 w-6" />
                {stats.critical > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[9px] font-black text-white shadow">
                    {stats.critical}
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-black tracking-tight text-slate-950 sm:text-xl">
                    Centre des perturbations
                  </h1>
                </div>
                <p className="mt-1 max-w-2xl text-xs font-medium leading-5 text-slate-500 sm:text-sm">
                  Détection prédictive des conflits de rotation et aide à la
                  réaffectation des appareils en temps réel.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={refreshing || optimizing}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:text-sm"
              >
                <RefreshCw
                  className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
                />
                Actualiser
              </button>
              <button
                type="button"
                onClick={() => void handleOptimize()}
                disabled={optimizing || stats.total === 0}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-600/20 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:text-sm"
              >
                {optimizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                {optimizing ? 'Optimisation...' : 'Optimiser'}
              </button>
            </div>

          </div>
        </header>

        {/* MESSAGE */}
        {message && (
          <div
            role="alert"
            className={`flex items-start justify-between gap-3 rounded-2xl border p-3.5 shadow-sm ${
              message.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : message.type === 'info'
                  ? 'border-sky-200 bg-sky-50 text-sky-900'
                  : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            <div className="flex min-w-0 items-start gap-2.5">
              {message.type === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <p className="text-xs font-semibold leading-5 sm:text-sm">
                {message.text}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMessage(null)}
              aria-label="Fermer"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition hover:bg-black/5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* KPI */}
        <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
          <MetricCard
            label="Conflits ML"
            value={stats.total}
            subtitle="Détectés"
            icon={<BrainCircuit className="h-5 w-5" />}
            tone="info"
          />
          <MetricCard
            label="Critiques"
            value={stats.critical}
            subtitle="Priorité OCC"
            icon={<ShieldAlert className="h-5 w-5" />}
            tone={stats.critical > 0 ? 'danger' : 'default'}
          />
          <MetricCard
            label="Élevés"
            value={stats.high}
            subtitle="À traiter"
            icon={<AlertTriangle className="h-5 w-5" />}
            tone={stats.high > 0 ? 'warning' : 'default'}
          />
          <MetricCard
            label="Risque moyen"
            value={`${stats.averageProbability}%`}
            subtitle="Probabilité moyenne"
            icon={<Gauge className="h-5 w-5" />}
            tone={
              stats.averageProbability >= 70
                ? 'danger'
                : stats.averageProbability >= 50
                  ? 'warning'
                  : 'success'
            }
          />
        </section>

        {/* MODEL INFO */}
        {(model || modelInfo) && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-black text-slate-900">
                    Modèle de détection
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-medium text-slate-500">
                  {model?.minTurnaroundMinutes != null && (
                    <span>
                      Turnaround minimum :{' '}
                      <strong className="text-slate-700">
                        {model.minTurnaroundMinutes} min
                      </strong>
                    </span>
                  )}
                  {model?.positioningMinutes != null && (
                    <span>
                      Repositionnement :{' '}
                      <strong className="text-slate-700">
                        {model.positioningMinutes} min
                      </strong>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* OPTIMIZATION RESULT */}
        {optimizationResult && (
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-4 sm:px-5">
              <div>
                <h2 className="text-sm font-black text-slate-900">
                  Résultat de l’optimisation
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Réaffectation automatique proposée par le moteur Python.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOptimizationResult(null)}
                aria-label="Fermer"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4 sm:p-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Avant
                </span>
                <p className="mt-1 text-xl font-black text-slate-900">
                  {optimizationResult.conflictsBefore}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Après
                </span>
                <p className="mt-1 text-xl font-black text-slate-900">
                  {optimizationResult.conflictsAfter}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                  Résolus
                </span>
                <p className="mt-1 text-xl font-black text-emerald-700">
                  {optimizationResult.resolvedConflicts}
                </p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
                <span className="text-[10px] font-bold uppercase tracking-wide text-rose-700">
                  Non résolus
                </span>
                <p className="mt-1 text-xl font-black text-rose-700">
                  {optimizationResult.unresolvedConflicts}
                </p>
              </div>
            </div>

            {optimizationResult.details.length > 0 && (
              <div className="border-t border-slate-100 px-4 py-3 sm:px-5">
                <div className="space-y-2">
                  {optimizationResult.details.map((detail, index) => (
                    <div
                      key={`${detail.flightNumber}-${index}`}
                      className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-mono text-sm font-black text-slate-900">
                          {detail.flightNumber}
                        </p>
                        {detail.reason && (
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {detail.reason}
                          </p>
                        )}
                      </div>
                      {detail.status === 'REASSIGNED' ? (
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600">
                            {detail.from || 'NON ASSIGNÉ'}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                          <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">
                            {detail.to || '--'}
                          </span>
                        </div>
                      ) : (
                        <span className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
                          Non résolu
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* FILTERS */}
        <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="grid gap-2.5 lg:grid-cols-[1fr_220px_270px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Rechercher : vol, appareil, route, motif..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-600/10"
              />
            </div>
            <div className="relative">
              <Filter className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={selectedSeverity}
                onChange={(event) => setSelectedSeverity(event.target.value)}
                className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-600/10"
              >
                <option value="ALL">Toutes les sévérités</option>
                <option value="CRITICAL">Critique</option>
                <option value="HIGH">Élevée</option>
                <option value="MEDIUM">Modérée</option>
                <option value="LOW">Faible</option>
              </select>
            </div>
            <select
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-600/10"
            >
              <option value="ALL">Tous les types de conflit</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {getConflictTypeLabel(type)}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* LIST */}
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 px-4 py-4 sm:px-5">
            <div>
              <h2 className="text-sm font-black text-slate-900 sm:text-base">
                Conflits détectés
              </h2>
            </div>
            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-black tabular-nums text-slate-700">
              {filteredConflicts.length}
            </span>
          </div>

          {filteredConflicts.length === 0 ? (
            <div className="flex min-h-62.5 items-center justify-center p-6 text-center">
              <div>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-black text-slate-800">
                  Aucun conflit détecté
                </p>
                <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">
                  Aucun conflit ne correspond actuellement aux critères de
                  l’arbre de décision et aux filtres sélectionnés.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* MOBILE */}
              <div className="space-y-3 bg-slate-50 p-2.5 md:hidden">
                {filteredConflicts.map((conflict) => (
                  <ConflictCard key={conflict.id} conflict={conflict} />
                ))}
              </div>

              {/* DESKTOP */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-300 text-left">
                  <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3.5">Conflit</th>
                      <th className="px-4 py-3.5">Rotation</th>
                      <th className="px-4 py-3.5">Appareil</th>
                      <th className="px-4 py-3.5">Risque ML</th>
                      <th className="px-4 py-3.5">Détecteur</th>
                      <th className="px-4 py-3.5">Motif</th>
                      <th className="px-4 py-3.5">Recommandation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredConflicts.map((conflict) => (
                      <tr
                        key={conflict.id}
                        className="align-top transition hover:bg-slate-50/70"
                      >
                        <td className="px-4 py-4">
                          <p className="max-w-45 text-sm font-bold text-slate-900">
                            {getConflictTypeLabel(conflict.type)}
                          </p>
                          <span
                            className={`mt-1.5 inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${getSeverityStyle(
                              conflict.severity,
                            )}`}
                          >
                            {getSeverityLabel(conflict.severity)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-mono text-sm font-black text-slate-900">
                                {conflict.flightA?.numeroVol || '--'}
                              </p>
                              <p className="mt-0.5 font-mono text-[10px] font-semibold text-slate-500">
                                {conflict.flightA?.aeroportDepart || '--'}
                                <span className="mx-1 text-slate-300">→</span>
                                {conflict.flightA?.aeroportArrivee || '--'}
                              </p>
                            </div>
                            {conflict.flightB && (
                              <>
                                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                                <div>
                                  <p className="font-mono text-sm font-black text-slate-900">
                                    {conflict.flightB.numeroVol || '--'}
                                  </p>
                                  <p className="mt-0.5 font-mono text-[10px] font-semibold text-slate-500">
                                    {conflict.flightB.aeroportDepart || '--'}
                                    <span className="mx-1 text-slate-300">→</span>
                                    {conflict.flightB.aeroportArrivee || '--'}
                                  </p>
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {conflict.aircraftRegistration ? (
                            <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-700">
                              {conflict.aircraftRegistration}
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-rose-600">
                              Non assigné
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="min-w-25">
                            <p
                              className={`text-sm font-black tabular-nums ${getProbabilityStyle(
                                conflict.probability,
                              )}`}
                            >
                              {formatProbability(conflict.probability)}
                            </p>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full ${getProbabilityBarStyle(
                                  conflict.probability,
                                )}`}
                                style={{
                                  width: `${clampProbability(
                                    conflict.probability,
                                  ) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-lg border px-2.5 py-1.5 text-xs font-bold ${getDetectorStyle(
                              conflict.detector,
                            )}`}
                          >
                            {getDetectorLabel(conflict.detector)}
                          </span>
                        </td>
                        <td className="max-w-75 px-4 py-4">
                          <p className="text-xs font-semibold leading-5 text-slate-700">
                            {conflict.reason}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {conflict.overlapMinutes != null &&
                              conflict.overlapMinutes > 0 && (
                                <span className="rounded-md bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-700">
                                  Chevauchement :{' '}
                                  {Math.round(conflict.overlapMinutes)} min
                                </span>
                              )}
                            {conflict.gapMinutes != null && (
                              <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">
                                Intervalle :{' '}
                                {Math.round(conflict.gapMinutes)} min
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="max-w-75 px-4 py-4">
                          <div className="flex items-start gap-2">
                            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                            <p className="text-xs font-semibold leading-5 text-slate-700">
                              {conflict.recommendation}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

      </div>
    </div>
  );
};

export default DisruptionCenter;