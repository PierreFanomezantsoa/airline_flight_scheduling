// src/Api/apiService.ts
// Compatible avec "erasableSyntaxOnly": true

// =============================================================================
// RÔLES
// =============================================================================

export type UserRole =
  | 'Admin'
  | 'Planificateur'
  | 'Regulator'
  | 'Crew_Member'
  | 'Maintenance_Engineer'
  | 'Product_Owner';

// =============================================================================
// STATUT DU COMPTE
// =============================================================================

export type AccountStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

// =============================================================================
// UTILISATEUR PUBLIC
// =============================================================================

export interface PublicUser {
  id: string;
  email: string;
  nom: string;
  role: UserRole;
  niveauTechnique?: string;
  niveauMetier?: string;
  actif?: boolean;
  accountStatus: AccountStatus;
  approvedAt?: string | null;
  approvedBy?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  creeA?: string;
  misAJourA?: string;
  createdAt?: string;
  updatedAt?: string;
}

// =============================================================================
// LOGIN / INSCRIPTION
// =============================================================================

export interface LoginPayload {
  email: string;
  password: string;
}

export interface SignUpPayload {
  email: string;
  password: string;
  nom: string;
  role: UserRole;
  niveauTechnique?: string;
  niveauMetier?: string;
}

// =============================================================================
// AUTH RESPONSE / SESSION
// =============================================================================

export interface AuthResponse {
  user: PublicUser;
  token: string;
}

export interface AuthSession {
  user: PublicUser;
  token: string;
}

// =============================================================================
// RÉPONSES ADMIN
// =============================================================================

export interface UserActionResponse {
  message: string;
  user: PublicUser;
}

export interface RejectUserPayload {
  reason?: string;
}

// =============================================================================
// CONFIGURATION API — DEUX BACKENDS
// =============================================================================
//
//   ┌──────────────────────────────────────────────────────────────┐
//   │  Backend              Routes               DEV       PROD    │
//   ├──────────────────────────────────────────────────────────────┤
//   │  NestJS (Express)     /users/*, /fleet/*   3001      /api    │
//   │                       /maintenance/*, ...                     │
//   │                       /crew-assignments                       │
//   │                                                               │
//   │  Python (Flask)       /flights/*           5000      /python │
//   │                       /flights/analytics                      │
//   │                       /flights/optimize                       │
//   │                       /flights/weather-*                      │
//   └──────────────────────────────────────────────────────────────┘
//
// Nginx en production :
//   /api/...    → 127.0.0.1:3001/...
//   /python/... → 127.0.0.1:5000/...
// =============================================================================

/**
 * URL de fallback pour NestJS.
 */
const FALLBACK_API_URL: string = import.meta.env.PROD
  ? '/api'
  : 'http://localhost:3001';

/**
 * URL de fallback pour Python.
 */
const FALLBACK_PYTHON_URL: string = import.meta.env.PROD
  ? '/python'
  : 'http://localhost:5000';

/**
 * URL de base NestJS, sans slash final.
 *   DEV  → "http://localhost:3001"
 *   PROD → "/api"
 */
const RAW_API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL || FALLBACK_API_URL;

const API_BASE_URL: string = RAW_API_BASE_URL.replace(/\/+$/, '');

/**
 * URL de base Python, sans slash final.
 *   DEV  → "http://localhost:5000"
 *   PROD → "/python"
 */
const RAW_PYTHON_BASE_URL: string =
  import.meta.env.VITE_PYTHON_BASE_URL || FALLBACK_PYTHON_URL;

const PYTHON_BASE_URL: string = RAW_PYTHON_BASE_URL.replace(/\/+$/, '');

// =============================================================================
// ENV FLAGS
// =============================================================================

const IS_PRODUCTION: boolean = import.meta.env.PROD;
const IS_DEVELOPMENT: boolean = import.meta.env.DEV;

// ─────────────────────────────────────────────────────────────
// Logs de debug (uniquement en développement)
// ─────────────────────────────────────────────────────────────

if (IS_DEVELOPMENT) {
  // eslint-disable-next-line no-console
  console.info('[apiService] Configuration chargée :', {
    mode: 'development',
    nestjsApiUrl: API_BASE_URL,
    pythonApiUrl: PYTHON_BASE_URL,
    nestjsFallbackUsed: !import.meta.env.VITE_API_BASE_URL,
    pythonFallbackUsed: !import.meta.env.VITE_PYTHON_BASE_URL,
  });
}

// =============================================================================
// CLÉS SESSION
// =============================================================================

const LOCAL_SESSION_KEY = 'airline.auth.session';
const SESSION_SESSION_KEY = 'airline.auth.session.temp';

// =============================================================================
// API ERROR
// =============================================================================

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

// =============================================================================
// ABORT ERROR — détection fiable
// =============================================================================

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  return (error as { name?: string }).name === 'AbortError';
}

// =============================================================================
// NORMALISER ERREUR BACKEND
// =============================================================================

function normalizeNestMessage(payload: unknown): string {
  if (payload === null || typeof payload !== 'object') {
    return 'Une erreur inattendue est survenue.';
  }

  const data = payload as Record<string, unknown>;
  const message = data.message;

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  if (Array.isArray(message)) {
    const messages = message
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(' ');
    }
  }

  if (message !== null && typeof message === 'object') {
    const nested = message as Record<string, unknown>;
    if (typeof nested.message === 'string' && nested.message.trim()) {
      return nested.message;
    }
  }

  if (typeof data.error === 'string' && data.error.trim()) {
    return data.error;
  }

  return 'Le serveur a refusé la requête.';
}

// =============================================================================
// LECTURE JSON SÉCURISÉE
// =============================================================================

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// =============================================================================
// HELPERS INTERNES DE FETCH
// =============================================================================

/**
 * Construit les headers standard (Accept + éventuel Content-Type).
 */
function buildBaseHeaders(options: RequestInit): Headers {
  const headers = new Headers(options.headers);

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
}

// =============================================================================
// REQUEST JSON PUBLIC — NestJS (sans token)
// =============================================================================

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: buildBaseHeaders(options),
    });
  } catch (error: unknown) {
    if (isAbortError(error)) throw error;

    console.error('[API] Erreur réseau :', error);
    throw new ApiError(
      `Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que le backend est démarré.`,
      0,
      error,
    );
  }

  if (response.status === 204) return undefined as T;

  const payload = await readJsonSafely(response);

  if (!response.ok) {
    throw new ApiError(
      normalizeNestMessage(payload),
      response.status,
      payload,
    );
  }

  return payload as T;
}

// =============================================================================
// AUTH FETCH — NestJS (avec token)
// =============================================================================

export async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const session = getAuthSession();

  if (!session || !session.token || !session.token.trim()) {
    throw new ApiError(
      'Aucune session valide trouvée. Veuillez vous reconnecter.',
      401,
    );
  }

  const headers = buildBaseHeaders(options);
  headers.set('Authorization', `Bearer ${session.token}`);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (error: unknown) {
    if (isAbortError(error)) throw error;

    console.error('[AUTH FETCH] Impossible de contacter le backend.', error);
    throw new ApiError(
      `Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que le backend est démarré.`,
      0,
      error,
    );
  }

  if (response.status === 401) {
    const payload = await readJsonSafely(response.clone());
    console.warn('[AUTH FETCH] Token refusé.', { path, status: 401, payload });
    clearAuthSession();

    const backendMessage = normalizeNestMessage(payload);
    throw new ApiError(
      backendMessage && backendMessage !== 'Le serveur a refusé la requête.'
        ? backendMessage
        : 'Votre session est invalide ou a expiré. Veuillez vous reconnecter.',
      401,
      payload,
    );
  }

  if (response.status === 403) {
    const payload = await readJsonSafely(response.clone());
    console.warn('[AUTH FETCH] Accès refusé.', { path, status: 403, payload });

    const backendMessage = normalizeNestMessage(payload);
    throw new ApiError(
      backendMessage && backendMessage !== 'Le serveur a refusé la requête.'
        ? backendMessage
        : "Vous n'êtes pas autorisé à accéder à cette ressource.",
      403,
      payload,
    );
  }

  return response;
}

// =============================================================================
// ✅ PYTHON FETCH — Python (avec token, AbortError safe)
// =============================================================================
//
// À utiliser pour toutes les routes hébergées sur le service Python :
//   - /flights
//   - /flights/analytics
//   - /flights/fast
//   - /flights/optimize
//   - /flights/weather-alerts
//   - /flights/weather/assess
//   - /flights/auto-schedule/*
//   - /flights/conflicts
//   - etc.
// =============================================================================

export async function pythonFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const session = getAuthSession();
  const headers = buildBaseHeaders(options);

  // Le token est ajouté si une session est active (endpoints publics acceptés)
  if (session?.token) {
    headers.set('Authorization', `Bearer ${session.token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${PYTHON_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (error: unknown) {
    if (isAbortError(error)) throw error;

    console.error('[PYTHON FETCH] Impossible de contacter le backend Python.', error);
    throw new ApiError(
      `Impossible de joindre l'API Python (${PYTHON_BASE_URL}). Vérifiez que le service Flask est démarré.`,
      0,
      error,
    );
  }

  // Gestion 401/403 (si le backend Python utilise aussi des tokens)
  if (response.status === 401) {
    const payload = await readJsonSafely(response.clone());
    console.warn('[PYTHON FETCH] Token refusé.', { path, status: 401, payload });
    clearAuthSession();

    const backendMessage = normalizeNestMessage(payload);
    throw new ApiError(
      backendMessage && backendMessage !== 'Le serveur a refusé la requête.'
        ? backendMessage
        : 'Votre session est invalide ou a expiré. Veuillez vous reconnecter.',
      401,
      payload,
    );
  }

  if (response.status === 403) {
    const payload = await readJsonSafely(response.clone());
    console.warn('[PYTHON FETCH] Accès refusé.', { path, status: 403, payload });

    const backendMessage = normalizeNestMessage(payload);
    throw new ApiError(
      backendMessage && backendMessage !== 'Le serveur a refusé la requête.'
        ? backendMessage
        : "Vous n'êtes pas autorisé à accéder à cette ressource.",
      403,
      payload,
    );
  }

  return response;
}

// =============================================================================
// ✅ PYTHON REQUEST JSON — helper pratique
// =============================================================================
//
// Wrapper de `pythonFetch` qui parse le JSON et gère les erreurs HTTP.
// À utiliser dans les composants (ex: DashboardGantt.tsx) :
//
//   const flights = await pythonRequestJson<Flight[]>('/flights');
//   const analytics = await pythonRequestJson<Analytics>('/flights/analytics');
// =============================================================================

export async function pythonRequestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await pythonFetch(path, options);

  if (response.status === 204) return undefined as T;

  const payload = await readJsonSafely(response);

  if (!response.ok) {
    throw new ApiError(
      normalizeNestMessage(payload),
      response.status,
      payload,
    );
  }

  return payload as T;
}

// =============================================================================
// REQUEST JSON AUTHENTIFIÉ (NestJS)
// =============================================================================

async function authRequestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await authFetch(path, options);

  if (response.status === 204) return undefined as T;

  const payload = await readJsonSafely(response);

  if (!response.ok) {
    throw new ApiError(
      normalizeNestMessage(payload),
      response.status,
      payload,
    );
  }

  return payload as T;
}

// =============================================================================
// LOGIN
// =============================================================================

export async function logIn(payload: LoginPayload): Promise<AuthResponse> {
  return requestJson<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
    }),
  });
}

// =============================================================================
// INSCRIPTION
// =============================================================================

export async function signUp(payload: SignUpPayload): Promise<PublicUser> {
  return requestJson<PublicUser>('/users', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      email: payload.email.trim().toLowerCase(),
      nom: payload.nom.trim(),
    }),
  });
}

// =============================================================================
// SAVE SESSION
// =============================================================================

export function saveAuthSession(auth: AuthResponse, rememberMe: boolean): void {
  clearAuthSession();

  const storage = rememberMe ? localStorage : sessionStorage;
  const key = rememberMe ? LOCAL_SESSION_KEY : SESSION_SESSION_KEY;

  const session: AuthSession = {
    user: auth.user,
    token: auth.token,
  };

  storage.setItem(key, JSON.stringify(session));
}

// =============================================================================
// GET SESSION
// =============================================================================

export function getAuthSession(): AuthSession | null {
  const localRaw = localStorage.getItem(LOCAL_SESSION_KEY);
  const sessionRaw = sessionStorage.getItem(SESSION_SESSION_KEY);
  const raw = localRaw ?? sessionRaw;

  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);

    if (parsed === null || typeof parsed !== 'object') {
      clearAuthSession();
      return null;
    }

    const session = parsed as Partial<AuthSession>;

    if (typeof session.token !== 'string' || !session.token.trim()) {
      clearAuthSession();
      return null;
    }

    if (session.user === null || typeof session.user !== 'object') {
      clearAuthSession();
      return null;
    }

    const user = session.user as Partial<PublicUser>;

    if (
      typeof user.id !== 'string' ||
      typeof user.email !== 'string' ||
      typeof user.nom !== 'string' ||
      typeof user.role !== 'string'
    ) {
      clearAuthSession();
      return null;
    }

    return session as AuthSession;
  } catch {
    clearAuthSession();
    return null;
  }
}

// =============================================================================
// CLEAR SESSION
// =============================================================================

export function clearAuthSession(): void {
  localStorage.removeItem(LOCAL_SESSION_KEY);
  sessionStorage.removeItem(SESSION_SESSION_KEY);
}

// =============================================================================
// SESSION EXISTE
// =============================================================================

export function hasAuthSession(): boolean {
  const session = getAuthSession();
  return Boolean(session?.token);
}

// =============================================================================
// GET CURRENT USER
// =============================================================================

export function getCurrentUser(): PublicUser | null {
  return getAuthSession()?.user ?? null;
}

// =============================================================================
// GET TOKEN
// =============================================================================

export function getAuthToken(): string | null {
  return getAuthSession()?.token ?? null;
}

// =============================================================================
// ADMIN - TOUS LES UTILISATEURS
// =============================================================================

export async function getUsers(): Promise<PublicUser[]> {
  return authRequestJson<PublicUser[]>('/users', { method: 'GET' });
}

// =============================================================================
// MEMBRES D'ÉQUIPAGE
// =============================================================================

export async function getCrewMembers(): Promise<PublicUser[]> {
  return authRequestJson<PublicUser[]>('/users/crew-members', { method: 'GET' });
}

// =============================================================================
// ADMIN - UTILISATEURS EN ATTENTE
// =============================================================================

export async function getPendingUsers(): Promise<PublicUser[]> {
  return authRequestJson<PublicUser[]>('/users/pending', { method: 'GET' });
}

// =============================================================================
// ADMIN - UTILISATEURS VALIDÉS
// =============================================================================

export async function getApprovedUsers(): Promise<PublicUser[]> {
  return authRequestJson<PublicUser[]>('/users/approved', { method: 'GET' });
}

// =============================================================================
// ADMIN - UTILISATEURS REFUSÉS
// =============================================================================

export async function getRejectedUsers(): Promise<PublicUser[]> {
  return authRequestJson<PublicUser[]>('/users/rejected', { method: 'GET' });
}

// =============================================================================
// ADMIN - APPROUVER COMPTE
// =============================================================================

export async function approveUserAccount(
  userId: string,
): Promise<UserActionResponse> {
  return authRequestJson<UserActionResponse>(
    `/users/${encodeURIComponent(userId)}/approve`,
    { method: 'PATCH' },
  );
}

// =============================================================================
// ADMIN - REFUSER COMPTE
// =============================================================================

export async function rejectUserAccount(
  userId: string,
  reason?: string,
): Promise<UserActionResponse> {
  const body: RejectUserPayload = {};
  if (reason?.trim()) body.reason = reason.trim();

  return authRequestJson<UserActionResponse>(
    `/users/${encodeURIComponent(userId)}/reject`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

// =============================================================================
// ADMIN - REMETTRE COMPTE EN ATTENTE
// =============================================================================

export async function setUserAccountPending(
  userId: string,
): Promise<UserActionResponse> {
  return authRequestJson<UserActionResponse>(
    `/users/${encodeURIComponent(userId)}/pending`,
    { method: 'PATCH' },
  );
}

// =============================================================================
// ADMIN - UTILISATEUR PAR ID
// =============================================================================

export async function getUserById(userId: string): Promise<PublicUser> {
  return authRequestJson<PublicUser>(`/users/${encodeURIComponent(userId)}`, {
    method: 'GET',
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  API_BASE_URL,
  PYTHON_BASE_URL,
  IS_DEVELOPMENT,
  IS_PRODUCTION,
};