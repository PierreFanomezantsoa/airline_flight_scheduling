// src/features/auth/AdminDashboard.tsx

import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Plane,
  ShieldCheck,
} from 'lucide-react';

import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import myImage from '../../assets/avions.png';

import {
  logIn,
  saveAuthSession,
  type PublicUser,
} from '../Api/apiService';

// =============================================================================
// TYPES
// =============================================================================

type AdminUser = Pick<PublicUser, 'id' | 'nom' | 'email' | 'role'>;

interface AdminDashboardProps {
  onAuthenticate: (user: AdminUser) => void;
  onBack: () => void;
}

interface AdminForm {
  email: string;
  password: string;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const INITIAL_FORM: AdminForm = {
  email: '',
  password: '',
};

// =============================================================================
// ERREURS
// =============================================================================

function getFriendlyError(error: unknown): string {
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
      case 400:
        return (
          apiError.message ||
          'Les informations saisies sont invalides.'
        );

      case 401:
        return 'Adresse e-mail ou mot de passe incorrect.';

      case 403:
        return (
          apiError.message ||
          "Vous n'avez pas l'autorisation d'accéder à l'administration."
        );

      case 404:
        return 'Compte administrateur introuvable.';

      case 0:
        return (
          'Impossible de contacter le serveur. Vérifiez votre connexion.'
        );

      default:
        return (
          apiError.message ||
          "Une erreur est survenue pendant l'authentification."
        );
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return (
    "Une erreur inattendue est survenue pendant l'authentification."
  );
}

// =============================================================================
// SPINNER
// =============================================================================

function Spinner() {
  return (
    <svg
      className="
        h-4
        w-4
        animate-spin
        text-white
      "
      viewBox="0 0 24 24"
      fill="none"
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
}

// =============================================================================
// ADMIN AUTH PAGE
// =============================================================================

export function AdminDashboard({
  onAuthenticate,
  onBack,
}: AdminDashboardProps) {
  const [form, setForm] = useState<AdminForm>(INITIAL_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // ===========================================================================
  // INPUT
  // ===========================================================================

  const handleChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    if (error) {
      setError('');
    }
  };

  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  const validate = (): boolean => {
    const email = form.email.trim().toLowerCase();

    if (!email) {
      setError(
        "Veuillez renseigner l'adresse e-mail administrateur.",
      );
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(
        'Veuillez saisir une adresse e-mail valide.',
      );
      return false;
    }

    if (!form.password) {
      setError(
        'Veuillez renseigner votre mot de passe.',
      );
      return false;
    }

    if (form.password.length < 8) {
      setError(
        'Le mot de passe doit contenir au moins 8 caractères.',
      );
      return false;
    }

    return true;
  };

  // ===========================================================================
  // CONNEXION ADMIN
  // ===========================================================================

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (
      isLoading ||
      !validate()
    ) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const auth = await logIn({
        email: form.email
          .trim()
          .toLowerCase(),
        password: form.password,
      });

      if (
        !auth ||
        !auth.user
      ) {
        throw new Error(
          "Le serveur n'a pas retourné les informations de l'utilisateur.",
        );
      }

      if (auth.user.role !== 'Admin') {
        throw new Error(
          "Accès refusé. Ce compte ne possède pas le rôle Administrateur.",
        );
      }

      saveAuthSession(
        auth,
        true,
      );

      onAuthenticate({
        id: auth.user.id,
        nom: auth.user.nom,
        email: auth.user.email,
        role: auth.user.role,
      });
    } catch (apiError: unknown) {
      setError(
        getFriendlyError(apiError),
      );
    } finally {
      setIsLoading(false);
    }
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
        p-3
        font-sans
        antialiased

        sm:p-5
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
          grid
          w-full
          max-w-5xl
          overflow-hidden
          rounded-2xl
          bg-white
          shadow-xl
          shadow-slate-200/80

          sm:rounded-3xl
          sm:shadow-2xl

          lg:grid-cols-12
        "
      >
        {/* ===================================================================
            COLONNE GAUCHE
        =================================================================== */}

        <div
          className="
            flex
            flex-col
            justify-between
            bg-white
            p-5

            sm:p-8
            md:p-10

            lg:col-span-7
            lg:p-12
          "
        >
          <div>
            {/* ===============================================================
                HEADER
            =============================================================== */}

            <div
              className="
                flex
                items-center
                justify-between
                gap-3
              "
            >
              {/* Brand */}
              <div
                className="
                  flex
                  min-w-0
                  items-center
                  gap-2
                "
              >
                <div
                  className="
                    flex
                    h-8
                    w-8
                    shrink-0
                    items-center
                    justify-center
                    rounded-lg
                    bg-emerald-100
                    text-emerald-700
                  "
                >
                  <Plane
                    className="
                      h-4
                      w-4
                      rotate-45
                      text-emerald-600
                    "
                  />
                </div>

                <span
                  className="
                    truncate
                    text-[11px]
                    font-black
                    uppercase
                    tracking-wider
                    text-slate-900

                    sm:text-xs
                  "
                >
                  Airline Operations
                </span>
              </div>

              {/* Retour */}
              <button
                type="button"
                onClick={onBack}
                disabled={isLoading}
                className="
                  inline-flex
                  shrink-0
                  cursor-pointer
                  items-center
                  justify-center
                  gap-1.5
                  rounded-full
                  border
                  border-slate-200
                  bg-white
                  px-3
                  py-2
                  text-[11px]
                  font-semibold
                  text-slate-500
                  transition

                  hover:border-slate-300
                  hover:bg-slate-50
                  hover:text-slate-800

                  focus:outline-none
                  focus:ring-2
                  focus:ring-emerald-500/20

                  disabled:cursor-not-allowed
                  disabled:opacity-50
                "
              >
                <ArrowLeft className="h-3.5 w-3.5" />

                <span
                  className="
                    hidden
                    min-[360px]:inline
                  "
                >
                  Retour
                </span>
              </button>
            </div>

            {/* ===============================================================
                TITRE
            =============================================================== */}

            <div
              className="
                mt-7
                text-center

                sm:mt-8
                sm:text-left
              "
            >
              <div
                className="
                  mx-auto
                  mb-3
                  flex
                  h-11
                  w-11
                  items-center
                  justify-center
                  rounded-2xl
                  bg-emerald-100
                  text-emerald-700

                  sm:mx-0
                "
              >
                <ShieldCheck className="h-5 w-5" />
              </div>

              <h1
                className="
                  text-[22px]
                  font-extrabold
                  leading-tight
                  tracking-tight
                  text-slate-900

                  sm:text-3xl
                "
              >
                Connexion administrateur
              </h1>

              <p
                className="
                  mx-auto
                  mt-2
                  max-w-md
                  text-xs
                  font-medium
                  leading-relaxed
                  text-slate-400

                  sm:mx-0
                  sm:text-sm
                "
              >
                Accédez à l'espace sécurisé de gestion et
                d'administration du système.
              </p>
            </div>

            {/* ===============================================================
                FORMULAIRE
            =============================================================== */}

            <form
              onSubmit={handleSubmit}
              className="
                mt-7
                space-y-4

                sm:mt-8
                sm:space-y-5
              "
              noValidate
            >
              {/* =============================================================
                  EMAIL
              ============================================================= */}

              <div className="space-y-1.5">
                <label
                  htmlFor="admin-email"
                  className="
                    block
                    px-3
                    text-[10px]
                    font-bold
                    uppercase
                    tracking-wider
                    text-slate-400

                    sm:px-4
                  "
                >
                  Adresse e-mail
                </label>

                <div className="relative">
                  <Mail
                    className="
                      pointer-events-none
                      absolute
                      left-4
                      top-1/2
                      h-4
                      w-4
                      -translate-y-1/2
                      text-slate-400
                    "
                  />

                  <input
                    id="admin-email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    disabled={isLoading}
                    placeholder="prenom.nom@compagnie.com"
                    autoComplete="username"
                    inputMode="email"
                    className="
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
                      text-slate-800
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
                    "
                  />
                </div>
              </div>

              {/* =============================================================
                  PASSWORD
              ============================================================= */}

              <div className="space-y-1.5">
                <label
                  htmlFor="admin-password"
                  className="
                    block
                    px-3
                    text-[10px]
                    font-bold
                    uppercase
                    tracking-wider
                    text-slate-400

                    sm:px-4
                  "
                >
                  Mot de passe
                </label>

                <div className="relative">
                  <Lock
                    className="
                      pointer-events-none
                      absolute
                      left-4
                      top-1/2
                      h-4
                      w-4
                      -translate-y-1/2
                      text-slate-400
                    "
                  />

                  <input
                    id="admin-password"
                    name="password"
                    type={
                      showPassword
                        ? 'text'
                        : 'password'
                    }
                    value={form.password}
                    onChange={handleChange}
                    disabled={isLoading}
                    placeholder="8 caractères minimum"
                    autoComplete="current-password"
                    className="
                      h-12
                      w-full
                      rounded-full
                      border
                      border-slate-200
                      bg-slate-50/50
                      pl-11
                      pr-12
                      text-sm
                      font-medium
                      text-slate-800
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
                    "
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (current) => !current,
                      )
                    }
                    disabled={isLoading}
                    aria-label={
                      showPassword
                        ? 'Masquer le mot de passe'
                        : 'Afficher le mot de passe'
                    }
                    aria-pressed={showPassword}
                    className="
                      absolute
                      right-4
                      top-1/2
                      -translate-y-1/2
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
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* =============================================================
                  SESSION
              ============================================================= */}

              <div
                className="
                  flex
                  items-center
                  justify-center
                  px-2
                  pt-1

                  sm:justify-end
                "
              >
                <span
                  className="
                    inline-flex
                    items-center
                    gap-1.5
                    text-center
                    text-[10px]
                    font-semibold
                    text-slate-400

                    sm:text-[11px]
                  "
                >
                  <CheckCircle2
                    className="
                      h-3.5
                      w-3.5
                      shrink-0
                      text-emerald-600
                    "
                  />

                  Session sécurisée et persistante
                </span>
              </div>

              {/* =============================================================
                  ERREUR
              ============================================================= */}

              {error && (
                <div
                  role="alert"
                  className="
                    flex
                    items-start
                    gap-2.5
                    rounded-xl
                    border
                    border-rose-200
                    bg-rose-50
                    p-3.5
                    text-xs
                    font-medium
                    leading-relaxed
                    text-rose-800
                  "
                >
                  <AlertCircle
                    className="
                      mt-0.5
                      h-4
                      w-4
                      shrink-0
                      text-rose-600
                    "
                  />

                  <span>{error}</span>
                </div>
              )}

              {/* =============================================================
                  ACTIONS
              ============================================================= */}

              <div
                className="
                  flex
                  flex-col
                  items-center
                  justify-center
                  gap-2.5
                  pt-3

                  sm:flex-row
                  sm:justify-start
                  sm:gap-4
                  sm:pt-4
                "
              >
                {/* Connexion */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="
                    inline-flex
                    h-11
                    min-w-45
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
                    disabled:opacity-60

                    max-[380px]:w-full
                  "
                >
                  {isLoading ? (
                    <span
                      className="
                        flex
                        items-center
                        justify-center
                        gap-2
                      "
                    >
                      <Spinner />
                      Connexion...
                    </span>
                  ) : (
                    'Se connecter'
                  )}
                </button>

                {/* Créer compte */}
                <button
                  type="button"
                  onClick={onBack}
                  disabled={isLoading}
                  className="
                    cursor-pointer
                    rounded-full
                    px-4
                    py-2
                    text-center
                    text-[11px]
                    font-bold
                    uppercase
                    tracking-wider
                    text-emerald-700
                    transition

                    hover:bg-emerald-50
                    hover:text-emerald-800

                    focus:outline-none
                    focus:ring-2
                    focus:ring-emerald-500/20

                    disabled:cursor-not-allowed
                    disabled:opacity-50

                    sm:text-xs
                  "
                >
                  Créer un compte
                </button>
              </div>
            </form>
          </div>

          {/* =================================================================
              INFORMATIONS ADMINISTRATEUR
          ================================================================= */}

          <div
            className="
              mt-7
              flex
              items-center
              gap-3
              rounded-2xl
              border
              border-slate-100
              bg-slate-50/50
              p-3.5
              transition

              hover:border-emerald-100
              hover:bg-emerald-50/30

              sm:mt-8
              sm:p-4
            "
          >
            <div
              className="
                flex
                h-9
                w-9
                shrink-0
                items-center
                justify-center
                rounded-xl
                bg-emerald-100
                text-emerald-700
              "
            >
              <ShieldCheck className="h-5 w-5" />
            </div>

            <div className="min-w-0">
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
                  text-[10px]
                  leading-relaxed
                  text-slate-400

                  sm:text-[11px]
                "
              >
                Accès réservé aux comptes disposant du rôle
                Administrateur.
              </p>
            </div>
          </div>
        </div>

        {/* ===================================================================
            COLONNE DROITE
        =================================================================== */}

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
          {/* Dégradé */}
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

          {/* Image avion */}
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

          {/* Logo avion */}
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
              <Plane
                className="
                  h-5
                  w-5
                  rotate-45
                  text-emerald-400
                "
              />
            </div>
          </div>

          {/* Texte */}
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
              Supervisez la flotte, les conflits de planning,
              les équipages, la maintenance technique et les
              opérations OCC depuis un espace centralisé.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;