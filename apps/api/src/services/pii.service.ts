import { decryptPii, encryptPii } from '../lib/pii-crypto.js';

export interface PlainNameFields {
  firstName: string;
  lastName: string;
}

export interface EncryptedNameFields {
  firstNameEnc: string;
  lastNameEnc: string;
}

/**
 * Cifra nombres de usuarios (cuidadores y profesionales).
 */
export function encryptUserNames(input: PlainNameFields): EncryptedNameFields {
  return {
    firstNameEnc: encryptPii(input.firstName.trim(), 'users:first_name'),
    lastNameEnc: encryptPii(input.lastName.trim(), 'users:last_name'),
  };
}

/**
 * Descifra nombres de usuarios.
 */
export function decryptUserNames(input: EncryptedNameFields): PlainNameFields {
  return {
    firstName: decryptPii(input.firstNameEnc, 'users:first_name'),
    lastName: decryptPii(input.lastNameEnc, 'users:last_name'),
  };
}

/**
 * Cifra nombres y apellidos de niños.
 */
export function encryptChildNames(input: PlainNameFields): EncryptedNameFields {
  return {
    firstNameEnc: encryptPii(input.firstName.trim(), 'children:first_name'),
    lastNameEnc: encryptPii(input.lastName.trim(), 'children:last_name'),
  };
}

export function encryptChildFirstName(firstName: string): string {
  return encryptPii(firstName.trim(), 'children:first_name');
}

export function encryptChildLastName(lastName: string): string {
  return encryptPii(lastName.trim(), 'children:last_name');
}

/**
 * Descifra nombres de niños.
 * Tolera explícitamente el valor literal 'Anonimizado' procedente de solicitudes
 * de eliminación ejecutadas (NK-41 / execute_erasure_requests).
 */
export function decryptChildNames(input: EncryptedNameFields): PlainNameFields {
  return {
    firstName:
      input.firstNameEnc === 'Anonimizado'
        ? 'Anonimizado'
        : decryptPii(input.firstNameEnc, 'children:first_name'),
    lastName:
      input.lastNameEnc === 'Anonimizado'
        ? 'Anonimizado'
        : decryptPii(input.lastNameEnc, 'children:last_name'),
  };
}

/**
 * Cifra el teléfono de un cuidador.
 * Normaliza cadenas vacías o espacios en blanco a null.
 */
export function encryptPhone(phone: string | null | undefined): string | null {
  const cleaned = phone?.trim();
  return cleaned ? encryptPii(cleaned, 'caregivers:phone') : null;
}

/**
 * Descifra el teléfono de un cuidador.
 */
export function decryptPhone(phoneEnc: string | null | undefined): string | null {
  return phoneEnc ? decryptPii(phoneEnc, 'caregivers:phone') : null;
}
