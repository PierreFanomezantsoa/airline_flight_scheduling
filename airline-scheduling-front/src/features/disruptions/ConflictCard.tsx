import type { FC } from 'react';
import { ArrowRight, Sparkles, Plane } from 'lucide-react';
import type { MLConflict } from './DisruptionCenter';

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

/**
 * Formate un nombre de minutes en entier sûr (jamais NaN).
 */
function formatMinutes(value?: number | null): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${Math.round(numeric)} min`;
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

/**
 * Transforme un type de conflit en libellé lisible.
 * Pour les types inconnus, capitalise chaque mot.
 */
function getConflictTypeLabel(type: string): string {
  const normalized = normalizeText(type);
  switch (normalized) {
    case 'UNASSIGNED_AIRCRAFT': return 'Appareil non affecté';
    case 'AIRCRAFT_OVERLAP': return 'Chevauchement appareil';
    case 'TURNAROUND_TOO_SHORT': return 'Turnaround insuffisant';
    case 'AIRCRAFT_POSITIONING': return 'Positionnement incompatible';
    case 'ML_CONFLICT_RISK': return 'Risque de conflit ML';
    default:
      // Capitalise la 1ère lettre de chaque mot
      return String(type)
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
  }
}

function getDetectorLabel(detector: string): string {
  switch (normalizeText(detector)) {
    case 'DECISION_TREE': return 'Arbre de décision';
    case 'RULE': return 'Règle métier';
    default: return detector;
  }
}

function getDetectorStyle(detector: string): string {
  if (normalizeText(detector) === 'DECISION_TREE') {
    return 'border-violet-200 bg-violet-50 text-violet-700';
  }
  return 'border-sky-200 bg-sky-50 text-sky-700';
}

/* ============================================================
 * PROPS
 * ========================================================== */

interface ConflictCardProps {
  conflict: MLConflict;
}

interface FlightBadgeProps {
  flight?: {
    numeroVol?: string | null;
    aeroportDepart?: string | null;
    aeroportArrivee?: string | null;
  } | null;
}

interface MetricBoxProps {
  label: string;
  value: string;
  tone?: 'danger' | 'neutral';
}

/* ============================================================
 * SUB-COMPONENTS
 * ========================================================== */

const FlightBadge: FC<FlightBadgeProps> = ({ flight }) => (
  <div className="flex flex-col">
    <p className="font-mono text-sm font-black tracking-tight text-slate-900">
      {flight?.numeroVol || '--'}
    </p>
    <p className="mt-0.5 font-mono text-[10px] font-semibold text-slate-500">
      {flight?.aeroportDepart || '--'}
      <span className="mx-1 text-slate-300">→</span>
      {flight?.aeroportArrivee || '--'}
    </p>
  </div>
);

const MetricBox: FC<MetricBoxProps> = ({ label, value, tone = 'neutral' }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-3">
    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
      {label}
    </span>
    <p
      className={`mt-1 text-sm font-black tabular-nums ${
        tone === 'danger' ? 'text-rose-600' : 'text-slate-800'
      }`}
    >
      {value}
    </p>
  </div>
);

/* ============================================================
 * COMPONENT
 * ========================================================== */

const ConflictCard: FC<ConflictCardProps> = ({ conflict }) => {
  const probability = clampProbability(conflict.probability);

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow-md">
      {/* HEADER */}
      <div className="border-b border-slate-100 px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Plane className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-black leading-tight text-slate-900">
                  {getConflictTypeLabel(conflict.type)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${getSeverityStyle(
                      conflict.severity,
                    )}`}
                  >
                    {getSeverityLabel(conflict.severity)}
                  </span>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${getDetectorStyle(
                      conflict.detector,
                    )}`}
                  >
                    {getDetectorLabel(conflict.detector)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p
              className={`text-xl font-black tabular-nums leading-none ${getProbabilityStyle(
                probability,
              )}`}
            >
              {formatProbability(probability)}
            </p>
            <span className="mt-1 block text-[9px] font-bold uppercase tracking-wide text-slate-400">
              Risque
            </span>
          </div>
        </div>

        {/* PROBABILITY BAR */}
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${getProbabilityBarStyle(
              probability,
            )}`}
            style={{ width: `${probability * 100}%` }}
          />
        </div>
      </div>

      {/* BODY */}
      <div className="space-y-4 p-4">
        {/* ROTATION */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Rotation analysée
          </span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <FlightBadge flight={conflict.flightA} />
            {conflict.flightB && (
              <>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                <FlightBadge flight={conflict.flightB} />
              </>
            )}
          </div>
        </div>

        {/* AIRCRAFT */}
        {conflict.aircraftRegistration && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Appareil
            </span>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-black text-slate-800">
              {conflict.aircraftRegistration}
            </span>
          </div>
        )}

        {/* REASON */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Constat
          </span>
          <p className="mt-1.5 text-sm font-medium leading-6 text-slate-700">
            {conflict.reason}
          </p>
        </div>

        {/* METRICS */}
        {(conflict.overlapMinutes != null || conflict.gapMinutes != null) && (
          <div className="grid grid-cols-2 gap-2">
            {conflict.overlapMinutes != null && (
              <MetricBox
                label="Chevauchement"
                value={formatMinutes(conflict.overlapMinutes)}
                tone="danger"
              />
            )}
            {conflict.gapMinutes != null && (
              <MetricBox
                label="Intervalle"
                value={formatMinutes(conflict.gapMinutes)}
              />
            )}
          </div>
        )}

        {/* RECOMMENDATION */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <div>
              <span className="block text-[10px] font-black uppercase tracking-wide text-emerald-700">
                Recommandation OCC
              </span>
              <p className="mt-1 text-xs font-semibold leading-5 text-emerald-900">
                {conflict.recommendation}
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
};

export default ConflictCard;