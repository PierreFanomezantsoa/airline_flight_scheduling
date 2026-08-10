import React, { useState, useEffect, useCallback } from 'react';
import { 
  Layers, 
  Clock, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Loader2, 
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ListTodo,
  Move,
  Plane,
  X,
  AlertTriangle,
  Activity,
  ChevronRight
} from 'lucide-react';

const BACKEND_URL = 'http://localhost:3001';

// --- Types ---
export interface Avion {
  id: number;
  nom: string;
  code: string;
  capacitePassagers: number;
  estActif: boolean;
}

export interface Vol {
  id: number;
  referenceCommande: string;
  nomProduit: string;
  quantiteAProduire: number;
  dureeEstimeeHeures: number;
  statut: 'EN_ATTENTE' | 'PLANIFIE';
}

export interface VolPlanifie {
  id: number;
  dateDebut: string;
  dateFin: string;
  tache: Vol;
  ligne: Avion;
}

export interface ToastMessage {
  id: number;
  type: 'success' | 'error';
  message: string;
}

const toLocalISOString = (dateInput: string | Date): string => {
  const d = new Date(dateInput);
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
};

export const SchedulingDashboard: React.FC = () => {
  const [lignes, setLignes] = useState<Avion[]>([]);
  const [creneaux, setCreneaux] = useState<VolPlanifie[]>([]);
  const [tachesEnAttente, setTachesEnAttente] = useState<Vol[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [actionIdLoading, setActionIdLoading] = useState<number | null>(null);

  const [creneauToDelete, setCreneauToDelete] = useState<VolPlanifie | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToast({ id, type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 4000);
  };

  const [assignForm, setAssignForm] = useState({
    tacheId: '',
    ligneId: '',
    dateDebut: '',
    dateFin: ''
  });

  const [creneauEnModification, setCreneauEnModification] = useState<VolPlanifie | null>(null);
  const [moveForm, setMoveForm] = useState({ ligneId: '', dateDebut: '', dateFin: '' });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (creneauToDelete) setCreneauToDelete(null);
        if (creneauEnModification) setCreneauEnModification(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [creneauToDelete, creneauEnModification]);

  const chargerDonneesOrdonnancement = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const debut = new Date('2026-01-01T00:00:00.000Z').toISOString();
      const fin = new Date('2026-12-31T23:59:59.000Z').toISOString();

      const [resLignes, resCalendrier, resTaches] = await Promise.all([
        fetch(`${BACKEND_URL}/api/ordonnancement/lignes`),
        fetch(`${BACKEND_URL}/api/ordonnancement/calendrier?debut=${debut}&fin=${fin}`),
        fetch(`${BACKEND_URL}/api/ordonnancement/taches/en-attente`)
      ]);

      if (!resLignes.ok || !resCalendrier.ok || !resTaches.ok) {
        throw new Error("Échec du chargement des données opérationnelles.");
      }

      setLignes(await resLignes.json());
      setCreneaux(await resCalendrier.json());
      setTachesEnAttente(await resTaches.json());
    } catch (err: any) {
      setError(err.message || "Erreur de communication avec le serveur.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    chargerDonneesOrdonnancement();
  }, [chargerDonneesOrdonnancement]);

  const recalculerDateFin = (tacheId: string, dateDebut: string) => {
    if (!tacheId || !dateDebut) return '';
    const vol = tachesEnAttente.find(t => t.id === Number(tacheId));
    if (!vol) return '';

    const debutDate = new Date(dateDebut);
    const finDate = new Date(debutDate.getTime() + vol.dureeEstimeeHeures * 3600000);
    return toLocalISOString(finDate);
  };

  const handleTacheChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tacheId = e.target.value;
    const dateFin = recalculerDateFin(tacheId, assignForm.dateDebut);
    setAssignForm(prev => ({ ...prev, tacheId, dateFin: dateFin || prev.dateFin }));
  };

  const handleDateDebutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateDebut = e.target.value;
    const dateFin = recalculerDateFin(assignForm.tacheId, dateDebut);
    setAssignForm(prev => ({ ...prev, dateDebut, dateFin: dateFin || prev.dateFin }));
  };

  const handleAssignerTache = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const ligneIdNum = Number(assignForm.ligneId);
    const tacheIdNum = Number(assignForm.tacheId);

    if (!ligneIdNum || !tacheIdNum) {
      const msg = "Veuillez sélectionner un vol et un appareil valides.";
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    const debut = new Date(assignForm.dateDebut);
    const fin = new Date(assignForm.dateFin);

    if (debut >= fin) {
      const msg = "L'arrivée doit être strictly postérieure au départ.";
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/ordonnancement/assigner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ligneId: ligneIdNum,
          tacheId: tacheIdNum,
          dateDebut: debut.toISOString(),
          dateFin: fin.toISOString()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(Array.isArray(data.message) ? data.message.join(' | ') : data.message);
      }

      await chargerDonneesOrdonnancement();
      setAssignForm({ tacheId: '', ligneId: '', dateDebut: '', dateFin: '' });
      showToast("Vol planifié avec succès !", 'success');
    } catch (err: any) {
      setError(err.message);
      showToast(err.message || "Erreur lors de la planification.", 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeplacerCreneau = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creneauEnModification) return;
    setError(null);

    const debut = new Date(moveForm.dateDebut);
    const fin = new Date(moveForm.dateFin);

    if (debut >= fin) {
      const msg = "La date d'arrivée doit être postérieure au départ.";
      setError(msg);
      showToast(msg, 'error');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/ordonnancement/deplacer/${creneauEnModification.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ligneId: moveForm.ligneId ? Number(moveForm.ligneId) : undefined,
          dateDebut: debut.toISOString(),
          dateFin: fin.toISOString()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(Array.isArray(data.message) ? data.message.join(' | ') : data.message);
      }

      setCreneauEnModification(null);
      await chargerDonneesOrdonnancement();
      showToast("Reprogrammation effectuée !", 'success');
    } catch (err: any) {
      setError(err.message);
      showToast(err.message || "Erreur lors de la reprogrammation.", 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmerRetraitPlanification = async () => {
    if (!creneauToDelete) return;

    const id = creneauToDelete.id;
    setError(null);
    setActionIdLoading(id);

    try {
      const response = await fetch(`${BACKEND_URL}/api/ordonnancement/desordonnancer/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error("Échec du retrait de la planification.");
      
      setCreneauToDelete(null);
      await chargerDonneesOrdonnancement();
      showToast("Vol remis en attente.", 'success');
    } catch (err: any) {
      setError(err.message);
      showToast(err.message || "Erreur lors du retrait du vol.", 'error');
    } finally {
      setActionIdLoading(null);
    }
  };

  const initierModification = (creneau: VolPlanifie) => {
    setCreneauEnModification(creneau);
    setMoveForm({
      ligneId: String(creneau.ligne?.id || ''),
      dateDebut: toLocalISOString(creneau.dateDebut),
      dateFin: toLocalISOString(creneau.dateFin)
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] bg-slate-900 text-slate-100 rounded-3xl p-8">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
          <Plane className="w-6 h-6 text-emerald-400 absolute animate-pulse" />
        </div>
        <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mt-5">Synchronisation Ops Center...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-2 md:p-6 max-w-7xl mx-auto bg-slate-50/50 min-h-screen text-slate-800">
      
      {/* MODAL SUPPRESSION */}
      {creneauToDelete && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => !actionIdLoading && setCreneauToDelete(null)}
        >
          <div 
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-rose-100/80 text-rose-600 rounded-2xl">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 tracking-tight">Désordonnancer ce vol ?</h3>
                  <p className="text-xs text-slate-500 font-medium">Le vol repassera dans le carnet d'attente.</p>
                </div>
              </div>
              <button 
                onClick={() => setCreneauToDelete(null)}
                disabled={actionIdLoading !== null}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-extrabold text-slate-900 text-sm">{creneauToDelete.tache?.nomProduit}</span>
                <span className="font-mono text-[10px] font-black text-emerald-700 bg-emerald-100/60 border border-emerald-200/80 px-2 py-0.5 rounded-md">
                  {creneauToDelete.tache?.referenceCommande}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Appareil : <span className="font-bold text-slate-800">{creneauToDelete.ligne?.nom} ({creneauToDelete.ligne?.code})</span>
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCreneauToDelete(null)}
                disabled={actionIdLoading !== null}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmerRetraitPlanification}
                disabled={actionIdLoading !== null}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer"
              >
                {actionIdLoading === creneauToDelete.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Retrait...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirmer le retrait</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div 
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl border text-xs font-bold transition-all animate-in fade-in slide-in-from-bottom-5 ${
            toast.type === 'success' 
              ? 'bg-slate-900 text-emerald-400 border-emerald-500/30' 
              : 'bg-slate-900 text-rose-400 border-rose-500/30'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{toast.message}</span>
          <button 
            onClick={() => setToast(null)} 
            className="ml-3 p-1 hover:bg-white/10 rounded-lg transition shrink-0 cursor-pointer"
          >
            <X className="w-3.5 h-3.5 opacity-70 hover:opacity-100" />
          </button>
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="bg-white text-slate-800 rounded-3xl p-6 shadow-lg border border-slate-200/80 relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 opacity-5 text-slate-900 pointer-events-none">
          <Plane className="w-72 h-72" />
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold tracking-wider uppercase">
              <Activity className="w-3.5 h-3.5 text-emerald-600" /> Centre d'Opérations Aériennes
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2 pt-1">
              Planning & Rotation Flotte
            </h1>
            <p className="text-xs text-slate-500 font-medium max-w-xl">
              Supervision en temps réel des créneaux de vol, affectation des avions et gestion anti-chevauchement.
            </p>
          </div>

          <button 
            onClick={chargerDonneesOrdonnancement}
            className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-2xl transition-all shadow-sm active:scale-95 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-emerald-400" /> Actualiser
          </button>
        </div>

        {/* METRICS QUICK VIEW */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6 pt-6 border-t border-slate-100 relative z-10">
          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/60">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Avions Actifs</p>
            <p className="text-lg font-black text-slate-900 mt-0.5">
              {lignes.filter(l => l.estActif).length} <span className="text-xs font-normal text-slate-400">/ {lignes.length}</span>
            </p>
          </div>

          <div className="bg-emerald-50/60 rounded-2xl p-3 border border-emerald-100">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Vols Planifiés</p>
            <p className="text-lg font-black text-emerald-600 mt-0.5">{creneaux.length}</p>
          </div>

          <div className="col-span-2 md:col-span-1 bg-amber-50/60 rounded-2xl p-3 border border-amber-100">
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">En Attente</p>
            <p className="text-lg font-black text-amber-600 mt-0.5">{tachesEnAttente.length}</p>
          </div>
        </div>
      </div>

      {/* ERREURS */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3 text-rose-900 text-xs font-semibold">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-rose-800">Alerte Ordonnanceur :</p>
            <p className="text-rose-700 font-medium">{error}</p>
          </div>
        </div>
      )}

      {/* REPROGRAMMATION DRAWER / FORM */}
      {creneauEnModification && (
        <div className="p-6 bg-indigo-900 text-white rounded-3xl shadow-xl border border-indigo-700 space-y-4 animate-in slide-in-from-top-4 duration-200">
          <div className="flex justify-between items-center border-b border-indigo-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-800 rounded-xl">
                <Move className="w-4 h-4 text-indigo-300" />
              </div>
              <h4 className="text-sm font-extrabold tracking-wide">
                Reprogrammer le vol : <span className="text-indigo-300">{creneauEnModification.tache?.referenceCommande}</span>
              </h4>
            </div>
            <button 
              onClick={() => setCreneauEnModification(null)} 
              className="p-1.5 hover:bg-indigo-800 rounded-xl transition text-indigo-300 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleDeplacerCreneau} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-[10px] font-extrabold text-indigo-300 uppercase mb-1.5">Changer l'appareil</label>
              <select
                value={moveForm.ligneId}
                onChange={(e) => setMoveForm({ ...moveForm, ligneId: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-indigo-700 rounded-xl text-xs bg-indigo-950 text-white font-semibold focus:ring-2 focus:ring-emerald-400 outline-none"
              >
                {lignes.map(l => (
                  <option key={l.id} value={l.id} disabled={!l.estActif}>
                    {l.nom} ({l.code}) {!l.estActif ? ' - Maintenance' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-extrabold text-indigo-300 uppercase mb-1.5">Nouveau Départ</label>
              <input 
                type="datetime-local" 
                value={moveForm.dateDebut}
                onChange={(e) => setMoveForm({ ...moveForm, dateDebut: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-indigo-700 rounded-xl text-xs bg-indigo-950 text-white font-mono focus:ring-2 focus:ring-emerald-400 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-extrabold text-indigo-300 uppercase mb-1.5">Nouvelle Arrivée</label>
              <input 
                type="datetime-local" 
                value={moveForm.dateFin}
                onChange={(e) => setMoveForm({ ...moveForm, dateFin: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-indigo-700 rounded-xl text-xs bg-indigo-950 text-white font-mono focus:ring-2 focus:ring-emerald-400 outline-none"
                required
              />
            </div>
            <button 
              type="submit" 
              disabled={submitting}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black uppercase cursor-pointer transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Valider les modifications"}
            </button>
          </form>
        </div>
      )}

      {/* SECTION 1 : ROTATION DE LA FLOTTE */}
      <div className="bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-700" /> Planning des Rotations par Appareil
          </h2>
          <span className="text-xs font-semibold text-slate-400">Total : {lignes.length} avions</span>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {lignes.map(avion => {
            const volsAppareil = creneaux.filter(c => c.ligne?.id === avion.id);

            return (
              <div key={avion.id} className="border border-slate-200/80 rounded-2xl bg-white overflow-hidden shadow-xs hover:border-slate-300 transition-all">
                {/* Header Avion */}
                <div className="bg-slate-50/80 px-4 py-3 flex justify-between items-center border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${avion.estActif ? 'bg-slate-900 text-emerald-400' : 'bg-amber-100 text-amber-800'}`}>
                      <Plane className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-extrabold text-slate-900">{avion.nom}</span>
                      <p className="text-[10px] text-slate-400 font-medium">Capacité : {avion.capacitePassagers} passagers</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!avion.estActif ? (
                      <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-200/80 px-2.5 py-1 rounded-lg font-extrabold">
                        En Maintenance
                      </span>
                    ) : (
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2.5 py-1 rounded-lg font-extrabold">
                        {volsAppareil.length} vol(s) programmé(s)
                      </span>
                    )}
                    <span className="text-[10px] font-mono font-black text-slate-600 bg-white border border-slate-200 px-2 py-1 rounded-md">
                      {avion.code}
                    </span>
                  </div>
                </div>

                {/* Liste des créneaux du vol */}
                <div className="p-4 divide-y divide-slate-100">
                  {volsAppareil.length === 0 ? (
                    <div className="py-2 text-center sm:text-left text-xs text-slate-400 italic">
                      Aucun vol assigné — Appareil disponible pour programmation.
                    </div>
                  ) : (
                    volsAppareil.map(creneau => (
                      <div key={creneau.id} className="py-3 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl shrink-0 mt-0.5 border border-emerald-100">
                            <Layers className="w-4 h-4" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black text-slate-900">{creneau.tache?.nomProduit}</span>
                              <span className="text-[10px] font-mono text-emerald-700 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                                {creneau.tache?.referenceCommande}
                              </span>
                            </div>
                            
                            {/* Dates et Durée */}
                            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-600 flex-wrap pt-0.5">
                              <span className="bg-slate-100 px-2 py-0.5 rounded-md text-slate-800 font-mono text-[10px] font-bold">
                                {new Date(creneau.dateDebut).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <ArrowRight className="w-3 h-3 text-slate-400" />
                              <span className="bg-slate-100 px-2 py-0.5 rounded-md text-slate-800 font-mono text-[10px] font-bold">
                                {new Date(creneau.dateFin).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md ml-1">
                                {creneau.tache?.dureeEstimeeHeures}h de vol
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2 border-t md:border-t-0 pt-2 md:pt-0">
                          <button
                            onClick={() => initierModification(creneau)}
                            className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl transition cursor-pointer"
                          >
                            <Move className="w-3.5 h-3.5" /> Modifier
                          </button>
                          <button
                            onClick={() => setCreneauToDelete(creneau)}
                            disabled={actionIdLoading === creneau.id}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition cursor-pointer disabled:opacity-50"
                            title="Annuler ce vol"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION 2 : FORMULAIRE D'AFFECTATION & CARNET EN ATTENTE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* FORMULAIRE NOUVEAU VOL */}
        <div className="lg:col-span-5 bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-5 h-fit">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-600" /> Nouvelle Affectation
            </h3>
            <p className="text-xs text-slate-400 font-medium">Planifier un vol du carnet vers la flotte.</p>
          </div>

          <form onSubmit={handleAssignerTache} className="space-y-4">
            <div>
              <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                1. Sélectionner le vol
              </label>
              <select
                value={assignForm.tacheId}
                onChange={handleTacheChange}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold bg-slate-50/50 text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition cursor-pointer"
                required
              >
                <option value="">Aéro-ligne en attente...</option>
                {tachesEnAttente.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.referenceCommande} — {t.nomProduit} ({t.dureeEstimeeHeures}h)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                2. Appareil Affecté
              </label>
              <select
                value={assignForm.ligneId}
                onChange={(e) => setAssignForm(prev => ({ ...prev, ligneId: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold bg-slate-50/50 text-slate-800 focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none transition cursor-pointer"
                required
              >
                <option value="">Attribuer à un avion disponible...</option>
                {lignes.filter(l => l.estActif).map(l => (
                  <option key={l.id} value={l.id}>{l.nom} ({l.code})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                  3. Horaires Décollage
                </label>
                <input 
                  type="datetime-local"
                  value={assignForm.dateDebut}
                  onChange={handleDateDebutChange}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold bg-slate-50/50 text-slate-800 font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                  4. Atterrissage <span className="text-emerald-600 font-normal italic">(Calculé)</span>
                </label>
                <input 
                  type="datetime-local"
                  value={assignForm.dateFin}
                  onChange={(e) => setAssignForm(prev => ({ ...prev, dateFin: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-2xl text-xs font-semibold bg-slate-50/50 text-slate-800 font-mono focus:bg-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || tachesEnAttente.length === 0}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-emerald-400 text-xs font-black tracking-wider uppercase rounded-2xl shadow-md transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plane className="w-4 h-4" />
                  <span>Planifier le vol</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* CARNET DE VOLS EN ATTENTE */}
        <div className="lg:col-span-7 bg-white border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <ListTodo className="w-4 h-4 text-amber-600" /> Carnet de Vols en Attente
              </h3>
              <p className="text-xs text-slate-400 font-medium">Vols nécessitant l'attribution d'un appareil et d'un créneau.</p>
            </div>
            <span className="text-xs font-extrabold bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-full">
              {tachesEnAttente.length} en attente
            </span>
          </div>

          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {tachesEnAttente.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto opacity-80" />
                <p className="text-xs font-medium">Tous les vols du carnet sont actuellement planifiés !</p>
              </div>
            ) : (
              tachesEnAttente.map((tache) => (
                <div 
                  key={tache.id} 
                  className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition flex items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-900">{tache.nomProduit}</span>
                      <span className="text-[10px] font-mono font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                        {tache.referenceCommande}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
                      <span>Passagers / Charge : <strong className="text-slate-700">{tache.quantiteAProduire}</strong></span>
                      <span>•</span>
                      <span>Durée estimée : <strong className="text-slate-700">{tache.dureeEstimeeHeures}h</strong></span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const calculatedFin = recalculerDateFin(String(tache.id), assignForm.dateDebut);
                      setAssignForm(prev => ({
                        ...prev,
                        tacheId: String(tache.id),
                        dateFin: calculatedFin || prev.dateFin
                      }));
                    }}
                    className="px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-xl transition cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <span>Sélectionner</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
};