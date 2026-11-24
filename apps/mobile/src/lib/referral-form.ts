import {
  CreateReferralInputSchema,
  MESSAGE_BODY_MAX_LENGTH,
  todayIsoDate,
  type CreateReferralInput,
  type ProfessionalAssignmentResponse,
} from '@nutrikids/shared';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { z } from 'zod';
import {
  getWebLocalStorage,
  getWebSessionStorage,
  readSensitiveWebItem,
  removeSensitiveWebItem,
  writeSensitiveWebItem,
} from './web-storage.js';

export const REFERRAL_PRIORITIES = ['ordinary', 'priority'] as const;

export type ReferralPriority = (typeof REFERRAL_PRIORITIES)[number];

/** Prefijo enviado al inicio de `body` cuando la interconsulta es prioritaria (la API no tiene campo propio). */
export const PRIORITY_PREFIX = '[Prioritaria] ';

export interface ReferralFormData {
  childId: string | null;
  recipientId: string | null;
  priority: ReferralPriority;
  reason: string;
}

export const EMPTY_REFERRAL_FORM: ReferralFormData = {
  childId: null,
  recipientId: null,
  priority: 'ordinary',
  reason: '',
};

export type ReferralFormError =
  | { code: 'childRequired' }
  | { code: 'recipientRequired' }
  | { code: 'bodyRequired' }
  | { code: 'bodyTooLong'; max: number }
  | { code: 'invalid' };

export type ReferralFormResult =
  { ok: true; input: CreateReferralInput } | { ok: false; error: ReferralFormError };

/** Devuelve el prefijo de prioridad que acompaña al motivo en la API. */
export function priorityPrefix(priority: ReferralPriority): string {
  return priority === 'priority' ? PRIORITY_PREFIX : '';
}

/** Longitud máxima disponible para el motivo escrito por el profesional según la prioridad. */
export function maxReasonLength(priority: ReferralPriority): number {
  return MESSAGE_BODY_MAX_LENGTH - priorityPrefix(priority).length;
}

/** Arma el cuerpo final que se envía a `POST /referrals`, recortando espacios y agregando el prefijo si aplica. */
export function composeReferralBody(reason: string, priority: ReferralPriority): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) return '';
  return `${priorityPrefix(priority)}${trimmed}`;
}

/**
 * Valida los datos del formulario y construye el cuerpo para `POST /referrals`.
 * El prefijo `[Prioritaria] ` cuenta dentro del límite de `MESSAGE_BODY_MAX_LENGTH` (2000).
 */
export function buildCreateReferralInput(
  form: ReferralFormData,
  options: { id: string },
): ReferralFormResult {
  if (!form.childId) return { ok: false, error: { code: 'childRequired' } };
  if (!form.recipientId) return { ok: false, error: { code: 'recipientRequired' } };

  const body = composeReferralBody(form.reason, form.priority);
  if (body.length === 0) return { ok: false, error: { code: 'bodyRequired' } };
  if (body.length > MESSAGE_BODY_MAX_LENGTH) {
    return { ok: false, error: { code: 'bodyTooLong', max: MESSAGE_BODY_MAX_LENGTH } };
  }

  const parsed = CreateReferralInputSchema.safeParse({
    id: options.id,
    childId: form.childId,
    recipientId: form.recipientId,
    body,
  });

  if (!parsed.success) return { ok: false, error: { code: 'invalid' } };
  return { ok: true, input: parsed.data };
}

/** Indica si una asignación profesional está vigente en la fecha `today` (`YYYY-MM-DD`). */
export function isAssignmentActiveOn(
  assignment: ProfessionalAssignmentResponse,
  today: string = todayIsoDate(),
): boolean {
  return (
    assignment.startDate <= today && (assignment.endDate === null || assignment.endDate >= today)
  );
}

/**
 * Filtra las asignaciones vigentes hoy excluyendo al profesional en sesión y evitando duplicados.
 */
export function filterEligibleRecipients(
  assignments: readonly ProfessionalAssignmentResponse[],
  currentUserId: string | null | undefined,
  today: string = todayIsoDate(),
): ProfessionalAssignmentResponse[] {
  const seen = new Set<string>();
  const eligible: ProfessionalAssignmentResponse[] = [];

  for (const assignment of assignments) {
    if (!isAssignmentActiveOn(assignment, today)) continue;
    if (currentUserId && assignment.professionalId === currentUserId) continue;
    if (seen.has(assignment.professionalId)) continue;
    seen.add(assignment.professionalId);
    eligible.push(assignment);
  }

  return eligible;
}

// ---------- Borrador local (archivo JSON con expo-file-system en móvil; sessionStorage en web) ----------

export const ReferralDraftSchema = z.object({
  childId: z.string().nullable(),
  recipientId: z.string().nullable(),
  priority: z.enum(REFERRAL_PRIORITIES),
  body: z.string(),
  savedAt: z.string(),
});

export type ReferralDraft = z.infer<typeof ReferralDraftSchema>;

const memoryDrafts = new Map<string, string>();

function safeUserSlug(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function draftStorageKey(userId: string): string {
  return `nutrikids.referral-draft.${safeUserSlug(userId)}`;
}

function draftFile(userId: string): File {
  return new File(Paths.document, `referral-draft-${safeUserSlug(userId)}.json`);
}

function shouldUseWebDraftStorage(): boolean {
  if (Platform.OS !== 'web') return false;
  if (!Platform.isTesting) return true;
  return getWebSessionStorage() !== null || getWebLocalStorage() !== null;
}

function readWebDraft(userId: string): string | null {
  const key = draftStorageKey(userId);
  return readSensitiveWebItem(key) ?? memoryDrafts.get(key) ?? null;
}

function writeWebDraft(userId: string, content: string | null): void {
  const key = draftStorageKey(userId);
  if (content === null) {
    removeSensitiveWebItem(key);
    memoryDrafts.delete(key);
    return;
  }
  if (!writeSensitiveWebItem(key, content)) {
    memoryDrafts.set(key, content);
  }
}

/** Guarda un borrador de interconsulta en almacenamiento local por usuario. */
export async function saveReferralDraft(
  userId: string,
  form: ReferralFormData,
  now: Date = new Date(),
): Promise<void> {
  const payload: ReferralDraft = {
    childId: form.childId,
    recipientId: form.recipientId,
    priority: form.priority,
    body: form.reason,
    savedAt: now.toISOString(),
  };
  const serialized = JSON.stringify(payload);

  if (shouldUseWebDraftStorage()) {
    writeWebDraft(userId, serialized);
    return;
  }

  try {
    const file = draftFile(userId);
    if (!file.exists) {
      file.create();
    }
    await file.write(serialized);
  } catch {
    writeWebDraft(userId, serialized);
  }
}

/** Lee el borrador guardado del usuario o devuelve `null` si no existe o es ilegible. */
export async function loadReferralDraft(userId: string): Promise<ReferralDraft | null> {
  let raw: string | null = null;
  if (shouldUseWebDraftStorage()) {
    raw = readWebDraft(userId);
  } else {
    try {
      const file = draftFile(userId);
      if (file.exists) {
        raw = await file.text();
      }
    } catch {
      raw = readWebDraft(userId);
    }
  }

  if (!raw || !raw.trim()) return null;
  try {
    const parsed = ReferralDraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Elimina el borrador local del usuario (por ejemplo al enviar la interconsulta). */
export async function clearReferralDraft(userId: string): Promise<void> {
  if (shouldUseWebDraftStorage()) {
    writeWebDraft(userId, null);
    return;
  }

  try {
    const file = draftFile(userId);
    if (!file.exists) return;
    if (typeof (file as { delete?: () => void }).delete === 'function') {
      try {
        file.delete();
        return;
      } catch {
        // Si delete falla en algún entorno, se limpia el contenido para invalidar el borrador.
      }
    }
    await file.write('');
  } catch {
    writeWebDraft(userId, null);
  }
}
