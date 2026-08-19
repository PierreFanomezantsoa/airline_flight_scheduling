import React, { useState } from 'react';
import { Users, UserCheck, ShieldCheck, AlertCircle } from 'lucide-react';

interface CrewMember {
  id: string;
  name: string;
  role: 'Commandant' | 'Copo' | 'Cabine';
  restTimeHours: number;
  assignedFlight: string | null;
}
export const CrewAssignment: React.FC = () => {
  const [crew] = useState<CrewMember[]>([
    { id: '1', name: 'R. Toky', role: 'Commandant', restTimeHours: 14, assignedFlight: 'MD050' },
    { id: '2', name: 'L. Hariniaina', role: 'Copo', restTimeHours: 16, assignedFlight: 'MD050' },
    { id: '3', name: 'M. Bialy', role: 'Cabine', restTimeHours: 8, assignedFlight: null },
    { id: '4', name: 'J. Nicole', role: 'Commandant', restTimeHours: 4, assignedFlight: null },
  ]);
  return (
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-0">
      {/* Zone d'alerte réglementaire */}
      <div className="flex items-start sm:items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900">
        <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5 sm:mt-0" />
        <div>
          <span className="font-bold">Réglementation ACM / Aviation Civile :</span> Un temps de repos minimum de 11 heures est obligatoire entre deux rotations de vol. Le système bloque automatiquement toute assignation non conforme.
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Liste du personnel disponible */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
          <h3 className="flex items-center gap-2 text-base sm:text-lg font-bold text-slate-900 mb-4">
            <Users className="h-5 w-5 text-sky-600 shrink-0" />
            <span className="truncate">Registre d'Équipage & Statut Réglementaire</span>
          </h3>
          <div className="divide-y divide-slate-100">
            {crew.map(member => {
              const isRestOk = member.restTimeHours >= 11;
              return (
                <div 
                  key={member.id} 
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                >
                  {/* Identité Membre */}
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isRestOk ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">{member.name}</h4>
                      <span className="text-[11px] font-medium text-slate-400">{member.role}</span>
                    </div>
                  </div>
                  {/* Section Métriques (Optimisée pour Mobile) */}
                  <div className="flex items-center justify-between sm:justify-end gap-6 sm:gap-8 border-t border-slate-50 pt-2.5 sm:border-t-0 sm:pt-0 text-xs">
                    <div className="text-left sm:text-right">
                      <span className="text-slate-400 block font-medium text-[11px] sm:text-xs">Repos cumulé</span>
                      <span className={`font-bold block mt-0.5 ${isRestOk ? 'text-slate-700' : 'text-amber-600'}`}>
                        {member.restTimeHours}h / 11h
                      </span>
                    </div>
                    <div className="w-28 text-right">
                      <span className="text-slate-400 block font-medium text-[11px] sm:text-xs">Affectation</span>
                      {member.assignedFlight ? (
                        <span className="inline-block mt-0.5 rounded-md bg-sky-50 px-2 py-0.5 font-bold text-sky-700">
                          Vol {member.assignedFlight}
                        </span>
                      ) : (
                        <span className="inline-block mt-0.5 rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-500">
                          En réserve
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Panneau d'affectation rapide */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base sm:text-lg font-bold text-slate-900 mb-4">
              <UserCheck className="h-5 w-5 text-sky-600 shrink-0" />
              Assignation Vol
            </h3>
            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1">Sélectionner un Vol actif</label>
                <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none">
                  <option>MD050 (TNR ➔ WHE)</option>
                  <option>AF006 (CDG ➔ JFK)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold uppercase text-slate-500 mb-1">Sélectionner un Personnel qualifié</label>
                <select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-sky-500 focus:outline-none">
                  <option>M. Bialy (Cabine) — Repos OK</option>
                  <option disabled>J. Nicole (Commandant) — Alerte Repos Insuffisant</option>
                </select>
              </div>
            </div>
          </div>
          <button className="mt-6 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white shadow-md hover:bg-slate-800 transition flex items-center justify-center gap-2 active:scale-[0.99]">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Valider l'équipage
          </button>
        </div>
      </div>
    </div>
  );
};