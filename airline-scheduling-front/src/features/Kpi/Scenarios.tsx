import React, { useMemo, useState } from 'react';
import type { ScheduleProposal, ScenarioStatus, OccDecision } from './types';
import { mockProposals, mockDecisions, mockConflicts } from './mockData';

const statusStyles: Record<ScenarioStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PREVIEWED: 'bg-blue-100 text-blue-700',
  OCC_VALIDATED: 'bg-emerald-100 text-emerald-700',
  OCC_REJECTED: 'bg-rose-100 text-rose-700',
};

const statusLabel: Record<ScenarioStatus, string> = {
  DRAFT: 'Brouillon',
  PREVIEWED: 'Prévisualisé',
  OCC_VALIDATED: 'Validé OCC',
  OCC_REJECTED: 'Rejeté OCC',
};

export const Scenarios: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('SP-2026-05-11-02');

  const selected = useMemo<ScheduleProposal | null>(
    () => mockProposals.find((p) => p.id === selectedId) ?? null,
    [selectedId]
  );

  const selectedDecisions = useMemo<OccDecision[]>(
    () => mockDecisions.filter((d) => d.proposalId === selectedId),
    [selectedId]
  );

  return (
    <div className="space-y-4">
      {/* LISTE */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">
          Tous les scénarios ({mockProposals.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-2 py-2">Scénario</th>
                <th className="px-2 py-2">Statut</th>
                <th className="px-2 py-2">Vols</th>
                <th className="px-2 py-2">Conflits</th>
                <th className="px-2 py-2">Météo</th>
                <th className="px-2 py-2">MAJ</th>
              </tr>
            </thead>
            <tbody>
              {mockProposals.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${
                    selectedId === p.id ? 'bg-slate-100' : ''
                  }`}
                >
                  <td className="px-2 py-2">
                    <div className="font-medium text-slate-800">{p.name}</div>
                    <div className="text-[10px] text-slate-400">{p.id}</div>
                  </td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles[p.status]}`}
                    >
                      {statusLabel[p.status]}
                    </span>
                  </td>
                  <td className="px-2 py-2">{p.flightsCount}</td>
                  <td className="px-2 py-2">
                    <span
                      className={
                        p.conflictsCount > 15 ? 'font-semibold text-rose-600' : ''
                      }
                    >
                      {p.conflictsCount}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs">
                    <div>{p.weatherSource}</div>
                    <div className="text-[10px] text-slate-400">
                      confiance {(p.weatherConfidence * 100).toFixed(0)}%
                    </div>
                  </td>
                  <td className="px-2 py-2 text-xs text-slate-500">
                    {new Date(p.updatedAt).toLocaleString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DÉTAIL + TRAÇABILITÉ OCC */}
      {selected && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">
              Détail — {selected.name}
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
              <div>
                <dt className="text-slate-500">Statut</dt>
                <dd className="mt-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles[selected.status]}`}
                  >
                    {statusLabel[selected.status]}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Vols</dt>
                <dd className="mt-1 font-semibold text-slate-800">
                  {selected.flightsCount}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Conflits</dt>
                <dd className="mt-1 font-semibold text-rose-600">
                  {selected.conflictsCount}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Météo</dt>
                <dd className="mt-1 text-slate-800">
                  {selected.weatherSource} (
                  {(selected.weatherConfidence * 100).toFixed(0)}%)
                </dd>
              </div>
            </dl>

            <h3 className="mt-4 text-xs font-semibold uppercase text-slate-500">
              Conflits associés
            </h3>
            <ul className="mt-2 space-y-1">
              {mockConflicts.map((c) => (
                <li
                  key={c.id}
                  className="rounded-md border border-slate-100 p-2 text-xs"
                >
                  <span className="font-medium text-slate-800">
                    {c.flightNumber}
                  </span>{' '}
                  — {c.reason}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              Décisions OCC liées
            </h2>
            {selectedDecisions.length === 0 ? (
              <p className="text-xs text-slate-500">
                Aucune décision enregistrée.
              </p>
            ) : (
              <ul className="space-y-3">
                {selectedDecisions.map((d) => (
                  <li
                    key={d.id}
                    className="rounded-md border border-slate-100 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          d.decision === 'VALIDATED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : d.decision === 'ADJUSTED'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {d.decision}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(d.decidedAt).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    <p className="mt-2 text-xs italic text-slate-600">
                      « {d.motive} »
                    </p>
                    <div className="mt-1 text-[10px] text-slate-400">
                      {d.decidedBy} ({d.role})
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default Scenarios;