import React, { useState } from 'react';
import type { ScheduleProposal, Conflict, OccDecision } from './types';
import { mockProposals, mockConflicts, mockDecisions } from './mockData';

export const OccValidation: React.FC = () => {
  const [selectedId, setSelectedId] = useState<string>('SP-2026-05-11-02');
  const [decision, setDecision] = useState<
    'VALIDATED' | 'ADJUSTED' | 'REJECTED'
  >('VALIDATED');
  const [motive, setMotive] = useState('');
  const [decisions, setDecisions] = useState<OccDecision[]>(mockDecisions);

  const proposal: ScheduleProposal | undefined = mockProposals.find(
    (p) => p.id === selectedId
  );
  const conflicts: Conflict[] = mockConflicts;

  const criticalConflicts = conflicts.filter((c) => c.severity === 'CRITICAL');
  const canSubmit =
    !!proposal &&
    motive.trim().length >= 5 &&
    !(decision === 'VALIDATED' && criticalConflicts.length > 0);

  const handleSubmit = () => {
    if (!canSubmit || !proposal) return;
    const newDecision: OccDecision = {
      id: `D-${Date.now()}`,
      proposalId: proposal.id,
      proposalName: proposal.name,
      decision,
      decidedBy: 'A. Diallo',
      role: 'OCC',
      motive,
      decidedAt: new Date().toISOString(),
    };
    setDecisions((prev) => [newDecision, ...prev]);
    setMotive('');
  };

  return (
    <div className="space-y-4">
      {/* SÉLECTION DU SCÉNARIO */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-xs font-medium uppercase text-slate-500">
          Scénario à valider
        </label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
        >
          {mockProposals.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.status}
            </option>
          ))}
        </select>
      </div>

      {proposal && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* FORMULAIRE DE VALIDATION */}
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">
              {proposal.name}
            </h2>
            <p className="text-xs text-slate-500">
              {proposal.flightsCount} vols • {conflicts.length} conflits • météo{' '}
              {proposal.weatherSource} (
              {(proposal.weatherConfidence * 100).toFixed(0)}%)
            </p>

            {criticalConflicts.length > 0 && (
              <div className="mt-4 rounded-md border-l-4 border-rose-500 bg-rose-50 p-3">
                <p className="text-sm font-semibold text-rose-700">
                  ⚠ {criticalConflicts.length} conflit(s) critique(s) non résolu(s)
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs text-rose-700">
                  {criticalConflicts.map((c) => (
                    <li key={c.id}>
                      {c.flightNumber} — {c.reason}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] italic text-rose-600">
                  La validation est bloquée tant que des conflits critiques subsistent.
                </p>
              </div>
            )}

            <div className="mt-4">
              <label className="text-xs font-medium uppercase text-slate-500">
                Décision
              </label>
              <div className="mt-2 flex gap-3">
                {(['VALIDATED', 'ADJUSTED', 'REJECTED'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDecision(d)}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                      decision === d
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {d === 'VALIDATED'
                      ? 'Valider'
                      : d === 'ADJUSTED'
                      ? 'Ajuster'
                      : 'Rejeter'}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="text-xs font-medium uppercase text-slate-500">
                Motif (obligatoire, min. 5 caractères)
              </label>
              <textarea
                value={motive}
                onChange={(e) => setMotive(e.target.value)}
                rows={3}
                className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder="Ex. : réaffectation de 3 vols sur F-HBKB, conflits critiques résolus."
              />
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`rounded-md px-3 py-1.5 text-sm font-medium text-white ${
                  canSubmit
                    ? 'bg-slate-900 hover:bg-slate-700'
                    : 'cursor-not-allowed bg-slate-300'
                }`}
              >
                Enregistrer la décision
              </button>
            </div>
          </div>

          {/* HISTORIQUE DES DÉCISIONS */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              Historique des décisions
            </h2>
            <ul className="space-y-3">
              {decisions.map((d) => (
                <li
                  key={d.id}
                  className="rounded-md border border-slate-100 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-800">
                      {d.proposalName}
                    </span>
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
                  </div>
                  <p className="mt-1 text-[11px] italic text-slate-600">
                    « {d.motive} »
                  </p>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {d.decidedBy} •{' '}
                    {new Date(d.decidedAt).toLocaleString('fr-FR')}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
};

export default OccValidation;