import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Layers,
  Plane,
  RefreshCw,
  Search,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { pythonRequestJson } from '../Api/apiService';
/* ============================================================================
 * CENTRE CONFLITS & OPTIMISATION — API Python / Flask :5000
 * ----------------------------------------------------------------------------
 * Routes du service Python :
 *   GET  /flights/conflicts
 *   POST /flights/optimize
 *
 * Les résultats combinent les détections prédictives et les contrôles
 * structurels déterministes (par exemple un vol sans aéronef).
 * ========================================================================== */

type ConflictSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

type Detector = string;

interface ConflictFlightRef {
  refFlight: string;
  flightNumber: string;
  depAirportCode: string;
  arrAirportCode: string;
  departureTime?: string | null;
  arrivalTime?: string | null;
  status?: string | null;
  refAircraft?: string | null;
  aircraftRegistration?: string | null;
}

interface FlightConflict {
  id: string;
  type: string;
  severity: ConflictSeverity;
  probability: number;
  detector?: Detector;
  refAircraft?: string | null;
  aircraftRegistration?: string | null;
  flightA: ConflictFlightRef;
  flightB?: ConflictFlightRef | null;
  overlapMinutes?: number | null;
  gapMinutes?: number | null;
  reason: string;
  recommendation: string;
}

interface ConflictModelInfo {
  minTurnaroundMinutes?: number;
  positioningMinutes?: number;
}

interface ConflictDetectionResult {
  timestamp: string;
  totalConflicts: number;
  criticalConflicts: number;
  highConflicts: number;
  mediumConflicts: number;
  conflicts: FlightConflict[];
  model?: ConflictModelInfo;
}

interface OptimizationDetail {
  flightNumber?: string;
  status: 'REASSIGNED' | 'UNRESOLVED' | string;
  from?: string | null;
  to?: string | null;
  reason?: string | null;
}

interface OptimizationResult {
  timestamp?: string;
  resolvedConflicts: number;
  unresolvedConflicts: number;
  conflictsBefore: number;
  conflictsAfter: number;
  details: OptimizationDetail[];
  remainingConflicts?: FlightConflict[];
}

type SeverityFilter = 'ALL' | ConflictSeverity;

const ITEMS_PER_PAGE = 8;

const SURFACE = 'rounded-xl border border-slate-200 bg-white';

const BTN_PRIMARY =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50';

const BTN_SECONDARY =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50';

const BADGE =
  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold';

const CONFLICT_SEVERITY = {
  CRITICAL: {
    label: 'Critique',
    className: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
    dot: 'bg-rose-500',
  },
  HIGH: {
    label: 'Élevé',
    className: 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200',
    dot: 'bg-orange-500',
  },
  MEDIUM: {
    label: 'Modéré',
    className: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
    dot: 'bg-amber-500',
  },
} satisfies Record<
  ConflictSeverity,
  { label: string; className: string; dot: string }
>;

const CONFLICT_TYPE_LABELS: Record<string, string> = {
  AIRCRAFT_OVERLAP: 'Chevauchement aéronef',
  TURNAROUND_TOO_SHORT: 'Turnaround insuffisant',
  AIRCRAFT_POSITIONING: 'Repositionnement impossible',
  UNASSIGNED_AIRCRAFT: 'Aéronef non affecté',
  ML_CONFLICT_RISK: 'Risque prédictif',
  XGBOOST_CONFLICT: 'Risque prédictif',
};

const getConflictTypeLabel = (type: string) =>
  CONFLICT_TYPE_LABELS[type.trim().toUpperCase().replace(/-/g, '_')] || type;

const formatProbability = (value?: number | null) => {
  const probability = Number(value);
  if (!Number.isFinite(probability)) return 0;
  const normalized = probability <= 1 ? probability * 100 : probability;
  return Math.max(0, Math.min(100, Math.round(normalized)));
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getFriendlyError = (error: unknown, fallback: string): string => {
  if (error instanceof Error) {
    if (error.message.includes('Failed to fetch')) {
      return 'Impossible de contacter le service Python. Vérifiez que « python app.py » est lancé sur le port 5000.';
    }
    return error.message || fallback;
  }
  return fallback;
};

export const FlightOptimizationDashboard: React.FC = () => {
  const [conflictResult, setConflictResult] =
    useState<ConflictDetectionResult | null>(null);
  const [optimizationResult, setOptimizationResult] =
    useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] =
    useState<SeverityFilter>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showOptimizationConfirm, setShowOptimizationConfirm] = useState(false);
  const loadConflicts = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      if (!silent) setError(null);
      const conflicts = await pythonRequestJson<ConflictDetectionResult>(
        '/flights/conflicts',
      );
      setConflictResult(conflicts);
      setLastScanAt(new Date());
      setError(null);
    } catch (loadError: unknown) {
      console.error('Erreur détection conflits :', loadError);
      if (!silent) {
        setError(
          getFriendlyError(
            loadError,
            'Impossible de charger les conflits détectés par le moteur Python.',
          ),
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);
  const runOptimization = useCallback(async () => {
    if (optimizing) return;
    setShowOptimizationConfirm(false);
    setOptimizing(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await pythonRequestJson<OptimizationResult>(
        '/flights/optimize',
        { method: 'POST' },
      );
      setOptimizationResult(result);
      setSuccess(
        `${result.resolvedConflicts} conflit(s) résolu(s), ${result.unresolvedConflicts} non résolu(s), ${result.conflictsAfter} restant(s).`,
      );
      await loadConflicts(true);
    } catch (optimizationError: unknown) {
      console.error('Erreur optimisation :', optimizationError);
      setError(
        getFriendlyError(
          optimizationError,
          'Impossible d’exécuter l’optimisation.',
        ),
      );
    } finally {
      setOptimizing(false);
    }
  }, [loadConflicts, optimizing]);
  useEffect(() => {
    void loadConflicts(false);
  }, [loadConflicts]);
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible' && !optimizing) {
        void loadConflicts(true);
      }
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, [loadConflicts, optimizing]);
  const conflicts = useMemo(
    () => conflictResult?.conflicts ?? [],
    [conflictResult],
  );
  const predictiveCount = useMemo(
    () => conflicts.filter(conflict => conflict.detector !== 'RULE').length,
    [conflicts],
  );
  const ruleCount = useMemo(
    () => conflicts.filter(conflict => conflict.detector === 'RULE').length,
    [conflicts],
  );
  const filteredConflicts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const severityOrder: Record<ConflictSeverity, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
    };
    return conflicts
      .filter(conflict =>
        severityFilter === 'ALL' ? true : conflict.severity === severityFilter,
      )
      .filter(conflict => {
        if (!query) return true;
        const searchable = [
          conflict.flightA?.flightNumber,
          conflict.flightB?.flightNumber,
          conflict.aircraftRegistration,
          conflict.flightA?.depAirportCode,
          conflict.flightA?.arrAirportCode,
          getConflictTypeLabel(conflict.type),
          conflict.detector,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return searchable.includes(query);
      })
      .sort((a, b) => {
        const severityDelta =
          severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDelta !== 0) return severityDelta;
        return formatProbability(b.probability) - formatProbability(a.probability);
      });
  }, [conflicts, searchQuery, severityFilter]);
  const totalPages = Math.max(
    1,
    Math.ceil(filteredConflicts.length / ITEMS_PER_PAGE),
  );
  const paginatedConflicts = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredConflicts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredConflicts, page]);
  useEffect(() => {
    setPage(1);
  }, [searchQuery, severityFilter]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] space-y-4 p-3 sm:space-y-5 sm:p-6">
        <header className="w-full">
          <div className="grid w-full grid-cols-2 gap-2 rounded-2xl  p-3  sm:flex sm:w-auto sm:justify-end sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
            <button
              type="button"
              onClick={() => void loadConflicts(false)}
              disabled={loading || optimizing}
              className={`${BTN_SECONDARY} w-full min-w-0 rounded-xl px-3 sm:w-auto sm:px-4`}
            >
              <RefreshCw
                className={`h-4 w-4 shrink-0 ${loading ? 'animate-spin' : ''}`}
              />
              <span className="truncate">
                {loading ? 'Analyse…' : 'Actualiser'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setShowOptimizationConfirm(true)}
              disabled={loading || optimizing}
              className={`${BTN_PRIMARY} w-full min-w-0 rounded-xl px-3 shadow-sm shadow-emerald-600/20 sm:w-auto sm:px-4`}
            >
              <Sparkles
                className={`h-4 w-4 shrink-0 ${optimizing ? 'animate-pulse' : ''}`}
              />
              <span className="truncate">
                {optimizing ? 'Optimisation…' : 'Optimiser'}
              </span>
            </button>
          </div>
        </header>
        {error && (
          <AlertBox
            tone="error"
            title="Erreur d’analyse"
            message={error}
            onClose={() => setError(null)}
          />
        )}
        {success && (
          <AlertBox
            tone="success"
            title="Optimisation terminée"
            message={success}
            onClose={() => setSuccess(null)}
          />
        )}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <KpiCard
            icon={<Layers className="h-4 w-4" />}
            label="Conflits détectés"
            value={conflictResult?.totalConflicts ?? 0}
            hint="Programme actuel"
          />
          <KpiCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Critiques"
            value={conflictResult?.criticalConflicts ?? 0}
            hint="Priorité maximale"
          />
          <KpiCard
            icon={<Cpu className="h-4 w-4" />}
            label="Détections prédictives"
            value={predictiveCount}
            hint="Analyse des rotations"
          />
          <KpiCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Contrôles métier"
            value={ruleCount}
            hint="Règles déterministes"
          />
          <KpiCard
            icon={<Clock className="h-4 w-4" />}
            label="Dernière analyse"
            value={
              lastScanAt
                ? lastScanAt.toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'
            }
            hint="Analyse actualisée"
          />
        </section>
        <section className={`${SURFACE} overflow-hidden`}>
          <div className="border-b border-slate-100 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Conflits du programme de vols
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Le pourcentage indique le niveau de confiance de la détection. Les règles métier sont affichées à 100 %.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={event => setSearchQuery(event.target.value)}
                    placeholder="Vol, aéronef, type…"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
                  />
                </div>
                <select
                  value={severityFilter}
                  onChange={event =>
                    setSeverityFilter(event.target.value as SeverityFilter)
                  }
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10"
                >
                  <option value="ALL">Toutes les criticités</option>
                  <option value="CRITICAL">Critique</option>
                  <option value="HIGH">Élevé</option>
                  <option value="MEDIUM">Modéré</option>
                </select>
              </div>
            </div>
          </div>
          {loading && !conflictResult ? (
            <div className="flex min-h-64 items-center justify-center p-8 text-sm text-slate-500">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Analyse des conflits en cours…
            </div>
          ) : paginatedConflicts.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800">
                Aucun conflit correspondant
              </p>
              <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">
                Le moteur n’a retourné aucune anomalie pour les critères actuellement affichés.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead className="bg-slate-50/80">
                    <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="w-10 px-4 py-3 sm:px-6" />
                      <th className="px-3 py-3">Criticité</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">Vol(s)</th>
                      <th className="px-3 py-3">Aéronef</th>
                      <th className="px-3 py-3">Détecteur</th>
                      <th className="px-3 py-3">Confiance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedConflicts.map(conflict => (
                      <ConflictRow
                        key={conflict.id}
                        conflict={conflict}
                        expanded={expandedId === conflict.id}
                        onToggle={() =>
                          setExpandedId(current =>
                            current === conflict.id ? null : conflict.id,
                          )
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="text-xs text-slate-500">
                  {filteredConflicts.length} résultat{filteredConflicts.length > 1 ? 's' : ''}
                </span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <PageButton
                      disabled={page === 1}
                      onClick={() => setPage(current => Math.max(1, current - 1))}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </PageButton>
                    <span className="px-2 text-xs font-semibold tabular-nums text-slate-600">
                      {page} / {totalPages}
                    </span>
                    <PageButton
                      disabled={page === totalPages}
                      onClick={() =>
                        setPage(current => Math.min(totalPages, current + 1))
                      }
                    >
                      <ChevronRight className="h-4 w-4" />
                    </PageButton>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
        <section className="grid gap-4 xl:grid-cols-2">
          {conflictResult?.model &&
            (conflictResult.model.minTurnaroundMinutes != null ||
              conflictResult.model.positioningMinutes != null) && (
              <article className={`${SURFACE} p-4 sm:p-5`}>
                <h2 className="text-sm font-bold text-slate-900">
                  Paramètres de planification
                </h2>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  {conflictResult.model.minTurnaroundMinutes != null && (
                    <InfoItem
                      label="Turnaround minimum"
                      value={`${conflictResult.model.minTurnaroundMinutes} min`}
                    />
                  )}
                  {conflictResult.model.positioningMinutes != null && (
                    <InfoItem
                      label="Repositionnement"
                      value={`${conflictResult.model.positioningMinutes} min`}
                    />
                  )}
                </dl>
              </article>
            )}
          <article className={`${SURFACE} p-4 sm:p-5`}>
            <h2 className="text-sm font-bold text-slate-900">
              Dernière optimisation
            </h2>
            {!optimizationResult ? (
              <p className="mt-3 text-sm leading-6 text-slate-500">
                Aucune optimisation lancée depuis l’ouverture de cette page.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <MiniMetric
                    label="Avant"
                    value={optimizationResult.conflictsBefore}
                  />
                  <MiniMetric
                    label="Résolus"
                    value={optimizationResult.resolvedConflicts}
                  />
                  <MiniMetric
                    label="Après"
                    value={optimizationResult.conflictsAfter}
                  />
                </div>
                {optimizationResult.details.length > 0 && (
                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                    {optimizationResult.details.map((detail, index) => (
                      <div
                        key={`${detail.flightNumber || 'flight'}-${index}`}
                        className="rounded-lg border border-slate-100 bg-slate-50 p-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-xs font-bold text-slate-700">
                            {detail.flightNumber || 'Vol'}
                          </span>
                          <span
                            className={`${BADGE} ${
                              detail.status === 'REASSIGNED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {detail.status === 'REASSIGNED'
                              ? 'Réaffecté'
                              : 'Non résolu'}
                          </span>
                        </div>
                        {detail.status === 'REASSIGNED' && (
                          <p className="mt-1.5 text-xs text-slate-500">
                            {detail.from || 'Non affecté'} <ArrowRight className="mx-1 inline h-3 w-3" />{' '}
                            <strong className="text-slate-700">{detail.to || '—'}</strong>
                          </p>
                        )}
                        {detail.reason && (
                          <p className="mt-1 text-[11px] leading-5 text-slate-500">
                            {detail.reason}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </article>
        </section>
      </div>
      {showOptimizationConfirm && (
        <OptimizationConfirmModal
          conflictCount={conflictResult?.totalConflicts ?? 0}
          onCancel={() => setShowOptimizationConfirm(false)}
          onConfirm={() => void runOptimization()}
        />
      )}
    </div>
  );
};

function OptimizationConfirmModal({
  conflictCount,
  onCancel,
  onConfirm,
}: {
  conflictCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="optimization-confirm-title"
      onMouseDown={onCancel}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-slate-100 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="optimization-confirm-title" className="text-base font-bold text-slate-900">
              Confirmer l’optimisation
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Le moteur va analyser le programme actuel et appliquer les réaffectations pouvant être résolues automatiquement.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-5">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
            <p className="text-xs font-semibold text-amber-900">
              {conflictCount > 0
                ? `${conflictCount} conflit${conflictCount > 1 ? 's' : ''} actuellement détecté${conflictCount > 1 ? 's' : ''}.`
                : 'Aucun conflit n’est actuellement comptabilisé.'}
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-800/80">
              Les situations qui ne peuvent pas être corrigées automatiquement resteront signalées pour validation manuelle.
            </p>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            Voulez-vous continuer l’optimisation du programme de vols ?
          </p>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className={BTN_SECONDARY}>
            Annuler
          </button>
          <button type="button" onClick={onConfirm} className={BTN_PRIMARY}>
            <Sparkles className="h-4 w-4" />
            Lancer l’optimisation
          </button>
        </div>
      </div>
    </div>
  );
}

function ConflictRow({
  conflict,
  expanded,
  onToggle,
}: {
  conflict: FlightConflict;
  expanded: boolean;
  onToggle: () => void;
}) {
  const severity = CONFLICT_SEVERITY[conflict.severity];
  const probability = formatProbability(conflict.probability);
  const isRule = conflict.detector?.toUpperCase() === 'RULE';
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50/70"
      >
        <td className="px-4 py-3.5 sm:px-6">
          <ChevronDown
            className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </td>
        <td className="px-3 py-3.5">
          <span className={`${BADGE} ${severity.className}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${severity.dot}`} />
            {severity.label}
          </span>
        </td>
        <td className="px-3 py-3.5 text-xs font-semibold text-slate-700">
          {getConflictTypeLabel(conflict.type)}
        </td>
        <td className="px-3 py-3.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <FlightBadge flight={conflict.flightA} />
            {conflict.flightB && (
              <>
                <ArrowRight className="h-3 w-3 text-slate-300" />
                <FlightBadge flight={conflict.flightB} />
              </>
            )}
          </div>
        </td>
        <td className="px-3 py-3.5">
          {conflict.aircraftRegistration ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 font-mono text-[11px] font-bold text-emerald-700">
              <Plane className="h-3 w-3" />
              {conflict.aircraftRegistration}
            </span>
          ) : (
            <span className="text-xs text-slate-400">Non affecté</span>
          )}
        </td>
        <td className="px-3 py-3.5">
          <span
            className={`${BADGE} ${
              isRule
                ? 'bg-slate-100 text-slate-600'
                : 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200'
            }`}
          >
            {isRule ? 'Règle métier' : 'Détection prédictive'}
          </span>
        </td>
        <td className="px-3 py-3.5">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${isRule ? 'bg-slate-500' : 'bg-violet-500'}`}
                style={{ width: `${probability}%` }}
              />
            </div>
            <span className="font-mono text-[11px] font-bold tabular-nums text-slate-600">
              {probability}%
            </span>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-slate-100 bg-slate-50/40">
          <td colSpan={7} className="px-4 py-5 sm:px-6">
            <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Anomalie détectée
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-slate-700">
                    {conflict.reason}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {conflict.overlapMinutes != null && conflict.overlapMinutes > 0 && (
                    <span className="rounded-md bg-rose-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-rose-700">
                      Chevauchement : {Math.round(conflict.overlapMinutes)} min
                    </span>
                  )}
                  {conflict.gapMinutes != null && (
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-600">
                      Marge : {Math.round(conflict.gapMinutes)} min
                    </span>
                  )}
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Recommandation
                  </p>
                  <p className="mt-1.5 text-sm leading-6 text-slate-700">
                    {conflict.recommendation}
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Rotation concernée
                </p>
                <FlightDetail flight={conflict.flightA} label="Vol A" />
                {conflict.flightB && (
                  <FlightDetail flight={conflict.flightB} label="Vol B" />
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function FlightBadge({ flight }: { flight: ConflictFlightRef }) {
  return (
    <span
      className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] font-bold text-slate-700"
      title={flight.refFlight}
    >
      {flight.flightNumber || flight.refFlight}
    </span>
  );
}

function FlightDetail({
  flight,
  label,
}: {
  flight: ConflictFlightRef;
  label: string;
}) {
  return (
    <div className="mt-3 border-t border-slate-100 pt-3 first:mt-2 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {label}
        </span>
        <span className="font-mono text-xs font-bold text-slate-700">
          {flight.flightNumber || flight.refFlight}
        </span>
      </div>
      <p className="mt-1 text-xs font-semibold text-slate-600">
        {flight.depAirportCode} → {flight.arrAirportCode}
      </p>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">
        Départ : {formatDateTime(flight.departureTime)}
        <br />
        Arrivée : {formatDateTime(flight.arrivalTime)}
      </p>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <article className={`${SURFACE} p-4 shadow-sm shadow-slate-900/[0.03]`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-slate-500">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">{hint}</p>
    </article>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 text-xs font-semibold leading-5 text-slate-700">
        {value}
      </dd>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-center">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-800 tabular-nums">{value}</p>
    </div>
  );
}

function AlertBox({
  tone,
  title,
  message,
  onClose,
}: {
  tone: 'success' | 'error';
  title: string;
  message: string;
  onClose: () => void;
}) {
  const success = tone === 'success';
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-4 ${
        success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
          : 'border-rose-200 bg-rose-50 text-rose-900'
      }`}
    >
      {success ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
      ) : (
        <XCircle className="mt-0.5 h-5 w-5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-1 text-xs leading-5 opacity-80">{message}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-1 opacity-60 transition hover:bg-white/50 hover:opacity-100"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function PageButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}
