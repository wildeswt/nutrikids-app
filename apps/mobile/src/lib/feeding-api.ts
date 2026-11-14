import {
  CreateFeedingLogInputSchema,
  FeedingLogResponseSchema,
  type CreateFeedingLogInput,
  type FeedingLogResponse,
} from '@nutrikids/shared';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

const OFFLINE_FALLBACK =
  'Necesitas conexión para guardar la alimentación. Inténtalo de nuevo cuando vuelvas a tener internet.';
const CREATE_FALLBACK = 'No pudimos guardar la alimentación. Intenta de nuevo.';

/** Error devuelto al registrar alimentación; conserva el código HTTP y si falló por red. */
export class FeedingApiError extends Error {
  readonly status: number;
  readonly isNetwork: boolean;

  constructor(
    message: string,
    status: number,
    options: { isNetwork?: boolean; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'FeedingApiError';
    this.status = status;
    this.isNetwork = options.isNetwork ?? false;
  }
}

/**
 * `true` cuando la API rechazó el registro porque el niño no tiene consentimiento informado
 * vigente (403). Otras respuestas 403 (rol o vínculo) no mencionan el consentimiento.
 */
export function isConsentRequiredError(err: unknown): boolean {
  return (
    err instanceof FeedingApiError && err.status === 403 && /consentimiento/i.test(err.message)
  );
}

/** `true` cuando el error corresponde a una falla de red o falta de conexión. */
export function isFeedingNetworkError(err: unknown): boolean {
  if (err instanceof FeedingApiError) {
    return err.isNetwork || err.status === 0;
  }
  if (err instanceof TypeError) {
    return true;
  }
  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    return (
      err.name === 'AbortError' ||
      message.includes('network') ||
      message.includes('failed to fetch') ||
      message.includes('fetch failed')
    );
  }
  return false;
}

async function toApiError(response: Response, fallback: string): Promise<FeedingApiError> {
  const payload: unknown = await response.json().catch(() => ({}));
  return new FeedingApiError(parseApiError(payload, fallback).message, response.status);
}

/**
 * Registra la alimentación del día de un niño (`POST /children/:childId/feeding-logs`).
 * Valida entrada y respuesta con los esquemas de `@nutrikids/shared`.
 */
export async function createChildFeedingLog(
  childId: string,
  input: CreateFeedingLogInput,
): Promise<FeedingLogResponse> {
  const validatedBody = CreateFeedingLogInputSchema.parse(input);

  let response: Response;
  try {
    response = await authFetch(`/children/${childId}/feeding-logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validatedBody),
    });
  } catch (err) {
    throw new FeedingApiError(i18n.t('errors:feeding.network', OFFLINE_FALLBACK), 0, {
      isNetwork: true,
      cause: err,
    });
  }

  if (!response.ok) {
    throw await toApiError(response, i18n.t('errors:feeding.create', CREATE_FALLBACK));
  }

  const rawJson: unknown = await response.json();
  return FeedingLogResponseSchema.parse(rawJson);
}
