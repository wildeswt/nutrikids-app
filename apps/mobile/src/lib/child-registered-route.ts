import type { ChildResponse } from '@nutrikids/shared';

/** Parámetros de ruta de `child-registered` (los parámetros de ruta son siempre texto). */
export interface ChildRegisteredParams extends Record<string, string> {
  childId: string;
  childName: string;
  birthDate: string;
}

export function toChildRegisteredParams(
  child: Pick<ChildResponse, 'id' | 'firstName' | 'birthDate'>,
): ChildRegisteredParams {
  return { childId: child.id, childName: child.firstName, birthDate: child.birthDate };
}

function firstString(value: string | string[] | undefined): string | null {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' && text.trim() ? text : null;
}

/** Reconstruye los datos del niño registrado; `null` si falta alguno (p. ej. enlace directo). */
export function parseChildRegisteredParams(
  params: Record<string, string | string[] | undefined>,
): ChildRegisteredParams | null {
  const childId = firstString(params.childId);
  const childName = firstString(params.childName);
  const birthDate = firstString(params.birthDate);
  if (!childId || !childName || !birthDate) return null;
  return { childId, childName, birthDate };
}
