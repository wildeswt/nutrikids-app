import { describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import {
  decryptPii,
  encryptPii,
  isEncrypted,
  PiiCryptoError,
  type PiiContext,
} from '../lib/pii-crypto.js';

describe('Primitivas de cifrado PII (AES-256-GCM)', () => {
  const context: PiiContext = 'users:first_name';

  it('produce un formato versionado v1:<keyId>:<iv>:<tag>:<ciphertext>', () => {
    const encrypted = encryptPii('María José', context);
    expect(isEncrypted(encrypted)).toBe(true);

    const parts = encrypted.split(':');
    expect(parts.length).toBe(5);
    expect(parts[0]).toBe('v1');
    expect(parts[1]).toBe(env.DATA_ENCRYPTION_KEY_ID);
    expect(parts[2]!.length).toBeGreaterThan(0); // IV base64url
    expect(parts[3]!.length).toBeGreaterThan(0); // Tag base64url
    expect(parts[4]!.length).toBeGreaterThan(0); // Ciphertext base64url
  });

  it('genera ciphertexts distintos para el mismo texto claro debido al IV aleatorio', () => {
    const text = 'Carlos';
    const enc1 = encryptPii(text, context);
    const enc2 = encryptPii(text, context);
    expect(enc1).not.toBe(enc2);
  });

  it('cifra y descifra correctamente conservando caracteres especiales y acentos en español', () => {
    const original = 'Ñandú López-García & Sofía 👶';
    const encrypted = encryptPii(original, 'children:last_name');
    const decrypted = decryptPii(encrypted, 'children:last_name');
    expect(decrypted).toBe(original);
  });

  it('falla si se intenta descifrar con un contexto (AAD) diferente al original', () => {
    const encrypted = encryptPii('Pedro', 'users:first_name');
    expect(() => decryptPii(encrypted, 'users:last_name')).toThrow(PiiCryptoError);
    expect(() => decryptPii(encrypted, 'users:last_name')).toThrowError(/DECRYPT_FAILED/);
  });

  it('falla con DECRYPT_FAILED si el ciphertext o tag han sido manipulados', () => {
    const encrypted = encryptPii('Ana', context);
    const parts = encrypted.split(':');
    // Alterar el último carácter del ciphertext
    const tampered = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:${parts[4]!.slice(0, -1)}X`;
    expect(() => decryptPii(tampered, context)).toThrow(PiiCryptoError);
    expect(() => decryptPii(tampered, context)).toThrowError(/DECRYPT_FAILED/);
  });

  it('falla con UNKNOWN_KEY si el keyId no coincide con el configurado', () => {
    const encrypted = encryptPii('Ana', context);
    const parts = encrypted.split(':');
    const wrongKey = `${parts[0]}:other-key:${parts[2]}:${parts[3]}:${parts[4]}`;
    expect(() => decryptPii(wrongKey, context)).toThrow(PiiCryptoError);
    expect(() => decryptPii(wrongKey, context)).toThrowError(/UNKNOWN_KEY/);
  });

  it('falla con INVALID_FORMAT si el formato no tiene 5 partes o versión v1', () => {
    expect(() => decryptPii('plain-text-name', context)).toThrow(PiiCryptoError);
    expect(() => decryptPii('plain-text-name', context)).toThrowError(/INVALID_FORMAT/);
    expect(() => decryptPii('v2:k1:a:b:c', context)).toThrowError(/INVALID_FORMAT/);
  });

  it('el mensaje de error nunca expone el texto en claro', () => {
    const secret = 'NombreMuySecreto12345';
    const encrypted = encryptPii(secret, context);
    try {
      decryptPii(encrypted, 'children:first_name'); // contexto incorrecto
      expect.unreachable('Debería haber lanzado error');
    } catch (err: unknown) {
      expect((err as Error).message).not.toContain(secret);
    }
  });

  it('isEncrypted detecta correctamente cadenas con prefijo v1:', () => {
    expect(isEncrypted('v1:k1:iv:tag:data')).toBe(true);
    expect(isEncrypted('Anonimizado')).toBe(false);
    expect(isEncrypted(null)).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
  });
});
