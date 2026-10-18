// src/features/auth/AuthPage.tsx

import { useState } from 'react';
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
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Mail,
  PlaneTakeoff,
  ShieldCheck,
  User,
  CalendarClock,
  RadioTower,
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
  Planificateur: 'Planificateur des vols',
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
  userName: string;
  email: string;
  role: UserRole;
}

interface AuthPageProps {
  onAuthenticate: (user: AuthenticatedUser) => void;
  onAdminDashboard?: () => void;
  /** Lance la connexion Google (OAuth). À fournir par le parent. */
  onGoogleSignIn?: () => void | Promise<void>;
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
// STYLES PARTAGÉS (palette de l'image : fond bleu-gris, carte claire, accent vert d'eau)
// =============================================================================

const FIELD_BASE =
  'w-full rounded-md border bg-white pl-11 pr-4 text-sm text-slate-800 outline-none transition-colors duration-150 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60';

const FIELD_OK =
  'border-[#d6e4ea] hover:border-[#b7cfd8] focus:border-[#4a9d8a] focus:ring-2 focus:ring-[#4a9d8a]/20';

const FIELD_ERR = 'border-rose-300 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15';

// =============================================================================
// LABEL
// =============================================================================

const FieldLabel = ({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) => (
  <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
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
  compact?: boolean;
}

const InputField = ({
  label,
  icon,
  id,
  rightElement,
  error,
  hint,
  compact = false,
  className = '',
  ...props
}: InputFieldProps) => {
  const messageId = `${id}-message`;

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>

      <div className="group relative">
        <div
          className={`pointer-events-none absolute left-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center transition-colors ${
            error ? 'text-rose-500' : 'text-slate-400 group-focus-within:text-[#4a9d8a]'
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
          className={`${compact ? 'h-10' : 'h-12'} ${FIELD_BASE} ${error ? FIELD_ERR : FIELD_OK} ${className}`}
        />

        {rightElement && (
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center">
            {rightElement}
          </div>
        )}
      </div>

      {error ? (
        <p id={messageId} className="flex items-center gap-1.5 text-xs font-medium text-rose-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <div id={messageId} className="text-xs text-slate-500">
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
// ICÔNE GOOGLE
// =============================================================================

const GoogleIcon = () => (
  <svg className="h-[18px] w-[18px]" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
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
      className={`flex items-start gap-3 rounded-md border px-3.5 py-3 text-sm ${
        isError
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-[#bfe0d8] bg-[#eef8f5] text-[#25695a]'
      }`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${isError ? 'text-rose-600' : 'text-[#4a9d8a]'}`}
        aria-hidden="true"
      />
      <span className="leading-relaxed">{children}</span>
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
  { label: 'Correct', color: 'bg-[#4a9d8a]', text: 'text-[#3b8a77]' },
  { label: 'Robuste', color: 'bg-[#2f7f6d]', text: 'text-[#2f7f6d]' },
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
// ILLUSTRATION (colonne gauche)
// =============================================================================

const Illustration = () => (
  <div className="relative mx-auto w-full max-w-[360px]">
    {/* Formes douces en arrière-plan, comme dans la maquette */}
    <div
      className="absolute -left-6 top-4 h-40 w-40 rounded-full bg-[#e3f1ee]"
      aria-hidden="true"
    />
    <div
      className="absolute -right-4 bottom-2 h-32 w-48 rounded-[60px] bg-[#e9f3f6]"
      aria-hidden="true"
    />
    <div
      className="absolute right-6 top-0 h-3 w-3 rounded-full bg-[#dbeae8]"
      aria-hidden="true"
    />

    <img
      src={myImage}
      alt=""
      className="relative aspect-[4/3] w-full object-cover"
    />

    {/* Ligne de sol, comme sous le bureau de l'illustration */}
    <div className="mx-auto mt-5 h-[3px] w-[92%] rounded-full bg-slate-800" aria-hidden="true" />
  </div>
);

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

export function AuthPage({ onAuthenticate, onGoogleSignIn }: AuthPageProps) {
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

    if (isSignUp && !name) errors.name = 'Veuillez renseigner votre nom complet.';

    if (!email) {
      errors.email = 'Veuillez renseigner votre adresse e-mail.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Format attendu : prenom.nom@compagnie.com';
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
      userName: user.userName,
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
        await signUp({ email, password: form.password, userName: name, role: form.role });

        setIsSignUp(false);
        setShowPassword(false);
        setForm({ ...INITIAL_FORM, email });
        setSuccess('Compte créé avec succès. Saisissez votre mot de passe pour vous connecter.');
        requestAnimationFrame(() => document.getElementById('password')?.focus());
        return;
      }

      const auth = await logIn({ email, password: form.password });

      if (!auth || !auth.user) {
        throw new Error("Le serveur n'a pas retourné les informations de l'utilisateur.");
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

  const handleGoogleSignIn = async () => {
    if (isLoading) return;

    setError('');
    setSuccess('');

    if (!onGoogleSignIn) {
      setError("La connexion avec Google n'est pas encore configurée.");
      return;
    }

    setIsLoading(true);
    try {
      await onGoogleSignIn();
    } catch (googleError: unknown) {
      setError(getFriendlyApiError(googleError));
    } finally {
      setIsLoading(false);
    }
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  const SelectedRoleIcon = ROLE_META[form.role]?.icon ?? User;

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[#b9d3d9] p-3 font-sans text-slate-900 antialiased sm:p-6">
      <main className="grid w-full max-w-5xl overflow-hidden rounded-2xl bg-[#f7fbff]  shadow-[0_24px_60px_-24px_rgba(38,70,83,0.35)] lg:min-h-[580px] lg:grid-cols-[1fr_1.2fr]">
        {/* =================================================================
            GAUCHE : MARQUE + ILLUSTRATION + SLOGAN
        ================================================================= */}
        <section className="hidden flex-col px-8 py-6 lg:flex">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#263238] text-white">
              <PlaneTakeoff className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="text-lg font-medium tracking-tight text-slate-800">
              Airline Operations
            </span>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-8 py-6">
            <Illustration />
            <p className="max-w-xs text-center text-lg font-medium leading-snug text-slate-600">
              Planifiez et supervisez vos vols, en temps réel.
            </p>
          </div>
        </section>

        {/* =================================================================
            DROITE : FORMULAIRE
        ================================================================= */}
        <section
          className={`flex flex-col justify-center rounded-2xl border border-[#d6e4ea] bg-white px-6 shadow-[0_8px_30px_-12px_rgba(38,70,83,0.18)] sm:px-12 lg:px-12 xl:px-16 ${
            isSignUp ? 'py-6' : 'py-10'
          }`}
        >
          {/* Marque visible uniquement sur mobile */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#263238] text-white">
              <PlaneTakeoff className="h-4 w-4" aria-hidden="true" />
            </div>
            <span className="text-lg font-medium tracking-tight text-slate-800">
              Airline Operations
            </span>
          </div>

          <div className="w-full">
            <h1
              className={`font-semibold tracking-tight text-[#4a9d8a] ${isSignUp ? 'text-2xl' : 'text-3xl'}`}
            >
              {isSignUp ? 'Créer un compte' : 'Connexion'}
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              {isSignUp
                ? 'Renseignez vos informations et votre rôle.'
                : 'Accédez au système de planification et de supervision des vols.'}
            </p>

            <form
              className={isSignUp ? 'mt-4 space-y-3' : 'mt-7 space-y-4'}
              onSubmit={handleSubmit}
              noValidate
            >
              {/* Messages serveur */}
              <div aria-live="polite" className="empty:hidden">
                {error && <FormAlert tone="error">{error}</FormAlert>}
                {success && <FormAlert tone="success">{success}</FormAlert>}
              </div>

              {isSignUp && (
                <InputField
                  label="Nom complet"
                  icon={<User className="h-4 w-4" />}
                  id="name"
                  name="name"
                  type="text"
                  value={form.name}
                  onChange={handleInputChange}
                  placeholder="Nom et prénom"
                  disabled={isLoading}
                  autoComplete="name"
                  compact={isSignUp}
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
                placeholder="prenom.nom@compagnie.com"
                disabled={isLoading}
                autoComplete="username"
                inputMode="email"
                spellCheck={false}
                autoCapitalize="none"
                compact={isSignUp}
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
                compact={isSignUp}
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
                className="pr-12"
                rightElement={
                  <button
                    type="button"
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((current) => !current)}
                    disabled={isLoading}
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-[#3b8a77] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4a9d8a]/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              {/* Rôle */}
              {isSignUp && (
                <div className="space-y-1">
                  <FieldLabel htmlFor="role">Rôle opérationnel</FieldLabel>

                  <div className="group relative">
                    <div
                      className={`pointer-events-none absolute left-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center transition-colors ${
                        fieldErrors.role ? 'text-rose-500' : 'text-slate-400 group-focus-within:text-[#4a9d8a]'
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
                      className={`h-10 ${FIELD_BASE} cursor-pointer appearance-none pr-10 font-medium ${
                        fieldErrors.role ? FIELD_ERR : FIELD_OK
                      }`}
                    >
                      {SELF_REGISTRATION_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>

                    <ChevronDown
                      className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition group-focus-within:rotate-180 group-focus-within:text-[#4a9d8a]"
                      aria-hidden="true"
                    />
                  </div>

                  {fieldErrors.role ? (
                    <p id="role-message" className="flex items-center gap-1.5 text-xs font-medium text-rose-600">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      {fieldErrors.role}
                    </p>
                  ) : (
                    <p id="role-message" className="text-xs text-slate-500">
                      {ROLE_META[form.role]?.description}
                    </p>
                  )}
                </div>
              )}

              {/* Session */}
              {!isSignUp && (
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#4a9d8a]" aria-hidden="true" />
                  Session sécurisée et persistante
                </p>
              )}

              {/* Actions */}
              <div className={isSignUp ? 'space-y-2 pt-1' : 'space-y-3 pt-1'}>
                <button
                  type="submit"
                  disabled={isLoading}
                  aria-busy={isLoading}
                  className={`group relative inline-flex ${isSignUp ? 'h-11' : 'h-12'} w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-md bg-linear-to-r from-emerald-700 to-emerald-600 px-8 text-[13px] font-bold uppercase tracking-[0.08em] text-white shadow-lg shadow-emerald-700/25 transition-all duration-200 hover:-translate-y-px hover:shadow-xl hover:shadow-emerald-700/30 active:translate-y-0 active:scale-[0.99] focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-600/30 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0`}
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

                {!isSignUp && (
                  <>
                    <div className="flex items-center gap-3 text-xs text-slate-400" aria-hidden="true">
                      <span className="h-px flex-1 bg-[#dbe7ec]" />
                      ou
                      <span className="h-px flex-1 bg-[#dbe7ec]" />
                    </div>

                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={isLoading}
                      className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-md border border-[#d6e4ea] bg-white text-sm font-medium text-slate-700 transition-colors hover:border-[#b7cfd8] hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#4a9d8a]/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <GoogleIcon />
                      Continuer avec Google
                    </button>
                  </>
                )}

                <div className="text-center">
                  <button
                    type="button"
                    onClick={switchMode}
                    disabled={isLoading}
                    className="cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-[#3b8a77] transition-colors hover:text-[#2f7f6d] hover:underline focus:outline-none focus-visible:ring-4 focus-visible:ring-[#4a9d8a]/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSignUp ? 'Retour à la connexion' : 'Créer un compte'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

export default AuthPage;