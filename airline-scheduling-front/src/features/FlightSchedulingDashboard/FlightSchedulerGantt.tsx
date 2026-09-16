import React, { useMemo } from 'react';

import {
  BarChart3,
  MapPin,
  Plane,
} from 'lucide-react';

/* ============================================================================
 * TYPES
 * ========================================================================== */

export type FlightStatus =
  | 'Planifié'
  | 'En Vol'
  | 'Retardé'
  | 'Annulé'
  | 'Effectué';

export interface GanttRow {
  aircraftId: string;
  aircraftRegistration: string;
  capacity?: number | null;
  base?: string | null;
  currentPosition?: string | null;
  status?: string | null;
}

export interface GanttItem {
  id: string;
  flightId: string;
  flightNumber?: string | null;
  rowId: string;
  aircraftRegistration?: string | null;
  start: string;
  end: string;
  localStart?: string | null;
  localEnd?: string | null;
  origin?: string | null;
  destination?: string | null;
  durationMinutes?: number | null;
  label?: string | null;
  status?: string | null;
  shiftMinutes?: number;
}

export interface GanttPayload {
  timezone?: string;
  rows: GanttRow[];
  items: GanttItem[];
}

export interface AutoScheduleAssignment {
  flightId: string;
  flightNumber?: string | null;
  aircraftId: string;
  aircraftRegistration?: string | null;
  origin?: string | null;
  destination?: string | null;
  originalDeparture?: string;
  originalArrival?: string;
  departure: string;
  arrival: string;
  localDeparture?: string | null;
  localArrival?: string | null;
  durationMinutes?: number;
  shiftMinutes?: number;
  reason?: string;
}

interface FlightSchedulerGanttProps {
  schedule: GanttPayload;
  searchTerm: string;
  selectedStatus: string;
  isPreview: boolean;
  assignmentLookup: Map<string, AutoScheduleAssignment>;
}

/* ============================================================================
 * DESIGN TOKENS
 * ========================================================================== */

const SURFACE = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const FOCUS_RING =
  'outline-none transition focus:ring-4 focus:ring-emerald-500/10';

/* ============================================================================
 * STATUS
 * ========================================================================== */

interface StatusConfigItem {
  bg: string;
  border: string;
  text: string;
  dot: string;
  accent: string;
}

const STATUS_CONFIG: Record<FlightStatus, StatusConfigItem> = {
  Planifié: {
    bg: 'bg-blue-50 hover:bg-blue-100',
    border: 'border-blue-200 hover:border-blue-300',
    text: 'text-blue-900',
    dot: 'bg-blue-500',
    accent: 'bg-blue-500',
  },
  'En Vol': {
    bg: 'bg-amber-50 hover:bg-amber-100',
    border: 'border-amber-200 hover:border-amber-300',
    text: 'text-amber-900',
    dot: 'bg-amber-500 animate-pulse',
    accent: 'bg-amber-500',
  },
  Retardé: {
    bg: 'bg-orange-50 hover:bg-orange-100',
    border: 'border-orange-200 hover:border-orange-300',
    text: 'text-orange-900',
    dot: 'bg-orange-500',
    accent: 'bg-orange-500',
  },
  Annulé: {
    bg: 'bg-rose-50 hover:bg-rose-100',
    border: 'border-rose-200 hover:border-rose-300',
    text: 'text-rose-900',
    dot: 'bg-rose-500',
    accent: 'bg-rose-500',
  },
  Effectué: {
    bg: 'bg-emerald-50 hover:bg-emerald-100',
    border: 'border-emerald-200 hover:border-emerald-300',
    text: 'text-emerald-900',
    dot: 'bg-emerald-500',
    accent: 'bg-emerald-500',
  },
};

const normalizeFlightStatus = (value?: string | null): FlightStatus => {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/_/g, ' ');
  if (['IN-FLIGHT', 'IN FLIGHT', 'EN VOL'].includes(normalized)) return 'En Vol';
  if (['DELAYED', 'RETARDÉ', 'RETARDE', 'SHIFTED'].includes(normalized))
    return 'Retardé';
  if (['CANCELLED', 'CANCELED', 'ANNULÉ', 'ANNULE'].includes(normalized))
    return 'Annulé';
  if (['EFFECTUÉ', 'EFFECTUE', 'DONE', 'COMPLETED', 'LANDED'].includes(normalized))
    return 'Effectué';
  return 'Planifié';
};

/* ============================================================================
 * DATE HELPERS
 * ========================================================================== */

const safeDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateTime = (value?: string | null): string => {
  const date = safeDate(value);
  if (!date) return '--';
  return date.toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

const formatUtcTick = (timestamp: number): string =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));

const formatUtcDay = (timestamp: number): string =>
  new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(timestamp));

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

const FlightSchedulerGantt: React.FC<FlightSchedulerGanttProps> = ({
  schedule,
  searchTerm,
  selectedStatus,
  isPreview,
  assignmentLookup,
}) => {
  const ganttData = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    const filteredItems = (schedule.items ?? []).filter(item => {
      const status = normalizeFlightStatus(item.status);
      const matchesStatus =
        selectedStatus === 'TOUS' || status === selectedStatus;

      const matchesSearch =
        !term ||
        [
          item.flightNumber,
          item.origin,
          item.destination,
          item.aircraftRegistration,
          item.label,
        ]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(term));

      return matchesStatus && matchesSearch;
    });

    const itemsByRow = new Map<string, GanttItem[]>();
    filteredItems.forEach(item => {
      const rowItems = itemsByRow.get(item.rowId) ?? [];
      rowItems.push(item);
      itemsByRow.set(item.rowId, rowItems);
    });

    const rows = schedule.rows
      .filter(row => itemsByRow.has(row.aircraftId))
      .map(row => ({
        ...row,
        items: itemsByRow.get(row.aircraftId) ?? [],
      }));

    const validItems = filteredItems.filter(item => {
      const start = safeDate(item.start);
      const end = safeDate(item.end);
      return Boolean(
        start && end && end.getTime() > start.getTime(),
      );
    });

    if (validItems.length === 0) {
      return {
        rows,
        minTime: 0,
        maxTime: 0,
        totalDuration: 1,
        hourTicks: [] as number[],
      };
    }

    const times = validItems.flatMap(item => [
      new Date(item.start).getTime(),
      new Date(item.end).getTime(),
    ]);

    const minDate = new Date(Math.min(...times));
    minDate.setUTCHours(0, 0, 0, 0);

    const maxDate = new Date(Math.max(...times));
    maxDate.setUTCHours(23, 59, 59, 999);

    const minTime = minDate.getTime();
    const maxTime = maxDate.getTime();
    const totalDuration = Math.max(1, maxTime - minTime);

    const durationDays = totalDuration / (24 * 3600 * 1000);

    let stepHours = 3;
    if (durationDays > 7) stepHours = 24;
    else if (durationDays > 3) stepHours = 12;
    else if (durationDays > 1) stepHours = 6;

    const stepMs = stepHours * 3600 * 1000;
    const hourTicks: number[] = [];
    for (let time = minTime; time <= maxTime; time += stepMs) {
      hourTicks.push(time);
    }

    return { rows, minTime, maxTime, totalDuration, hourTicks };
  }, [schedule, searchTerm, selectedStatus]);

  const stats = useMemo(() => {
    let total = 0;
    let shifted = 0;
    ganttData.rows.forEach(row => {
      row.items.forEach(item => {
        total += 1;
        const shift =
          item.shiftMinutes ??
          assignmentLookup.get(item.flightId)?.shiftMinutes ??
          0;
        if (shift > 0) shifted += 1;
      });
    });
    return { total, shifted, rows: ganttData.rows.length };
  }, [ganttData, assignmentLookup]);

  return (
    <section className={`${SURFACE} p-4 sm:p-5`}>
      {/* HEADER */}
      <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Programmation graphique
              </h2>
              {isPreview && (
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                  Prévisualisation
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {stats.total} vol{stats.total > 1 ? 's' : ''} · {stats.rows}{' '}
              appareil{stats.rows > 1 ? 's' : ''}
              {stats.shifted > 0 && ` · ${stats.shifted} décalé${stats.shifted > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <LegendDot className="bg-blue-500" label="Planifié" />
          <LegendDot className="bg-amber-500" label="En vol" />
          <LegendDot className="bg-orange-500" label="Retardé" />
          <LegendDot className="bg-emerald-500" label="Effectué" />
          <LegendDot className="bg-rose-500" label="Annulé" />
        </div>
      </div>

      {/* CONTENT */}
      {ganttData.rows.length === 0 ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">
            <Plane className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-slate-700">
            Aucun élément Gantt
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Ajustez la recherche ou les filtres de statut.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <div className="min-w-[1450px]">
            {/* TIME HEADER */}
            <div className="sticky top-0 z-30 flex border-b border-slate-200 bg-white/95 backdrop-blur">
              <div className="sticky left-0 z-40 flex w-64 shrink-0 items-center border-r border-slate-200 bg-slate-50/70 px-4 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Appareil / position
                </span>
              </div>

              <div className="relative h-11 flex-1 bg-white">
                {ganttData.hourTicks.map(tick => {
                  const left =
                    ((tick - ganttData.minTime) / ganttData.totalDuration) *
                    100;
                  return (
                    <div
                      key={tick}
                      className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center justify-center border-l border-slate-100 pl-2"
                      style={{ left: `${left}%` }}
                    >
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-700">
                        {formatUtcTick(tick)}
                      </span>
                      <span className="mt-0.5 font-mono text-[9px] font-medium text-slate-400">
                        {formatUtcDay(tick)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ROWS */}
            <div className="divide-y divide-slate-100">
              {ganttData.rows.map(row => (
                <div
                  key={row.aircraftId}
                  className="group flex items-center transition hover:bg-slate-50/60"
                >
                  {/* AIRCRAFT SIDEBAR */}
                  <div className="sticky left-0 z-20 flex w-64 shrink-0 items-center gap-2.5 border-r border-slate-200 bg-white px-4 py-3 group-hover:bg-slate-50">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                        row.aircraftId === 'UNASSIGNED'
                          ? 'border-rose-200 bg-rose-50 text-rose-600'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      <Plane className="h-4 w-4" />
                    </div>

                    <div className="min-w-0">
                      <span className="block truncate text-xs font-bold text-slate-800">
                        {row.aircraftRegistration}
                      </span>

                      {row.aircraftId === 'UNASSIGNED' ? (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-rose-600">
                          <span className="h-1 w-1 rounded-full bg-rose-500" />
                          Affectation requise
                        </span>
                      ) : (
                        <>
                          {row.base && (
                            <span className="mt-0.5 block truncate text-[10px] font-medium text-slate-500">
                              Base <strong className="text-slate-600">{row.base}</strong>
                              {row.capacity ? ` · ${row.capacity} sièges` : ''}
                            </span>
                          )}
                          <span
                            className={`mt-0.5 flex items-center gap-1 truncate text-[10px] font-medium ${
                              row.currentPosition
                                ? 'text-emerald-700'
                                : 'text-slate-400'
                            }`}
                          >
                            <MapPin className="h-2.5 w-2.5 shrink-0" />
                            {row.currentPosition
                              ? row.currentPosition
                              : row.base
                                ? `Position : ${row.base}`
                                : 'Position à déterminer'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* TIMELINE */}
                  <div className="relative mx-2 my-1.5 h-16 flex-1">
                    {/* Grid lines */}
                    {ganttData.hourTicks.map(tick => {
                      const left =
                        ((tick - ganttData.minTime) /
                          ganttData.totalDuration) *
                        100;
                      return (
                        <div
                          key={`${row.aircraftId}-${tick}`}
                          className="absolute bottom-0 top-0 border-l border-slate-100"
                          style={{ left: `${left}%` }}
                        />
                      );
                    })}

                    {/* Items */}
                    {row.items.map(item => {
                      const start = safeDate(item.start);
                      const end = safeDate(item.end);
                      if (!start || !end) return null;

                      const startMs = start.getTime();
                      const endMs = end.getTime();

                      const left = Math.max(
                        0,
                        ((startMs - ganttData.minTime) /
                          ganttData.totalDuration) *
                          100,
                      );
                      const width = Math.max(
                        0.5,
                        ((endMs - startMs) / ganttData.totalDuration) * 100,
                      );

                      const status = normalizeFlightStatus(item.status);
                      const config = STATUS_CONFIG[status];

                      const assignment = assignmentLookup.get(item.flightId);
                      const shiftMinutes =
                        item.shiftMinutes ?? assignment?.shiftMinutes ?? 0;
                      const localStart =
                        item.localStart ?? assignment?.localDeparture;
                      const localEnd =
                        item.localEnd ?? assignment?.localArrival;

                      return (
                        <div
                          key={item.id}
                          className={`group/item absolute bottom-2 top-2 flex min-w-[125px] cursor-pointer items-center justify-between overflow-hidden rounded-lg border px-2.5 shadow-sm transition hover:z-30 hover:shadow-md ${config.bg} ${config.border}`}
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                          }}
                          title={[
                            `Vol ${item.flightNumber ?? ''}`,
                            `${item.origin ?? '?'} → ${item.destination ?? '?'}`,
                            `Départ UTC : ${formatDateTime(item.start)}`,
                            `Arrivée UTC : ${formatDateTime(item.end)}`,
                            localStart
                              ? `Départ local : ${formatDateTime(localStart)}`
                              : '',
                            localEnd
                              ? `Arrivée locale : ${formatDateTime(localEnd)}`
                              : '',
                            shiftMinutes > 0
                              ? `Décalage : +${shiftMinutes} min`
                              : 'Aucun décalage',
                          ]
                            .filter(Boolean)
                            .join('\n')}
                        >
                          {/* Accent bar */}
                          <span
                            className={`absolute inset-y-0 left-0 w-1 ${config.accent}`}
                            aria-hidden
                          />

                          <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-1.5">
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`}
                            />
                            <span
                              className={`truncate text-[11px] font-bold ${config.text}`}
                            >
                              {item.flightNumber}
                            </span>
                            {shiftMinutes > 0 && (
                              <span className="shrink-0 rounded border border-orange-200 bg-white/80 px-1 py-0.5 text-[9px] font-bold text-orange-700">
                                +{shiftMinutes}m
                              </span>
                            )}
                          </div>

                          <span className="ml-1.5 hidden shrink-0 truncate rounded border border-white/60 bg-white/60 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600 sm:inline-block">
                            {item.origin} → {item.destination}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

/* ============================================================================
 * LEGEND
 * ========================================================================== */

function LegendDot({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}

export default FlightSchedulerGantt;