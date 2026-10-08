// src/features/auth/AuthPage.tsx

import { memo, useState } from 'react';
import type {
  ChangeEvent,
  FormEvent,
  InputHTMLAttributes,
  KeyboardEvent,
  ReactNode,
} from 'react';

import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Mail,
  PlaneTakeoff,
  RadioTower,
  ShieldCheck,
  User,
  Users,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import myImage from '../../assets/avions.png';

import {
  logIn,
  saveAuthSession,
  signUp,
  type PublicUser,
  type UserRole,
} from '../Api/apiService';

// =============================================================================
// CONFIGURATION
// =============================================================================

const ROLE_LABELS: Record<UserRole, string> = {
  Admin: 'Administrateur',
  Planificateur: 'Planificateur de flight',
  Regulator: 'Régulateur OCC',
  Crew_Member: "Membre d'équipage",
  Maintenance_Engineer: 'Ingénieur de maintenance',
  Product_Owner: 'Product Owner',
};

const SELF_REGISTRATION_ROLES: UserRole[] = [
  'Planificateur',
  'Regulator',
  'Crew_Member',
  'Maintenance_Engineer',
];

const ROLE_META: Partial<Record<UserRole, { icon: LucideIcon; description: string }>> = {
  Planificateur: { icon: CalendarClock, description: 'Rotations et programmes' },
  Regulator: { icon: RadioTower, description: 'Supervision OCC' },
  Crew_Member: { icon: Users, description: 'Planning et affectations' },
  Maintenance_Engineer: { icon: Wrench, description: 'Suivi technique flotte' },
};

const PASSWORD_MIN_LENGTH = 8;

// =============================================================================
// TYPES
// =============================================================================

export interface AuthenticatedUser {
  refUser: string;
  name: string;
  email: string;
  role: UserRole;
}

interface AuthPageProps {
  onAuthenticate: (user: AuthenticatedUser) => void;
  onAdminDashboard?: () => void;
}

interface AuthFormState {
  email: string;
  password: string;
  name: string;
  role: UserRole;
}

type FieldErrors = Partial<Record<keyof AuthFormState, string>>;

// =============================================================================
// ÉTAT INITIAL
// =============================================================================

const INITIAL_FORM: AuthFormState = {
  email: '',
  password: '',
  name: '',
  role: 'Regulator',
};

const FIELD_ORDER: (keyof AuthFormState)[] = ['name', 'email', 'password', 'role'];

// =============================================================================
// LABEL
// =============================================================================

const FieldLabel = ({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) => (
  <label
    htmlFor={htmlFor}
    className="block px-5 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500"
  >
    {children}
  </label>
);

// =============================================================================
// INPUT
// =============================================================================

interface InputFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  icon: ReactNode;
  rightElement?: ReactNode;
  error?: string;
  hint?: ReactNode;
}

const InputField = ({
  label,
  icon,
  id,
  rightElement,
  error,
  hint,
  className = '',
  ...props
}: InputFieldProps) => {
  const messageId = `${id}-message`;

  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>

      <div className="group relative">
        <div
          className={`pointer-events-none absolute left-5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center transition-colors ${
            error ? 'text-rose-500' : 'text-slate-400 group-focus-within:text-emerald-600'
          }`}
          aria-hidden="true"
        >
          {icon}
        </div>

        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          {...props}
          className={`
            h-11 w-full rounded-full border pl-12 pr-5
            text-sm font-medium text-slate-800 outline-none transition-all duration-200
            placeholder:font-normal placeholder:text-slate-400
            focus:bg-white focus:ring-4
            disabled:cursor-not-allowed disabled:opacity-60
            ${
              error
                ? 'border-rose-300 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-500/10'
                : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white focus:border-emerald-600 focus:ring-emerald-600/10'
            }
            ${className}
          `}
        />

        {rightElement && (
          <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center">
            {rightElement}
          </div>
        )}
      </div>

      {error ? (
        <p
          id={messageId}
          className="flex items-center gap-1.5 px-5 text-xs font-medium text-rose-600"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <div id={messageId} className="px-5 text-xs text-slate-500">
          {hint}
        </div>
      ) : null}
    </div>
  );
};

// =============================================================================
// SPINNER
// =============================================================================

const IconSpinner = () => (
  <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

// =============================================================================
// ALERTE
// =============================================================================

const FormAlert = ({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) => {
  const isError = tone === 'error';
  const Icon = isError ? AlertCircle : CheckCircle2;

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
        isError
          ? 'border-rose-200/80 bg-rose-50 text-rose-800'
          : 'border-emerald-200/80 bg-emerald-50 text-emerald-800'
      }`}
    >
      <span
        className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
          isError ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
        }`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="font-medium leading-relaxed">{children}</span>
    </div>
  );
};

// =============================================================================
// FORCE DU MOT DE PASSE
// =============================================================================

function getPasswordStrength(password: string): number {
  if (!password) return 0;
  if (password.length < PASSWORD_MIN_LENGTH) return 1;

  let score = 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return score;
}

const STRENGTH_LEVELS = [
  { label: '', color: 'bg-slate-200', text: '' },
  { label: 'Trop court', color: 'bg-rose-500', text: 'text-rose-600' },
  { label: 'Faible', color: 'bg-amber-500', text: 'text-amber-600' },
  { label: 'Correct', color: 'bg-emerald-500', text: 'text-emerald-600' },
  { label: 'Robuste', color: 'bg-emerald-600', text: 'text-emerald-700' },
];

const PasswordStrength = ({ password }: { password: string }) => {
  const score = getPasswordStrength(password);
  const level = STRENGTH_LEVELS[score];

  return (
    <div className="space-y-1.5 pt-0.5">
      <div className="flex gap-1.5" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              score >= step ? level.color : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
      <p className="flex justify-between gap-2">
        <span>Force du mot de passe</span>
        {level.label && <span className={`shrink-0 font-semibold ${level.text}`}>{level.label}</span>}
      </p>
    </div>
  );
};

// =============================================================================
// PANNEAU DROIT
// =============================================================================

const InfoPanel = memo(() => (
  <aside
    className="relative hidden flex-col overflow-hidden rounded-tl-[120px] bg-[#0a141c] px-10 py-10 text-white lg:col-span-5 lg:flex xl:px-12"
    aria-label="Présentation"
  >
    {/* Fond */}
    <div
      className="absolute inset-0 bg-linear-to-br from-emerald-950/90 via-[#0c1821] to-[#060d13]"
      aria-hidden="true"
    />

    {/* Avion */}
    <div
      className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-45 mix-blend-luminosity"
      style={{ backgroundImage: `url(${myImage})` }}
      aria-hidden="true"
    />

    {/* Lueur émeraude + fondu bas pour la lisibilité du texte */}
    <div
      className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl"
      aria-hidden="true"
    />
    <div
      className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-[#060d13] via-[#060d13]/80 to-transparent"
      aria-hidden="true"
    />

    {/* Trajectoire de flight décorative */}
    <svg
      className="absolute inset-x-0 top-28 h-40 w-full text-emerald-400/25"
      viewBox="0 0 400 160"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M-10 150 C 120 140, 220 40, 410 20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 8" />
    </svg>

    {/* En-tête */}
    <div className="relative z-10 flex items-center justify-between pt-2">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-lg shadow-black/20 backdrop-blur-md">
        <PlaneTakeoff className="h-5 w-5 text-emerald-400" aria-hidden="true" />
      </div>

      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-slate-200 backdrop-blur-md">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        OCC opérationnel
      </span>
    </div>

    {/* Contenu */}
    <div className="relative z-10 mt-auto">
      <h2 className="text-3xl font-extrabold leading-[1.1] tracking-tight xl:text-4xl">
        Gérez vos rotations
        <br />
        <span className="bg-linear-to-r from-emerald-300 to-teal-200 bg-clip-text text-transparent">
          en temps réel.
        </span>
      </h2>

      <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-slate-300">
        Supervisez la flotte, les conflits de planning, les équipages, la maintenance technique et
        les opérations OCC depuis un espace centralisé.
      </p>
    </div>
  </aside>
));

InfoPanel.displayName = 'InfoPanel';

// =============================================================================
// ERREURS API
// =============================================================================

function getFriendlyApiError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const apiError = error as { status?: number; message?: string };

    switch (apiError.status) {
      case 400:
        return apiError.message || 'Les informations saisies sont invalides.';
      case 401:
        return 'Email ou mot de passe incorrect.';
      case 403:
        return apiError.message || "Vous n'avez pas l'autorisation d'accéder à cette ressource.";
      case 404:
        return apiError.message || 'Utilisateur introuvable.';
      case 409:
        return apiError.message || 'Ce compte existe déjà.';
      case 0:
        return apiError.message || 'Impossible de contacter le serveur. Vérifiez votre connexion.';
      default:
        return apiError.message || 'Le serveur a refusé la requête.';
    }
  }

  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  return "Une erreur inattendue est survenue lors de l'authentification.";
}

function isSelfRegistrationRole(role: UserRole): boolean {
  return SELF_REGISTRATION_ROLES.includes(role);
}

// =============================================================================
// PAGE AUTHENTIFICATION
// =============================================================================

export function AuthPage({ onAuthenticate }: AuthPageProps) {
  const [form, setForm] = useState<AuthFormState>(INITIAL_FORM);
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // ===========================================================================
  // CHAMPS
  // ===========================================================================

  const updateField = (key: keyof AuthFormState, value: string) => {
    setError('');
    setSuccess('');
    setFieldErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateField(event.target.name as keyof AuthFormState, event.target.value);
  };

  const handlePasswordKey = (event: KeyboardEvent<HTMLInputElement>) => {
    setCapsLockOn(event.getModifierState('CapsLock'));
  };

  // ===========================================================================
  // MODE
  // ===========================================================================

  const switchMode = () => {
    if (isLoading) return;

    setIsSignUp((current) => !current);
    setError('');
    setSuccess('');
    setFieldErrors({});
    setShowPassword(false);
    setForm((current) => ({ ...INITIAL_FORM, email: current.email }));
  };

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  const validateForm = (): boolean => {
    const email = form.email.trim().toLowerCase();
    const name = form.name.trim();
    const errors: FieldErrors = {};

    if (isSignUp && !name) errors.name = 'Veuillez renseigner votre name complet.';

    if (!email) {
      errors.email = 'Veuillez renseigner votre adresse e-mail.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Format attendu : prenom.name@compagnie.com';
    }

    if (!form.password) {
      errors.password = 'Veuillez renseigner votre mot de passe.';
    } else if (form.password.length < PASSWORD_MIN_LENGTH) {
      errors.password = `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
    }

    if (isSignUp && !isSelfRegistrationRole(form.role)) {
      errors.role = "Ce rôle ne peut pas être demandé depuis l'inscription publique.";
    }

    setFieldErrors(errors);

    const firstInvalid = FIELD_ORDER.find((key) => errors[key]);
    if (firstInvalid) {
      const target = document.getElementById(firstInvalid);
      target?.focus();
      return false;
    }

    return true;
  };

  // ===========================================================================
  // AUTHENTIFICATION
  // ===========================================================================

  const authenticate = (user: PublicUser) => {
    onAuthenticate({
      refUser: user.refUser,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;

    setError('');
    setSuccess('');
    if (!validateForm()) return;

    const email = form.email.trim().toLowerCase();
    const name = form.name.trim();

    setIsLoading(true);

    try {
      if (isSignUp) {
        await signUp({ email, password: form.password, name, role: form.role });

        setIsSignUp(false);
        setShowPassword(false);
        setForm({ ...INITIAL_FORM, email });
        setSuccess('Compte créé avec succès. Saisissez votre mot de passe pour vous connecter.');
        requestAnimationFrame(() => document.getElementById('password')?.focus());
        return;
      }

      const auth = await logIn({ email, password: form.password });

      if (!auth || !auth.user) {
        throw new Error("Le serveur n'a pas retourné les informations de l'user.");
      }
      if (!auth.user.refUser || !auth.user.email || !auth.user.role) {
        throw new Error("La réponse d'authentification est incomplète.");
      }

      saveAuthSession(auth, true);
      authenticate(auth.user);
    } catch (apiError: unknown) {
      setError(getFriendlyApiError(apiError));
    } finally {
      setIsLoading(false);
    }
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  const SelectedRoleIcon = ROLE_META[form.role]?.icon ?? User;

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-linear-to-br from-slate-50 via-slate-100 to-emerald-50/40 p-3 font-sans text-slate-900 antialiased sm:p-6 lg:p-10">
      {/* Halos */}
      <div
        className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-emerald-200/40 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-48 -right-32 h-[28rem] w-[28rem] rounded-full bg-teal-100/60 blur-3xl"
        aria-hidden="true"
      />

      <main className="relative z-20 mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-[0_30px_80px_-20px_rgba(15,23,42,0.18)] ring-1 ring-slate-900/5 sm:rounded-[32px] lg:min-h-[580px] lg:grid-cols-12">
        {/* =================================================================
            FORMULAIRE
        ================================================================= */}

        <section className="flex flex-col justify-center p-6 sm:px-10 sm:py-10 lg:col-span-7 lg:px-14 lg:py-12">
          {/* Marque */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-emerald-100 to-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60">
              <BookOpen className="h-[18px] w-[18px] stroke-[2.25]" aria-hidden="true" />
            </div>
            <span className="text-[13px] font-extrabold uppercase tracking-[0.1em] text-slate-900">
              Airline Operations
            </span>
          </div>

          {/* Titre */}
          <div className={isSignUp ? 'mt-6' : 'mt-8'}>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[28px]">
              {isSignUp ? 'Créer un compte opérationnel' : 'Connexion sécurisée'}
            </h1>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
              {isSignUp
                ? 'Renseignez vos informations et choisissez votre rôle opérationnel.'
                : 'Accédez au système de planification et de supervision des vols.'}
            </p>
          </div>

          <form className={isSignUp ? 'mt-6 space-y-5' : 'mt-7 space-y-5'} onSubmit={handleSubmit} noValidate>
            {/* Messages serveur */}
            <div aria-live="polite" className="empty:hidden">
              {error && <FormAlert tone="error">{error}</FormAlert>}
              {success && <FormAlert tone="success">{success}</FormAlert>}
            </div>

            {/* Champs : 2 colonnes en inscription pour limiter la hauteur */}
            <div className={isSignUp ? 'grid items-start gap-4 sm:grid-cols-2' : 'space-y-5'}>
            {isSignUp && (
              <InputField
                label="Nom complet"
                icon={<User className="h-4 w-4" />}
                id="name"
                name="name"
                type="text"
                value={form.name}
                onChange={handleInputChange}
                placeholder="Nom et préname"
                disabled={isLoading}
                autoComplete="name"
                error={fieldErrors.name}
                required
              />
            )}

            <InputField
              label="Adresse e-mail"
              icon={<Mail className="h-4 w-4" />}
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleInputChange}
              placeholder="prenom.name@compagnie.com"
              disabled={isLoading}
              autoComplete="username"
              inputMode="email"
              spellCheck={false}
              autoCapitalize="none"
              error={fieldErrors.email}
              required
            />

            <InputField
              label="Mot de passe"
              icon={<Lock className="h-4 w-4" />}
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={handleInputChange}
              onKeyDown={handlePasswordKey}
              onKeyUp={handlePasswordKey}
              onBlur={() => setCapsLockOn(false)}
              placeholder={`${PASSWORD_MIN_LENGTH} caractères minimum`}
              disabled={isLoading}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength={PASSWORD_MIN_LENGTH}
              error={fieldErrors.password}
              hint={
                capsLockOn ? (
                  <span className="flex items-center gap-1.5 font-medium text-amber-600">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    Verrouillage des majuscules activé
                  </span>
                ) : isSignUp ? (
                  <PasswordStrength password={form.password} />
                ) : undefined
              }
              required
              className="pr-14"
              rightElement={
                <button
                  type="button"
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={isLoading}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />

            {/* Rôle */}
            {isSignUp && (
              <div className="space-y-1.5">
                <FieldLabel htmlFor="role">Rôle opérationnel</FieldLabel>

                <div className="group relative">
                  <div
                    className={`pointer-events-none absolute left-5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center transition-colors ${
                      fieldErrors.role ? 'text-rose-500' : 'text-slate-400 group-focus-within:text-emerald-600'
                    }`}
                    aria-hidden="true"
                  >
                    <SelectedRoleIcon className="h-4 w-4" />
                  </div>

                  <select
                    id="role"
                    name="role"
                    value={form.role}
                    onChange={(event) => updateField('role', event.target.value)}
                    disabled={isLoading}
                    aria-invalid={fieldErrors.role ? true : undefined}
                    aria-describedby="role-message"
                    className={`
                      h-11 w-full cursor-pointer appearance-none rounded-full border pl-12 pr-11
                      text-sm font-medium text-slate-800 outline-none transition-all duration-200
                      focus:bg-white focus:ring-4
                      disabled:cursor-not-allowed disabled:opacity-60
                      ${
                        fieldErrors.role
                          ? 'border-rose-300 bg-rose-50/50 focus:border-rose-500 focus:ring-rose-500/10'
                          : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white focus:border-emerald-600 focus:ring-emerald-600/10'
                      }
                    `}
                  >
                    {SELF_REGISTRATION_ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>

                  <ChevronDown
                    className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition group-focus-within:rotate-180 group-focus-within:text-emerald-600"
                    aria-hidden="true"
                  />
                </div>

                {fieldErrors.role ? (
                  <p id="role-message" className="flex items-center gap-1.5 px-5 text-xs font-medium text-rose-600">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {fieldErrors.role}
                  </p>
                ) : (
                  <p id="role-message" className="px-5 text-xs text-slate-500">
                    {ROLE_META[form.role]?.description}
                  </p>
                )}
              </div>
            )}
            </div>

            {/* Session */}
            {!isSignUp && (
              <div className="flex justify-center px-2 sm:justify-end">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50/80 px-3 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-100">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                  Session sécurisée et persistante
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col items-stretch gap-2.5 pt-2 sm:flex-row sm:items-center sm:gap-4">
              <button
                type="submit"
                disabled={isLoading}
                aria-busy={isLoading}
                className="group relative inline-flex h-11 min-w-[200px] cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-full bg-linear-to-r from-emerald-700 to-emerald-600 px-8 text-[13px] font-bold uppercase tracking-[0.08em] text-white shadow-lg shadow-emerald-700/25 transition-all duration-200 hover:-translate-y-px hover:shadow-xl hover:shadow-emerald-700/30 active:translate-y-0 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/30 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0"
              >
                {/* Reflet */}
                <span
                  className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                  aria-hidden="true"
                />
                {isLoading ? (
                  <>
                    <IconSpinner />
                    {isSignUp ? 'Création…' : 'Connexion…'}
                  </>
                ) : (
                  <>
                    {isSignUp ? "S'inscrire" : 'Se connecter'}
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={switchMode}
                disabled={isLoading}
                className="h-11 cursor-pointer rounded-full px-6 text-[13px] font-bold uppercase tracking-[0.08em] text-emerald-700 transition hover:bg-emerald-50 hover:text-emerald-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSignUp ? 'Retour à la connexion' : 'Créer un compte'}
              </button>
            </div>
          </form>
        </section>

        {/* =================================================================
            PANNEAU DROIT
        ================================================================= */}

        <InfoPanel />
      </main>
    </div>
  );
}

export default AuthPage;