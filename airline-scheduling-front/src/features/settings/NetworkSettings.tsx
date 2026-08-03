import React from 'react';
import { Settings, Anchor, ShieldCheck, Timer } from 'lucide-react';

export const NetworkSettings: React.FC = () => {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Paramètres de contraintes de l'algorithme */}
      <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Settings className="h-5 w-5 text-sky-600" />
          Seuils et Variables d'Optimisation du Planneur
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Timer className="h-4 w-4 text-sky-600" /> Règles de Rotation au Sol
            </h4>
            <div className="space-y-2 text-xs">
              <div>
                <label className="block text-slate-500 font-medium mb-1">Turnaround Time Min (Moyen Courrier)</label>
                <input type="number" defaultValue={45} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold focus:outline-none" /> <span className="text-slate-400 font-medium">minutes</span>
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Turnaround Time Min (Long Courrier)</label>
                <input type="number" defaultValue={90} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold focus:outline-none" /> <span className="text-slate-400 font-medium">minutes</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" /> Sécurité RH & Équipage
            </h4>
            <div className="space-y-2 text-xs">
              <div>
                <label className="block text-slate-500 font-medium mb-1">Temps de Repos Réglementaire Obligatoire</label>
                <input type="number" defaultValue={11} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold focus:outline-none" /> <span className="text-slate-400 font-medium">heures</span>
              </div>
              <div>
                <label className="block text-slate-500 font-medium mb-1">Temps de Vol Max Continu (Single Duty)</label>
                <input type="number" defaultValue={12} className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm font-bold focus:outline-none" /> <span className="text-slate-400 font-medium">heures</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-sky-700 transition">
            Sauvegarder les règles opérationnelles
          </button>
        </div>
      </div>

      {/* Catalogue des Plateformes / Aéroports desservis */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900 mb-4">
          <Anchor className="h-5 w-5 text-sky-600" />
          Plateformes & Escales (Hubs)
        </h3>

        <div className="space-y-2 text-xs font-medium text-slate-700">
          <div className="flex items-center justify-between rounded-xl border border-slate-100 p-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">TNR</span>
              <span>Ivato Intl, Antananarivo</span>
            </div>
            <span className="text-[10px] text-slate-400 font-bold">UTC+3</span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-100 p-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">WHE</span>
              <span>Fianarantsoa Airport</span>
            </div>
            <span className="text-[10px] text-slate-400 font-bold">UTC+3</span>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-slate-100 p-2.5">
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded">CDG</span>
              <span>Paris Charles de Gaulle</span>
            </div>
            <span className="text-[10px] text-slate-400 font-bold">UTC+1 (DST)</span>
          </div>
        </div>
      </div>
    </div>
  );
};