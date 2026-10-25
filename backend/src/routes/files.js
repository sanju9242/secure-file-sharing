import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { requireAuth, encryptBuffer, decryptBuffer } from '../security.js';
import { supabaseAdmin, getSupabaseStatus, verifySupabaseConnection } from '../supabase.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE_MB || 25) * 1024 * 1024, files: 1 },
});

function safeName(name) {
  return String(name || 'download').split(/[\\/]/).pop()?.replace(/[^\w.\- ()]/g, '_').slice(0, 180) || 'download';
}

router.post('/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Choose a file to upload.' });

    if (!getSupabaseStatus().configured) {
      return res.status(503).json({ error: 'Supabase is not configured. Set the project URL and service role key.' });
    }

    const setup = await verifySupabaseConnection();
    if (!setup.ok) return res.status(503).json({ error: setup.message });

    const storagePath = `${req.userId}/${crypto.randomUUID()}.enc`;
    const encrypted = encryptBuffer(req.file.buffer);
    const { error: uploadError } = await supabaseAdmin.storage.from('encrypted-files').upload(storagePath, encrypted, {
      contentType: req.file.mimetype || 'application/octet-stream',
      upsert: false,
    });

    if (uploadError) {
      console.error('Supabase Storage upload failed:', uploadError.message);
      return res.status(502).json({ error: 'File upload failed in Supabase Storage.', detail: uploadError.message });
    }

    const fileName = safeName(req.file.originalname);
    const { data, error } = await supabaseAdmin
      .from('files')
      .insert([
        {
          owner_id: req.userId,
          original_name: fileName,
          storage_bucket: 'encrypted-files',
          storage_path: storagePath,
          mime_type: req.file.mimetype || 'application/octet-stream',
          file_size: req.file.size,
          encryption_algorithm: 'AES-256-GCM',
        },
      ])
      .select('*')
      .single();

    if (error || !data) {
      await supabaseAdmin.storage.from('encrypted-files').remove([storagePath]);
      return res.status(500).json({ error: 'File metadata could not be saved.', detail: error?.message });
    }

    return res.status(201).json({ file: { id: data.id, name: data.original_name, fileSize: data.file_size, createdAt: data.created_at } });
  } catch (e) { next(e); }
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('owner_id', req.userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ files: (data || []).map((file) => ({ id: file.id, name: file.original_name, fileSize: file.file_size, mimeType: file.mime_type, createdAt: file.created_at })) });
  } catch (e) { next(e); }
});

router.get('/:id/download', requireAuth, async (req, res, next) => {
  try {
    const { data: file, error: fileError } = await supabaseAdmin.from('files').select('*').eq('id', req.params.id).single();
    if (fileError || !file) return res.status(404).json({ error: 'File not found.' });

    const isOwner = file.owner_id === req.userId;
    if (!isOwner) {
      const { data: shares, error: shareError } = await supabaseAdmin
        .from('file_shares')
        .select('expires_at')
        .eq('file_id', file.id)
        .eq('recipient_id', req.userId)
        .is('revoked_at', null);
      const hasActiveShare = !shareError && (shares || []).some((share) => !share.expires_at || new Date(share.expires_at) > new Date());
      if (!hasActiveShare) return res.status(403).json({ error: 'You do not have permission to download this file.' });
    }

    const { data: blob, error: storageError } = await supabaseAdmin.storage.from(file.storage_bucket || 'encrypted-files').download(file.storage_path);
    if (storageError || !blob) {
      return res.status(404).json({ error: 'File not found in Supabase storage.' });
    }

    const encrypted = Buffer.from(await blob.arrayBuffer());
    const plaintext = decryptBuffer(encrypted);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName(file.original_name)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(plaintext);
  } catch (e) {
    if (e.message?.includes('Unsupported state') || e.message?.includes('authenticate') || e.message?.includes('Invalid encrypted')) return res.status(400).json({ error: 'File integrity verification failed.' });
    next(e);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { data: file, error } = await supabaseAdmin.from('files').select('*').eq('id', req.params.id).eq('owner_id', req.userId).single();
    if (error || !file) return res.status(404).json({ error: 'File not found.' });

    const { error: storageError } = await supabaseAdmin.storage.from(file.storage_bucket || 'encrypted-files').remove([file.storage_path]);
    if (storageError) throw storageError;
    const { error: deleteError } = await supabaseAdmin.from('files').delete().eq('id', file.id);
    if (deleteError) throw deleteError;

    res.json({ message: 'File deleted.' });
  } catch (e) { next(e); }
});

export default router;
