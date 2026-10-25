import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validateEnvironment } from '../src/config.js';

const originalEnv = { ...process.env };

test('validateEnvironment requires all required variables', () => {
  process.env.PORT = '5000';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.FILE_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-server-secret-key';

  assert.equal(validateEnvironment().supabaseSecretKey, 'test-server-secret-key');
});

test('validateEnvironment does not require a custom JWT secret', () => {
  delete process.env.SESSION_SECRET;
  delete process.env.JWT_SECRET;
  process.env.PORT = '5000';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.FILE_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-server-secret-key';

  assert.doesNotThrow(() => validateEnvironment());
});

test('validateEnvironment rejects an invalid encryption key', () => {
  process.env.PORT = '5000';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.FILE_ENCRYPTION_KEY = 'not-a-32-byte-key';
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-server-secret-key';

  assert.throws(() => validateEnvironment(), /exactly 32 bytes/i);
});

test('validateEnvironment rejects an invalid upload size', () => {
  process.env.PORT = '5000';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.FILE_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'test-server-secret-key';
  process.env.MAX_FILE_SIZE_MB = '0';

  assert.throws(() => validateEnvironment(), /MAX_FILE_SIZE_MB/i);
});

test.afterEach(() => {
  process.env = { ...originalEnv };
});
