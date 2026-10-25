import { createClient } from '@supabase/supabase-js';
import { getEnv } from './config.js';

const supabaseUrl = getEnv('SUPABASE_URL');
const supabaseSecretKey = getEnv('SUPABASE_SECRET_KEY') || getEnv('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseSecretKey) {
  console.warn('Supabase is not fully configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY in backend/.env.');
}

export const supabaseAdmin = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseSecretKey || 'placeholder-key', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export function getSupabaseStatus() {
  return {
    configured: Boolean(supabaseUrl && supabaseSecretKey),
    url: supabaseUrl || null,
  };
}

export async function verifySupabaseConnection() {
  if (!supabaseUrl || !supabaseSecretKey) {
    return { ok: false, message: 'Supabase is not configured.' };
  }

  try {
    const checks = await Promise.all([
      supabaseAdmin.from('profiles').select('id').limit(1),
      supabaseAdmin.from('files').select('id, original_name, storage_bucket, encryption_algorithm').limit(1),
      supabaseAdmin.from('file_shares').select('id, permission, revoked_at').limit(1),
      supabaseAdmin.storage.listBuckets(),
    ]);
    const failedCheck = checks.find((result) => result.error);
    if (failedCheck) {
      if (failedCheck.error.code === 'PGRST205' || /could not find the table .* in the schema cache/i.test(failedCheck.error.message || '')) {
        return {
          ok: false,
          message: 'Supabase database schema is missing. Run supabase/migrations/202610250001_secure_share.sql in the Supabase SQL Editor.',
        };
      }
      return { ok: false, message: 'Supabase connection or migration check failed.', details: failedCheck.error.message };
    }
    const bucketExists = checks[3].data?.some((bucket) => bucket.name === 'encrypted-files' && !bucket.public);
    if (!bucketExists) return { ok: false, message: 'The private encrypted-files bucket is missing.' };

    return { ok: true, message: 'Supabase PostgreSQL is reachable.' };
  } catch (error) {
    return { ok: false, message: 'Supabase client initialization failed.', details: error.message };
  }
}
