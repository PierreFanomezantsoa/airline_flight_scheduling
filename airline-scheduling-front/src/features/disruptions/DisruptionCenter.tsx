import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Clock, 
  Layers, 
  RefreshCw, 
  CheckCircle, 
  Loader2, 
  FileText,
  ShieldAlert,
  ArrowRight,
  ToggleLeft,
  ToggleRight,
  Activity,
  Zap,
  CheckSquare,
  Plus,
  Sliders
} from 'lucide-react';

const BACKEND_URL = 'http://localhost:3001';

// --- INTERFACES ALIGNÉES SUR LES ENTITÉS TYPEORM ---
export interface LigneProduction {
  id: number;
  nom: string;
  code: string;
  capaciteParHeure: number;
  estActif: boolean;
  dateCreation: string;
  dateModification: string;
}

export interface TacheProduction {
  id: number;
  referenceCommande: string;
  nomProduit: string;
  quantiteAProduire: number;
  dureeEstimeeHeures: number;
  dateLimite: string;
  statut: 'EN_ATTENTE' | 'PLANIFIE' | 'EN_COURS' | 'TERMINE' | 'ANNULE';
  dateCreation: string;
}

export interface CreneauOrdonnancement {
  id: number;
  dateDebut: string;
  dateFin: string;
  ordreSequence: number;
  tache: TacheProduction;
  ligne: LigneProduction;
}

export interface AléaProduction {
  id: number;
  typePerturbation: string;
  description: string;
  gravite: 'MINEURE' | 'MAJEURE' | 'CRITIQUE';
  estResolue: boolean;
  dateApparition: string;
  tacheAssociee?: TacheProduction;
}

export const DisruptionCenter: React.FC = () => {
  const [lignes, setLignes] = useState<LigneProduction[]>([]);
  const [tachesEnCours, setTachesEnCours] = useState<TacheProduction[]>([]);
  const [aleas, setAleas] = useState<AléaProduction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [creatingLigne, setCreatingLigne] = useState<boolean>(false);

  // Formulaire Incident (Aléas)
  const [formData, setFormData] = useState({
    tacheId: '',
    typePerturbation: 'PANNE_MACHINE',
    description: '',
    gravite: 'MINEURE'
  });

  // Formulaire Configuration d'une Ligne
  const [ligneData, setLigneData] = useState({
    nom: '',
    code: '',
    capaciteParHeure: ''
  });

  // --- CHARGEMENT DEPUIS LES NOUVEAUX ENDPOINTS NESTJS ---
  const chargerDonneesUsine = async () => {
    setLoading(true);
    setError(null);
    try {
      const debut = '2026-01-01T00:00:00.000Z';
      const fin = '2026-12-31T23:59:59.000Z';

      const [resLignes, resCalendrier] = await Promise.all([
        fetch(`${BACKEND_URL}/api/ordonnancement/lignes`),
        fetch(`${BACKEND_URL}/api/ordonnancement/calendrier?debut=${debut}&fin=${fin}`)
      ]);

      if (!resLignes.ok || !resCalendrier.ok) {
        throw new Error(`Erreur réseau (Lignes: ${resLignes.status} / Calendrier: ${resCalendrier.status})`);
      }

      const dataLignes: LigneProduction[] = await resLignes.json();
      const dataCreneaux: CreneauOrdonnancement[] = await resCalendrier.json();

      setLignes(dataLignes);

      // Extraction propre des tâches associées aux créneaux
      const tachesExtraites = dataCreneaux
        .map(creneau => creneau.tache)
        .filter((tache, index, self) => tache && self.findIndex(t => t.id === tache.id) === index);
      
      setTachesEnCours(tachesExtraites);

      if(aleas.length === 0) {
        setAleas([
          {
            id: 1,
            typePerturbation: 'PANNE_MACHINE',
            description: 'Surchauffe du groupe motopropulseur principal détectée par les capteurs IoT.',
            gravite: 'MAJEURE',
            estResolue: false,
            dateApparition: new Date().toISOString(),
            tacheAssociee: tachesExtraites[0] || undefined
          }
        ]);
      }
    } catch (err: any) {
      setError(err.message || "Impossible de se connecter à l'API NestJS.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    chargerDonneesUsine();
  }, []);

  // --- ACTIONS : GESTION & CONFIGURATION DES LIGNES ---
  const handleToggleLigne = async (id: number) => {
    try {
      // NOTE: Le contrôleur actuel ne possédant pas de endpoint direct de bascule globale, 
      // nous simulons ou appelons un comportement d'inversion locale (ou via une future route PATCH).
      setLignes(prev => prev.map(l => l.id === id ? { ...l, estActif: !l.estActif } : l));
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    }
  };

  const handleCreerLigne = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingLigne(true);
    try {
      const response = await fetch(`${BACKEND_URL}/api/ordonnancement/lignes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: ligneData.nom,
          code: ligneData.code.toUpperCase(),
          capaciteParHeure: parseFloat(ligneData.capaciteParHeure)
        })
      });

      if (!response.ok) throw new Error("Erreur lors de l'enregistrement de la ligne.");

      const nouvelleLigne: LigneProduction = await response.json();
      setLignes(prev => [...prev, nouvelleLigne]);
      setLigneData({ nom: '', code: '', capaciteParHeure: '' });
    } catch (err: any) {
      alert(`Erreur de création : ${err.message}`);
    } finally {
      setCreatingLigne(false);
    }
  };

  // --- ACTIONS : SOUUMISSION D'ALÉAS ---
  const handleDeclarerAlea = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const tacheAssociee = tachesEnCours.find(t => t.id === Number(formData.tacheId));

    const nouvelAlea: AléaProduction = {
      id: Date.now(),
      typePerturbation: formData.typePerturbation,
      description: formData.description,
      gravite: formData.gravite as any,
      estResolue: false,
      dateApparition: new Date().toISOString(),
      tacheAssociee
    };

    setAleas(prev => [nouvelAlea, ...prev]);
    setFormData({
      tacheId: '',
      typePerturbation: 'PANNE_MACHINE',
      description: '',
      gravite: 'MINEURE'
    });
    setSubmitting(false);
  };

  const marquerAleaResolu = (idAlea: number) => {
    setAleas(prev => prev.map(a => a.id === idAlea ? { ...a, estResolue: true } : a));
  };

  const getBadgeGravite = (gravite: AléaProduction['gravite']) => {
    switch (gravite) {
      case 'CRITIQUE':
        return <span className="inline-flex items-center text-[10px] font-black tracking-wide text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-md uppercase">Critique</span>;
      case 'MAJEURE':
        return <span className="inline-flex items-center text-[10px] font-black tracking-wide text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-md uppercase">Majeure</span>;
      case 'MINEURE':
        return <span className="inline-flex items-center text-[10px] font-bold tracking-wide text-cyan-700 bg-cyan-50 border border-cyan-200 px-2.5 py-0.5 rounded-md uppercase">Mineure</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="relative flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-[#0e524b]/20 border-t-[#3ae7a6] rounded-full animate-spin"></div>
          <Loader2 className="w-6 h-6 text-[#0e524b] animate-pulse absolute" />
        </div>
        <p className="text-xs font-bold tracking-wider text-slate-400 uppercase mt-4">Calcul et synchronisation de l'ordonnancement...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center bg-white border border-slate-100 rounded-3xl shadow-sm max-w-xl mx-auto mt-12">
        <div className="p-4 bg-rose-50 rounded-full text-rose-500 mb-4">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <h3 className="text-lg font-black text-slate-900 tracking-tight">Erreur API (api/ordonnancement)</h3>
        <p className="text-sm text-slate-500 mt-2 max-w-sm font-medium">{error}</p>
        <button 
          onClick={chargerDonneesUsine} 
          className="mt-6 px-5 py-2.5 bg-[#0e524b] text-[#3ae7a6] hover:bg-[#0c4741] font-bold text-xs tracking-wider uppercase rounded-xl shadow-xs transition duration-150 cursor-pointer"
        >
          Relancer le diagnostic
        </button>
      </div>
    );
  }

  const aleasActifs = aleas.filter(a => !a.estResolue).length;
  const lignesActives = lignes.filter(l => l.estActif).length;

  return (
    <div className="space-y-6">
      
      {/* Blocs KPI Supérieurs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/60 p-4 rounded-2xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Réseau Lignes</p>
            <h4 className="text-2xl font-black text-slate-900 mt-1">{lignesActives} <span className="text-xs font-bold text-slate-400">/ {lignes.length} actif(s)</span></h4>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 p-4 rounded-2xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Anomalies Graphe</p>
            <h4 className={`text-2xl font-black mt-1 ${aleasActifs > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{aleasActifs}</h4>
          </div>
          <div className={`p-3 rounded-xl ${aleasActifs > 0 ? 'bg-rose-50 text-rose-500 animate-pulse' : 'bg-slate-50 text-slate-400'}`}>
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/60 p-4 rounded-2xl flex items-center justify-between shadow-xs">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Noeuds Ordonnancés</p>
            <h4 className="text-2xl font-black text-slate-900 mt-1">{tachesEnCours.length}</h4>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Zap className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Grid Supérieur : Configuration Ligne & Liste d'état */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Formulaire : Création de Ligne */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-xs h-fit space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sliders className="w-4 h-4 text-[#0e524b]" /> Configuration Nouvelle Ligne
          </h3>
          <form onSubmit={handleCreerLigne} className="space-y-3.5">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Désignation / Nom</label>
              <input 
                type="text"
                required
                placeholder="Ex: Ligne d'Assemblage A350"
                value={ligneData.nom}
                onChange={(e) => setLigneData({ ...ligneData, nom: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#0e524b] text-slate-800 placeholder:text-slate-300"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Code Unique</label>
                <input 
                  type="text"
                  required
                  placeholder="L-A350"
                  value={ligneData.code}
                  onChange={(e) => setLigneData({ ...ligneData, code: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#0e524b] text-slate-800 uppercase placeholder:text-slate-300"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Capacité (h)</label>
                <input 
                  type="number"
                  step="0.01"
                  required
                  placeholder="24.00"
                  value={ligneData.capaciteParHeure}
                  onChange={(e) => setLigneData({ ...ligneData, capaciteParHeure: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#0e524b] text-slate-800 placeholder:text-slate-300"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={creatingLigne}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold tracking-wider uppercase rounded-xl transition cursor-pointer flex items-center justify-center gap-2"
            >
              {creatingLigne ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Plus className="w-3.5 h-3.5" /> Déployer la Ligne</>}
            </button>
          </form>
        </div>

        {/* Liste Interactive : Disponibilité Réseau */}
        <div className="lg:col-span-2 bg-white border border-slate-200/60 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0e524b]" /> Matrice de Disponibilité des Lignes (`/lignes`)
            </h3>
            <button 
              onClick={chargerDonneesUsine}
              className="p-1.5 text-slate-400 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200/60 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-65 overflow-y-auto pr-1">
            {lignes.map(ligne => (
              <div 
                key={ligne.id} 
                className={`border rounded-xl p-4 flex items-center justify-between transition-all ${
                  ligne.estActif 
                    ? 'bg-linear-to-br from-white to-slate-50/30 border-slate-200' 
                    : 'bg-slate-50/60 border-slate-200/60 opacity-75'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-900 tracking-wide">{ligne.nom}</p>
                    <span className="text-[9px] font-mono font-black text-slate-400 border border-slate-200 px-1 py-0.2 rounded bg-slate-50">{ligne.code}</span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">Capacité de charge : <span className="text-slate-700 font-bold">{ligne.capaciteParHeure}h/h</span></p>
                </div>
                <button 
                  onClick={() => handleToggleLigne(ligne.id)}
                  className="cursor-pointer transition-transform duration-100 active:scale-95 focus:outline-none"
                >
                  {ligne.estActif ? (
                    <span className="flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-600 tracking-wider">
                      Actif <ToggleRight className="w-7 h-7 text-emerald-500" />
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      Gelé <ToggleLeft className="w-7 h-7 text-slate-300" />
                    </span>
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Grid Inférieur : Administration des crises (Aléas) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Formulaire d'injection d'aléa */}
        <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xs h-fit space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldAlert className="w-4 h-4 text-rose-500" /> Injection d'incident temps réel
          </h3>

          <form onSubmit={handleDeclarerAlea} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nature du sinistre</label>
              <select
                value={formData.typePerturbation}
                onChange={(e) => setFormData({ ...formData, typePerturbation: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-slate-50/50 text-slate-800 focus:outline-none focus:border-[#0e524b] cursor-pointer"
              >
                <option value="PANNE_MACHINE">🚨 Panne Structurelle / Machine</option>
                <option value="RUPTURE_STOCK">📦 Rupture Chaîne Approvisionnement</option>
                <option value="ABSENCE_OPERATEUR">👥 Carence d'Équipage / Opérateur</option>
                <option value="RETARD_LOGISTIQUE">✈️ Conflit Logistique Aéroportuaire</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Sévérité Algorithmique</label>
              <div className="grid grid-cols-3 gap-2">
                {['MINEURE', 'MAJEURE', 'CRITIQUE'].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setFormData({ ...formData, gravite: g })}
                    className={`py-2 px-1 text-[10px] font-bold tracking-wider rounded-lg uppercase cursor-pointer transition-all border ${
                      formData.gravite === g 
                        ? 'bg-rose-50 border-rose-400 text-rose-700 font-extrabold' 
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Tâche réseau impactée</label>
              <select
                value={formData.tacheId}
                onChange={(e) => setFormData({ ...formData, tacheId: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-slate-50/50 text-slate-800 focus:outline-none focus:border-[#0e524b] cursor-pointer"
                required
              >
                <option value="">Sélectionner un noeud du planning...</option>
                {tachesEnCours.map(tache => (
                  <option key={tache.id} value={tache.id}>
                    {tache.referenceCommande} — {tache.nomProduit}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Rapport de dysfonctionnement</label>
              <textarea
                required
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Décrire précisément la panne technique..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#0e524b] text-slate-800 placeholder:text-slate-300"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-[#0e524b] hover:bg-[#0c4741] text-[#3ae7a6] text-xs font-bold tracking-wider uppercase rounded-xl shadow-xs transition duration-150 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Calculer le re-routage"}
            </button>
          </form>
        </div>

        {/* Journal de bord des aléas */}
        <div className="xl:col-span-2 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-[#0e524b]" /> Registre des Conflits Résiliés & Actifs
            </h3>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Actifs : {aleasActifs}</span>
          </div>

          <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
            {aleas.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl bg-slate-50/40">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-slate-800 text-sm font-bold">Système en équilibre</p>
                <p className="text-slate-400 text-xs font-medium mt-0.5">Aucune perturbation détectée sur les graphes.</p>
              </div>
            ) : (
              aleas.map((alea) => (
                <div 
                  key={alea.id} 
                  className={`border rounded-xl p-4 transition-all duration-150 ${
                    alea.estResolue 
                      ? 'bg-slate-50/50 border-slate-200/60 opacity-60' 
                      : 'bg-white border-rose-100 shadow-xs ring-1 ring-rose-500/5'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono font-black text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {alea.typePerturbation}
                      </span>
                      {getBadgeGravite(alea.gravite)}
                    </div>
                    
                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                      <Clock className="w-3 h-3" /> 
                      {new Date(alea.dateApparition).toLocaleTimeString('fr-FR')}
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-700 font-semibold mb-3 leading-relaxed">{alea.description}</p>

                  {alea.tacheAssociee && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/60 w-fit">
                      <FileText className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="font-bold">Noeud :</span>
                      <span className="font-mono text-indigo-600 font-bold">{alea.tacheAssociee.referenceCommande}</span>
                      <ArrowRight className="w-3 h-3 text-slate-300" />
                      <span className="text-slate-700 font-bold">{alea.tacheAssociee.nomProduit}</span>
                    </div>
                  )}

                  <div className="flex justify-end border-t border-slate-100/80 pt-3 mt-3">
                    {alea.estResolue ? (
                      <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">
                        <CheckCircle className="w-3.5 h-3.5" /> Risque Contenu
                      </span>
                    ) : (
                      <button
                        onClick={() => marquerAleaResolu(alea.id)}
                        className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-lg hover:bg-emerald-100 transition cursor-pointer"
                      >
                        Lever l'alerte & Stabiliser
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
};