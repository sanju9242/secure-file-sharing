import { Router } from 'express';
import { requireAuth } from '../security.js';
import { supabaseAdmin } from '../supabase.js';

const router = Router();
router.use(requireAuth);

router.post('/', async (req, res, next) => {
  try {
    const { fileId, recipientEmail, expiresAt } = req.body || {};
    const email = String(recipientEmail || '').toLowerCase().trim();
    if (typeof fileId !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Provide a valid file ID and recipient email.' });
    }

    const { data: file, error: fileError } = await supabaseAdmin.from('files').select('*').eq('id', fileId).eq('owner_id', req.userId).single();
    if (fileError || !file) return res.status(404).json({ error: 'File not found.' });

    const { data: recipient, error: recipientError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', email)
      .maybeSingle();
    if (recipientError) throw recipientError;
    if (!recipient) return res.status(404).json({ error: 'Recipient account was not found.' });
    if (recipient.id === req.userId) return res.status(400).json({ error: 'You cannot share a file with yourself.' });

    let expiry = null;
    if (expiresAt) {
      expiry = new Date(expiresAt);
      if (Number.isNaN(expiry.getTime()) || expiry <= new Date()) return res.status(400).json({ error: 'Expiration must be a future date.' });
    }

    const { data: share, error } = await supabaseAdmin
      .from('file_shares')
      .insert([
        {
          file_id: file.id,
          owner_id: req.userId,
          recipient_id: recipient.id,
          recipient_email: email,
          permission: 'read',
          expires_at: expiry,
          revoked_at: null,
        },
      ])
      .select('*')
      .single();

    if (error || !share) throw error || new Error('Unable to create share');
    res.status(201).json({ share: { id: share.id, fileName: file.original_name, recipientEmail: email, expiresAt: share.expires_at } });
  } catch (e) { next(e); }
});

router.get('/sent', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('file_shares')
      .select('*')
      .eq('owner_id', req.userId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    const fileIds = (data || []).map((share) => share.file_id);
    if (!fileIds.length) return res.json({ shares: [] });
    const { data: filesData, error: filesError } = await supabaseAdmin.from('files').select('id, original_name').in('id', fileIds);
    if (filesError) throw filesError;

    res.json({
      shares: (data || []).map((share) => ({
        id: share.id,
        fileId: share.file_id,
        fileName: filesData?.find((file) => file.id === share.file_id)?.original_name || '[deleted]',
        recipientEmail: share.recipient_email,
        expiresAt: share.expires_at,
        createdAt: share.created_at,
      })),
    });
  } catch (e) { next(e); }
});

router.get('/received', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('file_shares')
      .select('*')
      .eq('recipient_id', req.userId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    const activeShares = (data || []).filter((share) => !share.expires_at || new Date(share.expires_at) > new Date());
    const fileIds = activeShares.map((share) => share.file_id);
    if (!fileIds.length) return res.json({ shares: [] });
    const { data: filesData, error: filesError } = await supabaseAdmin.from('files').select('id, original_name, file_size, mime_type, created_at').in('id', fileIds);
    if (filesError) throw filesError;
    const ownerIds = [...new Set(activeShares.map((share) => share.owner_id))];
    const { data: owners, error: ownersError } = await supabaseAdmin.from('profiles').select('id, email').in('id', ownerIds);
    if (ownersError) throw ownersError;

    res.json({
      shares: activeShares.map((share) => ({
        id: share.id,
        fileId: share.file_id,
        fileName: filesData?.find((file) => file.id === share.file_id)?.original_name || '[deleted]',
        fileSize: filesData?.find((file) => file.id === share.file_id)?.file_size || 0,
        sender: owners?.find((owner) => owner.id === share.owner_id)?.email || 'User',
        expiresAt: share.expires_at,
        createdAt: share.created_at,
      })),
    });
  } catch (e) { next(e); }
});

router.post('/:id/revoke', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.from('file_shares').select('*').eq('id', req.params.id).eq('owner_id', req.userId).is('revoked_at', null).single();
    if (error || !data) return res.status(404).json({ error: 'Share not found.' });

    const { error: updateError } = await supabaseAdmin.from('file_shares').update({ revoked_at: new Date().toISOString() }).eq('id', data.id);
    if (updateError) throw updateError;
    res.json({ message: 'Sharing access revoked.' });
  } catch (e) { next(e); }
});

export default router;
