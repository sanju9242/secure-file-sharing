import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encryptBuffer, decryptBuffer } from '../src/security.js';

process.env.FILE_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');

test('AES-256-GCM encryption round-trip preserves bytes', () => {
  const original = Buffer.from('Secure file sharing test');
  const encrypted = encryptBuffer(original);
  assert.notDeepEqual(encrypted, original);
  assert.deepEqual(decryptBuffer(encrypted), original);
});

test('AES-GCM detects tampering', () => {
  const encrypted = encryptBuffer(Buffer.from('tamper test'));
  encrypted[encrypted.length - 1] ^= 1;
  assert.throws(() => decryptBuffer(encrypted));
});
