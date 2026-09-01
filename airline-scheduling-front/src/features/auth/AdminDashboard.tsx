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
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const apiError = error as { status?: number; message?: string };

    switch (apiError.status) {
      case 400:
        return (
          apiError.message || 'Les informations saisies sont invalides.'
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
        return 'Impossible de contacter le serveur. Vérifiez votre connexion.';
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

  return "Une erreur inattendue est survenue pendant l'authentification.";
}

// =============================================================================
// SPINNER
// =============================================================================

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-white"
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
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
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

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
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
      setError("Veuillez renseigner l'adresse e-mail administrateur.");
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Veuillez saisir une adresse e-mail valide.');
      return false;
    }

    if (!form.password) {
      setError('Veuillez renseigner votre mot de passe.');
      return false;
    }

    if (form.password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return false;
    }

    return true;
  };

  // ===========================================================================
  // CONNEXION ADMIN
  // ===========================================================================

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isLoading || !validate()) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const auth = await logIn({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      if (!auth || !auth.user) {
        throw new Error(
          "Le serveur n'a pas retourné les informations de l'utilisateur."
        );
      }

      if (auth.user.role !== 'Admin') {
        throw new Error(
          "Accès refusé. Ce compte ne possède pas le rôle Administrateur."
        );
      }

      saveAuthSession(auth, true);

      onAuthenticate({
        id: auth.user.id,
        nom: auth.user.nom,
        email: auth.user.email,
        role: auth.user.role,
      });
    } catch (apiError: unknown) {
      setError(getFriendlyError(apiError));
    } finally {
      setIsLoading(false);
    }
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-100/70 p-4 font-sans antialiased sm:p-6 lg:p-8">
      {/* Container principal à 2 colonnes */}
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl shadow-slate-200/80 lg:grid-cols-12">
        
        {/* COLONNE GAUCHE : Formulaire */}
        <div className="flex flex-col justify-between p-8 sm:p-12 lg:col-span-7">
          <div>
            {/* Header / Brand */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <Plane className="h-4 w-4 rotate-45 text-emerald-600" />
                </div>
                <span className="text-xs font-black tracking-wider text-slate-900">
                  AIRLINE OPERATIONS
                </span>
              </div>

              <button
                type="button"
                onClick={onBack}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Retour
              </button>
            </div>

            {/* Title Section */}
            <div className="mt-8">
              <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">
                Connexion sécurisée
              </h1>
              <p className="mt-1.5 text-xs font-medium text-slate-400 sm:text-sm">
                Accédez au système de planification et de supervision des vols.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
              {/* Email */}
              <div className="space-y-2">
                <label
                  htmlFor="admin-email"
                  className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase"
                >
                  ADRESSE E-MAIL
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="admin-email"
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    disabled={isLoading}
                    placeholder="prenom.nom@compagnie.com"
                    autoComplete="username"
                    className="h-12 w-full rounded-full border border-slate-200 bg-slate-50/40 pl-11 pr-4 text-xs font-medium text-slate-800 transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 disabled:bg-slate-100"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label
                  htmlFor="admin-password"
                  className="block text-[10px] font-bold tracking-wider text-slate-400 uppercase"
                >
                  MOT DE PASSE
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="admin-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={handleChange}
                    disabled={isLoading}
                    placeholder="8 caractères minimum"
                    autoComplete="current-password"
                    className="h-12 w-full rounded-full border border-slate-200 bg-slate-50/40 pl-11 pr-11 text-xs font-medium text-slate-800 transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 disabled:bg-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    disabled={isLoading}
                    aria-label={
                      showPassword
                        ? 'Masquer le mot de passe'
                        : 'Afficher le mot de passe'
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end text-[11px] font-medium text-slate-400">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Session sécurisée et persistante
                </span>
              </div>

              {/* Error Box */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs font-medium text-rose-800"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-4 pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="h-11 rounded-full bg-emerald-700 px-7 text-xs font-bold tracking-wider text-white shadow-md shadow-emerald-700/20 transition hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 active:scale-[0.98] disabled:opacity-70"
                >
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <Spinner /> Connexion...
                    </span>
                  ) : (
                    'SE CONNECTER'
                  )}
                </button>

                <button
                  type="button"
                  onClick={onBack}
                  className="text-xs font-bold tracking-wider text-emerald-700 hover:text-emerald-800 hover:underline uppercase"
                >
                  CRÉER UN COMPTE
                </button>
              </div>
            </form>
          </div>

          {/* Bottom Card Info */}
          <div className="mt-8 flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition-colors hover:bg-slate-100/60">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  Espace administrateur
                </p>
                <p className="text-[11px] text-slate-400">
                  Accéder directement au tableau de bord Admin
                </p>
              </div>
            </div>
            <span className="text-xs font-bold text-slate-300">→</span>
          </div>
        </div>

        {/* COLONNE DROITE : Panneau sombre avec image localement importée */}
        <div className="relative hidden flex-col justify-between overflow-hidden rounded-tl-[120px] bg-[#0c1821] p-10 text-white lg:col-span-5 lg:flex">
          {/* Dégradé de fond */}
          <div className="absolute inset-0 bg-linear-to-br from-emerald-950/80 via-[#0c1821] to-[#081017]" />

          {/* Image d'arrière-plan via l'import local */}
          <div
            className="absolute inset-0 bg-cover bg-bottom opacity-40 mix-blend-luminosity"
            style={{
              backgroundImage: `url(${myImage})`,
            }}
          />

          {/* Icone Avion / Logo */}
          <div className="relative z-10 pt-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 backdrop-blur-md">
              <Plane className="h-5 w-5 rotate-45 text-emerald-400" />
            </div>
          </div>

          {/* Texte explicatif bas/centre */}
          <div className="relative z-10 my-auto pb-12">
            <h2 className="text-3xl font-extrabold leading-tight text-white sm:text-4xl">
              Gérez vos rotations <br />
              en temps réel.
            </h2>
            <p className="mt-4 text-xs font-normal leading-relaxed text-slate-300">
              Supervisez la flotte, les conflits de planning, les équipages, la
              maintenance technique et les opérations OCC depuis un espace
              centralisé.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

export default AdminDashboard;