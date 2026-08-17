// src/pages/AuthPage.tsx

import {
  memo,
  useState,
} from 'react';

import type {
  ChangeEvent,
  FormEvent,
  ReactNode,
} from 'react';

import {
  BookOpen,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  Mail,
  PlaneTakeoff,
  ShieldCheck,
  User,
} from 'lucide-react';

import myImage from '../../assets/avions.png';

import {
  logIn,
  saveAuthSession,
  signUp,
  type PublicUser,
  type UserRole,
} from '../Api/apiService';

// =============================================================================
// CONFIGURATION UI
// =============================================================================

const ROLE_LABELS: Record<UserRole, string> = {
  Admin: 'Administrateur',
  Planificateur: 'Planificateur de vol',
  Regulator: 'Régulateur OCC',
  Crew_Member: "Membre d'équipage",
  Maintenance_Engineer: 'Ingénieur de maintenance',
  Product_Owner: 'Product Owner',
};

/**
 * Rôles autorisés pour l'inscription publique.
 *
 * IMPORTANT :
 * cette restriction doit également être appliquée côté Backend.
 */
const SELF_REGISTRATION_ROLES: UserRole[] = [
  'Planificateur',
  'Regulator',
  'Crew_Member',
  'Maintenance_Engineer',
];

// =============================================================================
// TYPES
// =============================================================================

interface AuthenticatedUser {
  id: string;
  nom: string;
  email: string;
  role: UserRole;
}

interface AuthPageProps {
  onAuthenticate: (user: AuthenticatedUser) => void;
}

interface AuthFormState {
  email: string;
  password: string;
  nom: string;
  role: UserRole;
}

const INITIAL_FORM: AuthFormState = {
  email: '',
  password: '',
  nom: '',
  role: 'Regulator',
};

// =============================================================================
// COMPOSANTS UI
// =============================================================================

interface InputFieldProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: ReactNode;
  rightElement?: ReactNode;
}

const InputField = ({
  label,
  icon,
  id,
  rightElement,
  className = '',
  ...props
}: InputFieldProps) => (
  <div className="space-y-1.5">
    <label
      htmlFor={id}
      className="block px-4 text-[10px] font-bold uppercase tracking-wider text-slate-400"
    >
      {label}
    </label>

    <div className="relative">
      <div
        className="pointer-events-none absolute left-4 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center text-slate-400"
        aria-hidden="true"
      >
        {icon}
      </div>

      <input
        id={id}
        {...props}
        className={`
          h-12 w-full rounded-full border border-slate-200
          bg-slate-50/50 pl-11 pr-4 text-sm text-slate-700
          outline-none transition
          placeholder:text-slate-400
          hover:border-slate-300
          focus:border-emerald-600
          focus:bg-white
          focus:ring-4
          focus:ring-emerald-600/10
          disabled:cursor-not-allowed
          disabled:opacity-60
          ${className}
        `}
      />

      {rightElement && (
        <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center">
          {rightElement}
        </div>
      )}
    </div>
  </div>
);

const IconSpinner = () => (
  <svg
    className="-ml-1 mr-2 h-4 w-4 animate-spin text-white"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />

    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

const InfoPanel = memo(() => (
  <div className="relative hidden overflow-hidden rounded-tl-[160px] bg-slate-900 lg:block">
    <div
      className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: `url(${myImage})`,
        backgroundSize: '120% 120%',
      }}
      aria-hidden="true"
    />

    <div
      className="absolute inset-0 z-10 bg-linear-to-br from-emerald-700/90 via-slate-800/85 to-slate-900/95"
      aria-hidden="true"
    />

    <div className="relative z-20 flex h-full flex-col justify-center space-y-6 px-12 text-white">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-inner backdrop-blur-md">
        <PlaneTakeoff className="h-5 w-5 rotate-45 stroke-[2.5] text-emerald-300" />
      </div>

      <div className="space-y-3">
        <h3 className="text-3xl font-black leading-tight tracking-tight">
          Gérez vos rotations
          <br />
          en temps réel.
        </h3>

        <p className="max-w-xs text-xs font-medium leading-relaxed text-emerald-100/80">
          Supervisez la flotte, les conflits de planning,
          les équipages et la maintenance technique
          depuis un même espace opérationnel.
        </p>
      </div>
    </div>
  </div>
));

InfoPanel.displayName = 'InfoPanel';

// =============================================================================
// HELPERS
// =============================================================================

function getFriendlyApiError(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error
  ) {
    const apiError = error as {
      status?: number;
      message?: string;
    };

    switch (apiError.status) {
      case 401:
        return 'Email ou mot de passe incorrect.';

      case 409:
        return (
          apiError.message ||
          'Ce compte existe déjà.'
        );

      case 400:
        return (
          apiError.message ||
          'Les informations saisies sont invalides.'
        );

      case 0:
        return (
          apiError.message ||
          'Impossible de contacter le serveur.'
        );

      default:
        return (
          apiError.message ||
          'Le serveur a refusé la requête.'
        );
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return (
    "Une erreur inattendue est survenue lors de l'authentification."
  );
}

function isSelfRegistrationRole(
  role: UserRole,
): boolean {
  return SELF_REGISTRATION_ROLES.includes(role);
}

// =============================================================================
// PAGE AUTHENTIFICATION
// =============================================================================

export function AuthPage({
  onAuthenticate,
}: AuthPageProps) {
  const [form, setForm] =
    useState<AuthFormState>(INITIAL_FORM);

  const [isSignUp, setIsSignUp] =
    useState(false);

  const [showPassword, setShowPassword] =
    useState(false);

  const [isLoading, setIsLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  const [success, setSuccess] =
    useState('');

  // ===========================================================================
  // CHANGEMENT FORMULAIRE
  // ===========================================================================

  const handleInputChange = (
    event: ChangeEvent<
      HTMLInputElement | HTMLSelectElement
    >,
  ) => {
    const target = event.target;

    const key =
      target.id as keyof AuthFormState;

    setError('');
    setSuccess('');

    setForm((current) => ({
      ...current,
      [key]: target.value,
    }));
  };

  // ===========================================================================
  // CONNEXION / INSCRIPTION
  // ===========================================================================

  const switchMode = () => {
    setIsSignUp((current) => !current);

    setError('');
    setSuccess('');
    setShowPassword(false);

    setForm((current) => ({
      ...INITIAL_FORM,
      email: current.email,
    }));
  };

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  const validateForm = (): boolean => {
    const email =
      form.email.trim().toLowerCase();

    const nom =
      form.nom.trim();

    if (
      !email ||
      !form.password
    ) {
      setError(
        'Veuillez renseigner votre adresse e-mail et votre mot de passe.',
      );

      return false;
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      setError(
        'Veuillez saisir une adresse e-mail valide.',
      );

      return false;
    }

    if (
      form.password.length < 8
    ) {
      setError(
        'Le mot de passe doit contenir au moins 8 caractères.',
      );

      return false;
    }

    if (
      isSignUp &&
      !nom
    ) {
      setError(
        'Veuillez renseigner votre nom complet.',
      );

      return false;
    }

    if (
      isSignUp &&
      !isSelfRegistrationRole(form.role)
    ) {
      setError(
        "Ce rôle ne peut pas être demandé depuis l'inscription publique.",
      );

      return false;
    }

    return true;
  };

  // ===========================================================================
  // UTILISATEUR AUTHENTIFIÉ
  // ===========================================================================

  const authenticate = (
    user: PublicUser,
  ) => {
    onAuthenticate({
      id: user.id,
      nom: user.nom,
      email: user.email,
      role: user.role,
    });
  };

  // ===========================================================================
  // SUBMIT
  // ===========================================================================

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (
      isLoading ||
      !validateForm()
    ) {
      return;
    }

    const email =
      form.email
        .trim()
        .toLowerCase();

    const nom =
      form.nom.trim();

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // =======================================================================
      // INSCRIPTION
      // =======================================================================

      if (isSignUp) {
        await signUp({
          email,
          password: form.password,
          nom,
          role: form.role,
        });

        setIsSignUp(false);
        setShowPassword(false);

        setForm({
          ...INITIAL_FORM,
          email,
        });

        setSuccess(
          'Compte créé avec succès. Vous pouvez maintenant vous connecter.',
        );

        return;
      }

      // =======================================================================
      // CONNEXION
      // =======================================================================

      const auth =
        await logIn({
          email,
          password: form.password,
        });

      // =======================================================================
      // LOCAL STORAGE
      // =======================================================================
      //
      // TRUE = sauvegarde persistante dans localStorage.
      //
      // La session reste disponible :
      // - après actualisation de la page
      // - après fermeture du navigateur
      // - après réouverture de l'application
      //
      // jusqu'à expiration/invalidation du token backend.
      // =======================================================================

      saveAuthSession(
        auth,
        true,
      );

      // =======================================================================
      // CONNEXION RÉUSSIE
      // =======================================================================

      authenticate(
        auth.user,
      );
    } catch (
      apiError: unknown
    ) {
      setError(
        getFriendlyApiError(
          apiError,
        ),
      );
    } finally {
      setIsLoading(false);
    }
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-8 font-sans text-slate-900">

      {/* Décoration gauche */}
      <div
        className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-emerald-100/40 blur-3xl"
        aria-hidden="true"
      />

      {/* Décoration droite */}
      <div
        className="pointer-events-none absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-emerald-100/30 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative z-20 mx-auto grid w-full max-w-5xl overflow-hidden rounded-[24px] border border-slate-100 bg-white shadow-xl shadow-slate-200/50 lg:grid-cols-[1.15fr_0.85fr]">

        {/* ================================================================ */}
        {/* FORMULAIRE */}
        {/* ================================================================ */}

        <div className="flex flex-col justify-between bg-white p-8 sm:p-12">
          <div>

            {/* Logo */}
            <div className="flex items-center gap-2.5 font-black tracking-tight text-emerald-700">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50">
                <BookOpen className="h-4 w-4 stroke-[2.5] text-emerald-700" />
              </div>

              <span className="text-sm font-extrabold uppercase tracking-wider text-slate-800">
                Airline Operations
              </span>
            </div>

            {/* Titre */}
            <div className="mt-8">
              <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
                {isSignUp
                  ? 'Créer un compte opérationnel'
                  : 'Connexion sécurisée'}
              </h1>

              <p className="mt-1.5 text-xs font-medium leading-relaxed text-slate-400">
                {isSignUp
                  ? "Créez un compte avec un rôle opérationnel autorisé."
                  : 'Accédez au système de planification et de supervision des vols.'}
              </p>
            </div>

            {/* Formulaire */}
            <form
              className="mt-8 space-y-4"
              onSubmit={handleSubmit}
              noValidate
            >

              {/* Nom */}
              {isSignUp && (
                <InputField
                  label="Nom complet"
                  icon={
                    <User className="h-4 w-4" />
                  }
                  id="nom"
                  name="nom"
                  type="text"
                  value={form.nom}
                  onChange={handleInputChange}
                  placeholder="Nom et prénom"
                  disabled={isLoading}
                  autoComplete="name"
                  required
                />
              )}

              {/* Email */}
              <InputField
                label="Adresse e-mail"
                icon={
                  <Mail className="h-4 w-4" />
                }
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleInputChange}
                placeholder="prenom.nom@compagnie.com"
                disabled={isLoading}
                autoComplete="username"
                inputMode="email"
                required
              />

              {/* Mot de passe */}
              <InputField
                label="Mot de passe"
                icon={
                  <Lock className="h-4 w-4" />
                }
                id="password"
                name="password"
                type={
                  showPassword
                    ? 'text'
                    : 'password'
                }
                value={form.password}
                onChange={handleInputChange}
                placeholder="8 caractères minimum"
                disabled={isLoading}
                autoComplete={
                  isSignUp
                    ? 'new-password'
                    : 'current-password'
                }
                minLength={8}
                required
                className="pr-12"
                rightElement={
                  <button
                    type="button"
                    aria-label={
                      showPassword
                        ? 'Masquer le mot de passe'
                        : 'Afficher le mot de passe'
                    }
                    aria-pressed={
                      showPassword
                    }
                    onClick={() =>
                      setShowPassword(
                        (current) =>
                          !current,
                      )
                    }
                    className="cursor-pointer text-slate-400 transition hover:text-emerald-700 focus:outline-none focus:text-emerald-700 disabled:opacity-50"
                    disabled={
                      isLoading
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                }
              />

              {/* Rôle */}
              {isSignUp && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="role"
                    className="block px-4 text-[10px] font-bold uppercase tracking-wider text-slate-400"
                  >
                    Rôle opérationnel
                  </label>

                  <div className="relative">
                    <select
                      id="role"
                      name="role"
                      value={form.role}
                      onChange={
                        handleInputChange
                      }
                      className="h-12 w-full cursor-pointer appearance-none rounded-full border border-slate-200 bg-slate-50/50 pl-5 pr-11 text-sm text-slate-600 outline-none transition hover:border-slate-300 focus:border-emerald-600 focus:bg-white focus:ring-4 focus:ring-emerald-600/10 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={
                        isLoading
                      }
                    >
                      {SELF_REGISTRATION_ROLES.map(
                        (role) => (
                          <option
                            key={role}
                            value={role}
                          >
                            {
                              ROLE_LABELS[
                                role
                              ]
                            }
                          </option>
                        ),
                      )}
                    </select>

                    <ChevronDown
                      className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                  </div>
                </div>
              )}

              {/* Information session */}
              {!isSignUp && (
                <div className="flex items-center justify-end px-2 pt-1">
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />

                    Session sécurisée et persistante
                  </span>
                </div>
              )}

              {/* Messages */}
              <div
                aria-live="polite"
                className="min-h-0"
              >
                {error && (
                  <div
                    className="rounded-xl border border-rose-100 bg-rose-50/70 px-4 py-2.5 text-xs font-semibold leading-relaxed text-rose-700"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                {success && (
                  <div
                    className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-2.5 text-xs font-semibold leading-relaxed text-emerald-800"
                    role="status"
                  >
                    {success}
                  </div>
                )}
              </div>

              {/* Boutons */}
              <div className="flex flex-wrap items-center gap-5 pt-4">

                <button
                  type="submit"
                  className="inline-flex h-11 cursor-pointer items-center justify-center rounded-full bg-emerald-700 px-8 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-emerald-700/20 transition hover:bg-emerald-800 active:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    isLoading
                  }
                >
                  {isLoading && (
                    <IconSpinner />
                  )}

                  {isLoading
                    ? isSignUp
                      ? 'Création...'
                      : 'Connexion...'
                    : isSignUp
                      ? "S'inscrire"
                      : 'Se connecter'}
                </button>

                <button
                  type="button"
                  onClick={
                    switchMode
                  }
                  className="cursor-pointer text-xs font-bold uppercase tracking-wider text-emerald-700 transition hover:text-emerald-800 focus:outline-none focus:underline disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    isLoading
                  }
                >
                  {isSignUp
                    ? 'Retour à la connexion'
                    : 'Créer un compte'}
                </button>

              </div>
            </form>
          </div>

          {/* Information sécurité */}
          <div className="mt-8 border-t border-slate-100 pt-5 text-[10px] font-semibold leading-relaxed text-slate-400">
            Les rôles Administrateur et Product Owner ne sont pas
            proposés en inscription autonome. Leur attribution doit
            être gérée par un administrateur côté serveur.
          </div>
        </div>

        {/* ================================================================ */}
        {/* PANNEAU DROIT */}
        {/* ================================================================ */}

        <InfoPanel />
      </div>
    </div>
  );
}