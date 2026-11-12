import type { z } from 'zod';

export interface FieldIssue {
  field?: string;
  message: string;
}

/**
 * Custom error thrown by authentication API request helpers.
 */
export class AuthApiError extends Error {
  readonly status?: number;
  readonly issues?: FieldIssue[];

  constructor(
    message: string,
    options?: { status?: number; cause?: unknown; issues?: FieldIssue[] },
  ) {
    super(message, { cause: options?.cause });
    this.name = 'AuthApiError';
    this.status = options?.status;
    this.issues = options?.issues;
  }
}

/**
 * Maps HTTP status codes, network errors, and API error payloads to clear Spanish messages.
 */
export function formatAuthErrorMessage(
  error: unknown,
  fallback = 'Error al procesar la solicitud. Intenta nuevamente.',
): string {
  if (error instanceof AuthApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.toLowerCase().includes('network')) {
      return 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
    }
    return error.message;
  }

  return fallback;
}

/**
 * Resolves human-readable error messages based on HTTP response status code and response payload.
 */
export function resolveHttpAuthError(
  status: number,
  payload?: {
    message?: string;
    issues?: Array<{ path?: Array<string | number>; message: string }>;
  },
): string {
  // If API returned validation issues, prioritize the first specific issue message
  if (payload?.issues && payload.issues.length > 0) {
    const firstIssue = payload.issues[0];
    if (
      firstIssue &&
      typeof firstIssue.message === 'string' &&
      firstIssue.message.trim().length > 0
    ) {
      return firstIssue.message;
    }
  }

  switch (status) {
    case 401:
      return 'Correo o contraseña incorrectos. Verifica tus credenciales.';
    case 403:
      return 'Acceso denegado o código de invitación profesional inválido.';
    case 404:
      return 'El recurso solicitado no fue encontrado.';
    case 409:
      return 'El correo electrónico o número de licencia ya se encuentra registrado.';
    case 429:
      return 'Demasiados intentos fallidos. Por seguridad, espera unos minutos antes de volver a intentar.';
    case 500:
    case 502:
    case 503:
      return 'El servidor no se encuentra disponible. Por favor, intenta de nuevo más tarde.';
    default:
      return 'Error al procesar la solicitud. Intenta nuevamente.';
  }
}

/**
 * Extracts a map of field-name to first error message from a ZodError.
 */
export function extractZodFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}
