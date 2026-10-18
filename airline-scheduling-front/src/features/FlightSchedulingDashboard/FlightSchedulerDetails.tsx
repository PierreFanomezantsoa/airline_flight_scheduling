// src/features/FlightSchedulingDashboard/FlightSchedulerDetails.tsx
import type { FC } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export interface Flight {
  refFlight: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  localDeparture?: string | null;
  localArrival?: string | null;
  durationMinutes?: number | null;
  flightStatus: string;
  aircraft?: string | null;
  aircraftModel?: string | null;
  weatherSeverity?: number | null;
  stopover?: string | string[] | null;
  stopoverMins?: number | null;
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
  refFlight: string;
  flightNumber?: string | null;
  origin?: string | null;
  destination?: string | null;
  departure?: string;
  arrival?: string;
  reason?: string;
}

export interface AutoScheduleResponse {
  flightStatus: string;
  message?: string;
  generatedAt?: string;
  strategy?: string;
  scenarioSignature?: string;
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

const FlightSchedulerDetails: FC<FlightSchedulerDetailsProps> = ({ previewScenario }) => {
  if (!previewScenario) return null;

  const unassignedList = previewScenario.unassigned ?? [];
  const unassignedCount = previewScenario.metrics.unassignedFlights ?? 0;

  return (
    <section className="p-4 sm:p-5" aria-label="Vols non affectés du scénario">
      <header className="mb-4 flex items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
          unassignedCount > 0
            ? 'bg-amber-50 text-amber-600'
            : 'bg-emerald-50 text-emerald-600'
        }`}>
          {unassignedCount > 0 ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">Vols non affectés</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {unassignedCount > 0
              ? `${unassignedCount} vol${unassignedCount > 1 ? 's' : ''} à traiter`
              : 'Tous les vols ont reçu une affectation'}
          </p>
        </div>
      </header>

      {unassignedList.length === 0 ? (
        <div className={`flex items-center gap-2 rounded-xl border px-4 py-3 ${
          unassignedCount > 0
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-emerald-100 bg-emerald-50/50 text-slate-700'
        }`}>
          {unassignedCount > 0
            ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
          <p className="text-xs font-medium">
            {unassignedCount > 0
              ? 'Certains vols restent sans affectation, mais leur détail n’est pas disponible.'
              : 'Aucun vol en attente d’affectation dans ce scénario.'}
          </p>
        </div>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {unassignedList.map((item, index) => (
            <div key={`${item.refFlight}-${index}`} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="font-mono text-xs font-semibold text-slate-900">{item.flightNumber || 'N° non renseigné'}</span>
                <span className="ml-2 text-xs text-slate-500">{item.origin || '—'} → {item.destination || '—'}</span>
              </div>
              <span className="max-w-full self-start rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 sm:self-auto">
                {item.reason || 'Affectation requise'}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default FlightSchedulerDetails;
