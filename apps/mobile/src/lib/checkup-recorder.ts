import type { CheckupRecorder } from '@nutrikids/shared';
import i18n from '../i18n/index.js';

export interface FormatCheckupRecorderOptions {
  recorder: CheckupRecorder | null | undefined;
  origin: 'CAREGIVER' | 'PROFESSIONAL';
  currentUserId?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t?: any;
}

/**
 * Formatea el texto de quién registró un control antropométrico (NK-73).
 *
 * Reglas:
 * 1. Si `recordedBy` es el propio usuario (`currentUserId`), devuelve «ti» (para «Registrado por ti»).
 * 2. Si `recordedBy` es otra persona, devuelve su nombre y apellido, añadiendo la especialidad
 *    si es profesional («{nombre} {apellido} · {especialidad}»).
 *    Para evitar suponer género, no se antepone «Dra./Dr.».
 * 3. Si `recordedBy` es `null`, usa el texto de respaldo según `origin` («ti» / «Equipo de salud»).
 */
export function formatCheckupRecorder({
  recorder,
  origin,
  currentUserId,
  t,
}: FormatCheckupRecorderOptions): string {
  const translate = t ?? i18n.t.bind(i18n);
  if (recorder) {
    if (currentUserId && recorder.userId === currentUserId) {
      return translate('caregiver:evolution.origin.CAREGIVER', { defaultValue: 'ti' });
    }
    const fullName = `${recorder.firstName} ${recorder.lastName}`.trim();
    if (recorder.specialty) {
      const specialtyKey = `common:specialties.${recorder.specialty}`;
      const specialtyLabel = translate(specialtyKey, { defaultValue: recorder.specialty });
      return `${fullName} · ${specialtyLabel}`;
    }
    return fullName;
  }

  return translate(`caregiver:evolution.origin.${origin}`, {
    defaultValue: origin === 'CAREGIVER' ? 'ti' : 'Equipo de salud',
  });
}
