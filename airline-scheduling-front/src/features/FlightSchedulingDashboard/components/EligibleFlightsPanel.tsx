import type { FC } from 'react';
import { CheckSquare2, Route, Square } from 'lucide-react';
import { FLIGHT_DATE_TIME_FORMATTER } from '../config';
import type { EligibleFlight } from '../domain/scheduling';

interface EligibleFlightsPanelProps {
  flights: EligibleFlight[];
  totalCount: number;
  selectedIds: string[];
  horizonDays: number;
  onToggle: (flightId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}

export const EligibleFlightsPanel: FC<EligibleFlightsPanelProps> = ({
  flights,
  totalCount,
  selectedIds,
  horizonDays,
  onToggle,
  onSelectAll,
  onClear,
}) => (
  <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-950/[0.02]">
    <header className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
          <Route className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-950">Vols à intégrer au scénario</h3>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            {selectedIds.length} sélectionné{selectedIds.length > 1 ? 's' : ''} sur {totalCount} · horizon {horizonDays} jours
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSelectAll}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
        >
          <CheckSquare2 className="h-3.5 w-3.5" /> Tout sélectionner
        </button>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/30"
        >
          <Square className="h-3.5 w-3.5" /> Effacer
        </button>
      </div>
    </header>

    {totalCount === 0 ? (
      <p className="px-5 py-8 text-center text-sm text-slate-500">
        Aucun vol futur valide à programmer dans cet horizon.
      </p>
    ) : flights.length === 0 ? (
      <p className="px-5 py-8 text-center text-sm text-slate-500">
        Aucun vol éligible ne correspond à la recherche.
      </p>
    ) : (
      <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto [scrollbar-width:thin]">
        {flights.map((flight) => {
          const isSelected = selectedIds.includes(flight.id);
          return (
            <label
              key={flight.id}
              className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 px-4 py-3 transition sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-5 ${
                isSelected ? 'bg-sky-50/45' : 'hover:bg-slate-50/80'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(flight.id)}
                className="mt-0.5 h-4 w-4 accent-sky-600"
                aria-label={`Inclure le vol ${flight.flightNumber}`}
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <strong className="font-mono text-sm text-slate-950">{flight.flightNumber}</strong>
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                    {flight.origin} → {flight.destination}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-slate-500 sm:hidden">
                  {FLIGHT_DATE_TIME_FORMATTER.format(new Date(flight.departure))}
                </span>
              </span>
              <time className="hidden self-center text-xs font-medium tabular-nums text-slate-500 sm:block" dateTime={flight.departure}>
                {FLIGHT_DATE_TIME_FORMATTER.format(new Date(flight.departure))}
              </time>
            </label>
          );
        })}
      </div>
    )}
  </section>
);

export default EligibleFlightsPanel;
