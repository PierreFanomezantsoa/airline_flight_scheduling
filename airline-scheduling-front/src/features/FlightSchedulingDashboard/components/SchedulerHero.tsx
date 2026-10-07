import type { FC } from 'react';
import {
  Clock3,
  Play,
  Radar,
  RefreshCw,
  Route,
  WandSparkles,
} from 'lucide-react';
import { FOCUS_RING } from '../config';

interface SchedulerHeroProps {
  horizonDays: number;
  timezone: string;
  selectedCount: number;
  totalEligible: number;
  isPreview: boolean;
  canApply: boolean;
  loading: boolean;
  generating: boolean;
  applying: boolean;
  onRefresh: () => void;
  onGenerate: () => void;
  onApply: () => void;
}

export const SchedulerHero: FC<SchedulerHeroProps> = ({
  horizonDays,
  timezone,
  selectedCount,
  totalEligible,
  isPreview,
  canApply,
  loading,
  generating,
  applying,
  onRefresh,
  onGenerate,
  onApply,
}) => (
  <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 px-5 py-5 text-white shadow-xl shadow-slate-950/10 sm:px-6 sm:py-6">
    <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl" aria-hidden="true" />
    <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" aria-hidden="true" />

    <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sky-300">
          <Radar className="h-4 w-4" />
          <span className="text-[11px] font-bold uppercase tracking-[0.16em]">Centre de programmation</span>
        </div>
        <h2 className="mt-2 text-xl font-bold tracking-tight sm:text-2xl">
          Construire un scénario de vols cohérent
        </h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-300">
          Sélectionnez les vols à traiter, contrôlez les affectations puis validez le scénario avant son application.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200">
            <Clock3 className="h-3.5 w-3.5 text-sky-300" /> Horizon {horizonDays} jours
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200">
            <Route className="h-3.5 w-3.5 text-sky-300" /> {selectedCount}/{totalEligible} vols sélectionnés
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200">
            Référence {timezone || 'UTC'}
          </span>
          {isPreview && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
              Scénario en prévisualisation
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || generating || applying}
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
        {isPreview ? (
          <button
            type="button"
            onClick={onApply}
            disabled={applying || !canApply}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 text-sm font-bold text-white shadow-lg shadow-sky-950/25 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
          >
            <Play className={`h-4 w-4 ${applying ? 'animate-pulse' : ''}`} />
            {applying ? 'Application…' : 'Appliquer le scénario'}
          </button>
        ) : (
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || applying || selectedCount === 0}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 text-sm font-bold text-white shadow-lg shadow-sky-950/25 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`}
          >
            <WandSparkles className={`h-4 w-4 ${generating ? 'animate-pulse' : ''}`} />
            {generating ? 'Génération…' : 'Générer le scénario'}
          </button>
        )}
      </div>
    </div>
  </section>
);

export default SchedulerHero;
