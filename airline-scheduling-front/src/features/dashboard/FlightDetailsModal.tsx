import React, { useEffect } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  CloudLightning,
  CloudRain,
  MapPin,
  Plane,
  Sparkles,
  Sun,
  Timer,
  X,
} from 'lucide-react';

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
/* DESIGN TOKENS                                                              */
/* ========================================================================== */

const SURFACE_INNER = 'rounded-xl border border-slate-200 bg-white';
const SURFACE_INNER_SOFT = 'rounded-xl border border-slate-100 bg-slate-50/70';
const LABEL_UPPER =
  'text-[10px] font-semibold uppercase tracking-wider text-slate-500';
const FOCUS_RING =
  'outline-none transition focus:ring-4 focus:ring-emerald-500/10';

/* ========================================================================== */
/* HELPERS                                                                    */
/* ========================================================================== */

const normalizeSeverity = (value?: number | null) =>
  Math.min(1, Math.max(0, Number(value ?? 0)));

/* ========================================================================== */
/* SOUS-COMPOSANTS                                                            */
/* ========================================================================== */

const StatusBadge: React.FC<{ style: StatusStyle }> = ({ style }) => (
  <span
    className={`inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[10px] font-semibold ${style.badge}`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
    {style.label}
  </span>
);

const SectionTitle: React.FC<{
  icon: React.ReactNode;
  title: string;
  hint?: string;
  tone?: 'emerald' | 'sky' | 'slate';
  rightSlot?: React.ReactNode;
}> = ({ icon, title, hint, tone = 'emerald', rightSlot }) => {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    sky: 'bg-sky-50 text-sky-700',
    slate: 'bg-slate-100 text-slate-600',
  } as const;

  return (
    <header className="mb-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <h4 className="truncate text-xs font-semibold text-slate-900">
            {title}
          </h4>
          {hint && (
            <p className="mt-0.5 truncate text-[10px] text-slate-500">{hint}</p>
          )}
        </div>
      </div>
      {rightSlot}
    </header>
  );
};

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
      if (event.key === 'Escape') onClose();
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

  const weather = getWeatherIndicator(selectedFlight.weatherSeverity);
  const isUnassigned = selectedFlight.aircraft === UNASSIGNED_AIRCRAFT;
  const severityValue = normalizeSeverity(selectedFlight.weatherSeverity);
  const severityPct = Math.round(severityValue * 100);

  const isInFlight = selectedFlight.status === 'In-Flight';
  const isCancelled = selectedFlight.status === 'Cancelled';
  const isDone = selectedFlight.status === 'Effectué';

  const statusBarClass = {
    Scheduled: 'bg-emerald-500',
    Delayed: 'bg-amber-500',
    Cancelled: 'bg-rose-500',
    'In-Flight': 'bg-sky-500',
    Effectué: 'bg-slate-400',
  }[selectedFlight.status];

  const hasLegs = selectedFlight.legs && selectedFlight.legs.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Détails du vol ${selectedFlight.flightNumber}`}
      onMouseDown={event => {
        if (event.currentTarget === event.target) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div
        className="
          relative flex w-full max-w-[640px] flex-col overflow-hidden
          rounded-t-3xl border border-slate-200 bg-white
          shadow-2xl shadow-slate-950/20
          max-h-[95vh] sm:max-h-[92vh]
          sm:rounded-2xl
        "
      >
        {/* Bande d'accent */}
        <span
          className={`absolute inset-x-0 top-0 h-1 ${statusBarClass}`}
          aria-hidden
        />

        {/* ═══════════════ HEADER ═══════════════ */}
        <header className="relative flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 pb-3.5 pt-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                isInFlight
                  ? 'border-sky-200 bg-sky-50 text-sky-700'
                  : isCancelled
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : isDone
                      ? 'border-slate-200 bg-slate-100 text-slate-500'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
              }`}
            >
              <Plane className={`h-4 w-4 ${isInFlight ? 'rotate-45' : ''}`} />
            </div>

            <div className="min-w-0">
              <p className={LABEL_UPPER}>Fiche opérationnelle</p>
              <h3 className="mt-0.5 truncate font-mono text-base font-bold tracking-wide text-slate-900 sm:text-lg">
                {selectedFlight.flightNumber}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusBadge style={statusStyle} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 ${FOCUS_RING}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* ═══════════════ CONTENU (compact) ═══════════════ */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:overflow-visible">
          {/* ─────────── HERO ROUTE (absorbe les horaires) ─────────── */}
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-emerald-700 to-emerald-800 p-4 text-white shadow-lg shadow-emerald-700/20">
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-400/10"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-emerald-400/5"
              aria-hidden
            />

            <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              {/* Origine */}
              <div>
                <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-50">
                  <MapPin className="h-2.5 w-2.5" />
                  Origine
                </span>
                <strong className="mt-1.5 block font-mono text-xl font-bold tracking-tight sm:text-2xl">
                  {selectedFlight.origin}
                </strong>
                <p className="mt-1 font-mono text-[11px] text-emerald-50">
                  {formatLocalIso(
                    selectedFlight.localDeparture || selectedFlight.departure,
                  )}
                </p>
                <p className="mt-0.5 font-mono text-[9px] text-emerald-100/70">
                  {formatDateTime(selectedFlight.departure)}
                </p>
              </div>

              {/* Connecteur */}
              <div className="flex flex-col items-center gap-1">
                <div className="h-px w-5 bg-emerald-300/50" />
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                  <Plane className="h-3 w-3 rotate-90" />
                </div>
                <div className="h-px w-5 bg-emerald-300/50" />
              </div>

              {/* Destination */}
              <div className="text-right">
                <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-50">
                  Destination
                  <MapPin className="h-2.5 w-2.5" />
                </span>
                <strong className="mt-1.5 block font-mono text-xl font-bold tracking-tight sm:text-2xl">
                  {selectedFlight.destination}
                </strong>
                <p className="mt-1 font-mono text-[11px] text-emerald-50">
                  {formatLocalIso(
                    selectedFlight.localArrival || selectedFlight.arrival,
                  )}
                </p>
                <p className="mt-0.5 font-mono text-[9px] text-emerald-100/70">
                  {formatDateTime(selectedFlight.arrival)}
                </p>
              </div>
            </div>

            {/* Route + durée */}
            <div className="relative mt-3 flex items-center justify-between gap-3 border-t border-emerald-600/60 pt-2.5">
              <span className="truncate font-mono text-[10px] font-medium text-emerald-50/90">
                {displayRoute(selectedFlight)}
              </span>
              {selectedFlight.durationMinutes != null && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-50">
                  <Timer className="h-3 w-3" />
                  {formatDuration(selectedFlight.durationMinutes)}
                </span>
              )}
            </div>
          </section>

          {/* ─────────── STATUT + APPAREIL ─────────── */}
          <section className="mt-3 grid grid-cols-2 gap-2.5">
            <div className={`${SURFACE_INNER} p-3`}>
              <p className={LABEL_UPPER}>Statut</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge style={statusStyle} />
                {isInFlight && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                    Live
                  </span>
                )}
              </div>
            </div>

            <div
              className={`${SURFACE_INNER} p-3 ${
                isUnassigned ? 'border-rose-200 bg-rose-50/50' : ''
              }`}
            >
              <p className={LABEL_UPPER}>Appareil</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Plane
                  className={`h-3.5 w-3.5 shrink-0 ${
                    isUnassigned ? 'text-rose-500' : 'text-slate-400'
                  }`}
                />
                <strong
                  className={`truncate font-mono text-xs font-bold ${
                    isUnassigned ? 'text-rose-700' : 'text-slate-900'
                  }`}
                >
                  {isUnassigned
                    ? 'Non assigné'
                    : selectedFlight.aircraftModel || selectedFlight.aircraft}
                </strong>
              </div>
            </div>
          </section>

          {/* ─────────── MÉTÉO (compacte, 2 colonnes) ─────────── */}
          <section className={`${SURFACE_INNER} mt-3 p-3.5`}>
            <SectionTitle
              icon={weather.icon}
              title="Météo opérationnelle"
              hint={`Indice : ${severityValue.toFixed(2)} / 1.00`}
              tone={severityValue >= 0.4 ? 'sky' : 'emerald'}
              rightSlot={
                <span
                  className={`inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[10px] font-semibold ${weather.badge}`}
                >
                  {weather.label}
                </span>
              }
            />

            {/* Jauge + reco sur la même ligne */}
            <div className="grid gap-2.5 sm:grid-cols-[1fr_1.4fr]">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-medium text-slate-500">
                  <span>Favorable</span>
                  <span className="font-mono font-bold text-slate-700">
                    {severityPct}%
                  </span>
                  <span>Extrême</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      severityValue >= 0.8
                        ? 'bg-rose-500'
                        : severityValue >= 0.7
                          ? 'bg-orange-500'
                          : severityValue >= 0.4
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.max(4, severityPct)}%` }}
                  />
                </div>
              </div>

              <div
                className={`flex items-start gap-2 rounded-lg border p-2.5 ${
                  severityValue >= 0.7
                    ? 'border-rose-100 bg-rose-50/50'
                    : severityValue >= 0.4
                      ? 'border-amber-100 bg-amber-50/50'
                      : 'border-emerald-100 bg-emerald-50/50'
                }`}
              >
                {severityValue >= 0.7 ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                ) : severityValue >= 0.4 ? (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                )}
                <p
                  className={`text-[10px] font-medium leading-4 ${
                    severityValue >= 0.7
                      ? 'text-rose-800'
                      : severityValue >= 0.4
                        ? 'text-amber-800'
                        : 'text-emerald-800'
                  }`}
                >
                  {weather.recommendation}
                </p>
              </div>
            </div>
          </section>

          {/* ─────────── TRONÇONS (compact) ─────────── */}
          {hasLegs && (
            <section className={`${SURFACE_INNER} mt-3 p-3.5`}>
              <SectionTitle
                icon={<Sparkles className="h-4 w-4" />}
                title="Tronçons du vol"
                tone="emerald"
                rightSlot={
                  <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {selectedFlight.legs!.length}
                  </span>
                }
              />

              <ol className="relative space-y-2 pl-5">
                <span
                  className="absolute bottom-1.5 left-1.5 top-1.5 w-px bg-slate-200"
                  aria-hidden
                />

                {selectedFlight.legs!.map((leg, index) => (
                  <li
                    key={`${leg.aeroportDepart}-${leg.aeroportArrivee}-${index}`}
                    className="relative"
                  >
                    <span
                      className="absolute -left-[14px] top-2.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-emerald-500 shadow-sm"
                      aria-hidden
                    >
                      <span className="h-1 w-1 rounded-full bg-white" />
                    </span>

                    <div className={`${SURFACE_INNER_SOFT} px-2.5 py-2`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700">
                          {leg.aeroportDepart}
                        </span>

                        <div className="flex flex-1 items-center gap-1 px-2">
                          <div className="h-px flex-1 bg-slate-200" />
                          <Plane className="h-2.5 w-2.5 text-slate-400" />
                          <div className="h-px flex-1 bg-slate-200" />
                        </div>

                        <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-700">
                          {leg.aeroportArrivee}
                        </span>
                      </div>

                      <div className="mt-1.5 flex items-center justify-between border-t border-slate-200/70 pt-1.5 text-[10px]">
                        <span className="inline-flex items-center gap-1 font-mono text-slate-500">
                          <Clock className="h-2.5 w-2.5" />
                          {formatDateTime(leg.heureDepart)}
                        </span>

                        <ArrowRight className="h-2.5 w-2.5 text-slate-300" />

                        <span className="inline-flex items-center gap-1 font-mono text-slate-500">
                          <Clock className="h-2.5 w-2.5" />
                          {formatDateTime(leg.heureArrivee)}
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        {/* ═══════════════ FOOTER ═══════════════ */}
        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
          <div className="hidden items-center gap-1.5 text-[10px] font-medium text-slate-500 sm:flex">
            <Calendar className="h-3 w-3" />
            {formatDateTime(selectedFlight.departure)}
          </div>

          <div className="flex flex-1 items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 ${FOCUS_RING}`}
            >
              Fermer
            </button>

            {isUnassigned && (
              <button
                type="button"
                onClick={onClose}
                className={`inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 ${FOCUS_RING}`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Affecter un appareil
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

export default FlightDetailsModal;