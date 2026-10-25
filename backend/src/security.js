import crypto from 'node:crypto';
import { getSupabaseStatus, supabaseAdmin } from './supabase.js';

export function getEncryptionKey() {
  const encoded = process.env.FILE_ENCRYPTION_KEY?.trim();
  if (!encoded) {
    throw new Error('FILE_ENCRYPTION_KEY is required. Set it in backend/.env before starting the API.');
  }
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new Error('FILE_ENCRYPTION_KEY must be base64 for exactly 32 random bytes. See README for generation steps.');
  }
  return key;
}
export function encryptBuffer(input) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from('SFS1'), iv, tag, ciphertext]);
}
export function decryptBuffer(input) {
  if (input.length < 32 || input.subarray(0, 4).toString() !== 'SFS1') throw new Error('Invalid encrypted file format');
  const key = getEncryptionKey();
  const iv = input.subarray(4, 16);
  const tag = input.subarray(16, 32);
  const ciphertext = input.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ error: 'Please log in.' });
  if (!getSupabaseStatus().configured) {
    return res.status(503).json({ error: 'Backend authentication is not configured.' });
  }

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    req.userId = user.id;
    req.userEmail = user.email;
    return next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}
