import { createHmac } from 'node:crypto';
import { env } from '../config/env.js';

export type PseudonymEntity = 'child' | 'caregiver' | 'professional' | 'checkup';

/**
 * Genera un seudónimo determinista no reversible sin la clave PSEUDONYMIZATION_KEY.
 * Emplea HMAC-SHA256 con prefijo de entidad y devuelve un identificador compacto psn_...
 */
export function pseudonymize(entity: PseudonymEntity, id: string): string {
  const digest = createHmac('sha256', env.PSEUDONYMIZATION_KEY)
    .update(`${entity}:${id}`, 'utf8')
    .digest('base64url');

  return `psn_${digest.slice(0, 22)}`;
}
