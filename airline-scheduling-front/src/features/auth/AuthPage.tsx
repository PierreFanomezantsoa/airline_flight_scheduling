import { useState, memo } from 'react';
import type { ReactNode, ChangeEvent, FormEvent } from 'react';
import { BookOpen, ChevronDown, Eye, EyeOff, Lock, Mail, PlaneTakeoff, User } from 'lucide-react';
// Importation des services API (présumés existants dans votre projet)
import { signUp, logIn } from '../Api/apiService';

// Import de l'image de fond
import myImage from '../../assets/avions.png';

// =============================================================================
// --- CONFIGURATION & TYPAGE ---
// =============================================================================

export type UserRole =
  | 'Admin'
  | 'Planificateur'
  | 'Regulator'
  | 'Crew_Member'
  | 'Maintenance_Engineer'
  | 'Product_Owner';

const ROLE_LABELS: Record<UserRole, string> = {
  Admin: 'Administrateur',
  Planificateur: 'Planificateur de Vol',
  Regulator: 'Régulateur IHM',
  Maintenance_Engineer: 'Ingénieur de Maintenance',
  Crew_Member: "Membre d'Équipage",
  Product_Owner: 'Product Owner',
};

interface AuthenticatedUser {
  nom: string;
  email: string;
  role?: UserRole;
}

interface AuthPageProps {
  onAuthenticate: (user: AuthenticatedUser) => void;
}

// =============================================================================
// --- SOUS-COMPOSANTS UI REUTILISABLES ---
// =============================================================================

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: ReactNode;
  rightElement?: ReactNode;
}

const InputField = ({ label, icon, id, rightElement, className = "", ...props }: InputFieldProps) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="block px-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
      {label}
    </label>
    <div className="relative">
      <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4 flex items-center justify-center" aria-hidden="true">
        {icon}
      </div>
      <input
        id={id}
        {...props}
        className={`h-12 w-full rounded-full border border-slate-200 bg-slate-50/50 pl-11 pr-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 disabled:opacity-60 ${className}`}
      />
      {rightElement && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
          {rightElement}
        </div>
      )}
    </div>
  </div>
);

const IconSpinner = () => (
  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" aria-hidden="true">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

// --- PANNEAU INFORMATIF : COULEUR/DÉGRADÉ AU-DESSUS DE L'IMAGE ---
const InfoPanel = memo(() => (
  <div className="hidden lg:block relative overflow-hidden bg-slate-900 rounded-tl-[160px]">
    {/* 1. Couche Arrière-plan : Image */}
    <div 
      className="absolute inset-0 bg-cover bg-center bg-no-repeat z-0"
      style={{ 
        backgroundImage: `url(${myImage})`,
        backgroundSize: '120% 120%',
        width: '100%',
        height: '100%'
      }}
      aria-hidden="true"
    />

    {/* 2. Couche Supérieure : Dégradé de couleur placé AU-DESSUS de l'image (z-10) */}
    <div 
      className="absolute inset-0 bg-gradient-to-br from-emerald-600/90 via-slate-800/85 to-slate-900/95 z-10" 
      aria-hidden="true" 
    />

    {/* 3. Couche Contenu : Texte & Icône au tout premier plan (z-20) */}
    <div className="relative h-full flex flex-col justify-center px-12 space-y-6 text-white z-20">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 border border-white/20 backdrop-blur-md shadow-inner">
        <PlaneTakeoff className="h-5 w-5 text-emerald-300 rotate-45 stroke-[2.5]" />
      </div>
      
      <div className="space-y-3">
        <h3 className="text-3xl font-black tracking-tight leading-tight">
          Gérez vos rotations<br /> en temps réel.
        </h3>
        <p className="text-xs font-medium text-emerald-100/80 leading-relaxed max-w-xs">
          Supervisez l'état de votre flotte, ajustez la planification des équipages et suivez la maintenance technique instantanément.
        </p>
      </div>
    </div>
  </div>
));

InfoPanel.displayName = 'InfoPanel';

// =============================================================================
// --- COMPOSANT PRINCIPAL ---
// =============================================================================

export function AuthPage({ onAuthenticate }: AuthPageProps) {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'Regulator' as UserRole,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { id, value } = e.target;
    if (error) setError(''); 
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const resetForm = () => {
    setError('');
    setShowPassword(false);
    setFormData({
      email: '',
      password: '',
      name: '',
      role: 'Regulator',
    });
  };

  const handleToggleMode = () => {
    setIsSignUp(prev => !prev);
    resetForm();
  };

  const validateForm = (cleanEmail: string, cleanName: string): boolean => {
    if (!cleanEmail || !formData.password.trim()) {
      setError('Veuillez renseigner votre email et votre mot de passe.');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setError('Veuillez saisir une adresse email valide.');
      return false;
    }

    if (formData.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return false;
    }

    if (isSignUp && !cleanName) {
      setError('Veuillez renseigner votre nom complet.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    setError('');

    const cleanEmail = formData.email.trim();
    const cleanName = formData.name.trim();

    if (!validateForm(cleanEmail, cleanName)) return;

    setIsLoading(true);

    try {
      if (isSignUp) {
        await signUp({ 
          email: cleanEmail, 
          password: formData.password, 
          nom: cleanName, 
          role: formData.role 
        });
        
        setIsSignUp(false);
        setError(''); 
        setFormData(prev => ({...prev, password: ''})); 
      } else {
        const authData = await logIn({ 
          email: cleanEmail, 
          password: formData.password 
        });
        
        onAuthenticate({
          nom: authData.user.nom,
          email: authData.user.email,
          role: authData.user.role as UserRole,
        });
      }
    } catch (apiError: unknown) {
      if (apiError instanceof Error) {
        setError(apiError.message);
      } else if (typeof apiError === 'string') {
        setError(apiError);
      } else {
        setError('Une erreur inattendue est survenue lors de l\'authentification.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden px-4 py-8 text-slate-900 bg-slate-50 font-sans">
      
      {/* Accents lumineux d'arrière-plan */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-emerald-100/40 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 h-96 w-96 rounded-full bg-emerald-100/30 blur-3xl" aria-hidden="true" />

      {/* Carte Conteneur Principal */}
      <div className="relative z-20 w-full max-w-5xl mx-auto rounded-[24px] border border-slate-100 bg-white shadow-xl shadow-slate-200/50 overflow-hidden grid lg:grid-cols-[1.15fr_0.85fr]">
        
        {/* CÔTÉ GAUCHE : Formulaire */}
        <div className="p-8 sm:p-12 flex flex-col justify-between bg-white">
          <div>
            <div className="flex items-center gap-2.5 text-emerald-600 font-black tracking-tight">
              <div className="h-8 w-8 rounded-xl bg-emerald-50 flex items-center justify-center">
                <BookOpen className="h-4 w-4 text-emerald-600 stroke-[2.5]" />
              </div>
              <span className="text-sm uppercase tracking-wider font-extrabold text-slate-800">Airline </span>
            </div>

            <div className="mt-8">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {isSignUp ? 'Créer un compte' : 'Espace de Connexion'}
              </h2>
              <p className="mt-1.5 text-xs font-medium text-slate-400">
                {isSignUp
                  ? 'Remplissez les informations ci-dessous pour rejoindre la suite'
                  : 'Connectez-vous pour accéder au système de programmation des vols de compagnie aérienne'}
              </p>
            </div>

            <form className="mt-8 space-y-4" onSubmit={handleSubmit} noValidate>
              
              {isSignUp && (
                <InputField
                  label="Nom complet"
                  icon={<User className="h-4 w-4" />}
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Nom et Prénom"
                  disabled={isLoading}
                  required
                />
              )}

              <InputField
                label="Adresse e-mail"
                icon={<Mail className="h-4 w-4" />}
                id="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="example@compagnie.com"
                disabled={isLoading}
                autoComplete="username"
                required
              />

              <InputField
                label="Mot de passe"
                icon={<Lock className="h-4 w-4" />}
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={formData.password}
                onChange={handleInputChange}
                placeholder="••••••••"
                disabled={isLoading}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                required
                className="pr-12"
                rightElement={
                  <button
                    type="button"
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword(prev => !prev)}
                    className="text-slate-400 transition hover:text-emerald-600 focus:outline-none focus:text-emerald-600 disabled:opacity-50 cursor-pointer"
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              {isSignUp && (
                <div className="space-y-1.5">
                  <label htmlFor="role" className="block px-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Rôle opérationnel
                  </label>
                  <div className="relative">
                    <select
                      id="role"
                      value={formData.role}
                      onChange={handleInputChange}
                      className="h-12 w-full appearance-none rounded-full border border-slate-200 bg-slate-50/50 pl-5 pr-11 text-sm text-slate-600 outline-none transition hover:border-slate-300 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 cursor-pointer disabled:opacity-60"
                      disabled={isLoading}
                    >
                      {(Object.keys(ROLE_LABELS) as UserRole[]).map((roleKey) => (
                        <option key={roleKey} value={roleKey}>
                          {ROLE_LABELS[roleKey]}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  </div>
                </div>
              )}

              {!isSignUp && (
                <div className="flex items-center justify-between text-xs text-slate-400 px-2 pt-1 font-medium">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" className="accent-emerald-600 rounded h-3.5 w-3.5" /> Se souvenir de moi
                  </label>
                  <button type="button" className="hover:text-emerald-600 transition focus:outline-none focus:text-emerald-600 focus:underline cursor-pointer">
                    Mot de passe oublié ?
                  </button>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-rose-100 bg-rose-50/50 px-4 py-2.5 text-xs font-semibold text-rose-700" role="alert">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-6 pt-4">
                {/* Bouton principal tirant parti de bg-emerald-600 avec hover et ombre ajustés */}
                <button
                  type="submit"
                  className="inline-flex items-center justify-center h-11 px-8 rounded-full bg-emerald-600 text-xs font-bold uppercase tracking-wider text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-500 active:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 cursor-pointer"
                  disabled={isLoading}
                >
                  {isLoading && <IconSpinner />}
                  {isSignUp ? "S'inscrire" : 'Connexion'}
                </button>
                
                <button
                  type="button"
                  onClick={handleToggleMode}
                  className="text-xs font-bold uppercase tracking-wider text-emerald-600 hover:text-emerald-700 transition focus:outline-none focus:text-emerald-700 focus:underline disabled:opacity-50 cursor-pointer"
                  disabled={isLoading}
                >
                  {isSignUp ? 'Retour' : 'Créer un compte'}
                </button>
              </div>
            </form>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-t border-slate-100 pt-5 mt-8">
          </div>
        </div>

        {/* CÔTÉ DROIT : Panneau informatif */}
        <InfoPanel />

      </div>
    </div>
  );
}