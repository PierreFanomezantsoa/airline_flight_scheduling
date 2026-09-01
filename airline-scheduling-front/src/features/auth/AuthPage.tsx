// src/features/auth/AuthPage.tsx

import {
  memo,
  useState,
} from 'react';

import type {
  ChangeEvent,
  FormEvent,
  InputHTMLAttributes,
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

  Planificateur:
    'Planificateur de vol',

  Regulator:
    'Régulateur OCC',

  Crew_Member:
    "Membre d'équipage",

  Maintenance_Engineer:
    'Ingénieur de maintenance',

  Product_Owner:
    'Product Owner',
};

// =============================================================================
// RÔLES AUTORISÉS À L'INSCRIPTION PUBLIQUE
// =============================================================================

const SELF_REGISTRATION_ROLES: UserRole[] = [
  'Planificateur',
  'Regulator',
  'Crew_Member',
  'Maintenance_Engineer',
];

// =============================================================================
// TYPES
// =============================================================================

export interface AuthenticatedUser {
  id: string;
  nom: string;
  email: string;
  role: UserRole;
}

interface AuthPageProps {
  onAuthenticate: (
    user: AuthenticatedUser,
  ) => void;

  onAdminDashboard?: () => void;
}

interface AuthFormState {
  email: string;
  password: string;
  nom: string;
  role: UserRole;
}

// =============================================================================
// VALEUR INITIALE
// =============================================================================

const INITIAL_FORM: AuthFormState = {
  email: '',
  password: '',
  nom: '',
  role: 'Regulator',
};

// =============================================================================
// INPUT
// =============================================================================

interface InputFieldProps
  extends InputHTMLAttributes<HTMLInputElement> {
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
}: InputFieldProps) => {
  return (
    <div
      className="
        space-y-1.5
      "
    >
      <label
        htmlFor={id}
        className="
          block
          px-4
          text-[10px]
          font-bold
          uppercase
          tracking-wider
          text-slate-400
        "
      >
        {label}
      </label>

      <div
        className="
          relative
        "
      >
        <div
          className="
            pointer-events-none
            absolute
            left-4
            top-1/2
            flex
            h-4
            w-4
            -translate-y-1/2
            items-center
            justify-center
            text-slate-400
          "
          aria-hidden="true"
        >
          {icon}
        </div>

        <input
          id={id}
          {...props}
          className={`
            h-12
            w-full
            rounded-full
            border
            border-slate-200
            bg-slate-50/50
            pl-11
            pr-4
            text-sm
            font-medium
            text-slate-700
            outline-none
            transition

            placeholder:text-slate-400

            hover:border-slate-300

            focus:border-emerald-600
            focus:bg-white
            focus:ring-4
            focus:ring-emerald-600/10

            disabled:cursor-not-allowed
            disabled:bg-slate-100
            disabled:opacity-60

            ${className}
          `}
        />

        {rightElement && (
          <div
            className="
              absolute
              right-4
              top-1/2
              flex
              -translate-y-1/2
              items-center
            "
          >
            {rightElement}
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// SPINNER
// =============================================================================

const IconSpinner = () => {
  return (
    <svg
      className="
        -ml-1
        mr-2
        h-4
        w-4
        animate-spin
        text-white
      "
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
        d="
          M4 12
          a8 8 0 018-8
          V0
          C5.373 0 0 5.373 0 12
          h4
          zm2 5.291
          A7.962 7.962 0 014 12
          H0
          c0 3.042
          1.135 5.824
          3 7.938
          l3-2.647
          z
        "
      />
    </svg>
  );
};

// =============================================================================
// PANNEAU DROIT
// DESIGN ALIGNÉ SUR ADMIN DASHBOARD
// =============================================================================

const InfoPanel = memo(() => {
  return (
    <div
      className="
        relative
        hidden
        flex-col
        justify-between
        overflow-hidden
        rounded-tl-[120px]
        bg-[#0c1821]
        p-10
        text-white
        lg:col-span-5
        lg:flex
      "
    >
      {/* =====================================================================
          DÉGRADÉ SOMBRE
      ===================================================================== */}

      <div
        className="
          absolute
          inset-0
          bg-linear-to-br
          from-emerald-950/80
          via-[#0c1821]
          to-[#081017]
        "
        aria-hidden="true"
      />

      {/* =====================================================================
          IMAGE AVION
      ===================================================================== */}

      <div
        className="
          absolute
          inset-0
          bg-cover
          bg-bottom
          bg-no-repeat
          opacity-40
          mix-blend-luminosity
        "
        style={{
          backgroundImage: `url(${myImage})`,
        }}
        aria-hidden="true"
      />

      {/* =====================================================================
          LOGO
      ===================================================================== */}

      <div
        className="
          relative
          z-10
          pt-4
        "
      >
        <div
          className="
            flex
            h-11
            w-11
            items-center
            justify-center
            rounded-2xl
            border
            border-white/10
            bg-white/10
            backdrop-blur-md
          "
        >
          <PlaneTakeoff
            className="
              h-5
              w-5
              rotate-45
              text-emerald-400
            "
          />
        </div>
      </div>

      {/* =====================================================================
          TEXTE
      ===================================================================== */}

      <div
        className="
          relative
          z-10
          my-auto
          pb-12
        "
      >
        <h2
          className="
            text-3xl
            font-extrabold
            leading-tight
            tracking-tight
            text-white
            sm:text-4xl
          "
        >
          Gérez vos rotations
          <br />
          en temps réel.
        </h2>

        <p
          className="
            mt-4
            max-w-sm
            text-xs
            font-normal
            leading-relaxed
            text-slate-300
          "
        >
          Supervisez la flotte,
          les conflits de planning,
          les équipages,
          la maintenance technique
          et les opérations OCC
          depuis un espace centralisé.
        </p>
      </div>
    </div>
  );
});

InfoPanel.displayName = 'InfoPanel';

// =============================================================================
// ERREURS API
// =============================================================================

function getFriendlyApiError(
  error: unknown,
): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error
  ) {
    const apiError =
      error as {
        status?: number;
        message?: string;
      };

    switch (
      apiError.status
    ) {
      case 400:
        return (
          apiError.message ||
          'Les informations saisies sont invalides.'
        );

      case 401:
        return (
          'Email ou mot de passe incorrect.'
        );

      case 403:
        return (
          apiError.message ||
          "Vous n'avez pas l'autorisation d'accéder à cette ressource."
        );

      case 404:
        return (
          apiError.message ||
          'Utilisateur introuvable.'
        );

      case 409:
        return (
          apiError.message ||
          'Ce compte existe déjà.'
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

  if (
    error instanceof Error
  ) {
    return error.message;
  }

  if (
    typeof error === 'string'
  ) {
    return error;
  }

  return (
    "Une erreur inattendue est survenue lors de l'authentification."
  );
}

// =============================================================================
// RÔLE AUTORISÉ EN INSCRIPTION PUBLIQUE
// =============================================================================

function isSelfRegistrationRole(
  role: UserRole,
): boolean {
  return (
    SELF_REGISTRATION_ROLES.includes(
      role,
    )
  );
}

// =============================================================================
// PAGE AUTHENTIFICATION
// =============================================================================

export function AuthPage({
  onAuthenticate,
  onAdminDashboard,
}: AuthPageProps) {
  const [
    form,
    setForm,
  ] =
    useState<AuthFormState>(
      INITIAL_FORM,
    );

  const [
    isSignUp,
    setIsSignUp,
  ] =
    useState(
      false,
    );

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(
      false,
    );

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(
      false,
    );

  const [
    error,
    setError,
  ] =
    useState('');

  const [
    success,
    setSuccess,
  ] =
    useState('');

  // ===========================================================================
  // CHANGEMENT DES CHAMPS
  // ===========================================================================

  const handleInputChange = (
    event:
      ChangeEvent<
        HTMLInputElement |
        HTMLSelectElement
      >,
  ) => {
    const target =
      event.target;

    const key =
      target.id as keyof AuthFormState;

    setError('');
    setSuccess('');

    setForm(
      (
        current,
      ) => ({
        ...current,

        [key]:
          target.value,
      }),
    );
  };

  // ===========================================================================
  // BASCULER CONNEXION / INSCRIPTION
  // ===========================================================================

  const switchMode = () => {
    setIsSignUp(
      (
        current,
      ) =>
        !current,
    );

    setError('');
    setSuccess('');
    setShowPassword(
      false,
    );

    setForm(
      (
        current,
      ) => ({
        ...INITIAL_FORM,

        email:
          current.email,
      }),
    );
  };

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  const validateForm =
    (): boolean => {
      const email =
        form.email
          .trim()
          .toLowerCase();

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
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          email,
        )
      ) {
        setError(
          'Veuillez saisir une adresse e-mail valide.',
        );

        return false;
      }

      if (
        form.password.length <
        8
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
        !isSelfRegistrationRole(
          form.role,
        )
      ) {
        setError(
          "Ce rôle ne peut pas être demandé depuis l'inscription publique.",
        );

        return false;
      }

      return true;
    };

  // ===========================================================================
  // AUTHENTIFIER UTILISATEUR
  // ===========================================================================

  const authenticate = (
    user: PublicUser,
  ) => {
    onAuthenticate({
      id:
        user.id,

      nom:
        user.nom,

      email:
        user.email,

      role:
        user.role,
    });
  };

  // ===========================================================================
  // SUBMIT
  // ===========================================================================

  const handleSubmit =
    async (
      event:
        FormEvent<HTMLFormElement>,
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

      setIsLoading(
        true,
      );

      setError('');
      setSuccess('');

      try {
        // =====================================================================
        // INSCRIPTION
        // =====================================================================

        if (
          isSignUp
        ) {
          await signUp({
            email,

            password:
              form.password,

            nom,

            role:
              form.role,
          });

          setIsSignUp(
            false,
          );

          setShowPassword(
            false,
          );

          setForm({
            ...INITIAL_FORM,
            email,
          });

          setSuccess(
            'Compte créé avec succès. Vous pouvez maintenant vous connecter.',
          );

          return;
        }

        // =====================================================================
        // CONNEXION
        // =====================================================================

        const auth =
          await logIn({
            email,

            password:
              form.password,
          });

        if (
          !auth ||
          !auth.user
        ) {
          throw new Error(
            "Le serveur n'a pas retourné les informations de l'utilisateur.",
          );
        }

        if (
          !auth.user.id ||
          !auth.user.email ||
          !auth.user.role
        ) {
          throw new Error(
            "La réponse d'authentification est incomplète.",
          );
        }

        // =====================================================================
        // SAUVEGARDE SESSION
        // =====================================================================

        saveAuthSession(
          auth,
          true,
        );

        // =====================================================================
        // AUTHENTIFICATION TERMINÉE
        // =====================================================================

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
        setIsLoading(
          false,
        );
      }
    };

  // ===========================================================================
  // ACCÈS ADMIN
  // ===========================================================================

  const handleAdminAccess =
    () => {
      setError('');
      setSuccess('');

      if (
        !onAdminDashboard
      ) {
        setError(
          "L'espace administrateur n'est pas configuré.",
        );

        return;
      }

      onAdminDashboard();
    };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <div
      className="
        relative
        flex
        min-h-screen
        w-full
        items-center
        justify-center
        overflow-hidden
        bg-slate-100/70
        p-4
        font-sans
        text-slate-900
        antialiased
        sm:p-6
        lg:p-8
      "
    >
      {/* =====================================================================
          BACKGROUND
      ===================================================================== */}

      <div
        className="
          pointer-events-none
          absolute
          -left-40
          -top-40
          h-96
          w-96
          rounded-full
          bg-emerald-100/50
          blur-3xl
        "
        aria-hidden="true"
      />

      <div
        className="
          pointer-events-none
          absolute
          -bottom-40
          -right-20
          h-96
          w-96
          rounded-full
          bg-emerald-100/40
          blur-3xl
        "
        aria-hidden="true"
      />

      {/* =====================================================================
          CONTAINER PRINCIPAL
      ===================================================================== */}

      <div
        className="
          relative
          z-20
          mx-auto
          grid
          w-full
          max-w-5xl
          overflow-hidden
          rounded-3xl
          bg-white
          shadow-2xl
          shadow-slate-200/80
          lg:grid-cols-12
        "
      >
        {/* ===================================================================
            COLONNE GAUCHE : FORMULAIRE
        =================================================================== */}

        <div
          className="
            flex
            flex-col
            justify-between
            bg-white
            p-8
            sm:p-12
            lg:col-span-7
          "
        >
          <div>
            {/* ===============================================================
                LOGO
            =============================================================== */}

            <div
              className="
                flex
                items-center
                gap-2.5
                font-black
                tracking-tight
                text-emerald-700
              "
            >
              <div
                className="
                  flex
                  h-8
                  w-8
                  items-center
                  justify-center
                  rounded-lg
                  bg-emerald-100
                  text-emerald-700
                "
              >
                <BookOpen
                  className="
                    h-4
                    w-4
                    stroke-[2.5]
                    text-emerald-700
                  "
                />
              </div>

              <span
                className="
                  text-xs
                  font-black
                  uppercase
                  tracking-wider
                  text-slate-900
                "
              >
                Airline Operations
              </span>
            </div>

            {/* ===============================================================
                TITRE
            =============================================================== */}

            <div
              className="
                mt-8
              "
            >
              <h1
                className="
                  text-2xl
                  font-extrabold
                  tracking-tight
                  text-slate-900
                  sm:text-3xl
                "
              >
                {isSignUp
                  ? 'Créer un compte opérationnel'
                  : 'Connexion sécurisée'}
              </h1>

              <p
                className="
                  mt-1.5
                  text-xs
                  font-medium
                  leading-relaxed
                  text-slate-400
                  sm:text-sm
                "
              >
                {isSignUp
                  ? 'Créez un compte avec un rôle opérationnel autorisé.'
                  : 'Accédez au système de planification et de supervision des vols.'}
              </p>
            </div>

            {/* ===============================================================
                FORMULAIRE
            =============================================================== */}

            <form
              className="
                mt-8
                space-y-4
              "
              onSubmit={
                handleSubmit
              }
              noValidate
            >
              {/* =============================================================
                  NOM
              ============================================================= */}

              {isSignUp && (
                <InputField
                  label="Nom complet"
                  icon={
                    <User
                      className="
                        h-4
                        w-4
                      "
                    />
                  }
                  id="nom"
                  name="nom"
                  type="text"
                  value={
                    form.nom
                  }
                  onChange={
                    handleInputChange
                  }
                  placeholder="Nom et prénom"
                  disabled={
                    isLoading
                  }
                  autoComplete="name"
                  required
                />
              )}

              {/* =============================================================
                  EMAIL
              ============================================================= */}

              <InputField
                label="Adresse e-mail"
                icon={
                  <Mail
                    className="
                      h-4
                      w-4
                    "
                  />
                }
                id="email"
                name="email"
                type="email"
                value={
                  form.email
                }
                onChange={
                  handleInputChange
                }
                placeholder="prenom.nom@compagnie.com"
                disabled={
                  isLoading
                }
                autoComplete="username"
                inputMode="email"
                required
              />

              {/* =============================================================
                  PASSWORD
              ============================================================= */}

              <InputField
                label="Mot de passe"
                icon={
                  <Lock
                    className="
                      h-4
                      w-4
                    "
                  />
                }
                id="password"
                name="password"
                type={
                  showPassword
                    ? 'text'
                    : 'password'
                }
                value={
                  form.password
                }
                onChange={
                  handleInputChange
                }
                placeholder="8 caractères minimum"
                disabled={
                  isLoading
                }
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
                        (
                          current,
                        ) =>
                          !current,
                      )
                    }
                    disabled={
                      isLoading
                    }
                    className="
                      cursor-pointer
                      text-slate-400
                      transition

                      hover:text-emerald-700

                      focus:outline-none
                      focus:text-emerald-700

                      disabled:cursor-not-allowed
                      disabled:opacity-50
                    "
                  >
                    {showPassword ? (
                      <EyeOff
                        className="
                          h-4
                          w-4
                        "
                      />
                    ) : (
                      <Eye
                        className="
                          h-4
                          w-4
                        "
                      />
                    )}
                  </button>
                }
              />

              {/* =============================================================
                  RÔLE
              ============================================================= */}

              {isSignUp && (
                <div
                  className="
                    space-y-1.5
                  "
                >
                  <label
                    htmlFor="role"
                    className="
                      block
                      px-4
                      text-[10px]
                      font-bold
                      uppercase
                      tracking-wider
                      text-slate-400
                    "
                  >
                    Rôle opérationnel
                  </label>

                  <div
                    className="
                      relative
                    "
                  >
                    <select
                      id="role"
                      name="role"
                      value={
                        form.role
                      }
                      onChange={
                        handleInputChange
                      }
                      disabled={
                        isLoading
                      }
                      className="
                        h-12
                        w-full
                        cursor-pointer
                        appearance-none
                        rounded-full
                        border
                        border-slate-200
                        bg-slate-50/50
                        pl-5
                        pr-11
                        text-sm
                        font-medium
                        text-slate-600
                        outline-none
                        transition

                        hover:border-slate-300

                        focus:border-emerald-600
                        focus:bg-white
                        focus:ring-4
                        focus:ring-emerald-600/10

                        disabled:cursor-not-allowed
                        disabled:bg-slate-100
                        disabled:opacity-60
                      "
                    >
                      {SELF_REGISTRATION_ROLES.map(
                        (
                          role,
                        ) => (
                          <option
                            key={
                              role
                            }
                            value={
                              role
                            }
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
                      className="
                        pointer-events-none
                        absolute
                        right-4
                        top-1/2
                        h-4
                        w-4
                        -translate-y-1/2
                        text-slate-400
                      "
                      aria-hidden="true"
                    />
                  </div>
                </div>
              )}

              {/* =============================================================
                  SESSION
              ============================================================= */}

              {!isSignUp && (
                <div
                  className="
                    flex
                    items-center
                    justify-end
                    px-2
                    pt-1
                  "
                >
                  <span
                    className="
                      inline-flex
                      items-center
                      gap-1.5
                      text-[10px]
                      font-semibold
                      text-slate-400
                    "
                  >
                    <ShieldCheck
                      className="
                        h-3.5
                        w-3.5
                        text-emerald-600
                      "
                    />

                    Session sécurisée et persistante
                  </span>
                </div>
              )}

              {/* =============================================================
                  MESSAGES
              ============================================================= */}

              <div
                aria-live="polite"
                className="
                  min-h-0
                "
              >
                {error && (
                  <div
                    className="
                      rounded-xl
                      border
                      border-rose-100
                      bg-rose-50/70
                      px-4
                      py-2.5
                      text-xs
                      font-semibold
                      leading-relaxed
                      text-rose-700
                    "
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                {success && (
                  <div
                    className="
                      rounded-xl
                      border
                      border-emerald-100
                      bg-emerald-50/70
                      px-4
                      py-2.5
                      text-xs
                      font-semibold
                      leading-relaxed
                      text-emerald-800
                    "
                    role="status"
                  >
                    {success}
                  </div>
                )}
              </div>

              {/* =============================================================
                  ACTIONS
              ============================================================= */}

              <div
                className="
                  flex
                  flex-wrap
                  items-center
                  gap-4
                  pt-4
                "
              >
                <button
                  type="submit"
                  disabled={
                    isLoading
                  }
                  className="
                    inline-flex
                    h-11
                    cursor-pointer
                    items-center
                    justify-center
                    rounded-full
                    bg-emerald-700
                    px-8
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    text-white
                    shadow-md
                    shadow-emerald-700/20
                    transition

                    hover:bg-emerald-800
                    active:scale-[0.98]
                    active:bg-emerald-900

                    focus:outline-none
                    focus:ring-2
                    focus:ring-emerald-600
                    focus:ring-offset-2

                    disabled:cursor-not-allowed
                    disabled:opacity-50
                  "
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
                  disabled={
                    isLoading
                  }
                  className="
                    cursor-pointer
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    text-emerald-700
                    transition

                    hover:text-emerald-800
                    hover:underline

                    focus:outline-none
                    focus:underline

                    disabled:cursor-not-allowed
                    disabled:opacity-50
                  "
                >
                  {isSignUp
                    ? 'Retour à la connexion'
                    : 'Créer un compte'}
                </button>
              </div>

              {/* =============================================================
                  ESPACE ADMINISTRATEUR
              ============================================================= */}

              {!isSignUp && (
                <div
                  className="
                    border-t
                    border-slate-100
                    pt-4
                  "
                >
                  <button
                    type="button"
                    onClick={
                      handleAdminAccess
                    }
                    disabled={
                      isLoading
                    }
                    className="
                      group
                      flex
                      w-full
                      cursor-pointer
                      items-center
                      justify-between
                      rounded-2xl
                      border
                      border-slate-100
                      bg-slate-50/50
                      p-4
                      text-left
                      transition-all

                      hover:border-emerald-200
                      hover:bg-emerald-50/50

                      focus:outline-none
                      focus:ring-2
                      focus:ring-emerald-500/30

                      disabled:cursor-not-allowed
                      disabled:opacity-50
                    "
                  >
                    <div
                      className="
                        flex
                        items-center
                        gap-3
                      "
                    >
                      <div
                        className="
                          flex
                          h-9
                          w-9
                          items-center
                          justify-center
                          rounded-xl
                          bg-emerald-100
                          text-emerald-700
                          transition

                          group-hover:bg-emerald-700
                          group-hover:text-white
                        "
                      >
                        <ShieldCheck
                          className="
                            h-5
                            w-5
                          "
                        />
                      </div>

                      <div>
                        <p
                          className="
                            text-xs
                            font-bold
                            text-slate-800
                          "
                        >
                          Espace administrateur
                        </p>

                        <p
                          className="
                            mt-0.5
                            text-[11px]
                            text-slate-400
                          "
                        >
                          Accéder à la connexion
                          administrateur sécurisée
                        </p>
                      </div>
                    </div>

                    <span
                      className="
                        text-lg
                        font-bold
                        text-slate-300
                        transition

                        group-hover:translate-x-1
                        group-hover:text-emerald-700
                      "
                    >
                      →
                    </span>
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>

        {/* ===================================================================
            COLONNE DROITE
        =================================================================== */}

        <InfoPanel />
      </div>
    </div>
  );
}

export default AuthPage;