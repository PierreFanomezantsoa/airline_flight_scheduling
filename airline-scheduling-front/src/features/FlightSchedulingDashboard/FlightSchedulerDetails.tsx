// src/features/FlightSchedulingDashboard/FlightSchedulerDetails.tsx

import type { FC } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

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
  status: string;
  aircraft?: string | null;
  aircraftModel?: string | null;
  weatherSeverity?: number | null;
  stopover?: string | string[] | null;
  stops?: string[];
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
 * SOUS-COMPOSANTS
 * ========================================================================== */

interface SmallValueProps {
  label: string;
  value: string | number;
}

const SmallValue: FC<SmallValueProps> = ({ label, value }) => {
  const stringValue = String(value);
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <span className="block truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <strong
        className="mt-1 block truncate text-sm font-semibold tabular-nums text-slate-800"
        title={stringValue}
      >
        {stringValue}
      </strong>
    </div>
  );
};

interface UnassignedFlightRowProps {
  item: AutoScheduleUnassigned;
}

const UnassignedFlightRow: FC<UnassignedFlightRowProps> = ({ item }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
    <div className="min-w-0">
      <span className="font-mono text-xs font-semibold text-slate-900">
        {item.flightNumber || 'N/A'}
      </span>
      <span className="ml-2 font-mono text-[10px] text-slate-500">
        {item.origin || '—'} → {item.destination || '—'}
      </span>
    </div>
    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-700">
      {item.reason || 'Non affecté'}
    </span>
  </div>
);

/* ============================================================================
 * COMPOSANT PRINCIPAL
 * ========================================================================== */

const FlightSchedulerDetails: FC<FlightSchedulerDetailsProps> = ({
  previewScenario,
}) => {
  // Pas de scénario prévisualisé = rien à afficher
  if (!previewScenario) return null;

  const scenarioUnassigned = previewScenario.metrics.unassignedFlights ?? 0;
  const unassignedList = previewScenario.unassigned ?? [];
  const hasUnassigned = unassignedList.length > 0;

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      {/* ─────────── MÉTRIQUES DU GÉNÉRATEUR ─────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <header className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Résultat du générateur
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Statistiques du scénario prévisualisé
            </p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3">
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
            value={previewScenario.strategy ?? 'Deterministic greedy'}
          />
        </div>
      </div>

      {/* ─────────── VOLS NON AFFECTÉS ─────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <header className="mb-4 flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              scenarioUnassigned > 0
                ? 'bg-amber-50 text-amber-600'
                : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            {scenarioUnassigned > 0 ? (
              <AlertTriangle className="h-4 w-4" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900">
              Vols non affectés
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {scenarioUnassigned > 0
                ? `${scenarioUnassigned} vol${scenarioUnassigned > 1 ? 's' : ''} à traiter`
                : 'Tous les vols ont reçu une affectation'}
            </p>
          </div>
        </header>

        {!hasUnassigned ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            <p className="text-xs font-medium text-slate-700">
              Aucun vol en attente d&apos;affectation dans ce scénario.
            </p>
          </div>
        ) : (
          <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
            {unassignedList.map((item, index) => (
              <UnassignedFlightRow
                key={`${item.flightId}-${index}`}
                item={item}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default FlightSchedulerDetails;