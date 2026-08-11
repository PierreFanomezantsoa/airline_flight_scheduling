// src/Api/authApi.ts
// Compatible avec "erasableSyntaxOnly": true

export type UserRole =
  | 'Admin'
  | 'Planificateur'
  | 'Regulator'
  | 'Crew_Member'
  | 'Maintenance_Engineer'
  | 'Product_Owner';

export interface PublicUser {
  id: string;
  email: string;
  nom: string;
  role: UserRole;
  niveauTechnique?: string;
  niveauMetier?: string;
  actif?: boolean;
  creeA?: string;
  misAJourA?: string;
}

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

export interface AuthResponse {
  user: PublicUser;
  token: string;
}

export interface AuthSession {
  user: PublicUser;
  token: string;
}

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
).replace(/\/$/, '');

const LOCAL_SESSION_KEY = 'airline.auth.session';
const SESSION_SESSION_KEY = 'airline.auth.session.temp';

/**
 * IMPORTANT :
 * Avec "erasableSyntaxOnly": true, on évite les parameter properties :
 *
 * ❌ constructor(
 *      message: string,
 *      public readonly status: number,
 *      public readonly details?: unknown,
 *    )
 *
 * ✅ Déclarer les propriétés séparément.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message);

    this.name = 'ApiError';
    this.status = status;
    this.details = details;

    // Rend instanceof ApiError fiable selon la cible JS utilisée.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

function normalizeNestMessage(payload: unknown): string {
  if (
    payload === null ||
    typeof payload !== 'object'
  ) {
    return 'Une erreur inattendue est survenue.';
  }

  const data = payload as Record<string, unknown>;
  const message = data.message;

  if (typeof message === 'string') {
    return message;
  }

  if (Array.isArray(message)) {
    return message
      .filter(
        (item): item is string =>
          typeof item === 'string',
      )
      .join(' ');
  }

  if (
    message !== null &&
    typeof message === 'object'
  ) {
    const nested =
      message as Record<string, unknown>;

    if (typeof nested.message === 'string') {
      return nested.message;
    }
  }

  if (typeof data.error === 'string') {
    return data.error;
  }

  return 'Le serveur a refusé la requête.';
}

async function requestJson<T>(
  path: string,
  options: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(
      `${API_BASE_URL}${path}`,
      {
        ...options,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
    );
  } catch {
    throw new ApiError(
      `Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que le backend est démarré.`,
      0,
    );
  }

  const payload: unknown =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      normalizeNestMessage(payload),
      response.status,
      payload,
    );
  }

  return payload as T;
}

export async function logIn(
  payload: LoginPayload,
): Promise<AuthResponse> {
  return requestJson<AuthResponse>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({
        email: payload.email
          .trim()
          .toLowerCase(),
        password: payload.password,
      }),
    },
  );
}

export async function signUp(
  payload: SignUpPayload,
): Promise<PublicUser> {
  return requestJson<PublicUser>(
    '/users',
    {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        email: payload.email
          .trim()
          .toLowerCase(),
        nom: payload.nom.trim(),
      }),
    },
  );
}

export function saveAuthSession(
  auth: AuthResponse,
  rememberMe: boolean,
): void {
  clearAuthSession();

  const storage = rememberMe
    ? localStorage
    : sessionStorage;

  const key = rememberMe
    ? LOCAL_SESSION_KEY
    : SESSION_SESSION_KEY;

  const session: AuthSession = {
    user: auth.user,
    token: auth.token,
  };

  storage.setItem(
    key,
    JSON.stringify(session),
  );
}

export function getAuthSession():
  AuthSession | null {
  const raw =
    localStorage.getItem(
      LOCAL_SESSION_KEY,
    ) ??
    sessionStorage.getItem(
      SESSION_SESSION_KEY,
    );

  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown =
      JSON.parse(raw);

    if (
      parsed === null ||
      typeof parsed !== 'object'
    ) {
      clearAuthSession();
      return null;
    }

    const session =
      parsed as Partial<AuthSession>;

    if (
      typeof session.token !== 'string' ||
      session.user === null ||
      typeof session.user !== 'object'
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

export function clearAuthSession(): void {
  localStorage.removeItem(
    LOCAL_SESSION_KEY,
  );

  sessionStorage.removeItem(
    SESSION_SESSION_KEY,
  );
}

export async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const session = getAuthSession();

  return fetch(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers: {
        Accept: 'application/json',

        ...(options.body
          ? {
              'Content-Type':
                'application/json',
            }
          : {}),

        ...(session?.token
          ? {
              Authorization:
                `Bearer ${session.token}`,
            }
          : {}),

        ...(options.headers || {}),
      },
    },
  );
}

export { API_BASE_URL };