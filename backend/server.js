import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './src/routes/auth.js';
import fileRoutes from './src/routes/files.js';
import shareRoutes from './src/routes/shares.js';
import { validateEnvironment } from './src/config.js';
import { getSupabaseStatus, verifySupabaseConnection } from './src/supabase.js';

const app = express();
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
].filter(Boolean);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS origin not allowed: ${origin}`));
  },
}));
app.use(express.json({ limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 }), authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/shares', shareRoutes);
app.get('/api/health', async (_req, res) => {
  const supabaseStatus = getSupabaseStatus();
  const connection = await verifySupabaseConnection();
  const healthy = supabaseStatus.configured && connection.ok;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'error',
    database: 'supabase-postgres',
    supabase: !supabaseStatus.configured ? 'not-configured' : connection.ok ? 'connected' : 'unavailable',
    error: connection.ok ? undefined : connection.message,
  });
});
app.use((err, _req, res, _next) => {
  console.error('Server error:', err.message);
  const missingSupabaseSchema = err.code === 'PGRST205' || /could not find the table .* in the schema cache/i.test(err.message || '');
  if (missingSupabaseSchema) {
    return res.status(503).json({
      error: 'Supabase database schema is missing. Run supabase/migrations/202610250001_secure_share.sql in the Supabase SQL Editor, then retry.',
    });
  }
  const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : err.status || 500;
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the configured upload size limit.' : err.status ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
});

const port = Number(process.env.PORT || 5000);

async function startServer() {
  try {
    validateEnvironment();
    if (process.env.NODE_ENV !== 'test') {
      const supabaseStatus = getSupabaseStatus();
      app.listen(port, () => {
        console.log(`API running at http://localhost:${port}`);
        console.log(`Supabase status: ${supabaseStatus.configured ? 'configured' : 'not configured'}`);
      });
    }
  } catch (error) {
    console.error('Server startup failed:', error.message);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, startServer };
export default app;
