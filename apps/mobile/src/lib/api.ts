import {
  AuthResponseSchema,
  ErrorResponseSchema,
  ForgotPasswordInputSchema,
  ForgotPasswordResponseSchema,
  HealthResponseSchema,
  LoginInputSchema,
  RegisterInputSchema,
  ResetPasswordInputSchema,
  type AuthResponse,
  type ErrorResponse,
  type ForgotPasswordInput,
  type ForgotPasswordResponse,
  type HealthResponse,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@nutrikids/shared';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { AuthApiError, resolveHttpAuthError } from './auth-errors.js';
import {
  clearStoredSession,
  getStoredSession,
  updateStoredTokens,
  type StoredSession,
} from './session-storage.js';

export { AuthApiError } from './auth-errors.js';

const DEFAULT_API_PORT = '3000';

function isLocalhost(url: string): boolean {
  return /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);
}

function resolveDefaultApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();

  // 1. Explicit non-localhost URL (e.g. PC local network IP).
  if (configured && !isLocalhost(configured)) {
    return configured;
  }

  // 2. Physical device / Expo Go: reuse the host serving Metro.
  const hostUri = Constants.expoConfig?.hostUri;
  if (Platform.OS !== 'web' && hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:${DEFAULT_API_PORT}`;
    }
  }

  // 3. Fallbacks for emulator / web.
  const fallback = configured ?? `http://localhost:${DEFAULT_API_PORT}`;
  return Platform.OS === 'android' ? fallback.replace('localhost', '10.0.2.2') : fallback;
}

export const API_BASE_URL = resolveDefaultApiUrl();

const REQUEST_TIMEOUT_MS = 8000;

export type SessionExpiredListener = () => void;
export type SessionUpdatedListener = (session: StoredSession) => void;
export type SessionRefreshErrorListener = (error: unknown) => void;

const expiredListeners = new Set<SessionExpiredListener>();
const updatedListeners = new Set<SessionUpdatedListener>();
const refreshErrorListeners = new Set<SessionRefreshErrorListener>();

/**
 * Register a listener invoked whenever the session has expired or refresh failed.
 */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  expiredListeners.add(listener);
  return () => {
    expiredListeners.delete(listener);
  };
}

/**
 * Register a listener invoked whenever tokens are renewed.
 */
export function onSessionUpdated(listener: SessionUpdatedListener): () => void {
  updatedListeners.add(listener);
  return () => {
    updatedListeners.delete(listener);
  };
}

/**
 * Register a listener invoked when a network or unexpected error occurs during token refresh.
 */
export function onSessionRefreshError(listener: SessionRefreshErrorListener): () => void {
  refreshErrorListeners.add(listener);
  return () => {
    refreshErrorListeners.delete(listener);
  };
}

function notifySessionExpired(): void {
  for (const listener of expiredListeners) {
    try {
      listener();
    } catch {
      // Ignore listener errors
    }
  }
}

function notifySessionUpdated(session: StoredSession): void {
  for (const listener of updatedListeners) {
    try {
      listener(session);
    } catch {
      // Ignore listener errors
    }
  }
}

function notifySessionRefreshError(error: unknown): void {
  for (const listener of refreshErrorListeners) {
    try {
      listener(error);
    } catch {
      // Ignore listener errors
    }
  }
}

/** Single-flight mutex for token refresh to avoid concurrent reuse revocations. */
let refreshInFlight: Promise<StoredSession | null> | null = null;

/**
 * Renews the access/refresh token pair against POST /auth/refresh.
 * If refresh fails (expired or reuse detected), clears stored session and notifies listeners.
 */
export async function refreshActiveSession(): Promise<StoredSession | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const current = await getStoredSession();
      if (!current?.refreshToken) {
        await clearStoredSession();
        notifySessionExpired();
        return null;
      }

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });

      if (!response.ok) {
        await clearStoredSession();
        notifySessionExpired();
        return null;
      }

      const rawJson: unknown = await response.json();
      const parsed = AuthResponseSchema.safeParse(rawJson);

      if (!parsed.success || parsed.data.requiresTwoFactor) {
        await clearStoredSession();
        notifySessionExpired();
        return null;
      }

      const updated = await updateStoredTokens({
        accessToken: parsed.data.accessToken,
        refreshToken: parsed.data.refreshToken,
        expiresIn: parsed.data.expiresIn,
      });

      if (updated) {
        notifySessionUpdated(updated);
      }
      return updated;
    } catch (err) {
      notifySessionRefreshError(err);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Dispatches a best-effort logout request to revoke the current refresh token.
 */
export async function logoutSessionRequest(refreshToken: string): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Best effort: do not block local sign out if network is down.
  }
}

/**
 * Generic helper for dispatching JSON POST requests to auth endpoints.
 * Consolidates fetch execution, network error mapping, HTTP error resolution,
 * and validates response payloads with Zod returning human-friendly Spanish errors on schema mismatch.
 */
async function postAuth<T>(
  path: string,
  body: unknown,
  schema?: { safeParse: (data: unknown) => { success: true; data: T } | { success: false } },
  defaultErrorMessage = 'Error al procesar la solicitud.',
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof Error) {
      const isNetwork = err.name === 'AbortError' || err.message.toLowerCase().includes('network');
      throw new AuthApiError(
        isNetwork
          ? 'No se pudo conectar con el servidor. Verifica tu conexión a internet.'
          : err.message,
        { cause: err },
      );
    }
    throw new AuthApiError(defaultErrorMessage);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = resolveHttpAuthError(
      response.status,
      data as {
        message?: string;
        issues?: Array<{ path?: Array<string | number>; message: string }>;
      },
    );
    throw new AuthApiError(message, { status: response.status });
  }

  if (!schema) {
    return data as T;
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new AuthApiError('La respuesta del servidor no tiene el formato esperado.');
  }

  return parsed.data;
}

/**
 * Dispatches a POST /auth/login request.
 * Returns AuthResponse: either requiresTwoFactor: true (with no tokens) or requiresTwoFactor: false (with tokens and user).
 */
export async function loginRequest(input: LoginInput): Promise<AuthResponse> {
  const validated = LoginInputSchema.parse(input);
  return postAuth(
    '/auth/login',
    validated,
    AuthResponseSchema,
    'Error inesperado al iniciar sesión.',
  );
}

/**
 * Dispatches a POST /auth/register request.
 * Creates the user account and returns the initial AuthResponse.
 */
export async function registerRequest(input: RegisterInput): Promise<AuthResponse> {
  const validated = RegisterInputSchema.parse(input);
  return postAuth(
    '/auth/register',
    validated,
    AuthResponseSchema,
    'Error inesperado al registrar la cuenta.',
  );
}

/**
 * Dispatches a POST /auth/forgot-password request.
 * Always returns 202 with an acknowledgment message.
 */
export async function forgotPasswordRequest(
  input: ForgotPasswordInput,
): Promise<ForgotPasswordResponse> {
  const validated = ForgotPasswordInputSchema.parse(input);
  return postAuth(
    '/auth/forgot-password',
    validated,
    ForgotPasswordResponseSchema,
    'Error inesperado al solicitar restablecimiento de contraseña.',
  );
}

/**
 * Dispatches a POST /auth/reset-password request.
 * Resets user password using single-use token and invalidates active refresh tokens.
 */
export async function resetPasswordRequest(input: ResetPasswordInput): Promise<void> {
  const validated = ResetPasswordInputSchema.parse(input);
  await postAuth(
    '/auth/reset-password',
    validated,
    undefined,
    'Error inesperado al restablecer la contraseña.',
  );
}

/**
 * Parses API error payload with ErrorResponseSchema from @nutrikids/shared.
 */
export function parseApiError(
  payload: unknown,
  fallbackMessage = 'Error al procesar la solicitud',
): ErrorResponse {
  const parsed = ErrorResponseSchema.safeParse(payload);
  if (parsed.success) {
    const firstIssue = parsed.data.issues?.[0];
    return {
      ...parsed.data,
      message: firstIssue ? firstIssue.message : parsed.data.message,
    };
  }
  return {
    error: 'Request Error',
    message: fallbackMessage,
  };
}

/**
 * Fetches the backend /health status.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const data: unknown = await response.json();
    return HealthResponseSchema.parse(data);
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Tiempo agotado conectando a ${API_BASE_URL}`, { cause: err });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Authenticated HTTP client with:
 * 1. Automatic Bearer token header injection.
 * 2. Preemptive renewal if access token expires within 30 seconds.
 * 3. 401 response interception with single-flight mutex retry.
 * 4. Automatic session cleanup and redirect notification on refresh failure.
 */
export async function authFetch(endpointOrUrl: string, init: RequestInit = {}): Promise<Response> {
  const targetUrl = endpointOrUrl.startsWith('http')
    ? endpointOrUrl
    : `${API_BASE_URL}${endpointOrUrl.startsWith('/') ? '' : '/'}${endpointOrUrl}`;

  let session = await getStoredSession();

  // If token is about to expire in <= 30 seconds, renew proactively.
  if (session && session.expiresAt - Date.now() <= 30_000) {
    const renewed = await refreshActiveSession();
    if (renewed) {
      session = renewed;
    }
  }

  const headers = new Headers(init.headers);
  if (session?.accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  const response = await fetch(targetUrl, {
    ...init,
    headers,
  });

  // If request receives 401 Unauthorized, try renewing tokens and retry once.
  if (response.status === 401 && session?.refreshToken) {
    const renewed = await refreshActiveSession();
    if (renewed) {
      const retryHeaders = new Headers(init.headers);
      retryHeaders.set('Authorization', `Bearer ${renewed.accessToken}`);
      if (!retryHeaders.has('Accept')) {
        retryHeaders.set('Accept', 'application/json');
      }

      return fetch(targetUrl, {
        ...init,
        headers: retryHeaders,
      });
    }
  }

  return response;
}
