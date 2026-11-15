import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '../lib/secretBox.js';
import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  generateTotp,
  generateTotpSecret,
  hotp,
  totpStep,
  verifyTotp,
} from '../lib/totp.js';
import { generateRecoveryCodes, hashRecoveryCode } from '../services/twoFactor.service.js';

/** Clave de los vectores de prueba de RFC 6238 (SHA-1): "12345678901234567890". */
const RFC_KEY = Buffer.from('12345678901234567890', 'ascii');
const RFC_SECRET = base32Encode(RFC_KEY);

describe('TOTP (RFC 6238)', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('reproduce el vector oficial en t=%i', (seconds, expected) => {
    expect(hotp(RFC_KEY, totpStep(seconds * 1000), 8)).toBe(expected);
    expect(generateTotp(RFC_SECRET, seconds * 1000)).toBe(expected.slice(-6));
  });

  it('codifica y decodifica base32 sin pérdida (RFC 4648)', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('mzxw 6ytb-oi======').toString()).toBe('foobar');
    expect(base32Decode(RFC_SECRET).equals(RFC_KEY)).toBe(true);
    expect(() => base32Decode('ABC1')).toThrow();
  });

  it('genera claves de 160 bits en base32', () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it('acepta el paso actual y ±1 (desfase de reloj) y devuelve el paso que coincidió', () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    expect(verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, now), now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, now - 30_000), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, now + 30_000), now)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, generateTotp(RFC_SECRET, now - 90_000), now)).toBeNull();
  });

  it('rechaza códigos con formato inválido', () => {
    expect(verifyTotp(RFC_SECRET, '12345')).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef')).toBeNull();
    expect(verifyTotp(RFC_SECRET, '1234567')).toBeNull();
  });

  it('arma la URI otpauth que entienden las aplicaciones autenticadoras', () => {
    const uri = buildOtpauthUri('luis@hospital.ec', 'JBSWY3DPEHPK3PXP');
    const url = new URL(uri);
    expect(url.protocol).toBe('otpauth:');
    expect(url.host).toBe('totp');
    expect(decodeURIComponent(url.pathname)).toBe('/NutriKids:luis@hospital.ec');
    expect(url.searchParams.get('secret')).toBe('JBSWY3DPEHPK3PXP');
    expect(url.searchParams.get('issuer')).toBe('NutriKids');
    expect(url.searchParams.get('digits')).toBe('6');
    expect(url.searchParams.get('period')).toBe('30');
  });
});

describe('Cifrado de la clave TOTP (AES-256-GCM)', () => {
  const key = 'clave-de-prueba-de-al-menos-32-caracteres';

  it('cifra con IV aleatorio y descifra el valor original', () => {
    const a = encryptSecret('JBSWY3DPEHPK3PXP', key);
    const b = encryptSecret('JBSWY3DPEHPK3PXP', key);
    expect(a).not.toBe(b);
    expect(a).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(a, key)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('detecta alteraciones y claves incorrectas', () => {
    const payload = encryptSecret('JBSWY3DPEHPK3PXP', key);
    const parts = payload.split('.');
    const tampered = [...parts.slice(0, 3), Buffer.from('otra-cosa').toString('base64url')].join(
      '.',
    );
    expect(() => decryptSecret(tampered, key)).toThrow();
    expect(() => decryptSecret(payload, 'otra-clave-de-al-menos-32-caracteres!!')).toThrow();
    expect(() => decryptSecret('no-es-un-secreto', key)).toThrow();
  });
});

describe('Códigos de recuperación', () => {
  it('genera 10 códigos distintos y legibles con sus hashes', () => {
    const { codes, hashes } = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(hashes).toEqual(codes.map(hashRecoveryCode));
  });

  it('normaliza mayúsculas, espacios y guiones antes de resumir', () => {
    expect(hashRecoveryCode('abcd efgh')).toBe(hashRecoveryCode('ABCD-EFGH'));
    expect(hashRecoveryCode('ABCD-EFGH')).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRecoveryCode('ABCD-EFGJ')).not.toBe(hashRecoveryCode('ABCD-EFGH'));
  });
});
