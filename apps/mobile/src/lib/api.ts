import {
  ErrorResponseSchema,
  HealthResponseSchema,
  type ErrorResponse,
  type HealthResponse,
} from '@nutrikids/shared';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const DEFAULT_API_PORT = '3000';

function isLocalhost(url: string): boolean {
  return /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);
}

function resolveDefaultApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();

  // 1. URL explícita que no sea localhost (ej. IP de la PC): se respeta tal cual.
  if (configured && !isLocalhost(configured)) {
    return configured;
  }

  // 2. En dispositivo físico / Expo Go: usar la misma IP del PC que sirve Metro.
  const hostUri = Constants.expoConfig?.hostUri;
  if (Platform.OS !== 'web' && hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:${DEFAULT_API_PORT}`;
    }
  }

  // 3. Fallbacks para emulador / web.
  const fallback = configured ?? `http://localhost:${DEFAULT_API_PORT}`;
  return Platform.OS === 'android' ? fallback.replace('localhost', '10.0.2.2') : fallback;
}

export const API_BASE_URL = resolveDefaultApiUrl();

const REQUEST_TIMEOUT_MS = 8000;

/**
 * Interpreta una respuesta de error de la API con `ErrorResponseSchema` de `@nutrikids/shared`.
 * Si incluye detalles de validación (`issues`), devuelve el primer mensaje en español.
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
