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
  LifeBuoy,
  Lock,
  Navigation,
  Plane,
  PlaneTakeoff,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
  UserCog,
  Users,
  Wrench,
  X,
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

type SupportPriority =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

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

const SUPPORT_STORAGE_KEY =
  'airline.help.support.tickets';

/* ============================================================================
 * NAVIGATION
 * ========================================================================== */

const HELP_NAV_ITEMS: HelpNavItem[] = [
  {
    id: 'START',
    label: 'Bien démarrer',
    description:
      'Connexion, navigation et rôles',
    icon: (
      <BookOpen className="h-4 w-4" />
    ),
  },

  {
    id: 'DASHBOARD',
    label: 'Tableau de bord',
    description:
      'Indicateurs et suivi opérationnel',
    icon: (
      <Gauge className="h-4 w-4" />
    ),
  },

  {
    id: 'FLIGHTS',
    label: 'Vols',
    description:
      'Création, modification et statuts',
    icon: (
      <Plane className="h-4 w-4" />
    ),
  },

  {
    id: 'SCHEDULING',
    label: 'Planning',
    description:
      'Rotations et scénarios',
    icon: (
      <Layers className="h-4 w-4" />
    ),
  },

  {
    id: 'FLEET',
    label: 'Flotte',
    description:
      'Appareils et disponibilité',
    icon: (
      <PlaneTakeoff className="h-4 w-4" />
    ),
  },

  {
    id: 'CREW',
    label: 'Équipages',
    description:
      'Affectation et contrôle du repos',
    icon: (
      <Users className="h-4 w-4" />
    ),
  },

  {
    id: 'MAINTENANCE',
    label: 'Maintenance',
    description:
      'Indisponibilités techniques',
    icon: (
      <Wrench className="h-4 w-4" />
    ),
  },

  {
    id: 'CONFLICTS',
    label: 'Conflits',
    description:
      'Détection et résolution',
    icon: (
      <AlertTriangle className="h-4 w-4" />
    ),
  },

  {
    id: 'WEATHER',
    label: 'Météo',
    description:
      'Risque et recommandations OCC',
    icon: (
      <Cloud className="h-4 w-4" />
    ),
  },

  {
    id: 'HISTORY',
    label: 'Historique',
    description:
      'Consultation des vols passés',
    icon: (
      <History className="h-4 w-4" />
    ),
  },

  {
    id: 'FAQ',
    label: 'Questions fréquentes',
    description:
      'Réponses rapides',
    icon: (
      <HelpCircle className="h-4 w-4" />
    ),
  },

  {
    id: 'SUPPORT',
    label: 'Support',
    description:
      'Signaler un problème',
    icon: (
      <Headphones className="h-4 w-4" />
    ),
  },
];

/* ============================================================================
 * GUIDES
 * ========================================================================== */

const START_GUIDES: GuideCardData[] = [
  {
    id: 'login',
    title: 'Se connecter à l’application',
    description:
      'Accéder à Airline Flight Scheduling avec votre compte.',
    icon: (
      <Lock className="h-5 w-5" />
    ),
    tone:
      'bg-emerald-50 text-emerald-700',
    steps: [
      'Ouvrez l’application Airline Flight Scheduling.',
      'Saisissez votre adresse e-mail.',
      'Saisissez votre mot de passe.',
      'Cliquez sur le bouton de connexion.',
      'Après authentification, l’application affiche les écrans autorisés pour votre rôle.',
    ],
    note:
      'Les menus accessibles peuvent varier selon votre profil utilisateur.',
  },

  {
    id: 'navigation',
    title: 'Naviguer dans l’application',
    description:
      'Utiliser la barre latérale et les différents modules.',
    icon: (
      <Navigation className="h-5 w-5" />
    ),
    tone:
      'bg-sky-50 text-sky-700',
    steps: [
      'Utilisez la barre latérale gauche pour changer de module sur ordinateur.',
      'Sur mobile, utilisez la navigation située en bas de l’écran.',
      'Cliquez sur Tableau de bord pour retrouver la vue opérationnelle générale.',
      'Utilisez Aide et support lorsque vous avez besoin d’une procédure.',
      'Votre dernier écran peut être restauré lors de votre prochaine utilisation.',
    ],
  },

  {
    id: 'roles',
    title: 'Comprendre les rôles',
    description:
      'Les fonctionnalités disponibles dépendent de votre profil.',
    icon: (
      <UserCog className="h-5 w-5" />
    ),
    tone:
      'bg-violet-50 text-violet-700',
    steps: [
      'Administrateur : gestion générale, utilisateurs et configuration.',
      'Planificateur : gestion des vols, flotte et construction du planning.',
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
    description:
      'Comprendre les informations principales affichées dès l’ouverture.',
    icon: (
      <Gauge className="h-5 w-5" />
    ),
    tone:
      'bg-emerald-50 text-emerald-700',
    steps: [
      'Total vols indique le nombre de vols suivis.',
      'OTP indique le niveau de ponctualité opérationnelle.',
      'Retardés indique les vols actuellement en retard.',
      'En vol indique les opérations en cours.',
      'Annulés indique les vols annulés.',
      'Le planning des rotations regroupe les vols selon les appareils affectés.',
    ],
  },

  {
    id: 'dashboard-filter',
    title: 'Rechercher et filtrer',
    description:
      'Retrouver rapidement un vol dans le planning.',
    icon: (
      <Search className="h-5 w-5" />
    ),
    tone:
      'bg-sky-50 text-sky-700',
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
    description:
      'Consulter les informations détaillées d’une rotation.',
    icon: (
      <Info className="h-5 w-5" />
    ),
    tone:
      'bg-slate-100 text-slate-700',
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
    id: 'create-flight',
    title: 'Créer un nouveau vol',
    description:
      'Ajouter une nouvelle opération au planning.',
    icon: (
      <Plane className="h-5 w-5" />
    ),
    tone:
      'bg-emerald-50 text-emerald-700',
    steps: [
      'Ouvrez Planification des Vols ou cliquez sur Nouveau vol.',
      'Saisissez le numéro du vol.',
      'Sélectionnez l’aéroport de départ.',
      'Sélectionnez l’aéroport d’arrivée.',
      'Renseignez la date et l’heure de départ.',
      'Renseignez la date et l’heure d’arrivée.',
      'Ajoutez une escale si nécessaire.',
      'Sélectionnez un appareil si vous souhaitez l’affecter immédiatement.',
      'Cliquez sur Enregistrer.',
    ],
    note:
      'L’heure d’arrivée doit être postérieure à l’heure de départ.',
  },

  {
    id: 'edit-flight',
    title: 'Modifier un vol',
    description:
      'Mettre à jour les informations d’un vol existant.',
    icon: (
      <Settings className="h-5 w-5" />
    ),
    tone:
      'bg-sky-50 text-sky-700',
    steps: [
      'Ouvrez le module Planification des Vols.',
      'Recherchez le vol concerné.',
      'Cliquez sur Modifier.',
      'Changez les informations nécessaires.',
      'Vérifiez les horaires et l’appareil affecté.',
      'Enregistrez les modifications.',
      'Corrigez les conflits éventuels signalés par l’application.',
    ],
  },

  {
    id: 'status-flight',
    title: 'Comprendre les statuts',
    description:
      'Identifier rapidement l’état d’un vol.',
    icon: (
      <Activity className="h-5 w-5" />
    ),
    tone:
      'bg-violet-50 text-violet-700',
    steps: [
      'Planifié : le vol est programmé.',
      'Retardé : le vol est toujours prévu mais son horaire a été décalé.',
      'En vol : l’opération est actuellement en cours.',
      'Effectué : le vol est terminé.',
      'Annulé : le vol ne sera pas exécuté.',
    ],
  },

  {
    id: 'flight-time',
    title: 'Comprendre les horaires',
    description:
      'Distinguer les heures locales et la référence UTC.',
    icon: (
      <Clock3 className="h-5 w-5" />
    ),
    tone:
      'bg-amber-50 text-amber-700',
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
    description:
      'Lire le planning organisé par appareil.',
    icon: (
      <Layers className="h-5 w-5" />
    ),
    tone:
      'bg-sky-50 text-sky-700',
    steps: [
      'Ouvrez Ordonnancement ou consultez le planning depuis le tableau de bord.',
      'Chaque bloc appareil regroupe ses rotations.',
      'Les vols non affectés sont regroupés dans Non assigné.',
      'Consultez les heures de départ et d’arrivée.',
      'Cliquez sur une rotation pour afficher sa fiche.',
    ],
  },

  {
    id: 'generate-planning',
    title: 'Générer un scénario',
    description:
      'Créer une proposition automatique de planning.',
    icon: (
      <Sparkles className="h-5 w-5" />
    ),
    tone:
      'bg-violet-50 text-violet-700',
    steps: [
      'Définissez la période concernée.',
      'Lancez la génération du scénario.',
      'Les vols planifiables sont analysés.',
      'Les appareils disponibles sont recherchés.',
      'Les contraintes de maintenance, disponibilité et positionnement sont contrôlées.',
      'Le système construit une proposition.',
      'Consultez le résultat.',
      'Validez, ajustez ou rejetez le scénario.',
    ],
    note:
      'La génération crée une proposition, pas une publication automatique.',
  },

  {
    id: 'validate-planning',
    title: 'Valider un scénario',
    description:
      'Vérifier un planning avant son application.',
    icon: (
      <ShieldCheck className="h-5 w-5" />
    ),
    tone:
      'bg-emerald-50 text-emerald-700',
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
    description:
      'Obtenir des alternatives lors d’une situation complexe.',
    icon: (
      <Cpu className="h-5 w-5" />
    ),
    tone:
      'bg-amber-50 text-amber-700',
    steps: [
      'Cliquez sur Optimiser.',
      'Attendez la fin de l’analyse.',
      'Consultez les conflits identifiés.',
      'Comparez les solutions proposées.',
      'Choisissez la réaffectation ou le décalage approprié.',
      'Validez manuellement la solution retenue.',
    ],
    note:
      'L’outil aide à décider mais n’applique pas seul une décision critique.',
  },
];

const FLEET_GUIDES: GuideCardData[] = [
  {
    id: 'fleet-read',
    title: 'Consulter la flotte',
    description:
      'Afficher les appareils disponibles.',
    icon: (
      <PlaneTakeoff className="h-5 w-5" />
    ),
    tone:
      'bg-emerald-50 text-emerald-700',
    steps: [
      'Ouvrez Gestion de la Flotte.',
      'Consultez la liste des appareils.',
      'Vérifiez l’immatriculation.',
      'Consultez le modèle.',
      'Vérifiez la capacité.',
      'Vérifiez la base de l’appareil.',
      'Consultez son statut opérationnel.',
    ],
  },

  {
    id: 'aircraft-status',
    title: 'Comprendre le statut d’un appareil',
    description:
      'Savoir rapidement si un avion peut être utilisé.',
    icon: (
      <Activity className="h-5 w-5" />
    ),
    tone:
      'bg-sky-50 text-sky-700',
    steps: [
      'Active : appareil normalement disponible pour la planification.',
      'Maintenance : appareil temporairement indisponible.',
      'Out of Service : appareil hors service.',
      'Retired : appareil retiré de l’exploitation.',
    ],
  },

  {
    id: 'aircraft-assign',
    title: 'Affecter un appareil',
    description:
      'Associer un avion disponible à un vol.',
    icon: (
      <Plane className="h-5 w-5" />
    ),
    tone:
      'bg-violet-50 text-violet-700',
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
    description:
      'Ajouter une affectation sur un vol.',
    icon: (
      <Users className="h-5 w-5" />
    ),
    tone:
      'bg-sky-50 text-sky-700',
    steps: [
      'Ouvrez Affectation des Équipages.',
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
    description:
      'Comprendre les rôles proposés lors d’une affectation.',
    icon: (
      <User className="h-5 w-5" />
    ),
    tone:
      'bg-violet-50 text-violet-700',
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
    description:
      'Identifier pourquoi un membre ne peut pas être affecté.',
    icon: (
      <AlertTriangle className="h-5 w-5" />
    ),
    tone:
      'bg-amber-50 text-amber-700',
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
    description:
      'Créer une période d’indisponibilité technique.',
    icon: (
      <Wrench className="h-5 w-5" />
    ),
    tone:
      'bg-orange-50 text-orange-700',
    steps: [
      'Ouvrez Planification Maintenance.',
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
    description:
      'Savoir pourquoi un appareil devient indisponible.',
    icon: (
      <AlertTriangle className="h-5 w-5" />
    ),
    tone:
      'bg-rose-50 text-rose-700',
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
    description:
      'Identifier les principaux conflits opérationnels.',
    icon: (
      <AlertTriangle className="h-5 w-5" />
    ),
    tone:
      'bg-amber-50 text-amber-700',
    steps: [
      'Horaires invalides : la fenêtre temporelle n’est pas cohérente.',
      'Avion non assigné : aucun appareil n’est associé au vol.',
      'Avion indisponible : l’appareil ne peut pas être utilisé.',
      'Chevauchement avion : le même appareil est utilisé sur deux vols simultanément.',
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
    description:
      'Suivre une procédure simple de correction.',
    icon: (
      <ShieldCheck className="h-5 w-5" />
    ),
    tone:
      'bg-emerald-50 text-emerald-700',
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
    description:
      'Interpréter le niveau affiché sur un vol.',
    icon: (
      <Cloud className="h-5 w-5" />
    ),
    tone:
      'bg-sky-50 text-sky-700',
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
    description:
      'La valeur opérationnelle augmente à l’approche du départ.',
    icon: (
      <Clock3 className="h-5 w-5" />
    ),
    tone:
      'bg-violet-50 text-violet-700',
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
    description:
      'Utiliser la recommandation affichée sans automatiser la décision.',
    icon: (
      <ShieldCheck className="h-5 w-5" />
    ),
    tone:
      'bg-emerald-50 text-emerald-700',
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
    description:
      'Retrouver les opérations déjà passées.',
    icon: (
      <History className="h-5 w-5" />
    ),
    tone:
      'bg-slate-100 text-slate-700',
    steps: [
      'Ouvrez Historique des Vols.',
      'Utilisez la recherche pour retrouver un vol.',
      'Filtrez par statut.',
      'Choisissez une période si nécessaire.',
      'Cliquez sur Détails pour consulter les informations.',
    ],
  },

  {
    id: 'history-details',
    title: 'Lire les détails historiques',
    description:
      'Consulter les informations enregistrées pour un vol passé.',
    icon: (
      <FileQuestion className="h-5 w-5" />
    ),
    tone:
      'bg-sky-50 text-sky-700',
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
  {
    id: 'faq1',
    category: 'Vols',
    question:
      'Pourquoi mon vol apparaît-il comme Non assigné ?',
    answer:
      'Cela signifie qu’aucun appareil n’est actuellement affecté au vol. Vous pouvez sélectionner un appareil disponible ou utiliser une proposition de planning.',
    keywords: [
      'non assigné',
      'avion',
      'affectation',
    ],
  },

  {
    id: 'faq2',
    category: 'Vols',
    question:
      'Pourquoi l’heure d’arrivée est-elle refusée ?',
    answer:
      'L’heure d’arrivée doit être postérieure à l’heure de départ. Vérifiez également les dates lorsque le vol traverse minuit.',
    keywords: [
      'heure',
      'arrivée',
      'départ',
    ],
  },

  {
    id: 'faq3',
    category: 'Planning',
    question:
      'Quels vols sont utilisés lors d’une génération ?',
    answer:
      'Les vols Planifiés et Retardés peuvent être utilisés. Les vols En vol, Effectués et Annulés sont exclus.',
    keywords: [
      'génération',
      'planning',
      'statut',
    ],
  },

  {
    id: 'faq4',
    category: 'Planning',
    question:
      'L’optimisation modifie-t-elle automatiquement le planning ?',
    answer:
      'Non. Elle propose des alternatives que l’utilisateur autorisé doit examiner et valider.',
    keywords: [
      'optimisation',
      'automatique',
      'validation',
    ],
  },

  {
    id: 'faq5',
    category: 'Flotte',
    question:
      'Pourquoi un avion ne peut-il pas être affecté ?',
    answer:
      'Il peut être déjà utilisé, indisponible, en maintenance, hors service ou mal positionné.',
    keywords: [
      'avion',
      'indisponible',
      'maintenance',
    ],
  },

  {
    id: 'faq6',
    category: 'Équipage',
    question:
      'Pourquoi mon affectation équipage est-elle refusée ?',
    answer:
      'Le membre peut déjà être affecté sur un autre vol ou ne pas respecter le temps de repos nécessaire.',
    keywords: [
      'équipage',
      'repos',
      'chevauchement',
    ],
  },

  {
    id: 'faq7',
    category: 'Météo',
    question:
      'La météo peut-elle annuler automatiquement un vol ?',
    answer:
      'Non. Le système peut recommander une révision ou un retard, mais la décision finale reste manuelle.',
    keywords: [
      'météo',
      'annulation',
      'occ',
    ],
  },

  {
    id: 'faq8',
    category: 'Horaires',
    question:
      'Pourquoi l’heure locale est-elle différente de l’heure UTC ?',
    answer:
      'Chaque aéroport possède son propre fuseau horaire. L’UTC sert de référence commune alors que l’heure locale sert à l’affichage opérationnel.',
    keywords: [
      'utc',
      'heure locale',
      'fuseau',
    ],
  },

  {
    id: 'faq9',
    category: 'Historique',
    question:
      'Pourquoi consulter l’historique des vols ?',
    answer:
      'Il permet de retrouver les opérations passées, leurs horaires, leur statut final et les principales informations opérationnelles.',
    keywords: [
      'historique',
      'vol effectué',
    ],
  },

  {
    id: 'faq10',
    category: 'Accès',
    question:
      'Pourquoi certains menus ne sont-ils pas visibles ?',
    answer:
      'Les menus dépendent de votre rôle et des permissions associées à votre compte.',
    keywords: [
      'rôle',
      'permission',
      'menu',
    ],
  },
];

/* ============================================================================
 * SUPPORT LABELS
 * ========================================================================== */

const SUPPORT_CATEGORY_LABELS:
  Record<
    SupportCategory,
    string
  > = {
    GENERAL:
      'Question générale',

    AUTH:
      'Connexion',

    DASHBOARD:
      'Tableau de bord',

    FLIGHTS:
      'Vols',

    SCHEDULING:
      'Planning',

    FLEET:
      'Flotte',

    CREW:
      'Équipages',

    MAINTENANCE:
      'Maintenance',

    CONFLICTS:
      'Conflits',

    WEATHER:
      'Météo',

    HISTORY:
      'Historique',

    TECHNICAL:
      'Problème technique',
  };

const SUPPORT_PRIORITY_LABELS:
  Record<
    SupportPriority,
    string
  > = {
    LOW:
      'Faible',

    MEDIUM:
      'Normale',

    HIGH:
      'Élevée',

    CRITICAL:
      'Critique',
  };

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

const HelpSupportPage:
  React.FC = () => {
    const [
      activeSection,
      setActiveSection,
    ] =
      useState<HelpSection>(
        'START',
      );

    const [
      expandedGuide,
      setExpandedGuide,
    ] =
      useState<
        string | null
      >(null);

    const [
      expandedFaq,
      setExpandedFaq,
    ] =
      useState<
        string | null
      >(null);

    const [
      searchQuery,
      setSearchQuery,
    ] =
      useState('');

    const [
      supportForm,
      setSupportForm,
    ] =
      useState<SupportForm>({
        subject: '',
        category: 'GENERAL',
        priority: 'MEDIUM',
        description: '',
      });

    const [
      supportSuccess,
      setSupportSuccess,
    ] =
      useState('');

    const [
      supportError,
      setSupportError,
    ] =
      useState('');

    const [
      sending,
      setSending,
    ] =
      useState(false);

    /* =========================================================================
     * ACTIVE NAV ITEM
     * ======================================================================= */

    const activeNavItem =
      useMemo(
        () =>
          HELP_NAV_ITEMS.find(
            (item) =>
              item.id ===
              activeSection,
          ) ??
          HELP_NAV_ITEMS[0],
        [activeSection],
      );

    /* =========================================================================
     * FAQ FILTER
     * ======================================================================= */

    const filteredFaq =
      useMemo(
        () => {
          const query =
            searchQuery
              .trim()
              .toLowerCase();

          if (!query) {
            return FAQ_ITEMS;
          }

          return FAQ_ITEMS.filter(
            (faq) =>
              [
                faq.category,
                faq.question,
                faq.answer,
                ...faq.keywords,
              ]
                .join(' ')
                .toLowerCase()
                .includes(
                  query,
                ),
          );
        },
        [searchQuery],
      );

    /* =========================================================================
     * SUPPORT
     * ======================================================================= */

    const handleSubmitSupport =
      async (
        event:
          React.FormEvent,
      ) => {
        event.preventDefault();

        setSupportSuccess('');
        setSupportError('');

        if (
          !supportForm.subject.trim() ||
          !supportForm.description.trim()
        ) {
          setSupportError(
            'Veuillez renseigner le sujet et la description.',
          );

          return;
        }

        setSending(true);

        try {
          const ticket:
            LocalTicket = {
              id:
                `SUP-${Date.now()
                  .toString()
                  .slice(-8)}`,

              subject:
                supportForm.subject.trim(),

              category:
                supportForm.category,

              priority:
                supportForm.priority,

              createdAt:
                new Date().toISOString(),
            };

          const previous =
            JSON.parse(
              localStorage.getItem(
                SUPPORT_STORAGE_KEY,
              ) || '[]',
            );

          const tickets =
            Array.isArray(
              previous,
            )
              ? [
                  ticket,
                  ...previous,
                ].slice(
                  0,
                  20,
                )
              : [ticket];

          localStorage.setItem(
            SUPPORT_STORAGE_KEY,
            JSON.stringify(
              tickets,
            ),
          );

          setSupportSuccess(
            `Votre demande ${ticket.id} a été enregistrée.`,
          );

          setSupportForm({
            subject: '',
            category: 'GENERAL',
            priority: 'MEDIUM',
            description: '',
          });
        } catch {
          setSupportError(
            'Impossible d’enregistrer votre demande.',
          );
        } finally {
          setSending(false);
        }
      };

    /* =========================================================================
     * GUIDE SOURCE
     * ======================================================================= */

    const getGuidesForSection =
      (
        section:
          HelpSection,
      ): GuideCardData[] => {
        switch (section) {
          case 'START':
            return START_GUIDES;

          case 'DASHBOARD':
            return DASHBOARD_GUIDES;

          case 'FLIGHTS':
            return FLIGHT_GUIDES;

          case 'SCHEDULING':
            return SCHEDULING_GUIDES;

          case 'FLEET':
            return FLEET_GUIDES;

          case 'CREW':
            return CREW_GUIDES;

          case 'MAINTENANCE':
            return MAINTENANCE_GUIDES;

          case 'CONFLICTS':
            return CONFLICT_GUIDES;

          case 'WEATHER':
            return WEATHER_GUIDES;

          case 'HISTORY':
            return HISTORY_GUIDES;

          default:
            return [];
        }
      };

    const currentGuides =
      getGuidesForSection(
        activeSection,
      );

    /* =========================================================================
     * RENDER
     * ======================================================================= */

    return (
      <div className="min-h-screen bg-slate-100 text-slate-800">

        <div className="mx-auto max-w-[1500px] space-y-4">

          {/* ===================================================================
              HEADER
          =================================================================== */}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">

              <div className="flex min-w-0 items-center gap-3">

                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white shadow-sm">

                  <LifeBuoy className="h-5 w-5" />

                  <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" />

                </div>

                <div className="min-w-0">

                  <div className="flex flex-wrap items-center gap-2">

                    <h1 className="text-base font-black tracking-tight text-slate-950 sm:text-lg">
                      Aide et support
                    </h1>

                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">
                      Guide utilisateur
                    </span>

                  </div>

                  <p className="mt-1 max-w-3xl text-[11px] font-medium leading-5 text-slate-500">
                    Retrouvez les procédures essentielles pour utiliser
                    les vols, le planning, la flotte, les équipages,
                    la maintenance, la météo et l’historique.
                  </p>

                </div>

              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveSection(
                    'SUPPORT',
                  );

                  setExpandedGuide(
                    null,
                  );

                  setExpandedFaq(
                    null,
                  );
                }}
                className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800 lg:self-auto"
              >

                <Headphones className="h-4 w-4" />

                Besoin d’aide

              </button>

            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 text-[10px] font-semibold text-slate-500 sm:px-5">

              <span className="inline-flex items-center gap-1.5">

                <BookOpen className="h-3.5 w-3.5 text-emerald-600" />

                <strong className="text-slate-700">
                  10
                </strong>

                modules couverts

              </span>

              <span className="inline-flex items-center gap-1.5">

                <HelpCircle className="h-3.5 w-3.5 text-sky-500" />

                <strong className="text-slate-700">
                  {FAQ_ITEMS.length}
                </strong>

                questions fréquentes

              </span>

              <span className="inline-flex items-center gap-1.5">

                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />

                Guide orienté utilisateur

              </span>

            </div>

          </section>

          {/* ===================================================================
              NAVIGATION HORIZONTALE
          =================================================================== */}

          <section className="sticky top-[84px] z-20 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur">

            <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">

              <div>

                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Guide de l’application
                </span>

                <p className="mt-0.5 text-[10px] text-slate-500">
                  Sélectionnez un module pour afficher son aide.
                </p>

              </div>

              <div className="hidden items-center gap-1.5 text-[9px] font-semibold text-slate-400 sm:flex">

                <BookOpen className="h-3.5 w-3.5 text-emerald-600" />

                {
                  HELP_NAV_ITEMS.length
                } sections

              </div>

            </div>

            <div className="overflow-x-auto">

              <nav className="flex min-w-max items-stretch gap-1 p-2">

                {HELP_NAV_ITEMS.map(
                  (item) => {

                    const active =
                      activeSection ===
                      item.id;

                    return (

                      <button
                        key={
                          item.id
                        }
                        type="button"
                        onClick={() => {
                          setActiveSection(
                            item.id,
                          );

                          setExpandedGuide(
                            null,
                          );

                          setExpandedFaq(
                            null,
                          );
                        }}
                        title={
                          item.description
                        }
                        className={`group relative flex h-[54px] min-w-[120px] items-center gap-2.5 rounded-xl px-3 text-left transition-all duration-200 ${
                          active
                            ? 'bg-emerald-700 text-white shadow-sm shadow-emerald-700/20'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >

                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition ${
                            active
                              ? 'bg-white/15 text-white'
                              : 'bg-slate-100 text-slate-500 group-hover:bg-white group-hover:text-emerald-700'
                          }`}
                        >

                          {
                            item.icon
                          }

                        </span>

                        <span className="min-w-0">

                          <span className="block whitespace-nowrap text-[10px] font-black">
                            {
                              item.label
                            }
                          </span>

                          <span
                            className={`mt-0.5 block max-w-[125px] truncate whitespace-nowrap text-[8px] font-medium ${
                              active
                                ? 'text-emerald-100'
                                : 'text-slate-400'
                            }`}
                          >
                            {
                              item.description
                            }
                          </span>

                        </span>

                        {active && (

                          <span className="absolute bottom-0 left-1/2 h-0.5 w-8 -translate-x-1/2 rounded-t-full bg-white" />

                        )}

                      </button>

                    );
                  },
                )}

              </nav>

            </div>

          </section>

          {/* ===================================================================
              CONTENU
          =================================================================== */}

          <div className="min-w-0 space-y-4">

            {/* =================================================================
                CONTEXT HEADER
            ================================================================= */}

            {activeSection !==
              'FAQ' &&
              activeSection !==
                'SUPPORT' && (

              <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">

                <div className="flex items-center gap-3">

                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">

                    {
                      activeNavItem.icon
                    }

                  </div>

                  <div>

                    <h2 className="text-sm font-black text-slate-900">

                      {
                        activeNavItem.label
                      }

                    </h2>

                    <p className="mt-0.5 text-[10px] text-slate-400">

                      {
                        activeNavItem.description
                      }

                    </p>

                  </div>

                </div>

              </section>

            )}

            {/* =================================================================
                GUIDE GRID
            ================================================================= */}

            {currentGuides.length >
              0 && (

              <section className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">

                {currentGuides.map(
                  (guide) => {

                    const expanded =
                      expandedGuide ===
                      guide.id;

                    return (

                      <article
                        key={
                          guide.id
                        }
                        className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
                          expanded
                            ? 'border-emerald-200 shadow-md'
                            : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
                        }`}
                      >

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedGuide(
                              expanded
                                ? null
                                : guide.id,
                            )
                          }
                          className="w-full p-4 text-left"
                        >

                          <div className="flex items-start gap-3">

                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${guide.tone}`}
                            >

                              {
                                guide.icon
                              }

                            </div>

                            <div className="min-w-0 flex-1">

                              <div className="flex items-start justify-between gap-3">

                                <h3 className="text-xs font-black leading-5 text-slate-900">

                                  {
                                    guide.title
                                  }

                                </h3>

                                <span
                                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                                    expanded
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-slate-50 text-slate-400'
                                  }`}
                                >

                                  {expanded ? (

                                    <ChevronUp className="h-3.5 w-3.5" />

                                  ) : (

                                    <ChevronDown className="h-3.5 w-3.5" />

                                  )}

                                </span>

                              </div>

                              <p className="mt-1 text-[10px] leading-5 text-slate-500">

                                {
                                  guide.description
                                }

                              </p>

                            </div>

                          </div>

                        </button>

                        {expanded && (

                          <div className="border-t border-slate-100 bg-slate-50/60 p-4">

                            <div className="relative">

                              <div className="absolute bottom-2 left-[10px] top-2 w-px bg-slate-200" />

                              <ol className="relative space-y-3">

                                {guide.steps.map(
                                  (
                                    step,
                                    index,
                                  ) => (

                                    <li
                                      key={`${guide.id}-${index}`}
                                      className="flex gap-3"
                                    >

                                      <span className="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[8px] font-black text-white shadow-sm">

                                        {
                                          index +
                                          1
                                        }

                                      </span>

                                      <p className="pt-0.5 text-[10px] leading-5 text-slate-600">

                                        {
                                          step
                                        }

                                      </p>

                                    </li>

                                  ),
                                )}

                              </ol>

                            </div>

                            {guide.note && (

                              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">

                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />

                                <p className="text-[9px] font-medium leading-4 text-amber-900">

                                  {
                                    guide.note
                                  }

                                </p>

                              </div>

                            )}

                          </div>

                        )}

                      </article>

                    );
                  },
                )}

              </section>

            )}

            {/* =================================================================
                FAQ
            ================================================================= */}

            {activeSection ===
              'FAQ' && (

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

                <SectionHeader
                  icon={
                    <HelpCircle className="h-4 w-4" />
                  }
                  title="Questions fréquentes"
                  subtitle="Retrouvez rapidement une réponse aux problèmes les plus courants"
                />

                <div className="border-b border-slate-100 bg-slate-50/60 p-4">

                  <div className="relative max-w-2xl">

                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                    <input
                      value={
                        searchQuery
                      }
                      onChange={(
                        event,
                      ) =>
                        setSearchQuery(
                          event.target.value,
                        )
                      }
                      placeholder="Rechercher : équipage, avion, météo, horaire..."
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-xs font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />

                    {searchQuery && (

                      <button
                        type="button"
                        onClick={() =>
                          setSearchQuery(
                            '',
                          )
                        }
                        className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                      >

                        <X className="h-3.5 w-3.5" />

                      </button>

                    )}

                  </div>

                </div>

                {filteredFaq.length ===
                0 ? (

                  <div className="flex min-h-[260px] flex-col items-center justify-center p-6 text-center">

                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">

                      <FileQuestion className="h-5 w-5" />

                    </div>

                    <h3 className="mt-3 text-sm font-black text-slate-700">
                      Aucun résultat
                    </h3>

                    <p className="mt-1 text-xs text-slate-400">
                      Essayez un autre mot-clé.
                    </p>

                  </div>

                ) : (

                  <div className="divide-y divide-slate-100">

                    {filteredFaq.map(
                      (faq) => {

                        const expanded =
                          expandedFaq ===
                          faq.id;

                        return (

                          <div
                            key={
                              faq.id
                            }
                          >

                            <button
                              type="button"
                              onClick={() =>
                                setExpandedFaq(
                                  expanded
                                    ? null
                                    : faq.id,
                                )
                              }
                              className={`flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition ${
                                expanded
                                  ? 'bg-emerald-50/40'
                                  : 'hover:bg-slate-50'
                              }`}
                            >

                              <div className="min-w-0">

                                <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-slate-500">

                                  {
                                    faq.category
                                  }

                                </span>

                                <p className="mt-1.5 text-xs font-bold leading-5 text-slate-800">

                                  {
                                    faq.question
                                  }

                                </p>

                              </div>

                              <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                                  expanded
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-slate-100 text-slate-400'
                                }`}
                              >

                                {expanded ? (

                                  <ChevronUp className="h-3.5 w-3.5" />

                                ) : (

                                  <ChevronDown className="h-3.5 w-3.5" />

                                )}

                              </span>

                            </button>

                            {expanded && (

                              <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">

                                <p className="max-w-4xl text-[11px] leading-6 text-slate-600">

                                  {
                                    faq.answer
                                  }

                                </p>

                              </div>

                            )}

                          </div>

                        );
                      },
                    )}

                  </div>

                )}

              </section>

            )}

            {/* =================================================================
                SUPPORT
            ================================================================= */}

            {activeSection ===
              'SUPPORT' && (

              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

                <SectionHeader
                  icon={
                    <Headphones className="h-4 w-4" />
                  }
                  title="Contacter le support"
                  subtitle="Décrivez le problème rencontré dans l’application"
                />

                <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">

                  <form
                    onSubmit={
                      handleSubmitSupport
                    }
                    className="space-y-4 p-5"
                  >

                    {supportSuccess && (

                      <MessageBox
                        type="success"
                        text={
                          supportSuccess
                        }
                      />

                    )}

                    {supportError && (

                      <MessageBox
                        type="error"
                        text={
                          supportError
                        }
                      />

                    )}

                    <label className="block">

                      <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                        Sujet *
                      </span>

                      <input
                        required
                        value={
                          supportForm.subject
                        }
                        onChange={(
                          event,
                        ) =>
                          setSupportForm(
                            (
                              current,
                            ) => ({
                              ...current,

                              subject:
                                event.target.value,
                            }),
                          )
                        }
                        placeholder="Ex. Impossible d’affecter un équipage"
                        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                      />

                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">

                      <label>

                        <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                          Module concerné
                        </span>

                        <select
                          value={
                            supportForm.category
                          }
                          onChange={(
                            event,
                          ) =>
                            setSupportForm(
                              (
                                current,
                              ) => ({
                                ...current,

                                category:
                                  event.target.value as SupportCategory,
                              }),
                            )
                          }
                          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:bg-white"
                        >

                          {Object.entries(
                            SUPPORT_CATEGORY_LABELS,
                          ).map(
                            (
                              [
                                value,
                                label,
                              ],
                            ) => (

                              <option
                                key={
                                  value
                                }
                                value={
                                  value
                                }
                              >
                                {
                                  label
                                }
                              </option>

                            ),
                          )}

                        </select>

                      </label>

                      <label>

                        <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                          Priorité
                        </span>

                        <select
                          value={
                            supportForm.priority
                          }
                          onChange={(
                            event,
                          ) =>
                            setSupportForm(
                              (
                                current,
                              ) => ({
                                ...current,

                                priority:
                                  event.target.value as SupportPriority,
                              }),
                            )
                          }
                          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500 focus:bg-white"
                        >

                          {Object.entries(
                            SUPPORT_PRIORITY_LABELS,
                          ).map(
                            (
                              [
                                value,
                                label,
                              ],
                            ) => (

                              <option
                                key={
                                  value
                                }
                                value={
                                  value
                                }
                              >
                                {
                                  label
                                }
                              </option>

                            ),
                          )}

                        </select>

                      </label>

                    </div>

                    <label className="block">

                      <span className="mb-1.5 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                        Description *
                      </span>

                      <textarea
                        required
                        rows={6}
                        value={
                          supportForm.description
                        }
                        onChange={(
                          event,
                        ) =>
                          setSupportForm(
                            (
                              current,
                            ) => ({
                              ...current,

                              description:
                                event.target.value,
                            }),
                          )
                        }
                        placeholder="Décrivez ce que vous faisiez, le vol ou la ressource concernée, puis le message affiché..."
                        className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium leading-6 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                      />

                    </label>

                    <div className="flex justify-end border-t border-slate-100 pt-4">

                      <button
                        type="submit"
                        disabled={
                          sending
                        }
                        className="inline-flex h-10 min-w-[165px] items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-xs font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >

                        {sending ? (

                          <RefreshCw className="h-4 w-4 animate-spin" />

                        ) : (

                          <Send className="h-4 w-4" />

                        )}

                        {sending
                          ? 'Enregistrement...'
                          : 'Envoyer la demande'}

                      </button>

                    </div>

                  </form>

                  <aside className="border-t border-slate-200 bg-slate-50/70 p-5 lg:border-l lg:border-t-0">

                    <div className="flex items-center gap-2">

                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">

                        <Info className="h-4 w-4" />

                      </div>

                      <div>

                        <h3 className="text-xs font-black text-slate-800">
                          Pour obtenir une aide rapide
                        </h3>

                        <p className="mt-0.5 text-[9px] text-slate-400">
                          Donnez le maximum d’informations utiles.
                        </p>

                      </div>

                    </div>

                    <div className="mt-4 space-y-3">

                      <SupportTip
                        number={1}
                        text="Indiquez le module où le problème apparaît."
                      />

                      <SupportTip
                        number={2}
                        text="Précisez le numéro de vol ou l’appareil concerné."
                      />

                      <SupportTip
                        number={3}
                        text="Copiez le message d’erreur exactement."
                      />

                      <SupportTip
                        number={4}
                        text="Expliquez l’action effectuée juste avant le problème."
                      />

                      <SupportTip
                        number={5}
                        text="Précisez ce que vous attendiez comme résultat."
                      />

                    </div>

                    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3">

                      <div className="flex items-start gap-2">

                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />

                        <p className="text-[9px] font-medium leading-4 text-amber-900">
                          Pour une situation opérationnelle importante,
                          vérifiez toujours le vol et les ressources avant
                          de valider une modification.
                        </p>

                      </div>

                    </div>

                  </aside>

                </div>

              </section>

            )}

          </div>

        </div>

      </div>
    );
  };

/* ============================================================================
 * SECTION HEADER
 * ========================================================================== */

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon:
    React.ReactNode;

  title:
    string;

  subtitle:
    string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">

      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">

        {icon}

      </div>

      <div>

        <h2 className="text-sm font-black text-slate-900">
          {title}
        </h2>

        <p className="mt-0.5 text-[10px] text-slate-400">
          {subtitle}
        </p>

      </div>

    </div>
  );
}

/* ============================================================================
 * MESSAGE
 * ========================================================================== */

function MessageBox({
  type,
  text,
}: {
  type:
    | 'success'
    | 'error';

  text:
    string;
}) {
  const success =
    type ===
    'success';

  return (
    <div
      className={`flex items-start gap-2 rounded-xl border p-3 text-xs font-semibold ${
        success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : 'border-rose-200 bg-rose-50 text-rose-800'
      }`}
    >

      {success ? (

        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />

      ) : (

        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />

      )}

      <span>
        {text}
      </span>

    </div>
  );
}

/* ============================================================================
 * SUPPORT TIP
 * ========================================================================== */

function SupportTip({
  number,
  text,
}: {
  number:
    number;

  text:
    string;
}) {
  return (
    <div className="flex items-start gap-3">

      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-[8px] font-black text-white">
        {number}
      </span>

      <p className="pt-0.5 text-[10px] leading-4 text-slate-600">
        {text}
      </p>

    </div>
  );
}

export default HelpSupportPage;