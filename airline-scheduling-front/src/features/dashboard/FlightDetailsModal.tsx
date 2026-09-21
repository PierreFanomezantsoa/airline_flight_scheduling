import { useEffect, useId } from 'react';
import type { FC, ReactNode } from 'react';

import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  Plane,
  Sparkles,
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

const LABEL_UPPER =
  'text-[10px] font-semibold uppercase tracking-wider text-slate-500';

const FOCUS_RING =
  'outline-none transition focus:ring-4 focus:ring-emerald-500/10';

/**
 * Bande d'accent colorée en haut de la modale selon le statut.
 * Le fallback `slate-300` évite `undefined` si un nouveau statut apparaît.
 */
const STATUS_BAR_CLASSES: Record<FlightStatus, string> = {
  Scheduled: 'bg-emerald-500',
  Delayed: 'bg-amber-500',
  Cancelled: 'bg-rose-500',
  'In-Flight': 'bg-sky-500',
  Effectué: 'bg-slate-400',
};

/* ========================================================================== */
/* HELPERS                                                                    */
/* ========================================================================== */

const normalizeSeverity = (value?: number | null): number =>
  Math.min(1, Math.max(0, Number(value ?? 0)));

/**
 * Classe Tailwind de la jauge météo selon le niveau de sévérité.
 */
const getSeverityBarClass = (value: number): string => {
  if (value >= 0.8) return 'bg-rose-500';
  if (value >= 0.7) return 'bg-orange-500';
  if (value >= 0.4) return 'bg-amber-500';
  return 'bg-emerald-500';
};

/* ========================================================================== */
/* SOUS-COMPOSANTS                                                            */
/* ========================================================================== */

const StatusBadge: FC<{ style: StatusStyle }> = ({ style }) => (
  <span
    className={`inline-flex h-6 items-center gap-1.5 rounded-md border bg-white px-2 text-[10px] font-semibold ${style.badge}`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
    {style.label}
  </span>
);

interface SectionTitleProps {
  icon: ReactNode;
  title: string;
  hint?: string;
  tone?: 'emerald' | 'sky' | 'slate';
  rightSlot?: ReactNode;
}

const SectionTitle: FC<SectionTitleProps> = ({
  icon,
  title,
  hint,
  tone = 'emerald',
  rightSlot,
}) => {
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

export const FlightDetailsModal: FC<FlightDetailsModalProps> = ({
  selectedFlight,
  onClose,
  statusStyles,
  formatDateTime,
  formatLocalIso,
  formatDuration,
  displayRoute,
  getWeatherIndicator,
}) => {
  // Identifiant stable pour lier le dialog à son titre (a11y)
  const titleId = useId();

  /* ------------------------------------------------------------------------
   * BODY LOCK + ESCAPE
   * ---------------------------------------------------------------------- */

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

  /* ------------------------------------------------------------------------
   * DERIVED VALUES
   * ---------------------------------------------------------------------- */

  const statusStyle =
    statusStyles[selectedFlight.status] ?? statusStyles.Scheduled;

  const weather = getWeatherIndicator(selectedFlight.weatherSeverity);
  const isUnassigned = selectedFlight.aircraft === UNASSIGNED_AIRCRAFT;
  const severityValue = normalizeSeverity(selectedFlight.weatherSeverity);
  const severityPct = Math.round(severityValue * 100);

  const isInFlight = selectedFlight.status === 'In-Flight';
  const isCancelled = selectedFlight.status === 'Cancelled';
  const isDone = selectedFlight.status === 'Effectué';

  const statusBarClass =
    STATUS_BAR_CLASSES[selectedFlight.status] ?? 'bg-slate-300';

  // Narrowing sans `!` — évite l'assertion non-null
  const legs = selectedFlight.legs ?? [];
  const hasLegs = legs.length > 0;

  const isSevere = severityValue >= 0.7;
  const isUnstable = severityValue >= 0.4;

  const weatherTone: 'emerald' | 'sky' = isUnstable ? 'sky' : 'emerald';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={(event) => {
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
        <header className="relative flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-5 pb-3.5 pt-4">
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
              <h3
                id={titleId}
                className="mt-0.5 truncate font-mono text-base font-bold tracking-wide text-slate-900 sm:text-lg"
              >
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

        {/* ═══════════════ CONTENU ═══════════════ */}
        <div className="flex-1 overflow-y-auto overscroll-contain bg-white px-5 py-4 sm:overflow-visible">
          {/* ─────────── HERO ROUTE ─────────── */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div
              className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-slate-100/60"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-slate-100/40"
              aria-hidden
            />

            <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              {/* Origine */}
              <div>
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                  <MapPin className="h-2.5 w-2.5" />
                  Origine
                </span>
                <strong className="mt-1.5 block font-mono text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  {selectedFlight.origin}
                </strong>
                <p className="mt-1 font-mono text-[11px] text-slate-700">
                  {formatLocalIso(
                    selectedFlight.localDeparture || selectedFlight.departure,
                  )}
                </p>
                <p className="mt-0.5 font-mono text-[9px] text-slate-400">
                  {formatDateTime(selectedFlight.departure)}
                </p>
              </div>

              {/* Connecteur */}
              <div className="flex flex-col items-center gap-1">
                <div className="h-px w-5 bg-slate-200" />
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500">
                  <Plane className="h-3 w-3 rotate-90" />
                </div>
                <div className="h-px w-5 bg-slate-200" />
              </div>

              {/* Destination */}
              <div className="text-right">
                <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                  Destination
                  <MapPin className="h-2.5 w-2.5" />
                </span>
                <strong className="mt-1.5 block font-mono text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  {selectedFlight.destination}
                </strong>
                <p className="mt-1 font-mono text-[11px] text-slate-700">
                  {formatLocalIso(
                    selectedFlight.localArrival || selectedFlight.arrival,
                  )}
                </p>
                <p className="mt-0.5 font-mono text-[9px] text-slate-400">
                  {formatDateTime(selectedFlight.arrival)}
                </p>
              </div>
            </div>

            {/* Route + durée */}
            <div className="relative mt-3 flex items-center justify-between gap-3 border-t border-slate-200 pt-2.5">
              <span className="truncate font-mono text-[10px] font-medium text-slate-500">
                {displayRoute(selectedFlight)}
              </span>
              {selectedFlight.durationMinutes != null && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700">
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
                  <span className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sky-700">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                    Live
                  </span>
                )}
              </div>
            </div>

            <div
              className={`${SURFACE_INNER} p-3 ${
                isUnassigned ? 'border-rose-200 bg-white' : ''
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

          {/* ─────────── MÉTÉO ─────────── */}
          <section className={`${SURFACE_INNER} mt-3 p-3.5`}>
            <SectionTitle
              icon={weather.icon}
              title="Météo opérationnelle"
              hint={`Indice : ${severityValue.toFixed(2)} / 1.00`}
              tone={weatherTone}
              rightSlot={
                <span
                  className={`inline-flex h-6 items-center gap-1.5 rounded-md border bg-white px-2 text-[10px] font-semibold ${weather.badge}`}
                >
                  {weather.label}
                </span>
              }
            />

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
                    className={`h-full rounded-full transition-all duration-500 ${getSeverityBarClass(
                      severityValue,
                    )}`}
                    style={{ width: `${Math.max(4, severityPct)}%` }}
                  />
                </div>
              </div>

              <div
                className={`flex items-start gap-2 rounded-lg border bg-white p-2.5 ${
                  isSevere
                    ? 'border-rose-200'
                    : isUnstable
                      ? 'border-amber-200'
                      : 'border-emerald-200'
                }`}
              >
                {isSevere ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                ) : isUnstable ? (
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                )}
                <p
                  className={`text-[10px] font-medium leading-4 ${
                    isSevere
                      ? 'text-rose-800'
                      : isUnstable
                        ? 'text-amber-800'
                        : 'text-emerald-800'
                  }`}
                >
                  {weather.recommendation}
                </p>
              </div>
            </div>
          </section>

          {/* ─────────── TRONÇONS ─────────── */}
          {hasLegs && (
            <section className={`${SURFACE_INNER} mt-3 p-3.5`}>
              <SectionTitle
                icon={<Sparkles className="h-4 w-4" />}
                title="Tronçons du vol"
                tone="emerald"
                rightSlot={
                  <span className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {legs.length}
                  </span>
                }
              />

              <ol className="relative space-y-2 pl-5">
                <span
                  className="absolute bottom-1.5 left-1.5 top-1.5 w-px bg-slate-200"
                  aria-hidden
                />

                {legs.map((leg, index) => (
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

                    <div className={`${SURFACE_INNER} px-2.5 py-2`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded border border-emerald-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700">
                          {leg.aeroportDepart}
                        </span>

                        <div className="flex flex-1 items-center gap-1 px-2">
                          <div className="h-px flex-1 bg-slate-200" />
                          <Plane className="h-2.5 w-2.5 text-slate-400" />
                          <div className="h-px flex-1 bg-slate-200" />
                        </div>

                        <span className="rounded border border-sky-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-sky-700">
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
        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 py-3">
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