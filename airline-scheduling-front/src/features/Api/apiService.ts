// src/Api/authApi.ts
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

export type AccountStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

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

  // Compatibilité éventuelle avec certains composants frontend
  createdAt?: string;

  updatedAt?: string;
}

// =============================================================================
// LOGIN
// =============================================================================

export interface LoginPayload {
  email: string;

  password: string;
}

// =============================================================================
// INSCRIPTION
// =============================================================================

export interface SignUpPayload {
  email: string;

  password: string;

  nom: string;

  role: UserRole;

  niveauTechnique?: string;

  niveauMetier?: string;
}

// =============================================================================
// AUTH RESPONSE
// =============================================================================

export interface AuthResponse {
  user: PublicUser;

  token: string;
}

// =============================================================================
// SESSION
// =============================================================================

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
// CONFIGURATION API
// =============================================================================

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:3001'
).replace(
  /\/$/,
  '',
);

// =============================================================================
// CLÉS SESSION
// =============================================================================

const LOCAL_SESSION_KEY =
  'airline.auth.session';

const SESSION_SESSION_KEY =
  'airline.auth.session.temp';

// =============================================================================
// API ERROR
// =============================================================================

export class ApiError extends Error {
  readonly status: number;

  readonly details?: unknown;

  constructor(
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(
      message,
    );

    this.name =
      'ApiError';

    this.status =
      status;

    this.details =
      details;

    Object.setPrototypeOf(
      this,
      ApiError.prototype,
    );
  }
}

// =============================================================================
// NORMALISER ERREUR NESTJS
// =============================================================================

function normalizeNestMessage(
  payload: unknown,
): string {
  if (
    payload === null ||
    typeof payload !==
      'object'
  ) {
    return (
      'Une erreur inattendue est survenue.'
    );
  }

  const data =
    payload as Record<
      string,
      unknown
    >;

  const message =
    data.message;

  // ---------------------------------------------------------------------------
  // MESSAGE STRING
  // ---------------------------------------------------------------------------

  if (
    typeof message ===
    'string' &&
    message.trim()
  ) {
    return message;
  }

  // ---------------------------------------------------------------------------
  // MESSAGE ARRAY
  // ---------------------------------------------------------------------------

  if (
    Array.isArray(
      message,
    )
  ) {
    const messages =
      message
        .filter(
          (
            item,
          ): item is string =>
            typeof item ===
            'string',
        )
        .map(
          (
            item,
          ) =>
            item.trim(),
        )
        .filter(
          Boolean,
        );

    if (
      messages.length >
      0
    ) {
      return messages.join(
        ' ',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // MESSAGE OBJET
  // ---------------------------------------------------------------------------

  if (
    message !== null &&
    typeof message ===
      'object'
  ) {
    const nested =
      message as Record<
        string,
        unknown
      >;

    if (
      typeof nested.message ===
        'string' &&
      nested.message.trim()
    ) {
      return nested.message;
    }
  }

  // ---------------------------------------------------------------------------
  // ERROR
  // ---------------------------------------------------------------------------

  if (
    typeof data.error ===
      'string' &&
    data.error.trim()
  ) {
    return data.error;
  }

  return (
    'Le serveur a refusé la requête.'
  );
}

// =============================================================================
// LECTURE JSON SÉCURISÉE
// =============================================================================

async function readJsonSafely(
  response: Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// =============================================================================
// REQUEST JSON PUBLIC
// =============================================================================

async function requestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response =
      await fetch(
        `${API_BASE_URL}${path}`,
        {
          ...options,

          headers: {
            Accept:
              'application/json',

            ...(options.body
              ? {
                  'Content-Type':
                    'application/json',
                }
              : {}),

            ...(options.headers ||
              {}),
          },
        },
      );
  } catch (
    error:
      unknown
  ) {
    console.error(
      '[API] Erreur réseau :',
      error,
    );

    throw new ApiError(
      `Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que le backend est démarré.`,
      0,
      error,
    );
  }

  // ---------------------------------------------------------------------------
  // 204
  // ---------------------------------------------------------------------------

  if (
    response.status ===
    204
  ) {
    return undefined as T;
  }

  const payload =
    await readJsonSafely(
      response,
    );

  if (
    !response.ok
  ) {
    throw new ApiError(
      normalizeNestMessage(
        payload,
      ),
      response.status,
      payload,
    );
  }

  return payload as T;
}

// =============================================================================
// LOGIN
// =============================================================================

export async function logIn(
  payload: LoginPayload,
): Promise<AuthResponse> {
  return requestJson<AuthResponse>(
    '/auth/login',
    {
      method:
        'POST',

      body:
        JSON.stringify({
          email:
            payload.email
              .trim()
              .toLowerCase(),

          password:
            payload.password,
        }),
    },
  );
}

// =============================================================================
// INSCRIPTION
// =============================================================================

export async function signUp(
  payload: SignUpPayload,
): Promise<PublicUser> {
  return requestJson<PublicUser>(
    '/users',
    {
      method:
        'POST',

      body:
        JSON.stringify({
          ...payload,

          email:
            payload.email
              .trim()
              .toLowerCase(),

          nom:
            payload.nom
              .trim(),
        }),
    },
  );
}

// =============================================================================
// SAVE SESSION
// =============================================================================

export function saveAuthSession(
  auth: AuthResponse,
  rememberMe: boolean,
): void {
  clearAuthSession();

  const storage =
    rememberMe
      ? localStorage
      : sessionStorage;

  const key =
    rememberMe
      ? LOCAL_SESSION_KEY
      : SESSION_SESSION_KEY;

  const session:
    AuthSession = {
      user:
        auth.user,

      token:
        auth.token,
    };

  storage.setItem(
    key,
    JSON.stringify(
      session,
    ),
  );
}

// =============================================================================
// GET SESSION
// =============================================================================

export function getAuthSession():
  AuthSession | null {
  const localRaw =
    localStorage.getItem(
      LOCAL_SESSION_KEY,
    );

  const sessionRaw =
    sessionStorage.getItem(
      SESSION_SESSION_KEY,
    );

  const raw =
    localRaw ??
    sessionRaw;

  if (
    !raw
  ) {
    return null;
  }

  try {
    const parsed: unknown =
      JSON.parse(
        raw,
      );

    if (
      parsed === null ||
      typeof parsed !==
        'object'
    ) {
      clearAuthSession();

      return null;
    }

    const session =
      parsed as Partial<AuthSession>;

    if (
      typeof session.token !==
        'string' ||
      !session.token.trim()
    ) {
      clearAuthSession();

      return null;
    }

    if (
      session.user ===
        null ||
      typeof session.user !==
        'object'
    ) {
      clearAuthSession();

      return null;
    }

    const user =
      session.user as Partial<PublicUser>;

    if (
      typeof user.id !==
        'string' ||
      typeof user.email !==
        'string' ||
      typeof user.nom !==
        'string' ||
      typeof user.role !==
        'string'
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
  localStorage.removeItem(
    LOCAL_SESSION_KEY,
  );

  sessionStorage.removeItem(
    SESSION_SESSION_KEY,
  );
}

// =============================================================================
// SESSION EXISTE
// =============================================================================

export function hasAuthSession():
  boolean {
  const session =
    getAuthSession();

  return Boolean(
    session?.token,
  );
}

// =============================================================================
// GET CURRENT USER
// =============================================================================

export function getCurrentUser():
  PublicUser | null {
  return (
    getAuthSession()
      ?.user ??
    null
  );
}

// =============================================================================
// GET TOKEN
// =============================================================================

export function getAuthToken():
  string | null {
  return (
    getAuthSession()
      ?.token ??
    null
  );
}

// =============================================================================
// FETCH AUTHENTIFIÉ
// =============================================================================

export async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const session =
    getAuthSession();

  // ---------------------------------------------------------------------------
  // SESSION ABSENTE
  // ---------------------------------------------------------------------------

  if (
    !session ||
    !session.token ||
    !session.token.trim()
  ) {
    throw new ApiError(
      'Aucune session valide trouvée. Veuillez vous reconnecter.',
      401,
    );
  }

  // ---------------------------------------------------------------------------
  // CONSTRUCTION HEADERS
  // ---------------------------------------------------------------------------

  const headers =
    new Headers(
      options.headers,
    );

  if (
    !headers.has(
      'Accept',
    )
  ) {
    headers.set(
      'Accept',
      'application/json',
    );
  }

  if (
    options.body &&
    !headers.has(
      'Content-Type',
    )
  ) {
    headers.set(
      'Content-Type',
      'application/json',
    );
  }

  headers.set(
    'Authorization',
    `Bearer ${session.token}`,
  );

  // ---------------------------------------------------------------------------
  // FETCH
  // ---------------------------------------------------------------------------

  let response: Response;

  try {
    response =
      await fetch(
        `${API_BASE_URL}${path}`,
        {
          ...options,

          headers,
        },
      );
  } catch (
    error:
      unknown
  ) {
    console.error(
      '[AUTH FETCH] Impossible de contacter le backend.',
      error,
    );

    throw new ApiError(
      `Impossible de joindre l'API (${API_BASE_URL}). Vérifiez que le backend est démarré.`,
      0,
      error,
    );
  }

  // ---------------------------------------------------------------------------
  // 401
  // ---------------------------------------------------------------------------

  if (
    response.status ===
    401
  ) {
    const payload =
      await readJsonSafely(
        response.clone(),
      );

    console.warn(
      '[AUTH FETCH] Token refusé.',
      {
        path,
        status:
          response.status,
        payload,
      },
    );

    clearAuthSession();

    const backendMessage =
      normalizeNestMessage(
        payload,
      );

    throw new ApiError(
      backendMessage &&
      backendMessage !==
        'Le serveur a refusé la requête.'
        ? backendMessage
        : 'Votre session est invalide ou a expiré. Veuillez vous reconnecter.',
      401,
      payload,
    );
  }

  // ---------------------------------------------------------------------------
  // 403
  // ---------------------------------------------------------------------------

  if (
    response.status ===
    403
  ) {
    const payload =
      await readJsonSafely(
        response.clone(),
      );

    console.warn(
      '[AUTH FETCH] Accès refusé.',
      {
        path,
        status:
          response.status,
        payload,
      },
    );

    const backendMessage =
      normalizeNestMessage(
        payload,
      );

    throw new ApiError(
      backendMessage &&
      backendMessage !==
        'Le serveur a refusé la requête.'
        ? backendMessage
        : "Vous n'êtes pas autorisé à accéder à cette ressource.",
      403,
      payload,
    );
  }

  return response;
}

// =============================================================================
// REQUEST JSON AUTHENTIFIÉ
// =============================================================================

async function authRequestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response =
    await authFetch(
      path,
      options,
    );

  // ---------------------------------------------------------------------------
  // 204
  // ---------------------------------------------------------------------------

  if (
    response.status ===
    204
  ) {
    return undefined as T;
  }

  const payload =
    await readJsonSafely(
      response,
    );

  if (
    !response.ok
  ) {
    throw new ApiError(
      normalizeNestMessage(
        payload,
      ),
      response.status,
      payload,
    );
  }

  return payload as T;
}

// =============================================================================
// ADMIN - TOUS LES UTILISATEURS
// GET /users
// =============================================================================

export async function getUsers():
  Promise<PublicUser[]> {
  return authRequestJson<
    PublicUser[]
  >(
    '/users',
    {
      method:
        'GET',
    },
  );
}

// =============================================================================
// ADMIN - UTILISATEURS EN ATTENTE
// GET /users/pending
// =============================================================================

export async function getPendingUsers():
  Promise<PublicUser[]> {
  return authRequestJson<
    PublicUser[]
  >(
    '/users/pending',
    {
      method:
        'GET',
    },
  );
}

// =============================================================================
// ADMIN - UTILISATEURS VALIDÉS
// GET /users/approved
// =============================================================================

export async function getApprovedUsers():
  Promise<PublicUser[]> {
  return authRequestJson<
    PublicUser[]
  >(
    '/users/approved',
    {
      method:
        'GET',
    },
  );
}

// =============================================================================
// ADMIN - UTILISATEURS REFUSÉS
// GET /users/rejected
// =============================================================================

export async function getRejectedUsers():
  Promise<PublicUser[]> {
  return authRequestJson<
    PublicUser[]
  >(
    '/users/rejected',
    {
      method:
        'GET',
    },
  );
}

// =============================================================================
// ADMIN - APPROUVER COMPTE
// PATCH /users/:id/approve
// =============================================================================

export async function approveUserAccount(
  userId: string,
): Promise<UserActionResponse> {
  return authRequestJson<
    UserActionResponse
  >(
    `/users/${encodeURIComponent(
      userId,
    )}/approve`,
    {
      method:
        'PATCH',
    },
  );
}

// =============================================================================
// ADMIN - REFUSER COMPTE
// PATCH /users/:id/reject
// =============================================================================

export async function rejectUserAccount(
  userId: string,
  reason?: string,
): Promise<UserActionResponse> {
  const body:
    RejectUserPayload = {};

  if (
    reason?.trim()
  ) {
    body.reason =
      reason.trim();
  }

  return authRequestJson<
    UserActionResponse
  >(
    `/users/${encodeURIComponent(
      userId,
    )}/reject`,
    {
      method:
        'PATCH',

      body:
        JSON.stringify(
          body,
        ),
    },
  );
}

// =============================================================================
// ADMIN - REMETTRE COMPTE EN ATTENTE
// PATCH /users/:id/pending
// =============================================================================

export async function setUserAccountPending(
  userId: string,
): Promise<UserActionResponse> {
  return authRequestJson<
    UserActionResponse
  >(
    `/users/${encodeURIComponent(
      userId,
    )}/pending`,
    {
      method:
        'PATCH',
    },
  );
}

// =============================================================================
// ADMIN - UTILISATEUR PAR ID
// GET /users/:id
// =============================================================================

export async function getUserById(
  userId: string,
): Promise<PublicUser> {
  return authRequestJson<
    PublicUser
  >(
    `/users/${encodeURIComponent(
      userId,
    )}`,
    {
      method:
        'GET',
    },
  );
}

// =============================================================================
// EXPORT API URL
// =============================================================================

export {
  API_BASE_URL,
};