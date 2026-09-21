import React, { useState } from 'react';
import type {
  FlightStatusCount,
  FlightHourlyData,
  FlightDailyData,
} from '../types';
import {
  mockFlightStatistics,
  mockFlightStatusCounts,
  mockFlightHourly,
  mockFlightDaily,
} from '../mockData';

// =============================================================================
// TYPES INTERNES
// =============================================================================

type ChartTab = 'histogram' | 'pie' | 'timeline' | 'weekly' | 'kpi';

interface ChartTabDef {
  id: ChartTab;
  label: string;
}

const TABS: ChartTabDef[] = [
  { id: 'histogram', label: 'Histogramme statuts' },
  { id: 'pie',       label: 'Répartition' },
  { id: 'timeline',  label: 'Évolution horaire' },
  { id: 'weekly',    label: 'Vols par jour' },
  { id: 'kpi',       label: 'Indicateurs KPI' },
];

// =============================================================================
// 1. HISTOGRAMME DES STATUTS
// =============================================================================

const FlightStatusHistogram: React.FC<{ data: FlightStatusCount[] }> = ({
  data,
}) => {
  const max = Math.max(...data.map((d) => d.count), 1);
  const total = data.reduce((acc, d) => acc + d.count, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">
          Répartition des vols par statut
        </h3>
        <span className="text-[11px] text-slate-500">
          Total : {total} vols
        </span>
      </div>

      <div className="flex h-72 items-end gap-3">
        {data.map((item) => {
          const heightPct = (item.count / max) * 100;
          return (
            <div
              key={item.status}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <span className="text-xs font-bold text-slate-700">
                {item.count}
              </span>
              <div className="relative flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-lg transition-all duration-500 hover:opacity-80"
                  style={{
                    height: `${heightPct}%`,
                    backgroundColor: item.color,
                    minHeight: '4px',
                  }}
                  title={`${item.label}: ${item.count}`}
                />
              </div>
              <div className="text-center">
                <div className="text-[10px] font-semibold text-slate-700">
                  {item.label}
                </div>
                <div className="text-[9px] text-slate-400">
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
// 2. CAMEMBERT (DONUT)
// =============================================================================

const FlightStatusPie: React.FC<{ data: FlightStatusCount[] }> = ({
  data,
}) => {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  const size = 200;
  const radius = size / 2;
  const strokeWidth = 32;
  const circumference = 2 * Math.PI * (radius - strokeWidth / 2);

  let cumulativeOffset = 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-bold text-slate-800">
        Proportion des vols
      </h3>

      <div className="flex flex-wrap items-center gap-8">
        <div className="relative" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
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
                  className="transition-all duration-500"
                />
              );
            })}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black text-slate-900">{total}</span>
            <span className="text-[10px] font-medium uppercase text-slate-500">
              vols
            </span>
          </div>
        </div>

        <ul className="flex-1 space-y-3">
          {data.map((item) => (
            <li key={item.status} className="flex items-center gap-3 text-xs">
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="flex-1 font-medium text-slate-700">
                {item.label}
              </span>
              <span className="font-bold text-slate-900">{item.count}</span>
              <span className="w-10 text-right text-[10px] text-slate-400">
                {((item.count / total) * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// =============================================================================
// 3. COURBE HORAIRE
// =============================================================================

const SERIES: { key: keyof FlightHourlyData; label: string; color: string }[] = [
  { key: 'inFlight',  label: 'En vol',     color: '#0ea5e9' },
  { key: 'planned',   label: 'Planifiés',  color: '#6366f1' },
  { key: 'completed', label: 'Effectués',  color: '#10b981' },
  { key: 'delayed',   label: 'En retard',  color: '#f59e0b' },
  { key: 'cancelled', label: 'Annulés',    color: '#ef4444' },
];

const FlightTimelineChart: React.FC<{ data: FlightHourlyData[] }> = ({
  data,
}) => {
  const width = 800;
  const height = 260;
  const padding = { top: 20, right: 20, bottom: 40, left: 40 };
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
        const y =
          padding.top + chartH - ((Number(d[key]) || 0) / maxValue) * chartH;
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-slate-800">
          Évolution horaire des vols
        </h3>
        <div className="flex flex-wrap gap-3">
          {SERIES.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-[10px] font-medium text-slate-600">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-72 w-full"
        preserveAspectRatio="none"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = padding.top + chartH * (1 - pct);
          return (
            <g key={pct}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray="3 3"
              />
              <text
                x={padding.left - 6}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-400"
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
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {SERIES.map((s) =>
          data.map((d, i) => {
            const x = padding.left + i * stepX;
            const y =
              padding.top +
              chartH -
              ((Number(d[s.key]) || 0) / maxValue) * chartH;
            return (
              <circle
                key={`${s.key}-${i}`}
                cx={x}
                cy={y}
                r={2.5}
                fill={s.color}
              />
            );
          })
        )}

        {data.map((d, i) => (
          <text
            key={d.hour}
            x={padding.left + i * stepX}
            y={height - 15}
            textAnchor="middle"
            className="fill-slate-500"
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
// 4. HISTOGRAMME QUOTIDIEN EMPILÉ
// =============================================================================

const FlightWeeklyChart: React.FC<{ data: FlightDailyData[] }> = ({ data }) => {
  const max = Math.max(
    ...data.map(
      (x) =>
        x.inFlight + x.planned + x.completed + x.delayed + x.cancelled
    ),
    1
  );

  const legend = [
    { label: 'Effectués', color: '#10b981' },
    { label: 'Planifiés', color: '#6366f1' },
    { label: 'En vol',    color: '#0ea5e9' },
    { label: 'En retard', color: '#f59e0b' },
    { label: 'Annulés',   color: '#ef4444' },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800">
          Vols par jour de la semaine
        </h3>
        <span className="text-[11px] text-slate-500">7 derniers jours</span>
      </div>

      <div className="flex h-72 items-end gap-3">
        {data.map((d) => {
          const total =
            d.inFlight + d.planned + d.completed + d.delayed + d.cancelled;
          const heightPct = (total / max) * 100;

          return (
            <div
              key={d.day}
              className="flex flex-1 flex-col items-center gap-2"
            >
              <span className="text-xs font-bold text-slate-700">{total}</span>
              <div className="relative flex w-full flex-1 items-end">
                <div
                  className="flex w-full flex-col-reverse overflow-hidden rounded-t-lg transition-all duration-500"
                  style={{ height: `${heightPct}%`, minHeight: '8px' }}
                >
                  <div
                    className="w-full"
                    style={{ flex: d.completed, backgroundColor: '#10b981' }}
                    title={`Effectués: ${d.completed}`}
                  />
                  <div
                    className="w-full"
                    style={{ flex: d.planned, backgroundColor: '#6366f1' }}
                    title={`Planifiés: ${d.planned}`}
                  />
                  <div
                    className="w-full"
                    style={{ flex: d.inFlight, backgroundColor: '#0ea5e9' }}
                    title={`En vol: ${d.inFlight}`}
                  />
                  <div
                    className="w-full"
                    style={{ flex: d.delayed, backgroundColor: '#f59e0b' }}
                    title={`En retard: ${d.delayed}`}
                  />
                  <div
                    className="w-full"
                    style={{ flex: d.cancelled, backgroundColor: '#ef4444' }}
                    title={`Annulés: ${d.cancelled}`}
                  />
                </div>
              </div>
              <span className="text-[11px] font-semibold text-slate-600">
                {d.day}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-4 border-t border-slate-100 pt-4">
        {legend.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-sm"
              style={{ backgroundColor: l.color }}
            />
            <span className="text-[11px] font-medium text-slate-600">
              {l.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// 5. KPI BARRES HORIZONTALES
// =============================================================================

const KpiBar: React.FC<{
  label: string;
  value: number;
  color: string;
  hint?: string;
}> = ({ label, value, color, hint }) => (
  <div>
    <div className="mb-1 flex items-center justify-between">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <span className="text-xs font-bold text-slate-900">
        {value.toFixed(1)}%
      </span>
    </div>
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(value, 100)}%`, backgroundColor: color }}
      />
    </div>
    {hint && <div className="mt-1 text-[10px] text-slate-400">{hint}</div>}
  </div>
);

const FlightKpiBars: React.FC = () => {
  const stats = mockFlightStatistics;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-5 text-sm font-bold text-slate-800">
        Indicateurs de performance
      </h3>

      <div className="space-y-5">
        <KpiBar
          label="Ponctualité (à l'heure)"
          value={stats.onTimeRate}
          color="#10b981"
          hint="Objectif ≥ 90 %"
        />
        <KpiBar
          label="Taux de retard"
          value={stats.delayRate}
          color="#f59e0b"
          hint="Objectif ≤ 5 %"
        />
        <KpiBar
          label="Taux d'annulation"
          value={stats.cancellationRate}
          color="#ef4444"
          hint="Objectif ≤ 2 %"
        />
        <KpiBar
          label="Taux de réalisation"
          value={stats.completionRate}
          color="#6366f1"
          hint="Vols effectués / total planifiés"
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-[10px] font-medium uppercase text-slate-500">
            Total vols
          </div>
          <div className="mt-1 text-xl font-bold text-slate-900">
            {stats.totalFlights}
          </div>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <div className="text-[10px] font-medium uppercase text-slate-500">
            Statuts actifs
          </div>
          <div className="mt-1 text-xl font-bold text-slate-900">
            {stats.byStatus.length}
          </div>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// PAGE UNIQUE — Charts.tsx
// =============================================================================

export const Charts: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ChartTab>('histogram');

  return (
    <div className="space-y-4">
      {/* ONGLETS */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === tab.id
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CONTENU */}
      {activeTab === 'histogram' && (
        <FlightStatusHistogram data={mockFlightStatusCounts} />
      )}

      {activeTab === 'pie' && <FlightStatusPie data={mockFlightStatusCounts} />}

      {activeTab === 'timeline' && (
        <FlightTimelineChart data={mockFlightHourly} />
      )}

      {activeTab === 'weekly' && <FlightWeeklyChart data={mockFlightDaily} />}

      {activeTab === 'kpi' && <FlightKpiBars />}
    </div>
  );
};

export default Charts;