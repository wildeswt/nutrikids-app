import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env'), quiet: true });

process.env.DATA_ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64');
process.env.DATA_ENCRYPTION_KEY_ID ??= 'test-k1';
process.env.PSEUDONYMIZATION_KEY ??= Buffer.alloc(32, 2).toString('base64');
