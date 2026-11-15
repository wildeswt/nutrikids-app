import {
  SyncCheckupsInputSchema,
  SyncCheckupsResponseSchema,
  type SyncCheckupItem,
  type SyncCheckupsResponse,
} from '@nutrikids/shared';
import i18n from '../../i18n/index.js';
import { authFetch, parseApiError } from '../api.js';
import { getHttpStatus, isNetworkUnavailableError } from '../offline-read.js';

/** Clasificación del fallo al enviar un lote a `POST /sync/checkups`. */
export type SyncApiErrorKind = 'network' | 'retryable-http' | 'batch-4xx' | 'invalid-response';

/**
 * Error emitido por el cliente de sincronización diferenciando fallos transitorios
 * (red, 5xx, 408, 429) de rechazos definitivos 4xx del lote completo.
 */
export class SyncApiError extends Error {
  readonly kind: SyncApiErrorKind;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      kind: SyncApiErrorKind;
      status?: number | null;
      retryable: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'SyncApiError';
    this.kind = options.kind;
    this.status = options.status ?? null;
    this.retryable = options.retryable;
  }
}

/**
 * Indica si un código de estado HTTP corresponde a un error transitorio reintentable
 * (5xx del servidor, 408 Request Timeout o 429 Too Many Requests).
 */
export function isRetryableHttpStatus(status: number): boolean {
  return (status >= 500 && status <= 599) || status === 408 || status === 429;
}

/**
 * Determina si un error al enviar un lote es transitorio y debe reintentarse con backoff,
 * o si corresponde a un rechazo 4xx definitivo del lote.
 */
export function isRetryableSyncError(error: unknown): boolean {
  if (error instanceof SyncApiError) {
    return error.retryable;
  }

  const status = getHttpStatus(error);
  if (status !== null) {
    return isRetryableHttpStatus(status);
  }

  if (error instanceof TypeError || isNetworkUnavailableError(error)) {
    return true;
  }

  // Cualquier otro fallo (incluida una respuesta que no cumple el esquema) se reintenta: el envío
  // es idempotente por `id`, así que repetirlo nunca duplica controles.
  return true;
}

/**
 * Envía un lote de controles a `POST /sync/checkups` usando `authFetch`.
 * Valida la entrada con `SyncCheckupsInputSchema` y la respuesta con `SyncCheckupsResponseSchema`.
 */
export async function postSyncCheckups(
  items: readonly SyncCheckupItem[],
): Promise<SyncCheckupsResponse> {
  const validatedBody = SyncCheckupsInputSchema.parse({ checkups: [...items] });

  let response: Response;
  try {
    response = await authFetch('/sync/checkups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(validatedBody),
    });
  } catch (err) {
    throw new SyncApiError(i18n.t('errors:network'), {
      kind: 'network',
      status: null,
      retryable: true,
      cause: err,
    });
  }

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const fallbackMessage =
      response.status >= 500 ? i18n.t('errors:http.5xx') : i18n.t('errors:checkups.create');
    const parsedError = parseApiError(payload, fallbackMessage);
    const retryable = isRetryableHttpStatus(response.status);

    throw new SyncApiError(parsedError.message, {
      kind: retryable ? 'retryable-http' : 'batch-4xx',
      status: response.status,
      retryable,
    });
  }

  let rawJson: unknown;
  try {
    rawJson = await response.json();
  } catch (err) {
    throw new SyncApiError(i18n.t('errors:invalidResponse'), {
      kind: 'invalid-response',
      status: response.status,
      // Una respuesta ilegible (p. ej. portal cautivo) no prueba que los controles sean inválidos:
      // el reenvío es idempotente, así que se reintenta con espera creciente.
      retryable: true,
      cause: err,
    });
  }

  const parsedResponse = SyncCheckupsResponseSchema.safeParse(rawJson);
  if (!parsedResponse.success) {
    throw new SyncApiError(i18n.t('errors:invalidResponse'), {
      kind: 'invalid-response',
      status: response.status,
      // Una respuesta ilegible (p. ej. portal cautivo) no prueba que los controles sean inválidos:
      // el reenvío es idempotente, así que se reintenta con espera creciente.
      retryable: true,
      cause: parsedResponse.error,
    });
  }

  return parsedResponse.data;
}
