import type { z } from 'zod';
import i18n from '../i18n/index.js';

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
 * Maps HTTP status codes, network errors, and API error payloads to clear, translated messages.
 */
export function formatAuthErrorMessage(
  error: unknown,
  fallback: string = i18n.t('errors:generic'),
): string {
  if (error instanceof AuthApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.toLowerCase().includes('network')) {
      return i18n.t('errors:network');
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
      return i18n.t('errors:http.401');
    case 403:
      return i18n.t('errors:http.403');
    case 404:
      return i18n.t('errors:http.404');
    case 409:
      return i18n.t('errors:http.409');
    case 429:
      return i18n.t('errors:http.429');
    case 500:
    case 502:
    case 503:
      return i18n.t('errors:http.5xx');
    default:
      return i18n.t('errors:generic');
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
