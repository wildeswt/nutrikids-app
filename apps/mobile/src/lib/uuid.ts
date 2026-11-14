/**
 * Generates a RFC 4122 v4 UUID on the device. The checkup `id` is created here so that resending
 * the same request never duplicates the checkup (idempotency, see POST /children/:id/checkups).
 *
 * Hermes does not always expose `crypto.randomUUID`, so it falls back to `getRandomValues` and,
 * as a last resort, to `Math.random` (the id only needs to be unique, not unguessable).
 */
export function generateUuid(): string {
  const cryptoApi = (globalThis as { crypto?: Partial<Crypto> }).crypto;

  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}
