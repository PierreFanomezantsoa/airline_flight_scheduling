import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Layers,
  Plane,
  RefreshCw,
  Search,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';

const ML_API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  'http://localhost:5000';

type ConflictSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';
type OccDecision = 'PENDING' | 'APPROVED' | 'REJECTED';
type ProposedAction =
  | 'REASSIGN_AIRCRAFT'
  | 'SHIFT_FLIGHT'
  | 'CANCEL_FLIGHT'
  | 'KEEP_CURRENT'
  | 'MANUAL_REVIEW'
  | string;

interface ConflictProposal {
  action: ProposedAction;
  description: string;
  targetAircraftId?: string | null;
  targetAircraftRegistration?: string | null;
  proposedDeparture?: string | null;
  proposedArrival?: string | null;
  requiresOccApproval?: boolean;
}

interface ConflictFlightRef {
  id: string;
  numeroVol: string;
  aeroportDepart: string;
  aeroportArrivee: string;
  heureDepart?: string | null;
  heureArrivee?: string | null;
  statut?: string;
  avionId?: string | null;
  aircraftRegistration?: string | null;
}

interface FlightConflict {
  id: string;
  type: string;
  severity: ConflictSeverity;
  probability: number;
  detector?: string;
  aircraftId?: string | null;
  aircraftRegistration?: string | null;
  flightA: ConflictFlightRef;
  flightB?: ConflictFlightRef | null;
  overlapMinutes?: number;
  gapMinutes?: number | null;
  reason: string;
  recommendation: string;
  proposal?: ConflictProposal | null;
  occDecision?: OccDecision;
  decision?: OccDecision;
}

interface ConflictDetectionResult {
  timestamp: string;
  totalConflicts: number;
  criticalConflicts: number;
  highConflicts: number;
  mediumConflicts: number;
  conflicts: FlightConflict[];
  model?: {
    algorithm?: string;
    version?: string;
    externalDependencies?: string[];
  };
}

type TabKey = 'all' | 'pending' | 'approved' | 'rejected';

const ITEMS_PER_PAGE = 8;

// ═══════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ═══════════════════════════════════════════════════════════════

const SURFACE = 'rounded-xl border border-slate-200 bg-white';

const BTN_PRIMARY =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50';

const BTN_SECONDARY =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';

const BADGE =
  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium';

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════

const CONFLICT_SEVERITY = {
  CRITICAL: {
    label: 'Critique',
    className: 'bg-rose-50 text-rose-700',
    dot: 'bg-rose-500',
  },
  HIGH: {
    label: 'Élevé',
    className: 'bg-orange-50 text-orange-700',
    dot: 'bg-orange-500',
  },
  MEDIUM: {
    label: 'Modéré',
    className: 'bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
  },
} satisfies Record<
  ConflictSeverity,
  { label: string; className: string; dot: string }
>;

const CONFLICT_TYPE_LABELS: Record<string, string> = {
  AIRCRAFT_UNAVAILABLE: 'Appareil indisponible',
  AIRCRAFT_OVERLAP: 'Chevauchement appareil',
  TURNAROUND_TOO_SHORT: 'Rotation trop courte',
  AIRCRAFT_POSITIONING: 'Positionnement appareil',
  AIRCRAFT_MAINTENANCE: 'Conflit maintenance',
  MAINTENANCE_DUE: 'Maintenance requise',
  CREW_OVERLAP: 'Chevauchement équipage',
  CREW_REST: 'Repos équipage insuffisant',
  UNASSIGNED_AIRCRAFT: 'Appareil non assigné',
  ML_CONFLICT_RISK: 'Risque prédictif ML',
};

const PROPOSAL_LABELS: Record<string, string> = {
  REASSIGN_AIRCRAFT: 'Réaffecter l’appareil',
  SHIFT_FLIGHT: 'Décaler le vol',
  CANCEL_FLIGHT: 'Annuler le vol',
  KEEP_CURRENT: 'Conserver le planning',
  MANUAL_REVIEW: 'Analyse manuelle',
};

const getConflictTypeLabel = (type: string) =>
  CONFLICT_TYPE_LABELS[type] || type;

const getProposalActionLabel = (action?: string) =>
  action ? PROPOSAL_LABELS[action] || action : 'Proposition OCC';

// ═══════════════════════════════════════════════════════════════
// COMPOSANT PRINCIPAL
// ═══════════════════════════════════════════════════════════════

export const FlightOptimizationDashboard: React.FC = () => {
  const [conflictResult, setConflictResult] =
    useState<ConflictDetectionResult | null>(null);
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [lastConflictScanAt, setLastConflictScanAt] =
    useState<Date | null>(null);
  const [occDecisions, setOccDecisions] = useState<
    Record<string, OccDecision>
  >({});
  const [processingConflictId, setProcessingConflictId] =
    useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const loadConflicts = async (silent = false) => {
    try {
      setLoadingConflicts(true);
      if (!silent) setConflictError(null);

      const response = await fetch(`${ML_API_BASE_URL}/flights/conflicts`, {
        headers: { Accept: 'application/json' },
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.message ||
            `Erreur détection conflits HTTP ${response.status}`,
        );
      }

      const result = data as ConflictDetectionResult;
      setConflictResult(result);

      setOccDecisions(current => {
        const next = { ...current };
        for (const conflict of result.conflicts || []) {
          const backendDecision =
            conflict.occDecision || conflict.decision;
          if (backendDecision) {
            next[conflict.id] = backendDecision;
          } else if (!next[conflict.id]) {
            next[conflict.id] = 'PENDING';
          }
        }
        return next;
      });

      setLastConflictScanAt(new Date());
      setConflictError(null);
    } catch (err: any) {
      console.error('Erreur détection conflits :', err);
      if (!silent) {
        setConflictError(
          err?.message ||
            'Impossible de détecter les conflits de vols.',
        );
      }
    } finally {
      setLoadingConflicts(false);
    }
  };

  const submitOccDecision = async (
    conflict: FlightConflict,
    decision: Exclude<OccDecision, 'PENDING'>,
  ) => {
    const proposal = conflict.proposal;

    if (
      decision === 'APPROVED' &&
      proposal &&
      ['SHIFT_FLIGHT', 'CANCEL_FLIGHT'].includes(proposal.action)
    ) {
      const confirmed = window.confirm(
        proposal.action === 'CANCEL_FLIGHT'
          ? 'Confirmer la validation OCC de cette proposition d’annulation ?'
          : 'Confirmer la validation OCC de ce décalage de vol ?',
      );
      if (!confirmed) return;
    }

    try {
      setProcessingConflictId(conflict.id);
      setConflictError(null);

      const response = await fetch(
        `${ML_API_BASE_URL}/flights/conflicts/${encodeURIComponent(
          conflict.id,
        )}/decision`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ decision, source: 'OCC_UI' }),
        },
      );

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.message ||
            `Erreur validation OCC HTTP ${response.status}`,
        );
      }

      setOccDecisions(current => ({
        ...current,
        [conflict.id]: decision,
      }));

      await loadConflicts(true);
    } catch (err: any) {
      console.error('Erreur validation OCC :', err);
      setConflictError(
        err?.message ||
          'Impossible d’enregistrer la décision OCC.',
      );
    } finally {
      setProcessingConflictId(null);
    }
  };

  useEffect(() => {
    void loadConflicts(true);
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') {
        void loadConflicts(true);
      }
    };

    const intervalId = window.setInterval(tick, 60_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener(
        'visibilitychange',
        onVisibilityChange,
      );
    };
  }, []);

  const conflicts = useMemo(
    () => conflictResult?.conflicts ?? [],
    [conflictResult],
  );

  const conflictCount = conflictResult?.totalConflicts ?? 0;

  const getOccDecision = (conflict: FlightConflict): OccDecision =>
    occDecisions[conflict.id] ||
    conflict.occDecision ||
    conflict.decision ||
    'PENDING';

  const pendingCount = useMemo(
    () => conflicts.filter(c => getOccDecision(c) === 'PENDING').length,
    [conflicts, occDecisions],
  );
  const approvedCount = useMemo(
    () => conflicts.filter(c => getOccDecision(c) === 'APPROVED').length,
    [conflicts, occDecisions],
  );
  const rejectedCount = useMemo(
    () => conflicts.filter(c => getOccDecision(c) === 'REJECTED').length,
    [conflicts, occDecisions],
  );

  const filteredConflicts = useMemo(() => {
    let result = [...conflicts];

    if (activeTab === 'pending') {
      result = result.filter(c => getOccDecision(c) === 'PENDING');
    } else if (activeTab === 'approved') {
      result = result.filter(c => getOccDecision(c) === 'APPROVED');
    } else if (activeTab === 'rejected') {
      result = result.filter(c => getOccDecision(c) === 'REJECTED');
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(c => {
        const numeroA = c.flightA?.numeroVol?.toLowerCase() || '';
        const numeroB = c.flightB?.numeroVol?.toLowerCase() || '';
        const reg = c.aircraftRegistration?.toLowerCase() || '';
        const type = getConflictTypeLabel(c.type).toLowerCase();
        return (
          numeroA.includes(q) ||
          numeroB.includes(q) ||
          reg.includes(q) ||
          type.includes(q)
        );
      });
    }

    const severityOrder: Record<ConflictSeverity, number> = {
      CRITICAL: 0,
      HIGH: 1,
      MEDIUM: 2,
    };
    result.sort((a, b) => {
      const sa = severityOrder[a.severity];
      const sb = severityOrder[b.severity];
      if (sa !== sb) return sa - sb;
      return (b.probability || 0) - (a.probability || 0);
    });

    return result;
  }, [conflicts, activeTab, searchQuery, occDecisions]);

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
  }, [activeTab, searchQuery]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleExpand = (id: string) => {
    setExpandedId(current => (current === id ? null : id));
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
        {/* ═══════════════ ACTIONS RAPIDES ═══════════════ */}
        <div className="flex items-center justify-end gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-500 sm:inline-flex">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            Sync 60s
          </span>
          <button
            type="button"
            onClick={() => void loadConflicts(false)}
            disabled={loadingConflicts}
            className={BTN_SECONDARY}
          >
            <RefreshCw
              className={`h-4 w-4 ${
                loadingConflicts ? 'animate-spin' : ''
              }`}
            />
            Actualiser
          </button>
          <button
            type="button"
            onClick={() => void loadConflicts(false)}
            disabled={loadingConflicts}
            className={BTN_PRIMARY}
          >
            <Sparkles className="h-4 w-4" />
            Analyser
          </button>
        </div>

        {/* ═══════════════ KPI ═══════════════ */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            icon={<Layers className="h-4 w-4" />}
            label="Conflits détectés"
            value={conflictCount}
            hint={
              conflictResult
                ? `dont ${conflictResult.criticalConflicts} critique(s)`
                : 'Aucune analyse récente'
            }
          />
          <KpiCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Critiques"
            value={conflictResult?.criticalConflicts ?? 0}
            hint="Priorité maximale"
          />
          <KpiCard
            icon={<Clock className="h-4 w-4" />}
            label="En attente OCC"
            value={pendingCount}
            hint="Validation requise"
          />
          <KpiCard
            icon={<CheckCircle2 className="h-4 w-4" />}
            label="Dernière analyse"
            value={
              lastConflictScanAt
                ? lastConflictScanAt.toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—'
            }
            hint="Mise à jour automatique"
            compact
          />
        </section>

        {/* ═══════════════ ERREUR ═══════════════ */}
        {conflictError && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="flex-1 text-xs leading-5 text-amber-800">
              {conflictError}
            </p>
            <button
              type="button"
              onClick={() => setConflictError(null)}
              className="rounded-md p-1 text-amber-600 transition hover:bg-amber-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* ═══════════════ CARTE PRINCIPALE ═══════════════ */}
        <section className={SURFACE}>
          {/* TOOLBAR : recherche arrondie + filtres pills */}
          <div className="flex flex-col gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:px-6">
            <div className="relative w-full lg:max-w-md">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher un vol, appareil..."
                className="h-11 w-full rounded-full border border-slate-200 bg-white pl-11 pr-10 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Effacer la recherche"
                  className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Filter className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="whitespace-nowrap">Filtrer :</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <PillButton
                  active={activeTab === 'all'}
                  onClick={() => setActiveTab('all')}
                  label="Tous"
                  count={conflictCount}
                />
                <PillButton
                  active={activeTab === 'pending'}
                  onClick={() => setActiveTab('pending')}
                  label="En attente"
                  count={pendingCount}
                />
                <PillButton
                  active={activeTab === 'approved'}
                  onClick={() => setActiveTab('approved')}
                  label="Validés"
                  count={approvedCount}
                />
                <PillButton
                  active={activeTab === 'rejected'}
                  onClick={() => setActiveTab('rejected')}
                  label="Rejetés"
                  count={rejectedCount}
                />
              </div>
            </div>
          </div>

          {/* CONTENU */}
          {loadingConflicts && !conflictResult ? (
            <div className="space-y-2 p-4 sm:p-6">
              {[1, 2, 3, 4, 5].map(item => (
                <div
                  key={item}
                  className="h-14 animate-pulse rounded-lg bg-slate-50"
                />
              ))}
            </div>
          ) : filteredConflicts.length === 0 ? (
            <EmptyState
              tab={activeTab}
              search={searchQuery}
              hasConflicts={conflictCount > 0}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="w-10 px-4 py-3 sm:px-6" />
                      <th className="px-3 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                        Sévérité
                      </th>
                      <th className="px-3 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                        Type
                      </th>
                      <th className="px-3 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                        Vols impliqués
                      </th>
                      <th className="px-3 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                        Appareil
                      </th>
                      <th className="px-3 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                        Confiance
                      </th>
                      <th className="px-3 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                        Proposition
                      </th>
                      <th className="px-3 py-3 text-[11px] font-medium uppercase tracking-wider text-slate-500">
                        Décision
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedConflicts.map(conflict => {
                      const decision = getOccDecision(conflict);
                      const isExpanded = expandedId === conflict.id;
                      const probability = Math.min(
                        100,
                        Math.max(
                          0,
                          Math.round((conflict.probability || 0) * 100),
                        ),
                      );
                      const severityVisual =
                        CONFLICT_SEVERITY[conflict.severity];

                      return (
                        <React.Fragment key={conflict.id}>
                          <tr
                            onClick={() => toggleExpand(conflict.id)}
                            className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50/60"
                          >
                            <td className="px-4 py-3.5 sm:px-6">
                              <ChevronDown
                                className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            </td>

                            <td className="px-3 py-3.5">
                              <span
                                className={`${BADGE} ${severityVisual.className}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${severityVisual.dot}`}
                                />
                                {severityVisual.label}
                              </span>
                            </td>

                            <td className="px-3 py-3.5">
                              <span className="text-xs font-medium text-slate-800">
                                {getConflictTypeLabel(conflict.type)}
                              </span>
                            </td>

                            <td className="px-3 py-3.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                                  {conflict.flightA.numeroVol}
                                </span>
                                {conflict.flightB && (
                                  <>
                                    <ArrowRight className="h-3 w-3 text-slate-300" />
                                    <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                                      {conflict.flightB.numeroVol}
                                    </span>
                                  </>
                                )}
                              </div>
                              <p className="mt-1 font-mono text-[10px] text-slate-400">
                                {conflict.flightA.aeroportDepart}
                                <span className="mx-1">→</span>
                                {conflict.flightA.aeroportArrivee}
                              </p>
                            </td>

                            <td className="px-3 py-3.5">
                              {conflict.aircraftRegistration ? (
                                <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-700">
                                  <Plane className="h-3 w-3" />
                                  {conflict.aircraftRegistration}
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400">
                                  —
                                </span>
                              )}
                            </td>

                            <td className="px-3 py-3.5">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full rounded-full bg-slate-500 transition-all"
                                    style={{ width: `${probability}%` }}
                                  />
                                </div>
                                <span className="font-mono text-[11px] font-semibold tabular-nums text-slate-600">
                                  {probability}%
                                </span>
                              </div>
                            </td>

                            <td className="px-3 py-3.5">
                              {conflict.proposal ? (
                                <span className="text-xs font-medium text-sky-700">
                                  {getProposalActionLabel(
                                    conflict.proposal.action,
                                  )}
                                </span>
                              ) : (
                                <span className="text-[11px] text-slate-400">
                                  Information
                                </span>
                              )}
                            </td>

                            <td className="px-3 py-3.5">
                              <DecisionBadge decision={decision} />
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="border-b border-slate-100 bg-slate-50/40">
                              <td colSpan={8} className="px-4 py-5 sm:px-6">
                                <div className="space-y-4">
                                  <div>
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                      Anomalie détectée
                                    </span>
                                    <p className="mt-1.5 text-sm leading-6 text-slate-700">
                                      {conflict.reason}
                                    </p>
                                  </div>

                                  {(conflict.overlapMinutes != null ||
                                    conflict.gapMinutes != null) && (
                                    <div className="flex flex-wrap gap-2">
                                      {conflict.overlapMinutes != null &&
                                        conflict.overlapMinutes > 0 && (
                                          <span className="rounded-md bg-rose-50 px-2.5 py-1 font-mono text-[11px] font-medium text-rose-700">
                                            Chevauchement :{' '}
                                            {Math.round(
                                              conflict.overlapMinutes,
                                            )}{' '}
                                            min
                                          </span>
                                        )}
                                      {conflict.gapMinutes != null && (
                                        <span className="rounded-md bg-slate-100 px-2.5 py-1 font-mono text-[11px] font-medium text-slate-600">
                                          Intervalle :{' '}
                                          {Math.round(
                                            conflict.gapMinutes,
                                          )}{' '}
                                          min
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/40 p-3.5">
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                                      <Sparkles className="h-3 w-3" />
                                      Recommandation
                                    </span>
                                    <p className="mt-1.5 text-sm leading-6 text-slate-700">
                                      {conflict.recommendation}
                                    </p>
                                  </div>

                                  {conflict.proposal && (
                                    <div className="rounded-lg border border-sky-200/70 bg-sky-50/40 p-3.5">
                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
                                          Proposition de résolution
                                        </span>
                                        <span className="w-fit rounded-md border border-sky-200 bg-white px-2.5 py-1 text-[11px] font-medium text-sky-700">
                                          {getProposalActionLabel(
                                            conflict.proposal.action,
                                          )}
                                        </span>
                                      </div>
                                      <p className="mt-2 text-sm leading-6 text-slate-700">
                                        {conflict.proposal.description}
                                      </p>
                                    </div>
                                  )}

                                  <div className="border-t border-slate-200 pt-4">
                                    {decision === 'APPROVED' ? (
                                      <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Validé par OCC
                                      </span>
                                    ) : decision === 'REJECTED' ? (
                                      <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
                                        <XCircle className="h-3.5 w-3.5" />
                                        Proposition rejetée
                                      </span>
                                    ) : conflict.proposal ? (
                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                                        <button
                                          type="button"
                                          onClick={e => {
                                            e.stopPropagation();
                                            void submitOccDecision(
                                              conflict,
                                              'REJECTED',
                                            );
                                          }}
                                          disabled={
                                            processingConflictId ===
                                            conflict.id
                                          }
                                          className={BTN_SECONDARY}
                                        >
                                          <XCircle className="h-3.5 w-3.5" />
                                          Rejeter
                                        </button>
                                        <button
                                          type="button"
                                          onClick={e => {
                                            e.stopPropagation();
                                            void submitOccDecision(
                                              conflict,
                                              'APPROVED',
                                            );
                                          }}
                                          disabled={
                                            processingConflictId ===
                                            conflict.id
                                          }
                                          className={BTN_PRIMARY}
                                        >
                                          {processingConflictId ===
                                          conflict.id ? (
                                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                          ) : (
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                          )}
                                          Valider OCC
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-500">
                                        Information uniquement — aucune
                                        action automatique.
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* PAGINATION */}
              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>Affichage</span>
                  <span className="inline-flex h-7 items-center rounded-md border border-slate-200 bg-white px-2 font-medium tabular-nums text-slate-700">
                    {ITEMS_PER_PAGE}
                  </span>
                  <span>
                    sur{' '}
                    <strong className="font-medium text-slate-700">
                      {filteredConflicts.length}
                    </strong>{' '}
                    résultat{filteredConflicts.length > 1 ? 's' : ''}
                  </span>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>

                    {Array.from({ length: totalPages }).map((_, i) => {
                      const p = i + 1;
                      const isActive = p === page;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPage(p)}
                          className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium transition ${
                            isActive
                              ? 'bg-emerald-600 text-white'
                              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {p}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() =>
                        setPage(p => Math.min(totalPages, p + 1))
                      }
                      disabled={page === totalPages}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS
// ═══════════════════════════════════════════════════════════════

function KpiCard({
  icon,
  label,
  value,
  hint,
  compact = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  hint: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-slate-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600">
          {icon}
        </span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p
        className={`mt-3 font-semibold tabular-nums tracking-tight text-slate-900 ${
          compact ? 'text-xl' : 'text-3xl'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

function PillButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-xs font-medium transition ${
        active
          ? 'bg-emerald-600 text-white shadow-sm'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      <span>{label}</span>
      {typeof count === 'number' && count > 0 && (
        <span
          className={`inline-flex min-w-4 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${
            active ? 'bg-white/20 text-white' : 'bg-white text-slate-700'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function DecisionBadge({ decision }: { decision: OccDecision }) {
  if (decision === 'APPROVED') {
    return (
      <span className={`${BADGE} bg-emerald-50 text-emerald-700`}>
        <CheckCircle2 className="h-3 w-3" />
        Validé
      </span>
    );
  }
  if (decision === 'REJECTED') {
    return (
      <span className={`${BADGE} bg-slate-100 text-slate-600`}>
        <XCircle className="h-3 w-3" />
        Rejeté
      </span>
    );
  }
  return (
    <span className={`${BADGE} bg-amber-50 text-amber-700`}>
      <Clock className="h-3 w-3" />
      En attente
    </span>
  );
}

function EmptyState({
  tab,
  search,
  hasConflicts,
}: {
  tab: TabKey;
  search: string;
  hasConflicts: boolean;
}) {
  let title = 'Aucun conflit détecté';
  let description =
    'Les vols actuellement planifiés respectent les contraintes analysées.';

  if (search) {
    title = 'Aucun résultat';
    description = 'Aucun conflit ne correspond à votre recherche.';
  } else if (tab === 'pending') {
    title = 'Aucune décision en attente';
    description = 'Toutes les propositions ont été traitées par l’OCC.';
  } else if (tab === 'approved') {
    title = 'Aucun conflit validé';
    description = 'Aucune décision OCC validée pour le moment.';
  } else if (tab === 'rejected') {
    title = 'Aucun conflit rejeté';
    description = 'Aucune proposition n’a été rejetée.';
  } else if (!hasConflicts) {
    description =
      'Lancez une analyse pour détecter d’éventuels conflits opérationnels.';
  }

  return (
    <div className="flex min-h-56 items-center justify-center p-8 text-center">
      <div>
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Sparkles className="h-5 w-5" />
        </div>
        <p className="mt-3 text-sm font-medium text-slate-700">{title}</p>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
      </div>
    </div>
  );
}

export default FlightOptimizationDashboard;