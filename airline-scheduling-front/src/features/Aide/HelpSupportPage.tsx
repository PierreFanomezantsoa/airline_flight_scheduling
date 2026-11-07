import React, {
  useMemo,
  useState,
} from 'react';

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Cloud,
  Cpu,
  FileQuestion,
  Gauge,
  Headphones,
  HelpCircle,
  History,
  Info,
  Layers,
  Lock,
  Navigation,
  Plane,
  PlaneTakeoff,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
  UserCog,
  Users,
  Wrench,
} from 'lucide-react';

/* ============================================================================
 * TYPES
 * ========================================================================== */

type HelpSection =
  | 'START'
  | 'DASHBOARD'
  | 'FLIGHTS'
  | 'SCHEDULING'
  | 'FLEET'
  | 'CREW'
  | 'MAINTENANCE'
  | 'CONFLICTS'
  | 'WEATHER'
  | 'HISTORY'
  | 'FAQ'
  | 'SUPPORT';

type SupportPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type SupportCategory =
  | 'GENERAL'
  | 'AUTH'
  | 'DASHBOARD'
  | 'FLIGHTS'
  | 'SCHEDULING'
  | 'FLEET'
  | 'CREW'
  | 'MAINTENANCE'
  | 'CONFLICTS'
  | 'WEATHER'
  | 'HISTORY'
  | 'TECHNICAL';

interface HelpNavItem {
  id: HelpSection;
  label: string;
  description: string;
  icon: React.ReactNode;
}

interface GuideCardData {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  tone: string;
  steps: string[];
  note?: string;
}

interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
}

interface SupportForm {
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  description: string;
}

interface LocalTicket {
  id: string;
  subject: string;
  category: SupportCategory;
  priority: SupportPriority;
  createdAt: string;
}

/* ============================================================================
 * CONFIGURATION
 * ========================================================================== */

const SUPPORT_STORAGE_KEY = 'airline.help.support.tickets';

/* ============================================================================
 * NAVIGATION
 * ========================================================================== */

const HELP_NAV_ITEMS: HelpNavItem[] = [
  { id: 'START', label: 'Bien démarrer', description: 'Connexion, navigation et rôles', icon: <BookOpen className="h-4 w-4" /> },
  { id: 'DASHBOARD', label: 'Tableau de bord', description: 'Indicateurs et suivi opérationnel', icon: <Gauge className="h-4 w-4" /> },
  { id: 'FLIGHTS', label: 'Vols', description: 'Création, modification et statuts', icon: <Plane className="h-4 w-4" /> },
  { id: 'SCHEDULING', label: 'Programmation', description: 'Programme de vols et scénarios', icon: <Layers className="h-4 w-4" /> },
  { id: 'FLEET', label: 'Flotte', description: 'Appareils et disponibilité', icon: <PlaneTakeoff className="h-4 w-4" /> },
  { id: 'CREW', label: 'Équipages', description: 'Affectation et contrôle du repos', icon: <Users className="h-4 w-4" /> },
  { id: 'MAINTENANCE', label: 'Maintenance', description: 'Indisponibilités techniques', icon: <Wrench className="h-4 w-4" /> },
  { id: 'CONFLICTS', label: 'Conflits', description: 'Détection et résolution', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'WEATHER', label: 'Météo', description: 'Risque et recommandations OCC', icon: <Cloud className="h-4 w-4" /> },
  { id: 'HISTORY', label: 'Historique', description: 'Consultation des vols passés', icon: <History className="h-4 w-4" /> },
  { id: 'FAQ', label: 'FAQ', description: 'Réponses rapides', icon: <HelpCircle className="h-4 w-4" /> },
  { id: 'SUPPORT', label: 'Support', description: 'Signaler un problème', icon: <Headphones className="h-4 w-4" /> },
];

/* ============================================================================
 * GUIDES
 * ========================================================================== */

const START_GUIDES: GuideCardData[] = [
  {
    id: 'login',
    title: 'Se connecter à l’application',
    description: 'Accéder à l’application de programmation des vols de la compagnie.',
    icon: <Lock className="h-5 w-5" />,
    tone: 'bg-emerald-50 text-emerald-700',
    steps: [
      'Ouvrez l’application Airline Vol Scheduling.',
      'Saisissez votre adresse e-mail.',
      'Saisissez votre mot de passe.',
      'Cliquez sur le bouton de connexion.',
      'Après authentification, l’application affiche les écrans autorisés pour votre rôle.',
    ],
    note: 'Les menus accessibles peuvent varier selon votre profil utilisateur.',
  },
  {
    id: 'navigation',
    title: 'Naviguer dans l’application',
    description: 'Utiliser la barre latérale et les différents modules.',
    icon: <Navigation className="h-5 w-5" />,
    tone: 'bg-sky-50 text-sky-700',
    steps: [
      'Utilisez la barre latérale gauche pour changer de module sur ordinateur.',
      'Sur mobile, ouvrez le menu avec le bouton situé en haut à gauche.',
      'Cliquez sur Tableau de bord pour retrouver la vue opérationnelle générale.',
      'Utilisez Aide et support lorsque vous avez besoin d’une procédure.',
      'Votre dernier écran peut être restauré lors de votre prochaine utilisation.',
    ],
  },
  {
    id: 'roles',
    title: 'Comprendre les rôles',
    description: 'Les fonctionnalités disponibles dépendent de votre profil.',
    icon: <UserCog className="h-5 w-5" />,
    tone: 'bg-violet-50 text-violet-700',
    steps: [
      'Administrateur : gestion des utilisateurs et supervision des opérations.',
      'Planificateur : gestion des vols, de la flotte et du programme de vols.',
      'Régulateur / OCC : surveillance des opérations, conflits et perturbations.',
      'Ingénieur maintenance : disponibilité technique et interventions.',
      'Membre d’équipage : consultation et gestion des affectations autorisées.',
      'Product Owner : supervision fonctionnelle du produit.',
    ],
  },
];

const DASHBOARD_GUIDES: GuideCardData[] = [
  {
    id: 'dashboard-read',
    title: 'Lire le tableau de bord',
    description: 'Comprendre les informations principales affichées dès l’ouverture.',
    icon: <Gauge className="h-5 w-5" />,
    tone: 'bg-emerald-50 text-emerald-700',
    steps: [
      'Total vols indique le nombre de vols suivis.',
      'OTP indique le niveau de ponctualité opérationnelle.',
      'Retardés indique les vols actuellement en retard.',
      'En vol indique les opérations en cours.',
      'Annulés indique les vols annulés.',
      'Le programme de vols regroupe les rotations selon les appareils affectés.',
    ],
  },
  {
    id: 'dashboard-filter',
    title: 'Rechercher et filtrer',
    description: 'Retrouver rapidement un vol dans le programme de vols.',
    icon: <Search className="h-5 w-5" />,
    tone: 'bg-sky-50 text-sky-700',
    steps: [
      'Cliquez dans la barre de recherche.',
      'Saisissez un numéro de vol, un aéroport ou un appareil.',
      'Utilisez les boutons de statut pour limiter les résultats.',
      'Le filtre Non assignés permet d’afficher les vols sans appareil.',
      'Cliquez sur Réinitialiser pour supprimer les filtres.',
    ],
  },
  {
    id: 'dashboard-details',
    title: 'Ouvrir la fiche d’un vol',
    description: 'Consulter les informations détaillées d’une rotation.',
    icon: <Info className="h-5 w-5" />,
    tone: 'bg-slate-100 text-slate-700',
    steps: [
      'Cliquez sur une carte de vol.',
      'La fiche opérationnelle s’ouvre au centre de l’écran.',
      'Consultez l’origine et la destination.',
      'Vérifiez le statut et l’appareil.',
      'Consultez le départ local, l’arrivée locale et la durée.',
      'Vérifiez les informations météo.',
      'Fermez la fiche avec le bouton Fermer ou la croix.',
    ],
  },
];

const FLIGHT_GUIDES: GuideCardData[] = [
  {
    id: 'create-vol',
    title: 'Créer un nouveau vol',
    description: 'Ajouter un vol au programme de vols de la compagnie.',
    icon: <Plane className="h-5 w-5" />,
    tone: 'bg-emerald-50 text-emerald-700',
    steps: [
      'Ouvrez Gestion des vols ou cliquez sur Programmer un vol.',
      'Saisissez le numéro du vol.',
      'Sélectionnez l’aéroport de départ.',
      'Sélectionnez l’aéroport d’arrivée.',
      'Renseignez la date et l’heure de départ.',
      'Renseignez la date et l’heure d’arrivée.',
      'Ajoutez une escale si nécessaire.',
      'Sélectionnez un appareil si vous souhaitez l’affecter immédiatement.',
      'Cliquez sur Enregistrer.',
    ],
    note: 'L’heure d’arrivée doit être postérieure à l’heure de départ.',
  },
  {
    id: 'edit-vol',
    title: 'Modifier un vol',
    description: 'Mettre à jour les informations d’un vol existant.',
    icon: <Settings className="h-5 w-5" />,
    tone: 'bg-sky-50 text-sky-700',
    steps: [
      'Ouvrez le module Gestion des vols.',
      'Recherchez le vol concerné.',
      'Cliquez sur Modifier.',
      'Changez les informations nécessaires.',
      'Vérifiez les horaires et l’appareil affecté.',
      'Enregistrez les modifications.',
      'Corrigez les conflits éventuels signalés par l’application.',
    ],
  },
  {
    id: 'statut-vol',
    title: 'Comprendre les statuts',
    description: 'Identifier rapidement l’état d’un vol.',
    icon: <Activity className="h-5 w-5" />,
    tone: 'bg-violet-50 text-violet-700',
    steps: [
      'Planifié : le vol est programmé.',
      'Retardé : le vol est toujours prévu mais son horaire a été décalé.',
      'En vol : l’opération est actuellement en cours.',
      'Effectué : le vol est terminé.',
      'Annulé : le vol ne sera pas exécuté.',
    ],
  },
  {
    id: 'vol-time',
    title: 'Comprendre les horaires',
    description: 'Distinguer les heures locales et la référence UTC.',
    icon: <Clock3 className="h-5 w-5" />,
    tone: 'bg-amber-50 text-amber-700',
    steps: [
      'Le système utilise l’UTC comme référence pour les calculs.',
      'Le départ local correspond au fuseau de l’aéroport de départ.',
      'L’arrivée locale correspond au fuseau de l’aéroport d’arrivée.',
      'La durée réelle est calculée entre les instants UTC.',
      'Les heures locales servent principalement à la lecture opérationnelle.',
    ],
  },
];

const SCHEDULING_GUIDES: GuideCardData[] = [
  {
    id: 'planning-read',
    title: 'Consulter les rotations',
    description: 'Lire le programme de vols et les rotations par appareil.',
    icon: <Layers className="h-5 w-5" />,
    tone: 'bg-sky-50 text-sky-700',
    steps: [
      'Ouvrez Programmation des vols ou consultez les rotations depuis le tableau de bord.',
      'Chaque bloc appareil regroupe ses rotations.',
      'Les vols non affectés sont regroupés dans Non assigné.',
      'Consultez les heures de départ et d’arrivée.',
      'Cliquez sur une rotation pour afficher sa fiche.',
    ],
  },
  {
    id: 'generate-planning',
    title: 'Générer un scénario',
    description: 'Créer un scénario de programmation à partir des vols sélectionnés.',
    icon: <Sparkles className="h-5 w-5" />,
    tone: 'bg-violet-50 text-violet-700',
    steps: [
      'Sélectionnez les vols futurs à inclure dans le scénario.',
      'Cliquez sur Générer le scénario.',
      'Le système analyse les vols sélectionnés.',
      'Les appareils disponibles sont recherchés.',
      'Les contraintes de maintenance, disponibilité et positionnement sont contrôlées.',
      'Le système construit une proposition.',
      'Consultez le résultat.',
      'Validez, ajustez ou rejetez le scénario.',
    ],
    note: 'La génération crée une proposition, pas une publication automatique.',
  },
  {
    id: 'validate-planning',
    title: 'Valider un scénario',
    description: 'Vérifier le programme proposé avant son application.',
    icon: <ShieldCheck className="h-5 w-5" />,
    tone: 'bg-emerald-50 text-emerald-700',
    steps: [
      'Vérifiez les rotations proposées.',
      'Contrôlez les appareils affectés.',
      'Vérifiez les conflits détectés.',
      'Analysez les propositions de réaffectation.',
      'Ajustez si nécessaire.',
      'Validez uniquement si le scénario est acceptable.',
    ],
  },
  {
    id: 'optimize-planning',
    title: 'Utiliser l’optimisation',
    description: 'Obtenir des alternatives lors d’une situation complexe.',
    icon: <Cpu className="h-5 w-5" />,
    tone: 'bg-amber-50 text-amber-700',
    steps: [
      'Cliquez sur Optimiser.',
      'Attendez la fin de l’analyse.',
      'Consultez les conflits identifiés.',
      'Comparez les solutions proposées.',
      'Choisissez la réaffectation ou le décalage approprié.',
      'Validez manuellement la solution retenue.',
    ],
    note: 'L’outil aide à décider mais n’applique pas seul une décision critique.',
  },
];

const FLEET_GUIDES: GuideCardData[] = [
  {
    id: 'fleet-read',
    title: 'Consulter la flotte',
    description: 'Afficher les appareils disponibles.',
    icon: <PlaneTakeoff className="h-5 w-5" />,
    tone: 'bg-emerald-50 text-emerald-700',
    steps: [
      'Ouvrez Gestion des aéronefs.',
      'Consultez la liste des appareils.',
      'Vérifiez l’immatriculation.',
      'Consultez le modèle.',
      'Vérifiez la capacité.',
      'Vérifiez la base de l’appareil.',
      'Consultez son statut opérationnel.',
    ],
  },
  {
    id: 'appareil-statut',
    title: 'Comprendre le statut d’un appareil',
    description: 'Savoir rapidement si un appareil peut être utilisé.',
    icon: <Activity className="h-5 w-5" />,
    tone: 'bg-sky-50 text-sky-700',
    steps: [
      'Active : appareil normalement disponible pour la planification.',
      'Maintenance : appareil temporairement indisponible.',
      'Out of Service : appareil hors service.',
      'Retired : appareil retiré de l’exploitation.',
    ],
  },
  {
    id: 'appareil-assign',
    title: 'Affecter un appareil',
    description: 'Associer un aéronef disponible à un vol.',
    icon: <Plane className="h-5 w-5" />,
    tone: 'bg-violet-50 text-violet-700',
    steps: [
      'Sélectionnez le vol concerné.',
      'Choisissez un appareil.',
      'Vérifiez qu’il n’est pas déjà utilisé.',
      'Vérifiez son statut technique.',
      'Contrôlez son positionnement.',
      'Enregistrez l’affectation.',
    ],
  },
];

const CREW_GUIDES: GuideCardData[] = [
  {
    id: 'crew-add',
    title: 'Affecter un membre d’équipage',
    description: 'Ajouter une affectation sur un vol.',
    icon: <Users className="h-5 w-5" />,
    tone: 'bg-sky-50 text-sky-700',
    steps: [
      'Ouvrez Affectation des équipages.',
      'Cliquez sur Nouvelle affectation.',
      'Sélectionnez le vol.',
      'Sélectionnez le membre.',
      'Choisissez sa fonction.',
      'Cliquez sur Affecter.',
      'Corrigez les éventuels conflits signalés.',
    ],
  },
  {
    id: 'crew-role',
    title: 'Fonctions disponibles',
    description: 'Comprendre les rôles proposés lors d’une affectation.',
    icon: <User className="h-5 w-5" />,
    tone: 'bg-violet-50 text-violet-700',
    steps: [
      'Commandant de bord : Captain.',
      'Copilote : First Officer.',
      'Chef de cabine : Purser.',
      'Personnel de cabine : Cabin Crew.',
      'Autre : Other.',
    ],
  },
  {
    id: 'crew-overlap',
    title: 'Comprendre un refus d’affectation',
    description: 'Identifier pourquoi un membre ne peut pas être affecté.',
    icon: <AlertTriangle className="h-5 w-5" />,
    tone: 'bg-amber-50 text-amber-700',
    steps: [
      'Le membre peut déjà être affecté sur un autre vol.',
      'Les horaires peuvent se chevaucher.',
      'Le temps de repos peut être insuffisant.',
      'Le vol ou le membre peut ne pas être valide.',
      'Consultez le message d’erreur affiché par l’application.',
    ],
  },
];

const MAINTENANCE_GUIDES: GuideCardData[] = [
  {
    id: 'maintenance-create',
    title: 'Planifier une maintenance',
    description: 'Créer une période d’indisponibilité technique.',
    icon: <Wrench className="h-5 w-5" />,
    tone: 'bg-orange-50 text-orange-700',
    steps: [
      'Ouvrez Planification maintenance.',
      'Sélectionnez l’appareil.',
      'Choisissez le type de maintenance.',
      'Renseignez le début de l’intervention.',
      'Renseignez la fin.',
      'Enregistrez le créneau.',
      'L’appareil est considéré indisponible pendant cette période.',
    ],
  },
  {
    id: 'maintenance-conflict',
    title: 'Comprendre un conflit maintenance',
    description: 'Savoir pourquoi un appareil devient indisponible.',
    icon: <AlertTriangle className="h-5 w-5" />,
    tone: 'bg-rose-50 text-rose-700',
    steps: [
      'Un appareil ne peut pas assurer un vol pendant une maintenance.',
      'Un chevauchement entre vol et maintenance est signalé.',
      'Un seuil de maintenance atteint peut empêcher une affectation.',
      'Vérifiez les créneaux avant d’affecter l’appareil.',
    ],
  },
];

const CONFLICT_GUIDES: GuideCardData[] = [
  {
    id: 'conflict-read',
    title: 'Comprendre les alertes',
    description: 'Identifier les principaux conflits opérationnels.',
    icon: <AlertTriangle className="h-5 w-5" />,
    tone: 'bg-amber-50 text-amber-700',
    steps: [
      'Horaires invalides : la fenêtre temporelle n’est pas cohérente.',
      'Avion non assigné : aucun appareil n’est associé au vol.',
      'Avion indisponible : l’appareil ne peut pas être utilisé.',
      'Chevauchement appareil : le même appareil est utilisé sur deux vols simultanément.',
      'Turnaround insuffisant : le temps entre deux rotations est trop court.',
      'Positionnement incohérent : l’appareil n’est pas au bon endroit.',
      'Maintenance : l’appareil n’est pas disponible.',
      'Chevauchement équipage : un membre est affecté à deux vols simultanément.',
      'Repos équipage : le temps minimal de repos n’est pas respecté.',
    ],
  },
  {
    id: 'conflict-action',
    title: 'Résoudre un conflit',
    description: 'Suivre une procédure simple de correction.',
    icon: <ShieldCheck className="h-5 w-5" />,
    tone: 'bg-emerald-50 text-emerald-700',
    steps: [
      'Identifiez le vol concerné.',
      'Lisez le type de conflit.',
      'Vérifiez la ressource responsable.',
      'Consultez les alternatives disponibles.',
      'Modifiez l’affectation ou l’horaire si nécessaire.',
      'Relancez l’analyse.',
      'Validez seulement après disparition du conflit.',
    ],
  },
];

const WEATHER_GUIDES: GuideCardData[] = [
  {
    id: 'weather-read',
    title: 'Comprendre le risque météo',
    description: 'Interpréter le niveau affiché sur un vol.',
    icon: <Cloud className="h-5 w-5" />,
    tone: 'bg-sky-50 text-sky-700',
    steps: [
      'Favorable : aucune contrainte majeure.',
      'Instable : surveillance recommandée.',
      'Critique : risque élevé nécessitant une révision.',
      'Extrême : situation nécessitant une vérification immédiate.',
    ],
  },
  {
    id: 'weather-horizon',
    title: 'Comprendre les horizons',
    description: 'La valeur opérationnelle augmente à l’approche du départ.',
    icon: <Clock3 className="h-5 w-5" />,
    tone: 'bg-violet-50 text-violet-700',
    steps: [
      'J-30 à J-7 : tendance stratégique.',
      'J-7 à J-1 : phase de planification.',
      'J-1 à H-2 : phase tactique.',
      'H-2 jusqu’au départ : phase opérationnelle.',
    ],
  },
  {
    id: 'weather-decision',
    title: 'Agir face à un risque météo',
    description: 'Utiliser la recommandation affichée sans automatiser la décision.',
    icon: <ShieldCheck className="h-5 w-5" />,
    tone: 'bg-emerald-50 text-emerald-700',
    steps: [
      'Consultez le niveau de risque.',
      'Lisez la recommandation.',
      'Vérifiez la proximité du départ.',
      'Comparez les solutions disponibles.',
      'Un retard ou une révision peut être proposé.',
      'Validez manuellement toute modification importante.',
    ],
  },
];

const HISTORY_GUIDES: GuideCardData[] = [
  {
    id: 'history-open',
    title: 'Consulter l’historique',
    description: 'Retrouver les opérations déjà passées.',
    icon: <History className="h-5 w-5" />,
    tone: 'bg-slate-100 text-slate-700',
    steps: [
      'Ouvrez Historique des vols.',
      'Utilisez la recherche pour retrouver un vol.',
      'Filtrez par statut.',
      'Choisissez une période si nécessaire.',
      'Cliquez sur Détails pour consulter les informations.',
    ],
  },
  {
    id: 'history-details',
    title: 'Lire les détails historiques',
    description: 'Consulter les informations enregistrées pour un vol passé.',
    icon: <FileQuestion className="h-5 w-5" />,
    tone: 'bg-sky-50 text-sky-700',
    steps: [
      'Vérifiez le numéro du vol.',
      'Consultez l’itinéraire.',
      'Vérifiez les horaires locaux.',
      'Consultez les références UTC.',
      'Vérifiez l’appareil.',
      'Consultez le statut final.',
      'Vérifiez les informations météo disponibles.',
    ],
  },
];

/* ============================================================================
 * FAQ
 * ========================================================================== */

const FAQ_ITEMS: FAQItem[] = [
  { id: 'faq1', category: 'Vols', question: 'Pourquoi mon vol apparaît-il comme Non assigné ?', answer: 'Cela signifie qu’aucun appareil n’est actuellement affecté au vol. Vous pouvez sélectionner un appareil disponible ou générer un scénario de programmation.', keywords: ['non assigné', 'appareil', 'affectation'] },
  { id: 'faq2', category: 'Vols', question: 'Pourquoi l’heure d’arrivée est-elle refusée ?', answer: 'L’heure d’arrivée doit être postérieure à l’heure de départ. Vérifiez également les dates lorsque le vol traverse minuit.', keywords: ['heure', 'arrivée', 'départ'] },
  { id: 'faq3', category: 'Programmation', question: 'Quels vols sont utilisés lors d’une génération ?', answer: 'Les vols Planifiés et Retardés peuvent être utilisés. Les vols En vol, Effectués et Annulés sont exclus.', keywords: ['génération', 'programme de vols', 'statut'] },
  { id: 'faq4', category: 'Programmation', question: 'L’optimisation modifie-t-elle automatiquement le programme de vols ?', answer: 'Non. Elle propose des alternatives que l’utilisateur autorisé doit examiner et valider.', keywords: ['optimisation', 'automatique', 'validation'] },
  { id: 'faq5', category: 'Flotte', question: 'Pourquoi un appareil ne peut-il pas être affecté ?', answer: 'Il peut être déjà utilisé, indisponible, en maintenance, hors service ou mal positionné.', keywords: ['appareil', 'indisponible', 'maintenance'] },
  { id: 'faq6', category: 'Équipage', question: 'Pourquoi mon affectation équipage est-elle refusée ?', answer: 'Le membre peut déjà être affecté sur un autre vol ou ne pas respecter le temps de repos nécessaire.', keywords: ['équipage', 'repos', 'chevauchement'] },
  { id: 'faq7', category: 'Météo', question: 'La météo peut-elle annuler automatiquement un vol ?', answer: 'Non. Le système peut recommander une révision ou un retard, mais la décision finale reste manuelle.', keywords: ['météo', 'annulation', 'occ'] },
  { id: 'faq8', category: 'Horaires', question: 'Pourquoi l’heure locale est-elle différente de l’heure UTC ?', answer: 'Chaque aéroport possède son propre fuseau horaire. L’UTC sert de référence commune alors que l’heure locale sert à l’affichage opérationnel.', keywords: ['utc', 'heure locale', 'fuseau'] },
  { id: 'faq9', category: 'Historique', question: 'Pourquoi consulter l’historique des vols ?', answer: 'Il permet de retrouver les opérations passées, leurs horaires, leur statut final et les principales informations opérationnelles.', keywords: ['historique', 'vol effectué'] },
  { id: 'faq10', category: 'Accès', question: 'Pourquoi certains menus ne sont-ils pas visibles ?', answer: 'Les menus dépendent de votre rôle et des permissions associées à votre compte.', keywords: ['rôle', 'permission', 'menu'] },
];

/* ============================================================================
 * SUPPORT LABELS
 * ========================================================================== */

const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  GENERAL: 'Question générale',
  AUTH: 'Connexion',
  DASHBOARD: 'Tableau de bord',
  FLIGHTS: 'Vols',
  SCHEDULING: 'Programmation des vols',
  FLEET: 'Flotte',
  CREW: 'Équipages',
  MAINTENANCE: 'Maintenance',
  CONFLICTS: 'Conflits',
  WEATHER: 'Météo',
  HISTORY: 'Historique',
  TECHNICAL: 'Problème technique',
};

const SUPPORT_PRIORITY_LABELS: Record<SupportPriority, string> = {
  LOW: 'Faible',
  MEDIUM: 'Normale',
  HIGH: 'Élevée',
  CRITICAL: 'Critique',
};

/* ============================================================================
 * CENTRE D'AIDE — INTERFACE RESPONSIVE
 * ========================================================================== */

const ALL_GUIDES: Partial<Record<HelpSection, GuideCardData[]>> = {
  START: START_GUIDES,
  DASHBOARD: DASHBOARD_GUIDES,
  FLIGHTS: FLIGHT_GUIDES,
  SCHEDULING: SCHEDULING_GUIDES,
  FLEET: FLEET_GUIDES,
  CREW: CREW_GUIDES,
  MAINTENANCE: MAINTENANCE_GUIDES,
  CONFLICTS: CONFLICT_GUIDES,
  WEATHER: WEATHER_GUIDES,
  HISTORY: HISTORY_GUIDES,
};

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const HelpSupportPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<HelpSection | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [supportForm, setSupportForm] = useState<SupportForm>({
    subject: '', category: 'GENERAL', priority: 'MEDIUM', description: '',
  });
  const [supportSuccess, setSupportSuccess] = useState('');
  const [supportError, setSupportError] = useState('');
  const [sending, setSending] = useState(false);

  const query = normalize(searchQuery.trim());
  const isSearching = query.length > 0;

  const guideResults = useMemo(() => {
    const entries = Object.entries(ALL_GUIDES).flatMap(([section, guides]) =>
      (guides ?? []).map((guide) => ({
        ...guide,
        section: section as HelpSection,
      })),
    );
    if (!query) return [];
    return entries.filter((guide) => normalize([
      guide.title, guide.description, ...guide.steps, guide.note ?? '',
      HELP_NAV_ITEMS.find((nav) => nav.id === guide.section)?.label ?? '',
    ].join(' ')).includes(query));
  }, [query]);

  const faqResults = useMemo(() => {
    if (!query) return FAQ_ITEMS;
    return FAQ_ITEMS.filter((faq) => normalize([
      faq.category, faq.question, faq.answer, ...faq.keywords,
    ].join(' ')).includes(query));
  }, [query]);

  const guideList = activeSection ? ALL_GUIDES[activeSection] ?? [] : [];
  const selectedItem = HELP_NAV_ITEMS.find((item) => item.id === activeSection);

  const selectSection = (section: HelpSection) => {
    setSearchQuery('');
    setActiveSection(section);
    setExpandedGuide(null);
    setExpandedFaq(null);
    // Scroll is deliberately left to the application's existing scroll container.
  };

  const resetHome = () => {
    setActiveSection(null);
    setSearchQuery('');
    setExpandedGuide(null);
    setExpandedFaq(null);
  };

  const handleSubmitSupport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSupportError('');
    setSupportSuccess('');

    if (!supportForm.subject.trim() || !supportForm.description.trim()) {
      setSupportError('Veuillez renseigner le sujet et la description de votre demande.');
      return;
    }

    setSending(true);
    try {
      const ticket: LocalTicket = {
        id: `SUP-${Date.now().toString().slice(-8)}`,
        subject: supportForm.subject.trim(),
        category: supportForm.category,
        priority: supportForm.priority,
        createdAt: new Date().toISOString(),
      };
      const raw = localStorage.getItem(SUPPORT_STORAGE_KEY);
      let previous: LocalTicket[] = [];
      if (raw) {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) previous = parsed as LocalTicket[];
        } catch {
          previous = [];
        }
      }
      localStorage.setItem(SUPPORT_STORAGE_KEY, JSON.stringify([ticket, ...previous].slice(0, 20)));
      setSupportSuccess(`Votre demande ${ticket.id} a été enregistrée dans ce navigateur. Elle n'a pas encore été transmise à une équipe de support.`);
      setSupportForm({ subject: '', category: 'GENERAL', priority: 'MEDIUM', description: '' });
    } catch {
      setSupportError('Impossible d’enregistrer votre demande dans ce navigateur.');
    } finally {
      setSending(false);
    }
  };

  const renderGuide = (guide: GuideCardData, section?: HelpSection) => {
    const key = `${section ?? activeSection ?? 'all'}-${guide.id}`;
    const expanded = expandedGuide === key;
    return (
      <article key={key} className="border-b border-slate-100 last:border-b-0">
        <button type="button" aria-expanded={expanded}
          onClick={() => setExpandedGuide(expanded ? null : key)}
          className="group flex min-h-14 w-full min-w-0 items-center justify-between gap-3 py-3 text-left transition-colors hover:text-emerald-800 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-emerald-600">
          <span className="min-w-0">
            <span className="block text-sm font-medium leading-6 text-slate-800 group-hover:text-emerald-800">{guide.title}</span>
            <span className="mt-0.5 block text-xs leading-5 text-slate-500 sm:text-[13px]">{guide.description}</span>
          </span>
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-emerald-700" /> : <ChevronRight className="h-4 w-4 shrink-0 text-emerald-700" />}
        </button>
        {expanded && (
          <div className="border-t border-slate-100 pb-5 pt-4">
            <ol className="space-y-3">
              {guide.steps.map((step, index) => (
                <li key={`${guide.id}-step-${index}`} className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[11px] font-bold text-white">{index + 1}</span>
                  <p className="pt-0.5 text-sm leading-6 text-slate-700">{step}</p>
                </li>
              ))}
            </ol>
            {guide.note && (
              <div className="mt-5 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />{guide.note}
              </div>
            )}
          </div>
        )}
      </article>
    );
  };

  const renderFaq = (faq: FAQItem) => {
    const expanded = expandedFaq === faq.id;
    return (
      <article key={faq.id} className="border-b border-slate-100 last:border-b-0">
        <button type="button" aria-expanded={expanded}
          onClick={() => setExpandedFaq(expanded ? null : faq.id)}
          className="group flex min-h-14 w-full min-w-0 items-center justify-between gap-3 py-3 text-left transition-colors hover:text-emerald-800 focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-emerald-600">
          <span className="min-w-0">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-emerald-700">{faq.category}</span>
            <span className="text-sm font-semibold leading-6 text-slate-800">{faq.question}</span>
          </span>
          {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-emerald-700" /> : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
        </button>
        {expanded && <p className="border-t border-slate-100 py-4 text-sm leading-7 text-slate-600">{faq.answer}</p>}
      </article>
    );
  };

  return (
    <main className="w-full min-w-0 overflow-x-hidden bg-transparent text-slate-800">
      <header className="w-full bg-transparent p-0">
        <div className="relative w-full min-w-0">
            <Search aria-hidden="true" className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input type="search" value={searchQuery}
              onChange={(event) => { setSearchQuery(event.target.value); setExpandedGuide(null); setExpandedFaq(null); }}
              aria-label="Rechercher dans les guides et les questions fréquentes"
              placeholder="Rechercher une réponse, un guide ou un mot-clé..."
              className="h-12 w-full min-w-0 rounded-xl border border-slate-200 bg-white pl-12 pr-4 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-500 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 sm:h-12" />
        </div>
      </header>

      <div className="w-full min-w-0 space-y-6 px-2 py-5 sm:px-3 sm:py-6 lg:px-4">
        {activeSection && !isSearching && (
          <nav aria-label="Fil d’Ariane" className="flex items-center gap-2 text-xs text-slate-500">
            <button type="button" onClick={resetHome} className="hover:text-emerald-800">Toutes les rubriques</button>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-slate-700">{selectedItem?.label}</span>
          </nav>
        )}
        {isSearching ? (
          <section aria-live="polite">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">Résultats de recherche</h2>
                <p className="mt-1 text-sm text-slate-500">{guideResults.length + faqResults.length} résultat(s) pour « {searchQuery.trim()} ».</p>
              </div>
              <button type="button" onClick={resetHome} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">Effacer la recherche</button>
            </div>
            {guideResults.length > 0 && (
              <div className="mb-9">
                <h3 className="mb-4 text-base font-bold text-slate-800">Guides d'utilisation</h3>
                <div className="rounded-xl border border-slate-200 bg-white px-4 sm:px-5">{guideResults.map((guide) => renderGuide(guide, guide.section))}</div>
              </div>
            )}
            {faqResults.length > 0 && (
              <div>
                <h3 className="mb-4 text-base font-bold text-slate-800">Questions fréquentes</h3>
                <div className="rounded-xl border border-slate-200 bg-white px-4 sm:px-5">{faqResults.map(renderFaq)}</div>
              </div>
            )}
            {guideResults.length === 0 && faqResults.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                <FileQuestion className="mx-auto h-9 w-9 text-slate-400" />
                <h3 className="mt-4 font-bold text-slate-800">Aucun résultat trouvé</h3>
                <p className="mt-2 text-sm text-slate-500">Essayez un autre mot-clé ou contactez le support.</p>
                <button type="button" onClick={() => selectSection('SUPPORT')} className="mt-5 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800">Contacter le support</button>
              </div>
            )}
          </section>
        ) : activeSection === 'SUPPORT' ? (
          <section>
            <button type="button" onClick={resetHome} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:underline">
              <BookOpen className="h-4 w-4" /> Retour au centre d'aide
            </button>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900">Contacter le support</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">Décrivez votre difficulté afin de conserver une demande d'assistance dans votre navigateur.</p>
            </div>
            <div className="grid min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm xl:grid-cols-[minmax(0,1fr)_300px]">
              <form className="space-y-5 p-5 sm:p-8" onSubmit={handleSubmitSupport}>
                {supportSuccess && <div role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0" />{supportSuccess}</div>}
                {supportError && <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{supportError}</div>}
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-800">Sujet de votre demande *</span>
                  <input required maxLength={160} value={supportForm.subject}
                    onChange={(e) => setSupportForm((prev) => ({ ...prev, subject: e.target.value }))}
                    placeholder="Ex. Impossible d'affecter un équipage"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-slate-800">Module concerné</span>
                    <select value={supportForm.category} onChange={(e) => setSupportForm((prev) => ({ ...prev, category: e.target.value as SupportCategory }))}
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-emerald-500">
                      {Object.entries(SUPPORT_CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-slate-800">Niveau de priorité</span>
                    <select value={supportForm.priority} onChange={(e) => setSupportForm((prev) => ({ ...prev, priority: e.target.value as SupportPriority }))}
                      className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-emerald-500">
                      {Object.entries(SUPPORT_PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-semibold text-slate-800">Description du problème *</span>
                  <textarea required rows={6} maxLength={5000} value={supportForm.description}
                    onChange={(e) => setSupportForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Expliquez les actions effectuées, le vol ou l'appareil concerné et le message d'erreur affiché..."
                    className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 outline-none focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100" />
                </label>
                <div className="flex justify-end">
                  <button type="submit" disabled={sending} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50 sm:w-auto">
                    <Send className="h-4 w-4" />{sending ? 'Enregistrement...' : 'Enregistrer la demande'}
                  </button>
                </div>
              </form>
              <aside className="border-t border-slate-200 bg-slate-50/80 p-6 xl:border-l xl:border-t-0 xl:p-8">
                <div className="flex items-center gap-3"><span className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><Info className="h-5 w-5" /></span><h3 className="font-bold text-slate-900">Pour une aide plus efficace</h3></div>
                <p className="mt-4 text-sm leading-7 text-slate-600">Indiquez le module concerné, le numéro du vol ou l'immatriculation de l'appareil, puis expliquez précisément les étapes ayant conduit au problème.</p>
                <p className="mt-4 text-sm leading-7 text-slate-600">Si un message d'erreur apparaît, recopiez-le pour faciliter le diagnostic.</p>
                <div className="mt-6 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900"><AlertTriangle className="mt-1 h-4 w-4 shrink-0" />L'enregistrement est uniquement local. Pour transmettre la demande à une équipe, il faudra connecter ce formulaire à votre API de support.</div>
              </aside>
            </div>
          </section>
        ) : activeSection === 'FAQ' ? (
          <section>
            <div className="mb-7 flex flex-col items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">{selectedItem?.icon}</span>
              <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Questions fréquentes</h1><p className="mt-1 text-sm leading-6 text-slate-500">Réponses aux questions les plus courantes concernant la gestion des vols.</p><p className="mt-3 text-xs text-slate-400">{FAQ_ITEMS.length} questions</p></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 sm:px-5">{FAQ_ITEMS.map(renderFaq)}</div>
          </section>
        ) : activeSection ? (
          <section>
            <div className="mb-7 flex flex-col items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">{selectedItem?.icon}</span>
              <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">{selectedItem?.label}</h1><p className="mt-1 text-sm leading-6 text-slate-600">{selectedItem?.description}</p><p className="mt-3 text-xs text-slate-400">{guideList.length} article{guideList.length === 1 ? '' : 's'}</p></div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 sm:px-5">
              <h2 className="border-b border-slate-200 py-4 text-base font-semibold text-slate-800">Guides et procédures</h2>
              {guideList.map((guide) => renderGuide(guide))}
            </div>
          </section>
        ) : (
          <>
            <section>
              <nav aria-label="Fil d’Ariane" className="mb-5 flex items-center gap-1.5 text-xs text-slate-500">
                <span>Toutes les rubriques</span>
                <ChevronRight className="h-3 w-3" />
                <span className="text-slate-700">Centre d’aide</span>
              </nav>
              <div className="mb-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <BookOpen className="h-6 w-6" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Centre d’aide</h1>
                <p className="mt-1.5 text-sm text-slate-600">Guides et documentation pour Airline Flight Scheduling.</p>
                <p className="mt-3 text-xs text-slate-400">
                  {Object.values(ALL_GUIDES).reduce((count, guides) => count + (guides?.length ?? 0), 0) + FAQ_ITEMS.length} articles et réponses
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {HELP_NAV_ITEMS.map((item) => {
                  const total = item.id === 'FAQ'
                    ? FAQ_ITEMS.length
                    : (ALL_GUIDES[item.id]?.length ?? 0);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectSection(item.id)}
                      className="group flex min-h-[205px] min-w-0 flex-col items-start rounded-lg border border-slate-300 bg-white p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 sm:min-h-[225px]"
                    >
                      <span className="mb-4 flex h-8 w-8 items-center justify-start text-slate-800 [&_svg]:h-6 [&_svg]:w-6" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span className="text-[15px] font-bold leading-5 text-slate-900">
                        {item.label}
                      </span>
                      <span className="mt-2 line-clamp-3 text-[13px] leading-[1.55] text-slate-600">
                        {item.description}. Retrouvez les explications et les procédures de cette rubrique.
                      </span>
                      <span className="mt-auto inline-flex items-center gap-2 pt-6 text-[13px] font-semibold text-emerald-700 transition-colors group-hover:text-emerald-900">
                        {item.id === 'SUPPORT' ? 'Contacter le support' : 'Explorer les articles'}
                        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </span>
                      {item.id !== 'SUPPORT' && (
                        <span className="sr-only"> — {total} article{total > 1 ? 's' : ''}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          </>
        )}

        {activeSection !== 'SUPPORT' && (
          <section className="flex flex-col items-start justify-between gap-5 rounded-2xl border border-emerald-100 bg-emerald-50/65 px-5 py-6 text-left sm:px-7 md:flex-row md:items-center">
            <div className="flex min-w-0 max-w-xl items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm"><Headphones className="h-7 w-7" /></span>
              <div><h2 className="text-lg font-bold text-slate-900 sm:text-xl">Vous avez encore besoin d'aide ?</h2><p className="mt-2 text-sm leading-6 text-slate-600">Si vous n'avez pas trouvé la réponse à votre question, décrivez votre problème dans notre espace de support.</p></div>
            </div>
            <button type="button" onClick={() => selectSection('SUPPORT')} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 sm:w-auto"><Headphones className="h-4 w-4" />Contacter le support</button>
          </section>
        )}
      </div>
    </main>
  );
};

export default HelpSupportPage;
