import { randomBytes } from 'node:crypto';

process.env.DATA_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
process.env.DATA_ENCRYPTION_KEY_ID ??= 'test-k1';
process.env.PSEUDONYMIZATION_KEY ??= randomBytes(32).toString('base64');
