import {
  NotificationResponseSchema,
  PushDeviceResponseSchema,
  RegisterPushDeviceInputSchema,
  type NotificationResponse,
  type PushDeviceResponse,
  type RegisterPushDeviceInput,
} from '@nutrikids/shared';
import { z } from 'zod';
import i18n from '../i18n/index.js';
import { authFetch, parseApiError } from './api.js';

/**
 * Registra o actualiza el token push del dispositivo para el usuario autenticado (NK-36).
 */
export async function registerPushDeviceApi(
  input: RegisterPushDeviceInput,
): Promise<PushDeviceResponse> {
  const validatedBody = RegisterPushDeviceInputSchema.parse(input);

  const response = await authFetch('/notifications/devices', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(validatedBody),
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, i18n.t('errors:notifications.registerDevice'));
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return PushDeviceResponseSchema.parse(rawJson);
}

/**
 * Elimina el dispositivo asociado al token para el usuario autenticado (llamado en signOut).
 */
export async function unregisterPushDeviceApi(token: string): Promise<void> {
  const response = await authFetch(`/notifications/devices/${encodeURIComponent(token)}`, {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 404) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, i18n.t('errors:notifications.unregisterDevice'));
    throw new Error(parsed.message);
  }
}

/**
 * Obtiene la lista de notificaciones del usuario autenticado (NK-36).
 */
export async function fetchNotificationsApi(): Promise<NotificationResponse[]> {
  const response = await authFetch('/notifications');

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, i18n.t('common:notifications.errorLoading'));
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return z.array(NotificationResponseSchema).parse(rawJson);
}

/**
 * Marca una notificación como leída (NK-36).
 */
export async function markNotificationReadApi(id: string): Promise<NotificationResponse> {
  const response = await authFetch(`/notifications/${id}/read`, {
    method: 'PATCH',
  });

  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => ({}));
    const parsed = parseApiError(payload, i18n.t('errors:notifications.markRead'));
    throw new Error(parsed.message);
  }

  const rawJson: unknown = await response.json();
  return NotificationResponseSchema.parse(rawJson);
}
