import React from 'react';
import type {
  FlightStatusCount,
  FlightHourlyData,
  FlightDailyData,
} from './types';
import {
  mockFlightStatistics,
  mockFlightStatusCounts,
  mockFlightHourly,
  mockFlightDaily,
} from './mockData';

// =============================================================================
// KPI CARD MODERNE
// =============================================================================

const KpiCard: React.FC<{
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  color?: string;
  badge?: string;
}> = ({ label, value, unit, hint, tone = 'default', color, badge }) => {
  const tones: Record<string, { bg: string; border: string; text: string }> = {
    default: { bg: 'bg-white', border: 'border-slate-200/80', text: 'text-slate-900' },
    success: { bg: 'bg-emerald-50/50', border: 'border-emerald-200', text: 'text-emerald-950' },
    warning: { bg: 'bg-amber-50/50', border: 'border-amber-200', text: 'text-amber-950' },
    danger: { bg: 'bg-rose-50/50', border: 'border-rose-200', text: 'text-rose-950' },
  };

  const selectedTone = tones[tone];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${selectedTone.border} ${selectedTone.bg} p-5 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {color && (
            <span
              className="h-2.5 w-2.5 rounded-full ring-4 ring-opacity-20"
              style={{ backgroundColor: color, boxShadow: `0 0 0 4px ${color}20` }}
            />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </span>
        </div>
        {badge && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
            {badge}
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={`text-3xl font-extrabold tracking-tight ${selectedTone.text}`}>
          {value}
        </span>
        {unit && <span className="text-sm font-medium text-slate-500">{unit}</span>}
      </div>

      {hint && (
        <p className="mt-2 text-xs font-medium text-slate-500 flex items-center gap-1">
          {hint}
        </p>
      )}
    </div>
  );
};

// =============================================================================
// HISTOGRAMME STATUTS
// =============================================================================

const FlightStatusHistogram: React.FC<{ data: FlightStatusCount[] }> = ({ data }) => {
  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((acc, d) => acc + d.count, 0);

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Répartition par statut</h3>
          <p className="text-xs text-slate-500 mt-0.5">Vue synthétique en temps réel</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {total} vols
        </span>
      </div>

      <div className="flex h-56 items-end gap-3 pt-4">
        {data.map((item) => {
          const heightPct = (item.count / max) * 100;
          return (
            <div key={item.status} className="group flex flex-1 flex-col items-center gap-2">
              <span className="text-xs font-bold text-slate-700 opacity-80 group-hover:opacity-100 transition-opacity">
                {item.count}
              </span>
              <div className="relative flex w-full flex-1 items-end rounded-xl bg-slate-50 p-1">
                <div
                  className="w-full rounded-lg transition-all duration-300 group-hover:brightness-110 shadow-sm"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: item.color,
                    minHeight: '6px',
                  }}
                  title={`${item.label}: ${item.count}`}
                />
              </div>
              <div className="text-center mt-1">
                <div className="text-xs font-medium text-slate-700 truncate max-w-[70px]">
                  {item.label}
                </div>
                <div className="text-[10px] font-semibold text-slate-400">
                  {((item.count / total) * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// =============================================================================
// DONUT CHART
// =============================================================================

const FlightStatusPie: React.FC<{ data: FlightStatusCount[] }> = ({ data }) => {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  const size = 180;
  const radius = size / 2;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * (radius - strokeWidth / 2);

  let cumulativeOffset = 0;

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">Proportion des vols</h3>
        <p className="text-xs text-slate-500 mt-0.5">Distribution relative des activités</p>
      </div>

      <div className="flex items-center justify-around gap-6 my-auto">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90 transform">
            {data.map((item) => {
              const pct = item.count / total;
              const dash = pct * circumference;
              const gap = circumference - dash;
              const offset = -cumulativeOffset;
              cumulativeOffset += dash;

              return (
                <circle
                  key={item.status}
                  cx={radius}
                  cy={radius}
                  r={radius - strokeWidth / 2}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${dash} ${gap}`}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  className="transition-all duration-500 hover:opacity-80 cursor-pointer"
                />
              );
            })}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-extrabold text-slate-900">{total}</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Vols
            </span>
          </div>
        </div>

        <ul className="flex-1 space-y-2.5 pl-2">
          {data.map((item) => (
            <li key={item.status} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 truncate">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="font-medium text-slate-600 truncate">{item.label}</span>
              </div>
              <div className="flex items-center gap-2 pl-2">
                <span className="font-bold text-slate-900">{item.count}</span>
                <span className="w-8 text-right text-[11px] font-medium text-slate-400">
                  {((item.count / total) * 100).toFixed(0)}%
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// =============================================================================
// COURBE HORAIRE SVG
// =============================================================================

const SERIES: { key: keyof FlightHourlyData; label: string; color: string }[] = [
  { key: 'inFlight',  label: 'En vol',    color: '#0284c7' },
  { key: 'planned',   label: 'Planifiés', color: '#6366f1' },
  { key: 'completed', label: 'Effectués', color: '#10b981' },
  { key: 'delayed',   label: 'En retard', color: '#f59e0b' },
  { key: 'cancelled', label: 'Annulés',  color: '#f43f5e' },
];

const FlightTimelineChart: React.FC<{ data: FlightHourlyData[] }> = ({ data }) => {
  const width = 800;
  const height = 260;
  const padding = { top: 24, right: 24, bottom: 40, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxValue = Math.max(
    ...data.flatMap((d) => SERIES.map((s) => Number(d[s.key]) || 0)),
    1
  );

  const stepX = chartW / (data.length - 1);

  const buildPath = (key: keyof FlightHourlyData) =>
    data
      .map((d, i) => {
        const x = padding.left + i * stepX;
        const y = padding.top + chartH - ((Number(d[key]) || 0) / maxValue) * chartH;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Évolution horaire</h3>
          <p className="text-xs text-slate-500 mt-0.5">Trafic global réparti sur 24h</p>
        </div>
        <div className="flex flex-wrap gap-4">
          {SERIES.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              <span className="text-xs font-medium text-slate-600">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full" preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = padding.top + chartH * (1 - pct);
          return (
            <g key={pct}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#f1f5f9"
                strokeWidth={1}
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-400 font-medium"
                style={{ fontSize: 10 }}
              >
                {Math.round(maxValue * pct)}
              </text>
            </g>
          );
        })}

        {SERIES.map((s) => (
          <path
            key={s.key}
            d={buildPath(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {SERIES.map((s) =>
          data.map((d, i) => {
            const x = padding.left + i * stepX;
            const y = padding.top + chartH - ((Number(d[s.key]) || 0) / maxValue) * chartH;
            return (
              <circle
                key={`${s.key}-${i}`}
                cx={x}
                cy={y}
                r={3}
                fill="#ffffff"
                stroke={s.color}
                strokeWidth={2}
                className="transition-all duration-200 hover:r-5 cursor-pointer"
              />
            );
          })
        )}

        {data.map((d, i) => (
          <text
            key={d.hour}
            x={padding.left + i * stepX}
            y={height - 12}
            textAnchor="middle"
            className="fill-slate-400 font-medium"
            style={{ fontSize: 10 }}
          >
            {d.hour}
          </text>
        ))}
      </svg>
    </div>
  );
};

// =============================================================================
// HISTOGRAMME QUOTIDIEN EMPILÉ
// =============================================================================

const FlightWeeklyChart: React.FC<{ data: FlightDailyData[] }> = ({ data }) => {
  const max = Math.max(
    ...data.map((x) => x.inFlight + x.planned + x.completed + x.delayed + x.cancelled),
    1
  );

  const legend = [
    { label: 'Effectués', color: '#10b981' },
    { label: 'Planifiés', color: '#6366f1' },
    { label: 'En vol',    color: '#0284c7' },
    { label: 'En retard', color: '#f59e0b' },
    { label: 'Annulés',  color: '#f43f5e' },
  ];

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Activité hebdomadaire</h3>
          <p className="text-xs text-slate-500 mt-0.5">Cumul des 7 derniers jours</p>
        </div>
      </div>

      <div className="flex h-56 items-end gap-3 pt-4">
        {data.map((d) => {
          const total = d.inFlight + d.planned + d.completed + d.delayed + d.cancelled;
          const heightPct = (total / max) * 100;

          return (
            <div key={d.day} className="group flex flex-1 flex-col items-center gap-2">
              <span className="text-xs font-bold text-slate-700 opacity-80 group-hover:opacity-100">
                {total}
              </span>
              <div className="relative flex w-full flex-1 items-end bg-slate-50 p-1 rounded-xl">
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-lg transition-all duration-300 group-hover:brightness-105"
                  style={{ height: `${heightPct}%`, minHeight: '8px' }}
                >
                  <div style={{ flex: d.completed, backgroundColor: '#10b981' }} title={`Effectués: ${d.completed}`} />
                  <div style={{ flex: d.planned, backgroundColor: '#6366f1' }} title={`Planifiés: ${d.planned}`} />
                  <div style={{ flex: d.inFlight, backgroundColor: '#0284c7' }} title={`En vol: ${d.inFlight}`} />
                  <div style={{ flex: d.delayed, backgroundColor: '#f59e0b' }} title={`En retard: ${d.delayed}`} />
                  <div style={{ flex: d.cancelled, backgroundColor: '#f43f5e' }} title={`Annulés: ${d.cancelled}`} />
                </div>
              </div>
              <span className="text-xs font-semibold text-slate-600 mt-1">{d.day}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-4 border-t border-slate-100 pt-4">
        {legend.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="text-xs font-medium text-slate-600">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// KPI BARRES HORIZONTALES
// =============================================================================

const KpiBar: React.FC<{ label: string; value: number; color: string; hint?: string }> = ({
  label,
  value,
  color,
  hint,
}) => (
  <div>
    <div className="mb-1.5 flex items-center justify-between">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <span className="text-xs font-bold text-slate-900">{value.toFixed(1)}%</span>
    </div>
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full transition-all duration-700 shadow-sm"
        style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
      />
    </div>
    {hint && <p className="mt-1 text-[10px] text-slate-400">{hint}</p>}
  </div>
);

const FlightKpiBars: React.FC = () => {
  const stats = mockFlightStatistics;
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">Performance globale</h3>
        <p className="text-xs text-slate-500 mt-0.5">Objectifs de qualité de service</p>
      </div>

      <div className="space-y-4 my-auto">
        <KpiBar label="Ponctualité" value={stats.onTimeRate} color="#10b981" hint="Objectif ≥ 90 %" />
        <KpiBar label="Taux de retard" value={stats.delayRate} color="#f59e0b" hint="Objectif ≤ 5 %" />
        <KpiBar label="Taux d'annulation" value={stats.cancellationRate} color="#f43f5e" hint="Objectif ≤ 2 %" />
        <KpiBar label="Taux de réalisation" value={stats.completionRate} color="#6366f1" hint="Vols effectués / planifiés" />
      </div>
    </div>
  );
};

// =============================================================================
// DASHBOARD MAIN COMPONENT
// =============================================================================

export const Dashboard: React.FC = () => {
  const stats = mockFlightStatistics;

  return (
    <div className="space-y-6 bg-slate-50/50 p-6 rounded-3xl min-h-screen">
      {/* 1. STATUTS DE VOL */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {mockFlightStatusCounts.map((s) => (
          <KpiCard
            key={s.status}
            label={s.label}
            value={s.count}
            hint={`${((s.count / stats.totalFlights) * 100).toFixed(1)}% du total`}
            color={s.color}
          />
        ))}
      </section>

      {/* 2. HISTOGRAMME + DONUT */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <FlightStatusHistogram data={mockFlightStatusCounts} />
        <FlightStatusPie data={mockFlightStatusCounts} />
      </section>

      {/* 3. COURBE HORAIRE */}
      <section>
        <FlightTimelineChart data={mockFlightHourly} />
      </section>

      {/* 4. PERFORMANCE & HEBDOMADAIRE */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <FlightKpiBars />
        </div>
        <div className="lg:col-span-2">
          <FlightWeeklyChart data={mockFlightDaily} />
        </div>
      </section>
    </div>
  );
};

export default Dashboard;