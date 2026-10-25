import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const backendDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(backendDir, '..', '.env') });

export function getEnv(name, { defaultValue = undefined, required = false } = {}) {
  const value = process.env[name];
  if (value !== undefined && value !== null && String(value).trim() !== '') {
    return String(value).trim();
  }
  if (required && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${name}. Add it to backend/.env.`);
  }
  return defaultValue;
}

export function validateEnvironment() {
  const supabaseSecretKey = getEnv('SUPABASE_SECRET_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const required = ['PORT', 'FILE_ENCRYPTION_KEY', 'FRONTEND_URL', 'SUPABASE_URL'];
  const missing = required.filter((name) => !process.env[name] || String(process.env[name]).trim() === '');
  if (!supabaseSecretKey) missing.push('SUPABASE_SECRET_KEY');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}. Copy backend/.env.example to backend/.env and set each value.`);
  }

  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port number between 1 and 65535.');
  }

  const encryptionKey = process.env.FILE_ENCRYPTION_KEY.trim();
  const decoded = Buffer.from(encryptionKey, 'base64');
  if (decoded.length !== 32) {
    throw new Error('FILE_ENCRYPTION_KEY must decode to exactly 32 bytes. Generate a Base64-encoded 32-byte value with Node.js crypto.');
  }
  const maxFileSizeMb = Number(getEnv('MAX_FILE_SIZE_MB', { defaultValue: '25' }));
  if (!Number.isInteger(maxFileSizeMb) || maxFileSizeMb < 1 || maxFileSizeMb > 25) {
    throw new Error('MAX_FILE_SIZE_MB must be a whole number between 1 and 25.');
  }

  return {
    port,
    frontendUrl: process.env.FRONTEND_URL.trim(),
    fileEncryptionKey: encryptionKey,
    maxFileSizeMb,
    supabaseUrl: process.env.SUPABASE_URL.trim(),
    supabaseSecretKey: supabaseSecretKey.trim(),
  };
}
