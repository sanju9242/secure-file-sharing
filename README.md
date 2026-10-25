# SecureShare

SecureShare is a React/Vite and Express demonstration using Supabase Auth, Supabase PostgreSQL, private Supabase Storage, and AES-256-GCM file encryption. The backend encrypts every upload before storage and decrypts it only after checking ownership or an active share. Because the backend holds the encryption key, this is server-side encryption, not end-to-end encryption. Do not use confidential files.

## Requirements

- Node.js 20 or later
- A Supabase project
- Windows PowerShell (commands below) or another terminal

## Create and configure Supabase

1. Create a project at [supabase.com](https://supabase.com/) and wait for provisioning to finish.
2. In **Project Settings > API**, copy the project URL, a publishable key (or legacy anon key), and a server-only secret key. The server key must never be placed in frontend code.
3. Open **SQL Editor** and run [`supabase/migrations/202610250001_secure_share.sql`](supabase/migrations/202610250001_secure_share.sql). It creates the profile/file/share tables, RLS policies, summary view, and private `encrypted-files` bucket.
4. In **Authentication > Providers**, enable Email. Choose whether email confirmation is required. For confirmation links, set the Site URL to `http://localhost:5173` and add it under allowed redirect URLs.
5. Configure the environment files below. `.env` files are ignored by Git; do not commit them.

No direct PostgreSQL connection string is needed: the backend uses the Supabase JavaScript client and Supabase APIs.

## Environment files

Create each local file from its example:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item frontend\.env.example frontend\.env
```

Set these values in `frontend/.env`:

```env
VITE_API_URL=http://localhost:5000/api
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The app also accepts `VITE_SUPABASE_ANON_KEY` for projects still using the legacy anon key.

Set these values in `backend/.env`:

```env
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SECRET_KEY=your-server-only-secret-key
FILE_ENCRYPTION_KEY=your-base64-encoded-32-byte-key
MAX_FILE_SIZE_MB=25
```

For older Supabase projects, `SUPABASE_SERVICE_ROLE_KEY` is accepted instead of `SUPABASE_SECRET_KEY`. Do not configure both unless you have a specific reason. Never use either server-only key in the frontend.

Generate the AES key in PowerShell, then paste the output into `FILE_ENCRYPTION_KEY`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

There is no custom JWT signing secret: Supabase issues and verifies user access tokens. The backend requires only the Supabase server key and file encryption key.

## Run on Windows

Backend terminal:

```powershell
Set-Location .\backend
npm install
npm start
```

Frontend terminal:

```powershell
Set-Location .\frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`. If that port is busy Vite may choose another; add that exact origin to `FRONTEND_URL` and the CORS allowlist in `backend/server.js`, then restart the backend.

The API health endpoint is `http://localhost:5000/api/health`; it checks whether Supabase PostgreSQL is reachable and the migration has been applied.

## Deploy the frontend to Vercel

This app encrypts uploads in its Express backend and currently allows files up to 25 MB. Vercel's serverless request-body limit is about 4.5 MB, so deploy the frontend to Vercel and deploy the Express backend as a separate Node.js web service (for example, on Render or Railway). This keeps the existing upload behavior; do not deploy the Express API as a Vercel function unless you intentionally reduce the upload limit.

1. Push the project to a GitHub repository and import it in Vercel.
2. Set the Vercel project's **Root Directory** to `frontend`. Use the Vite framework preset, build command `npm run build`, and output directory `dist`.
3. In **Settings > Environment Variables**, add the following for the environments you will deploy:

   ```env
   VITE_API_URL=https://your-backend-host.example.com/api
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

   Set `VITE_API_URL` to the public backend URL, including `/api`. These `VITE_` values are included in the browser build; never put a Supabase secret/service-role key or the file-encryption key here. Redeploy after changing environment variables.
4. Deploy the `backend` directory as a Node.js web service. Set its root directory to `backend`, install command to `npm install`, and start command to `npm start`. Configure these backend environment variables in that host's dashboard:

   ```env
   NODE_ENV=production
   FRONTEND_URL=https://your-vercel-project.vercel.app
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SECRET_KEY=your-server-only-secret-key
   FILE_ENCRYPTION_KEY=your-base64-encoded-32-byte-key
   MAX_FILE_SIZE_MB=25
   ```

   The host must provide `PORT`; if it does not, set `PORT=5000`. Keep `FILE_ENCRYPTION_KEY` identical to the key used for any files already stored. Keep both server-only secrets in the backend host's environment settings, never in Vercel's `VITE_` variables.
5. In Supabase **Authentication > URL Configuration**, set the Site URL to your Vercel production URL and add that URL to the allowed redirect URLs. Set the backend's `FRONTEND_URL` to the same exact origin so CORS permits the deployed site.
6. After both services deploy, visit `https://your-backend-host.example.com/api/health`. It should report `"status":"ok"` and `"supabase":"connected"`. Then open the Vercel URL and test registration, login, upload, sharing, and download.

The included [`frontend/vercel.json`](frontend/vercel.json) rewrites browser routes to the React entry point so refreshing an in-app route works.

## Use the application

1. Register with a name, email, password, and password confirmation.
2. If email confirmation is enabled, open the confirmation email, then sign in.
3. Upload a small file. The backend validates its size, encrypts its bytes with a new AES-GCM IV, and stores ciphertext in the private bucket.
4. Sign up a second account, then share the file using that account's email.
5. Sign in as the recipient and use **Shared with me** to download and decrypt it.
6. Sign in as the owner and revoke the share from **Shared by me**. Later downloads are denied; previously downloaded copies cannot be recalled.

## Tests and checks

```powershell
Set-Location .\backend
npm test
Set-Location ..\frontend
npm run build
```

Automated local tests cover AES-GCM round trips/tamper detection and environment validation. Live registration, email confirmation, Storage operations, and RLS behavior require manual testing against your Supabase project with two test accounts. Confirm that one user cannot read another user's files or access a revoked/expired share.

## Security notes

- Keep `backend/.env` private. Rotate the Supabase server key if it has been committed, shared, or exposed.
- The backend validates every access token and performs ownership/share checks before download.
- The Storage bucket is private; no permanent public file URLs are created.
- The server-side encryption key is required to decrypt files. Back it up securely; losing it makes existing uploads unrecoverable.
- This learning project has not been independently audited. Use HTTPS and obtain a professional security review before deployment.
