import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  Plane,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { useCrewAssignments } from './useCrewAssignments';

/* ============================================================================
 * DESIGN TOKENS
 * ========================================================================== */

const FOCUS_RING =
  'outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10';

const MIN_REST_HOURS = 11;

/* ============================================================================
 * HELPERS
 * ========================================================================== */

const getInitials = (name?: string | null): string => {
  if (!name) return '??';
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
};

const formatRestHours = (hours?: number | null): string => {
  if (hours == null || !Number.isFinite(hours)) return '--';
  return `${hours.toFixed(1)} h`;
};

/* ============================================================================
 * SOUS-COMPOSANTS
 * ========================================================================== */

function KpiCard({
  label,
  value,
  hint,
  icon,
  accent = 'emerald',
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
  accent?: 'emerald' | 'amber' | 'sky' | 'violet';
}) {
  const accents = {
    emerald: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-600',
      value: 'text-emerald-700',
      bar: 'from-emerald-400/80 to-emerald-500/40',
    },
    amber: {
      bg: 'bg-amber-50',
      text: 'text-amber-600',
      value: 'text-amber-700',
      bar: 'from-amber-400/80 to-amber-500/40',
    },
    sky: {
      bg: 'bg-sky-50',
      text: 'text-sky-600',
      value: 'text-sky-700',
      bar: 'from-sky-400/80 to-sky-500/40',
    },
    violet: {
      bg: 'bg-violet-50',
      text: 'text-violet-600',
      value: 'text-violet-700',
      bar: 'from-violet-400/80 to-violet-500/40',
    },
  }[accent];

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      <div className={`absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r ${accents.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] font-medium text-slate-500">{label}</span>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accents.bg} ${accents.text} transition-transform group-hover:scale-110`}
        >
          {icon}
        </div>
      </div>
      <div className="mt-5 flex items-baseline gap-2">
        <span className={`text-[28px] font-bold tabular-nums leading-none tracking-tight ${accents.value}`}>
          {value}
        </span>
      </div>
      <p className="mt-2 text-[11px] font-medium text-slate-400">{hint}</p>
    </article>
  );
}

function AlertBanner({
  type,
  text,
}: {
  type: 'success' | 'error' | 'info';
  text: string;
}) {
  const config = {
    success: {
      ring: 'border-emerald-200 bg-emerald-50/70',
      icon: 'bg-emerald-100 text-emerald-700',
      title: 'text-emerald-800',
      body: 'text-emerald-700',
      Icon: CheckCircle2,
      label: 'Opération réussie',
    },
    error: {
      ring: 'border-rose-200 bg-rose-50/70',
      icon: 'bg-rose-100 text-rose-700',
      title: 'text-rose-800',
      body: 'text-rose-700',
      Icon: AlertCircle,
      label: 'Action impossible',
    },
    info: {
      ring: 'border-sky-200 bg-sky-50/70',
      icon: 'bg-sky-100 text-sky-700',
      title: 'text-sky-800',
      body: 'text-sky-700',
      Icon: Info,
      label: 'Information',
    },
  }[type];

  const { Icon } = config;

  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-sm ${config.ring}`}
      role="alert"
    >
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.icon}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${config.title}`}>{config.label}</p>
        <p className={`mt-0.5 text-xs leading-5 ${config.body}`}>{text}</p>
      </div>
    </div>
  );
}

function RestBar({ hours }: { hours: number }) {
  const pct = Math.min(100, Math.max(0, (hours / MIN_REST_HOURS) * 100));
  const isOk = hours >= MIN_REST_HOURS;
  const isCritical = hours < MIN_REST_HOURS * 0.7;

  const barColor = isCritical
    ? 'bg-gradient-to-r from-rose-400 to-rose-500'
    : isOk
      ? 'bg-gradient-to-r from-emerald-400 to-emerald-500'
      : 'bg-gradient-to-r from-amber-400 to-amber-500';

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatusDot({ status }: { status: 'available' | 'assigned' | 'rest' }) {
  const map = {
    available: 'bg-emerald-500 shadow-emerald-500/40',
    assigned: 'bg-sky-500 shadow-sky-500/40',
    rest: 'bg-amber-500 shadow-amber-500/40',
  };
  const label = {
    available: 'Disponible',
    assigned: 'En vol',
    rest: 'Repos insuffisant',
  };
  return (
    <span className="relative flex h-3 w-3" title={label[status]}>
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-30 ${map[status]}`} />
      <span className={`relative inline-flex h-3 w-3 rounded-full border-2 border-white shadow-sm ${map[status]}`} />
    </span>
  );
}

/* ============================================================================
 * COMPOSANT PRINCIPAL
 * ========================================================================== */

export const CrewAssignment: React.FC = () => {
  const { flights, crew, loading, error: apiError, assignCrewMember } = useCrewAssignments();

  const [selectedFlightId, setSelectedFlightId] = useState<string>('');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  const currentSelectedUser = crew.find(m => m.id === selectedMemberId);

  /* -------------------- KPI stats -------------------- */
  const stats = useMemo(() => {
    const total = crew.length;
    const assigned = crew.filter(m => Boolean(m.volAssigne)).length;
    const available = crew.filter(
      m => !m.volAssigne && (m.heuresReposAvant ?? 0) >= MIN_REST_HOURS,
    ).length;
    const alerts = crew.filter(
      m => (m.heuresReposAvant ?? 0) < MIN_REST_HOURS,
    ).length;

    return { total, assigned, available, alerts };
  }, [crew]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    const flightId = selectedFlightId || flights[0]?.id;
    const member = currentSelectedUser;

    if (!flightId || !member) {
      setFeedback({
        type: 'error',
        msg: 'Veuillez sélectionner un vol et un membre du personnel.',
      });
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
    if (restHours < MIN_REST_HOURS) {
      setFeedback({
        type: 'error',
        msg: `Réglementation non respectée : ${member.nom} n'a que ${restHours}h de repos.`,
      });
      return;
    }

    try {
      setSubmitting(true);
      await assignCrewMember(flightId, member.id, restHours);
      setFeedback({
        type: 'success',
        msg: `Affectation validée avec succès pour ${member.nom}.`,
      });
      setSelectedMemberId('');
    } catch (err: any) {
      setFeedback({
        type: 'error',
        msg: err.message || "Échec de l'enregistrement.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* -------------------- LOADING -------------------- */
  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">Chargement du registre d'équipage</p>
          <p className="mt-1 text-xs text-slate-400">
            Synchronisation des affectations et du personnel navigant...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* ═══════════════ HEADER ═══════════════ */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/25">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                Registre d'équipage
              </h1>
              <p className="mt-0.5 text-[13px] text-slate-500">
                Suivi des affectations et conformité réglementaire
              </p>
            </div>
          </div>

          <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3.5 text-xs font-semibold text-emerald-700 shadow-sm">
            <ShieldCheck className="h-4 w-4" />
            Réglementation {MIN_REST_HOURS}h minimum
          </div>
        </header>

        {/* ═══════════════ API ERROR ═══════════════ */}
        {apiError && <AlertBanner type="error" text={apiError} />}

        {/* ═══════════════ KPI ═══════════════ */}
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Effectif total"
            value={stats.total}
            hint="Membres enregistrés"
            icon={<Users className="h-4 w-4" />}
            accent="emerald"
          />
          <KpiCard
            label="Disponibles"
            value={stats.available}
            hint="Repos conforme"
            icon={<UserCheck className="h-4 w-4" />}
            accent="sky"
          />
          <KpiCard
            label="En vol"
            value={stats.assigned}
            hint="Actuellement affectés"
            icon={<Plane className="h-4 w-4" />}
            accent="violet"
          />
          <KpiCard
            label="Alertes repos"
            value={stats.alerts}
            hint="Repos insuffisant"
            icon={<AlertTriangle className="h-4 w-4" />}
            accent="amber"
          />
        </section>

        {/* ═══════════════ CONTENU PRINCIPAL ═══════════════ */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* ═════════ REGISTRE ═════════ */}
          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm lg:col-span-7 xl:col-span-8">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold text-slate-900">Registre du personnel</h2>
                <span className="inline-flex h-5 items-center rounded-md bg-slate-100 px-2 text-[11px] font-semibold text-slate-600 tabular-nums">
                  {crew.length}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Statut de repos et affectation en temps réel
              </p>
            </header>

            <div className="divide-y divide-slate-100">
              {crew.length === 0 ? (
                <div className="flex min-h-[200px] flex-col items-center justify-center p-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-300">
                    <Users className="h-6 w-6" />
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    Aucun membre d'équipage
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Aucun agent n'est actuellement enregistré.
                  </p>
                </div>
              ) : (
                crew.map(member => {
                  const restHours = member.heuresReposAvant ?? 0;
                  const isRestOk = restHours >= MIN_REST_HOURS;
                  const isAssigned = Boolean(member.volAssigne);
                  const isAvailable = isRestOk && !isAssigned;
                  const initials = getInitials(member.nom);
                  const status: 'available' | 'assigned' | 'rest' = isAvailable
                    ? 'available'
                    : isAssigned
                      ? 'assigned'
                      : 'rest';

                  return (
                    <article key={member.id} className="group transition hover:bg-slate-50/70">
                      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        {/* Identité */}
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="relative shrink-0">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-xs font-bold text-slate-600 ring-1 ring-inset ring-slate-200/70">
                              {initials}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5">
                              <StatusDot status={status} />
                            </div>
                          </div>

                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-slate-900">
                              {member.nom}
                            </h3>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200/70">
                                {member.role}
                              </span>
                              {member.niveauMetier && (
                                <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-inset ring-slate-200/70">
                                  Niv. {member.niveauMetier}
                                </span>
                              )}
                              {member.niveauTechnique && (
                                <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-inset ring-sky-200/70">
                                  Tech {member.niveauTechnique}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-4 border-t border-slate-100 pt-3 sm:border-0 sm:pt-0">
                          <div className="min-w-[110px] flex-1 sm:flex-initial">
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                <Clock className="h-3 w-3" />
                                Repos
                              </span>
                              <span
                                className={`font-mono text-[11px] font-bold tabular-nums ${
                                  isRestOk ? 'text-emerald-600' : 'text-amber-600'
                                }`}
                              >
                                {formatRestHours(restHours)}
                              </span>
                            </div>
                            <div className="mt-1.5">
                              <RestBar hours={restHours} />
                            </div>
                            <p className="mt-1 text-[9px] font-medium text-slate-400">
                              Min {MIN_REST_HOURS} h requis
                            </p>
                          </div>

                          <div className="shrink-0">
                            {member.volAssigne ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200/70">
                                <Plane className="h-3 w-3" />
                                Vol {member.volAssigne.numeroVol}
                              </span>
                            ) : (
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${
                                  isRestOk
                                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/70'
                                    : 'bg-amber-50 text-amber-700 ring-amber-200/70'
                                }`}
                              >
                                {isRestOk ? (
                                  <>
                                    <CheckCircle2 className="h-3 w-3" />
                                    Disponible
                                  </>
                                ) : (
                                  <>
                                    <AlertTriangle className="h-3 w-3" />
                                    Indisponible
                                  </>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          {/* ═════════ FORMULAIRE ═════════ */}
          <form
            onSubmit={handleAssign}
            className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm lg:col-span-5 lg:sticky lg:top-4 xl:col-span-4"
          >
            <header className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-emerald-50/60 to-white px-5 py-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 ring-1 ring-inset ring-emerald-200/70">
                <UserCheck className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Nouvelle affectation</h2>
                <p className="mt-0.5 text-xs text-slate-500">Sélectionnez un vol et un agent</p>
              </div>
            </header>

            <div className="space-y-4 p-5">
              {/* Vol */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Vol cible
                </label>
                <select
                  value={selectedFlightId}
                  onChange={e => setSelectedFlightId(e.target.value)}
                  className={`h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 ${FOCUS_RING}`}
                >
                  <option value="">Sélectionner un vol</option>
                  {flights.map(f => (
                    <option key={f.id} value={f.id}>
                      Vol {f.numeroVol} ({f.aeroportDepart} → {f.aeroportArrivee})
                    </option>
                  ))}
                </select>
              </div>

              {/* Membre */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Agent d'équipage
                </label>
                <select
                  value={selectedMemberId}
                  onChange={e => setSelectedMemberId(e.target.value)}
                  className={`h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 ${FOCUS_RING}`}
                >
                  <option value="">Sélectionner un agent</option>
                  {crew.map(m => {
                    const restHours = m.heuresReposAvant ?? 0;
                    const isRestOk = restHours >= MIN_REST_HOURS;
                    const isAlreadyAssigned = Boolean(m.volAssigne);
                    const isDisabled = !isRestOk || isAlreadyAssigned;

                    let statusText = '✓ Repos conforme';
                    if (!isRestOk) {
                      statusText = `⚠ Repos insuffisant (${restHours}h)`;
                    } else if (isAlreadyAssigned) {
                      statusText = `⛔ Déjà affecté (Vol ${m.volAssigne?.numeroVol})`;
                    }

                    return (
                      <option key={m.id} value={m.id} disabled={isDisabled}>
                        {m.nom} ({m.role}) — {statusText}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Preview */}
              {currentSelectedUser && (
                <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-white p-4">
                  <div className="flex items-center justify-between gap-2 border-b border-emerald-100 pb-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200/70">
                        {getInitials(currentSelectedUser.nom)}
                      </div>
                      <span className="truncate text-xs font-semibold text-slate-900">
                        {currentSelectedUser.nom}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200/70">
                      {currentSelectedUser.role}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Repos cumulé</span>
                      <span
                        className={`font-mono font-bold ${
                          (currentSelectedUser.heuresReposAvant ?? 0) >= MIN_REST_HOURS
                            ? 'text-emerald-600'
                            : 'text-amber-600'
                        }`}
                      >
                        {currentSelectedUser.heuresReposAvant ?? 0} h / {MIN_REST_HOURS} h
                      </span>
                    </div>

                    {currentSelectedUser.niveauMetier && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Qualification</span>
                        <span className="font-medium text-slate-800">
                          Niv. {currentSelectedUser.niveauMetier}
                          {currentSelectedUser.niveauTechnique
                            ? ` · Tech ${currentSelectedUser.niveauTechnique}`
                            : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Feedback */}
              {feedback && <AlertBanner type={feedback.type} text={feedback.msg} />}
            </div>

            <footer className="border-t border-slate-100 bg-slate-50/60 p-5">
              <button
                type="submit"
                disabled={
                  !selectedMemberId ||
                  !selectedFlightId ||
                  submitting ||
                  Boolean(currentSelectedUser?.volAssigne)
                }
                className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 px-4 text-xs font-semibold text-white shadow-lg shadow-emerald-500/25 transition hover:from-emerald-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${FOCUS_RING}`}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {submitting ? 'Traitement en cours...' : "Valider l'affectation"}
              </button>

              <p className="mt-2.5 text-center text-[10px] leading-4 text-slate-400">
                Les contrôles de repos ({MIN_REST_HOURS} h minimum) et de chevauchement sont appliqués côté serveur.
              </p>
            </footer>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CrewAssignment;