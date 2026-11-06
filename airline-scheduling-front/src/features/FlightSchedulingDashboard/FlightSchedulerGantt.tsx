// src/features/FlightSchedulingDashboard/FlightSchedulerGantt.tsx
// Gantt SVG responsive avec d3 (échelle UTC), sans défilement horizontal.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FC } from 'react';
import { scaleUtc } from 'd3';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plane, X } from 'lucide-react';

export type FlightStatus = 'Planifié' | 'En Vol' | 'Retardé' | 'Annulé' | 'Effectué';
export interface GanttRow {
  refAircraft: string;
  aircraftRegistration: string;
  capacity?: number | null;
  base?: string | null;
  currentPosition?: string | null;
  aircraftStatus?: string | null;
}
export interface GanttItem {
  refFlight: string;
  flightNumber?: string | null;
  refAircraft: string;
  aircraftRegistration?: string | null;
  start: string;
  end: string;
  localStart?: string | null;
  localEnd?: string | null;
  origin?: string | null;
  destination?: string | null;
  stopovers?: string[];
  stopoverMins?: number | null;
  durationMinutes?: number | null;
  label?: string | null;
  flightStatus?: string | null;
  shiftMinutes?: number;
  weatherSeverity?: number | null;
}
export interface GanttPayload { timezone?: string; rows: GanttRow[]; items: GanttItem[]; }
export interface AutoScheduleAssignment {
  refFlight: string;
  flightNumber?: string | null;
  refAircraft: string;
  aircraftRegistration?: string | null;
  origin?: string | null;
  destination?: string | null;
  stopovers?: string[];
  stopoverMins?: number | null;
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
const PALETTE: Record<FlightStatus, { fill: string; stroke: string; text: string }> = {
  'Planifié': { fill: '#DBEAFE', stroke: '#2563EB', text: '#1D4ED8' },
  'En Vol': { fill: '#BFDBFE', stroke: '#1D4ED8', text: '#1E40AF' },
  'Retardé': { fill: '#FEF3C7', stroke: '#D97706', text: '#92400E' },
  'Annulé': { fill: '#FFE4E6', stroke: '#E11D48', text: '#9F1239' },
  'Effectué': { fill: '#E2E8F0', stroke: '#64748B', text: '#334155' },
};
const DAY = 86_400_000;
const HOUR = 3_600_000;
const parse = (s?: string | null): number => {
  if (!s) return NaN;
  const n = new Date(s).getTime();
  return Number.isFinite(n) ? n : NaN;
};
function normalizeStatus(input?: string | null): FlightStatus {
  const status = String(input ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[_-]/g, ' ');
  if (['IN FLIGHT', 'EN VOL'].includes(status)) return 'En Vol';
  if (['DELAYED', 'RETARDE', 'SHIFTED'].includes(status)) return 'Retardé';
  if (['CANCELLED', 'CANCELED', 'ANNULE'].includes(status)) return 'Annulé';
  if (['COMPLETED', 'DONE', 'LANDED', 'EFFECTUE'].includes(status)) return 'Effectué';
  return 'Planifié';
}
function formatUtc(value: number, detailed = false) {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'UTC', day: '2-digit', month: '2-digit',
    ...(detailed ? { year: 'numeric' } : {}),
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value)).replace(',', '');
}
function formatLocal(value?: string | null, fallback?: number) {
  if (value) {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}`;
  }
  return fallback !== undefined ? `${formatUtc(fallback, true)} UTC` : '—';
}
function isUUID(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value); }

type PositionedItem = { item: GanttItem; start: number; end: number; lane: number; status: FlightStatus };
type PositionedRow = { row: GanttRow; flights: PositionedItem[]; laneCount: number; top: number; height: number };

const FlightSchedulerGantt: FC<FlightSchedulerGanttProps> = ({ schedule, searchTerm, selectedStatus, isPreview, assignmentLookup }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [rangeMode, setRangeMode] = useState<'all' | 'day' | 'week'>('week');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(280, Math.floor(element.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const items = useMemo(() => {
    const q = searchTerm.trim().toLocaleLowerCase('fr');
    return (schedule.items ?? []).filter(item => {
      const start = parse(item.start), end = parse(item.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
      if (selectedStatus !== 'TOUS' && normalizeStatus(item.flightStatus) !== selectedStatus) return false;
      return !q || [item.flightNumber, item.origin, item.destination, item.aircraftRegistration, item.label]
        .some(value => String(value ?? '').toLocaleLowerCase('fr').includes(q));
    });
  }, [schedule.items, selectedStatus, searchTerm]);

  const domain = useMemo(() => {
    const first = Math.min(...items.map(item => parse(item.start)));
    const last = Math.max(...items.map(item => parse(item.end)));
    if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
    const span = rangeMode === 'day' ? DAY : rangeMode === 'week' ? 7 * DAY : Math.max(DAY, last - first + HOUR * 2);
    // Si la période contient le présent, afficher directement les vols actuels.
    const now = Date.now();
    const anchor = first <= now && last >= now ? now : first;
    const start = rangeMode === 'all' ? first - HOUR : Math.floor(anchor / DAY) * DAY + offset * span;
    return { start, end: rangeMode === 'all' ? last + HOUR : start + span, span };
  }, [items, rangeMode, offset]);

  const visibleItems = useMemo(() => !domain ? [] : items.filter(item => parse(item.end) > domain.start && parse(item.start) < domain.end), [items, domain]);
  const labelWidth = width < 550 ? 100 : width < 840 ? 130 : 176;
  const plotWidth = Math.max(120, width - labelWidth - 14);
  const scale = useMemo(() => scaleUtc()
    .domain([new Date(domain?.start ?? 0), new Date(domain?.end ?? 1)])
    .range([labelWidth, labelWidth + plotWidth]), [domain, labelWidth, plotWidth]);
  const ticks = useMemo(() => domain ? scale.ticks(Math.max(2, Math.floor(plotWidth / (width < 550 ? 100 : 125)))) : [], [scale, domain, plotWidth, width]);

  const positioned = useMemo(() => {
    const byAircraft = new Map<string, GanttItem[]>();
    visibleItems.forEach(item => byAircraft.set(item.refAircraft, [...(byAircraft.get(item.refAircraft) ?? []), item]));
    const known = new Map((schedule.rows ?? []).map(row => [row.refAircraft, row]));
    const result: PositionedRow[] = [];
    let top = 52;
    for (const [key, value] of byAircraft) {
      const laneEnds: number[] = [];
      const flights: PositionedItem[] = [];
      for (const item of [...value].sort((a, b) => parse(a.start) - parse(b.start))) {
        const start = parse(item.start), end = parse(item.end);
        let lane = laneEnds.findIndex(value => value <= start);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = end;
        flights.push({ item, start, end, lane, status: normalizeStatus(item.flightStatus) });
      }
      const row = known.get(key) ?? {
        refAircraft: key,
        aircraftRegistration: value[0]?.aircraftRegistration || (key === 'UNASSIGNED' ? 'Non affecté' : key),
      };
      const laneCount = Math.max(1, laneEnds.length);
      const height = Math.max(56, 14 + laneCount * 32);
      result.push({ row, flights, laneCount, top, height });
      top += height;
    }
    return { rows: result, height: top + 8 };
  }, [visibleItems, schedule.rows]);

  const focused = useMemo(() => items.find(item => item.refFlight === selected) ?? null, [items, selected]);
  const now = Date.now();
  const totalShifted = visibleItems.filter(item => (item.shiftMinutes ?? assignmentLookup.get(item.refFlight)?.shiftMinutes ?? 0) > 0).length;
  const changeMode = (mode: 'all' | 'day' | 'week') => { setRangeMode(mode); setOffset(0); setSelected(null); };

  return (
    <section className="min-w-0 overflow-hidden bg-white" aria-label="Diagramme de Gantt des vols">
      <header className="flex flex-col gap-3 border-b border-slate-100 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Plane className="h-4 w-4 text-blue-700" />
            <h2 className="text-sm font-bold text-slate-900">Diagramme de Gantt des rotations</h2>
            {isPreview && <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">Prévisualisation</span>}
          </div>
          <p className="mt-1 text-xs text-slate-500">{visibleItems.length} vol(s) visibles · {positioned.rows.length} aéronef(s) · {totalShifted} décalage(s)</p>
        </div>
        <div className="grid w-full grid-cols-[repeat(3,minmax(0,1fr))_36px_36px] gap-1.5 sm:flex sm:w-auto sm:items-center">
          {(['day', 'week', 'all'] as const).map(mode => (
            <button key={mode} type="button" onClick={() => changeMode(mode)} aria-pressed={rangeMode === mode}
              className={`min-h-9 rounded-md border px-1.5 py-1.5 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${rangeMode === mode ? 'border-blue-800 bg-blue-800 text-white' : 'border-blue-100 bg-white text-blue-800 hover:bg-blue-50'}`}>
              {mode === 'day' ? '24 h' : mode === 'week' ? '7 jours' : 'Tout'}
            </button>
          ))}
          {rangeMode !== 'all' && <>
            <button type="button" onClick={() => { setOffset(v => v - 1); setSelected(null); }} aria-label="Période précédente" className="flex min-h-9 items-center justify-center rounded-md border border-slate-200 p-1.5 text-blue-800 hover:bg-blue-50"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => { setOffset(v => v + 1); setSelected(null); }} aria-label="Période suivante" className="flex min-h-9 items-center justify-center rounded-md border border-slate-200 p-1.5 text-blue-800 hover:bg-blue-50"><ChevronRight className="h-4 w-4" /></button>
          </>}
          {rangeMode === 'all' && <><span className="hidden sm:hidden" aria-hidden="true"/><span className="hidden sm:hidden" aria-hidden="true"/></>}
        </div>
      </header>
      <div ref={wrapperRef} className="w-full min-w-0 overflow-x-hidden">
        {!domain || !positioned.rows.length ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-4 py-10 text-center">
            <CalendarDays className="h-8 w-8 text-blue-300" />
            <p className="mt-3 text-sm font-semibold text-slate-800">Aucun vol sur cette période</p>
            <p className="mt-1 text-xs text-slate-500">Choisissez une autre période ou modifiez les filtres.</p>
          </div>
        ) : (
          <>
            {/* MOBILE : une chronologie SVG compacte par vol, sans déplacement horizontal. */}
            <div className="space-y-3 px-3 py-3 sm:hidden">
              {positioned.rows.map(({ row, flights }) => {
                const aircraftName = row.aircraftRegistration && !isUUID(row.aircraftRegistration)
                  ? row.aircraftRegistration : row.refAircraft === 'UNASSIGNED' ? 'Non affecté' : 'Aéronef';
                return (
                  <section key={row.refAircraft} className="overflow-hidden rounded-lg border border-blue-100 bg-white">
                    <div className="flex items-center justify-between gap-2 border-b border-blue-100 bg-blue-50/70 px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-blue-700"><Plane className="h-4 w-4" /></span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-slate-900">{aircraftName}</p>
                          <p className="truncate text-[10px] text-slate-500">{row.currentPosition || row.base || 'Position non renseignée'}</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] font-semibold text-blue-800">{flights.length} vol{flights.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {flights.map(({ item, start, end, status }) => {
                        const palette = PALETTE[status];
                        const active = selected === item.refFlight;
                        const shift = item.shiftMinutes ?? assignmentLookup.get(item.refFlight)?.shiftMinutes ?? 0;
                        const from = Math.max(domain.start, start);
                        const to = Math.min(domain.end, end);
                        const left = Math.min(100, Math.max(0, (from - domain.start) / domain.span * 100));
                        const length = Math.min(100 - left, Math.max(0.6, (to - from) / domain.span * 100));
                        return (
                          <button key={item.refFlight} type="button"
                            onClick={() => setSelected(active ? null : item.refFlight)}
                            aria-expanded={active}
                            className={`block w-full px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${active ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}>
                            <div className="flex min-w-0 items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-bold text-slate-900">{item.flightNumber || item.label || 'Vol sans numéro'}</p>
                                <p className="mt-0.5 truncate text-[11px] text-slate-500">{item.origin || '—'} → {item.destination || '—'}</p>
                              </div>
                              <span className="shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold"
                                style={{ borderColor: palette.stroke, color: palette.text, backgroundColor: palette.fill }}>{status}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                              <div><span className="block text-[10px] text-slate-500">Départ</span><span className="font-medium tabular-nums text-slate-800">{formatLocal(item.localStart ?? assignmentLookup.get(item.refFlight)?.localDeparture, start)}</span></div>
                              <div><span className="block text-[10px] text-slate-500">Arrivée</span><span className="font-medium tabular-nums text-slate-800">{formatLocal(item.localEnd ?? assignmentLookup.get(item.refFlight)?.localArrival, end)}</span></div>
                            </div>
                            <svg viewBox="0 0 320 24" className="mt-2 block h-6 w-full" role="img" aria-label={`Durée et position du vol ${item.flightNumber || ''} dans la période sélectionnée`} preserveAspectRatio="none">
                              <rect x="0" y="9" width="320" height="6" rx="3" fill="#E2E8F0" />
                              <rect x={left * 3.2} y="7" width={Math.max(2, length * 3.2)} height="10" rx="3" fill={palette.stroke} />
                              <circle cx={left * 3.2} cy="12" r="3" fill={palette.text} />
                            </svg>
                            {shift > 0 && <p className="mt-1 text-[10px] font-semibold text-amber-700">Décalage : +{shift} min</p>}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
            {/* ORDINATEUR / TABLETTE : diagramme SVG D3 sur toute la largeur. */}
            <svg width="100%" height={positioned.height} viewBox={`0 0 ${width} ${positioned.height}`} role="img" aria-label="Chronologie des vols, affichée en UTC et répartie par aéronef" className="hidden w-full sm:block" style={{ maxWidth: '100%' }}>
            <rect x={0} y={0} width={width} height={positioned.height} fill="#FFFFFF" />
            <rect x={0} y={0} width={width} height={52} fill="#EFF6FF" />
            <line x1={labelWidth} x2={labelWidth} y1={0} y2={positioned.height} stroke="#CBD5E1" />
            <text x={12} y={19} fontSize={10} fontWeight={700} fill="#1E3A8A">AÉRONEF</text>
            <text x={12} y={35} fontSize={9} fill="#64748B">Rotation / position</text>
            {ticks.map(tick => {
              const x = scale(tick);
              return <g key={tick.valueOf()}>
                <line x1={x} x2={x} y1={43} y2={positioned.height} stroke="#DBEAFE" strokeDasharray="3 3" />
                <text x={x} y={18} fontSize={width < 550 ? 9 : 10} fill="#1E40AF" textAnchor="middle" fontWeight={600}>{new Intl.DateTimeFormat('fr-FR', {timeZone:'UTC', hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(tick)}</text>
                <text x={x} y={35} fontSize={9} fill="#64748B" textAnchor="middle">{new Intl.DateTimeFormat('fr-FR', {timeZone:'UTC', day:'2-digit',month:'2-digit'}).format(tick)}</text>
              </g>;
            })}
            {positioned.rows.map(({ row, flights, top, height }, index) => {
              const label = row.aircraftRegistration && !isUUID(row.aircraftRegistration) ? row.aircraftRegistration : (row.refAircraft === 'UNASSIGNED' ? 'Non affecté' : 'Appareil');
              return <g key={row.refAircraft}>
                <rect x={0} y={top} width={width} height={height} fill={index % 2 ? '#F8FAFC' : '#FFFFFF'} />
                <line x1={0} y1={top + height} x2={width} y2={top + height} stroke="#E2E8F0" />
                <text x={12} y={top + 23} fontSize={width < 550 ? 10 : 12} fontWeight={700} fill="#0F172A">{label.length > (width < 550 ? 12 : 20) ? `${label.slice(0, width < 550 ? 10 : 18)}…` : label}</text>
                <text x={12} y={top + 39} fontSize={9} fill="#64748B">{(row.currentPosition || row.base || '').slice(0, width < 550 ? 11 : 22)}</text>
                {flights.map(({ item, start, end, lane, status }) => {
                  const left = Math.max(labelWidth + 1, scale(new Date(start)));
                  const right = Math.min(width - 1, scale(new Date(end)));
                  if (right <= left) return null;
                  const w = Math.max(1, right - left);
                  const y = top + 9 + lane * 32;
                  const palette = PALETTE[status];
                  const shift = item.shiftMinutes ?? assignmentLookup.get(item.refFlight)?.shiftMinutes ?? 0;
                  const active = selected === item.refFlight;
                  return <g key={item.refFlight} role="button" tabIndex={0} aria-label={`Voir le vol ${item.flightNumber || item.label || ''}`}
                    onClick={() => setSelected(item.refFlight)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(item.refFlight); } }} style={{ cursor:'pointer' }}>
                    <rect x={left} y={y} width={w} height={25} rx={4} fill={palette.fill} stroke={active ? '#1E40AF' : palette.stroke} strokeWidth={active ? 2 : 1} />
                    <rect x={left} y={y} width={Math.min(4,w)} height={25} rx={2} fill={palette.stroke} />
                    {w >= 35 && <text x={left+7} y={y+16} fontSize={width < 550 ? 9 : 10} fontWeight={700} fill={palette.text} clipPath={undefined}>{(item.flightNumber || item.label || 'Vol').slice(0, Math.max(2, Math.floor((w-10)/6)))}</text>}
                    {shift > 0 && w > 90 && <text x={right - 5} y={y+16} textAnchor="end" fontSize={9} fill={palette.text}>+{shift}m</text>}
                    <title>{`${item.flightNumber || 'Vol'} : ${item.origin || '?'} → ${item.destination || '?'}\n${formatUtc(start, true)} – ${formatUtc(end, true)} UTC\nStatut : ${status}${shift ? `\nDécalage : +${shift} min` : ''}`}</title>
                  </g>;
                })}
              </g>;
            })}
            {now >= domain.start && now <= domain.end && <g>
              <line x1={scale(new Date(now))} x2={scale(new Date(now))} y1={43} y2={positioned.height} stroke="#E11D48" strokeWidth={1.5} strokeDasharray="5 3" />
              <circle cx={scale(new Date(now))} cy={43} r={3.5} fill="#E11D48" />
            </g>}
            </svg>
          </>
        )}
      </div>
      {focused && <div className="flex flex-wrap items-start justify-between gap-3 border-t border-blue-100 bg-blue-50/60 px-3 py-3 sm:px-4">
        <div className="min-w-0 flex-1 space-y-1 break-words text-xs">
          <p className="font-bold text-blue-900">{focused.flightNumber || 'Vol'} · {focused.origin || '—'} → {focused.destination || '—'}</p>
          <p className="text-slate-700"><Clock3 className="mr-1 inline h-3.5 w-3.5"/>Départ : {formatLocal(focused.localStart ?? assignmentLookup.get(focused.refFlight)?.localDeparture, parse(focused.start))}</p>
          <p className="text-slate-700">Arrivée : {formatLocal(focused.localEnd ?? assignmentLookup.get(focused.refFlight)?.localArrival, parse(focused.end))}</p>
          <p className="text-slate-600">Statut : {normalizeStatus(focused.flightStatus)} · {(focused.durationMinutes ?? Math.round((parse(focused.end) - parse(focused.start)) / 60000))} min</p>
        </div>
        <button type="button" onClick={() => setSelected(null)} aria-label="Fermer les détails" className="rounded-md p-1.5 text-blue-800 hover:bg-blue-100"><X className="h-4 w-4"/></button>
      </div>}
    </section>
  );
};
export default FlightSchedulerGantt;
