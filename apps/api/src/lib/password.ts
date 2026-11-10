import { hash, verify, type Algorithm, type Options } from '@node-rs/argon2';

const ARGON2ID: Algorithm.Argon2id = 2;

const ARGON2_OPTIONS: Options = {
  algorithm: ARGON2ID,
  memoryCost: 19456, // 19 MiB (recomendación OWASP para Argon2id)
  timeCost: 2,
  parallelism: 1,
};

let cachedDummyHashPromise: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  if (!cachedDummyHashPromise) {
    cachedDummyHashPromise = hash('nutrikids-dummy-password-for-timing-safety', ARGON2_OPTIONS);
  }
  return cachedDummyHashPromise;
}

/**
 * Calcula el hash Argon2id de una contraseña. Nunca registra ni devuelve la contraseña en claro.
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return hash(plainPassword, ARGON2_OPTIONS);
}

/**
 * Verifica una contraseña en claro contra un hash Argon2id almacenado.
 */
export async function verifyPassword(
  passwordHash: string,
  plainPassword: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plainPassword);
  } catch {
    return false;
  }
}

/**
 * Ejecuta una verificación Argon2id contra un hash ficticio cuando el correo no existe,
 * para igualar el tiempo de respuesta y evitar enumeración de usuarios por tiempo.
 */
export async function verifyDummyPassword(plainPassword: string): Promise<void> {
  const dummyHash = await getDummyHash();
  await verifyPassword(dummyHash, plainPassword);
}
