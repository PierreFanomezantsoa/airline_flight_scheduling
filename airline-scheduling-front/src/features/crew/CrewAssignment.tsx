import React, { useState } from 'react';
import { 
  Users, 
  UserCheck, 
  ShieldCheck,
  CheckCircle2, 
  XCircle, 
  Loader2, 
  User, 
  Plane,
  Clock
} from 'lucide-react';
import { useCrewAssignments } from './useCrewAssignments';

export const CrewAssignment: React.FC = () => {
  const { flights, crew, loading, error: apiError, assignCrewMember } = useCrewAssignments();

  const [selectedFlightId, setSelectedFlightId] = useState<string>('');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const currentSelectedUser = crew.find((m) => m.id === selectedMemberId);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const flightId = selectedFlightId || flights[0]?.id;
    const member = currentSelectedUser;

    if (!flightId || !member) {
      setFeedback({ type: 'error', msg: 'Veuillez sélectionner un vol et un membre du personnel.' });
      return;
    }

    if (member.volAssigne) {
      setFeedback({
        type: 'error',
        msg: `${member.nom} est déjà assigné(e) au Vol ${member.volAssigne.numeroVol}.`,
      });
      return;
    }

    const restHours = member.heuresReposAvant ?? 0;
    if (restHours < 11) {
      setFeedback({
        type: 'error',
        msg: `Réglementation non respectée : ${member.nom} n'a que ${restHours}h de repos.`,
      });
      return;
    }

    try {
      setSubmitting(true);
      await assignCrewMember(flightId, member.id, restHours);
      setFeedback({ type: 'success', msg: `Affectation validée avec succès pour ${member.nom}.` });
      setSelectedMemberId('');
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err.message || "Échec de l'enregistrement." });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-80 flex-col items-center justify-center gap-3 text-slate-500 text-sm">
        <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
        <p className="font-medium">Chargement du registre d'équipage...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-4 sm:p-6 bg-slate-50/50 min-h-screen">
      {/* En-tête de section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Plane className="h-6 w-6 text-sky-600" />
            Gestion & Affectation des Équipages
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Contrôle de la conformité réglementaire et affectation des agents de bord.
          </p>
        </div>
      </div>

      {/* Message d'erreur API globale */}
      {apiError && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs sm:text-sm text-rose-900 shadow-sm">
          <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
          <span className="font-medium">{apiError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Registre d'Équipage & Statut */}
        <div className="lg:col-span-7 xl:col-span-8 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="flex items-center gap-2.5 text-base sm:text-lg font-bold text-slate-900">
              <Users className="h-5 w-5 text-sky-600 shrink-0" />
              Registre du Personnel
            </h2>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/60">
              {crew.length} Membres
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {crew.map((member) => {
              const restHours = member.heuresReposAvant ?? 0;
              const isRestOk = restHours >= 11;
              const isAssigned = Boolean(member.volAssigne);

              const initials = member.nom
                .split(' ')
                .map((n) => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();

              return (
                <div
                  key={member.id}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4 transition hover:bg-slate-50/80 rounded-xl px-2 -mx-2"
                >
                  {/* Identité & Qualification */}
                  <div className="flex items-center gap-3.5">
                    <div className="relative">
                      <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-600 text-xs shadow-inner">
                        {initials}
                      </div>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white ${
                          isRestOk && !isAssigned ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        title={isRestOk && !isAssigned ? 'Disponible' : 'Indisponible ou Restreint'}
                      />
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-sky-600 transition capitalize">
                        {member.nom}
                      </h3>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px]">
                        <span className="font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          {member.role}
                        </span>
                        {member.niveauMetier && (
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium">
                            Niv. {member.niveauMetier}
                          </span>
                        )}
                        {member.niveauTechnique && (
                          <span className="bg-sky-50 text-sky-700 border border-sky-100 px-2 py-0.5 rounded-md font-medium">
                            Tech: {member.niveauTechnique}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Statut Repos & Affectation */}
                  <div className="flex items-center justify-between sm:justify-end gap-6 text-xs border-t border-slate-100 pt-3 sm:border-0 sm:pt-0">
                    <div className="min-w-[100px] text-left sm:text-right">
                      <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400 justify-start sm:justify-end">
                        <Clock className="h-3 w-3" />
                        <span>Repos Cumulé</span>
                      </div>
                      <span
                        className={`mt-0.5 inline-block font-bold text-xs ${
                          isRestOk ? 'text-slate-700' : 'text-amber-600 font-extrabold'
                        }`}
                      >
                        {restHours}h / 11h
                      </span>
                    </div>

                    <div className="min-w-[110px] text-right">
                      {member.volAssigne ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 border border-sky-200/60 px-2.5 py-1 text-xs font-bold text-sky-800 shadow-sm">
                          <Plane className="h-3 w-3 text-sky-600 shrink-0" />
                          Vol {member.volAssigne.numeroVol}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
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

        {/* Formulaire d'Assignation */}
        <form
          onSubmit={handleAssign}
          className="lg:col-span-5 xl:col-span-4 flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm sticky top-6"
        >
          <div>
            <div className="mb-5 border-b border-slate-100 pb-3">
              <h2 className="flex items-center gap-2 text-base sm:text-lg font-bold text-slate-900">
                <UserCheck className="h-5 w-5 text-sky-600 shrink-0" />
                Assignation de Vol
              </h2>
              <p className="text-xs text-slate-400 mt-1">Affecter un membre à une rotation active</p>
            </div>

            <div className="space-y-4">
              {/* Choix Vol */}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Vol Cible
                </label>
                <select
                  value={selectedFlightId}
                  onChange={(e) => setSelectedFlightId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 font-medium focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none transition"
                >
                  <option value="">-- Sélectionner un vol --</option>
                  {flights.map((f) => (
                    <option key={f.id} value={f.id}>
                      Vol {f.numeroVol} ({f.aeroportDepart} → {f.aeroportArrivee})
                    </option>
                  ))}
                </select>
              </div>

              {/* Choix Membre */}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Agent d'Équipage
                </label>
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-xs sm:text-sm text-slate-800 font-medium focus:bg-white focus:border-sky-500 focus:ring-2 focus:ring-sky-100 focus:outline-none transition"
                >
                  <option value="">-- Sélectionner un utilisateur --</option>
                  {crew.map((m) => {
                    const restHours = m.heuresReposAvant ?? 0;
                    const isRestOk = restHours >= 11;
                    const isAlreadyAssigned = Boolean(m.volAssigne);
                    const isDisabled = !isRestOk || isAlreadyAssigned;

                    let statusText = '✓ Repos OK';
                    if (!isRestOk) statusText = `⚠️ Repos Insuffisant (${restHours}h)`;
                    else if (isAlreadyAssigned) statusText = `⛔ Déjà Affecté (${m.volAssigne?.numeroVol})`;

                    return (
                      <option key={m.id} value={m.id} disabled={isDisabled}>
                        {m.nom} ({m.role}) — {statusText}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Prévisualisation de la sélection */}
              {currentSelectedUser && (
                <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/50 p-3.5 text-xs text-slate-700 space-y-2">
                  <div className="flex items-center justify-between font-bold text-slate-900 border-b border-sky-100 pb-2">
                    <div className="flex items-center gap-2 capitalize">
                      <User className="h-4 w-4 text-sky-600" />
                      <span>{currentSelectedUser.nom}</span>
                    </div>
                    <span className="text-[10px] font-semibold text-sky-700 bg-sky-100/80 px-2 py-0.5 rounded">
                      {currentSelectedUser.role}
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-[11px] text-slate-600">
                      <span>Temps de Repos Cumulé :</span>
                      <span className={`font-bold ${currentSelectedUser.heuresReposAvant >= 11 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {currentSelectedUser.heuresReposAvant}h / 11h
                      </span>
                    </div>

                    {currentSelectedUser.niveauMetier && (
                      <div className="flex justify-between text-[11px] text-slate-600">
                        <span>Qualifications :</span>
                        <span className="font-semibold text-slate-800">
                          {currentSelectedUser.niveauMetier} | Tech: {currentSelectedUser.niveauTechnique ?? 'N/A'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Notifications de Feedback */}
            {feedback && (
              <div
                className={`mt-4 flex items-start gap-2.5 rounded-xl p-3.5 text-xs font-medium border shadow-sm ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-rose-50 text-rose-900 border-rose-200'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <span className="leading-tight">{feedback.msg}</span>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!selectedMemberId || !selectedFlightId || submitting || Boolean(currentSelectedUser?.volAssigne)}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 px-4 text-xs sm:text-sm font-bold text-white transition-all duration-200 hover:bg-emerald-800 focus:ring-4 focus:ring-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm active:scale-[0.99]"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin text-emerald-200" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
            )}
            {submitting ? 'Traitement en cours...' : "Valider l'affectation"}
          </button>
        </form>
      </div>
    </div>
  );
};