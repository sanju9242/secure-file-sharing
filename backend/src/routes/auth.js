import { Router } from 'express';
import { supabaseAdmin, getSupabaseStatus } from '../supabase.js';

const router = Router();
router.get('/me', async (req, res, next) => {
  try {
    if (!getSupabaseStatus().configured) {
      return res.status(503).json({ error: 'Supabase is not configured.' });
    }
    const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return res.json({ user: null });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'User not found.' });
    }

    res.json({
      user: {
        id: data.user.id,
        name: data.user.user_metadata?.full_name || data.user.email,
        email: data.user.email,
      },
    });
  } catch (e) { next(e); }
});

export default router;
