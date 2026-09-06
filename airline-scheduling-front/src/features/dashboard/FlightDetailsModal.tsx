import React, { useEffect } from 'react';
import { ArrowRight, Plane, Sparkles, Timer, X } from 'lucide-react';

import type {
  Flight,
  FlightStatus,
  StatusStyle,
  WeatherIndicator,
} from './PlannificationVol';

import { UNASSIGNED_AIRCRAFT } from './PlannificationVol';

/* ========================================================================== */
/* PROPS                                                                      */
/* ========================================================================== */

interface FlightDetailsModalProps {
  selectedFlight: Flight | null;
  onClose: () => void;
  statusStyles: Record<FlightStatus, StatusStyle>;
  formatDateTime: (dateString?: string | null) => string;
  formatLocalIso: (dateString?: string | null) => string;
  formatDuration: (minutes?: number | null) => string;
  displayRoute: (flight: Flight) => string;
  getWeatherIndicator: (severity: number) => WeatherIndicator;
}

/* ========================================================================== */
/* HELPERS                                                                    */
/* ========================================================================== */

const normalizeSeverity = (value?: number | null) =>
  Math.min(1, Math.max(0, Number(value ?? 0)));

const StatusBadge: React.FC<{ style: StatusStyle }> = ({ style }) => (
  <span
    className={`inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[9px] font-semibold ${style.badge}`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />

    {style.label}
  </span>
);

/* ========================================================================== */
/* COMPONENT                                                                  */
/* ========================================================================== */

export const FlightDetailsModal: React.FC<FlightDetailsModalProps> = ({
  selectedFlight,
  onClose,
  statusStyles,
  formatDateTime,
  formatLocalIso,
  formatDuration,
  displayRoute,
  getWeatherIndicator,
}) => {
  useEffect(() => {
    if (!selectedFlight) return;

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;

      window.removeEventListener('keydown', handleEscape);
    };
  }, [selectedFlight, onClose]);

  if (!selectedFlight) return null;

  const statusStyle =
    statusStyles[selectedFlight.status] ?? statusStyles.Scheduled;

  const weather = getWeatherIndicator(
    selectedFlight.weatherSeverity,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Détails du vol ${selectedFlight.flightNumber}`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[1px] sm:p-4"
    >
      <div className="max-h-[92vh] w-full max-w-[520px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
        {/* ================================================================ */}
        {/* HEADER                                                           */}
        {/* ================================================================ */}

        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <div className="min-w-0">
            <span className="block text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Fiche opérationnelle
            </span>

            <h3 className="mt-0.5 truncate font-mono text-base font-bold text-slate-900">
              {selectedFlight.flightNumber}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-2.5 p-3.5">
          {/* ================================================================ */}
          {/* ROUTE                                                            */}
          {/* ================================================================ */}

          <section className="overflow-hidden rounded-xl bg-emerald-700 px-4 py-3.5 text-white">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div>
                <span className="block text-[8px] font-semibold uppercase tracking-wide text-emerald-100">
                  Origine
                </span>

                <strong className="mt-1 block font-mono text-xl font-bold">
                  {selectedFlight.origin}
                </strong>
              </div>

              <div className="flex items-center">
                <div className="h-px w-4 bg-emerald-400/70" />

                <Plane className="mx-1.5 h-3.5 w-3.5 rotate-90" />

                <div className="h-px w-4 bg-emerald-400/70" />
              </div>

              <div className="text-right">
                <span className="block text-[8px] font-semibold uppercase tracking-wide text-emerald-100">
                  Destination
                </span>

                <strong className="mt-1 block font-mono text-xl font-bold">
                  {selectedFlight.destination}
                </strong>
              </div>
            </div>

            <div className="mt-2.5 border-t border-emerald-600 pt-2 text-center font-mono text-[9px] font-medium text-emerald-100">
              {displayRoute(selectedFlight)}
            </div>
          </section>

          {/* ================================================================ */}
          {/* STATUT / APPAREIL                                                */}
          {/* ================================================================ */}

          <section className="grid grid-cols-2 gap-2.5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <span className="block text-[8px] font-bold uppercase tracking-wide text-slate-400">
                Statut
              </span>

              <div className="mt-1.5">
                <StatusBadge style={statusStyle} />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <span className="block text-[8px] font-bold uppercase tracking-wide text-slate-400">
                Appareil
              </span>

              <strong className="mt-1.5 block truncate font-mono text-[11px] font-bold text-slate-800">
                {selectedFlight.aircraft === UNASSIGNED_AIRCRAFT
                  ? 'NON ASSIGNÉ'
                  : selectedFlight.aircraftModel}
              </strong>
            </div>
          </section>

          {/* ================================================================ */}
          {/* HORAIRES                                                         */}
          {/* ================================================================ */}

          <section className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5">
              <div>
                <span className="block text-[8px] font-semibold uppercase tracking-wide text-slate-400">
                  Départ local
                </span>

                <strong className="mt-1 block font-mono text-xs font-bold text-slate-900">
                  {formatLocalIso(
                    selectedFlight.localDeparture ||
                      selectedFlight.departure,
                  )}
                </strong>
              </div>

              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50">
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              </div>

              <div className="text-right">
                <span className="block text-[8px] font-semibold uppercase tracking-wide text-slate-400">
                  Arrivée locale
                </span>

                <strong className="mt-1 block font-mono text-xs font-bold text-slate-900">
                  {formatLocalIso(
                    selectedFlight.localArrival ||
                      selectedFlight.arrival,
                  )}
                </strong>
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2">
              <span className="inline-flex items-center gap-1.5 text-[9px] font-medium text-slate-400">
                <Timer className="h-3 w-3" />

                Durée du vol
              </span>

              <span className="font-mono text-[10px] font-bold text-slate-700">
                {formatDuration(
                  selectedFlight.durationMinutes,
                )}
              </span>
            </div>
          </section>

          {/* ================================================================ */}
          {/* MÉTÉO                                                            */}
          {/* ================================================================ */}

          <section className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="block text-[8px] font-bold uppercase tracking-wide text-slate-400">
                  Météo opérationnelle
                </span>

                <span className="mt-0.5 block font-mono text-[9px] text-slate-500">
                  Indice{' '}
                  {normalizeSeverity(
                    selectedFlight.weatherSeverity,
                  ).toFixed(2)}
                  /1.00
                </span>
              </div>

              <span
                className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-[9px] font-semibold ${weather.badge}`}
              >
                {weather.icon}

                {weather.label}
              </span>
            </div>

            <p className="mt-2 border-t border-slate-200 pt-2 text-[9px] font-medium leading-4 text-slate-600">
              {weather.recommendation}
            </p>
          </section>

          {/* ================================================================ */}
          {/* TRONÇONS                                                         */}
          {/* ================================================================ */}

          {selectedFlight.legs &&
            selectedFlight.legs.length > 0 && (
              <section className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50">
                      <Sparkles className="h-3.5 w-3.5 text-emerald-700" />
                    </div>

                    <div>
                      <h4 className="text-[10px] font-bold text-slate-700">
                        Tronçons
                      </h4>

                      <p className="text-[8px] text-slate-400">
                        Détail de l&apos;itinéraire
                      </p>
                    </div>
                  </div>

                  <span className="rounded-md bg-slate-100 px-2 py-1 text-[8px] font-semibold text-slate-500">
                    {selectedFlight.legs.length}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedFlight.legs.map(
                    (leg, index) => (
                      <div
                        key={`${leg.aeroportDepart}-${leg.aeroportArrivee}-${index}`}
                        className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2"
                      >
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                          <span className="font-mono text-[9px] font-bold text-slate-900">
                            {leg.aeroportDepart}
                          </span>

                          <ArrowRight className="h-3 w-3 text-slate-400" />

                          <span className="text-right font-mono text-[9px] font-bold text-slate-900">
                            {leg.aeroportArrivee}
                          </span>
                        </div>

                        <div className="mt-1.5 grid grid-cols-2 border-t border-slate-200 pt-1.5 font-mono text-[8px] text-slate-400">
                          <span>
                            {formatDateTime(
                              leg.heureDepart,
                            )}
                          </span>

                          <span className="text-right">
                            {formatDateTime(
                              leg.heureArrivee,
                            )}
                          </span>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </section>
            )}

          {/* ================================================================ */}
          {/* ACTION                                                           */}
          {/* ================================================================ */}

          <button
            type="button"
            onClick={onClose}
            className="h-9 w-full rounded-lg bg-emerald-700 text-[11px] font-semibold text-white transition hover:bg-emerald-800"
          >
            Fermer la fiche
          </button>
        </div>
      </div>
    </div>
  );
};

export default FlightDetailsModal;