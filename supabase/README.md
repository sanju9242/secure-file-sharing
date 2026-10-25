# Supabase setup

1. Create or open a project at [supabase.com](https://supabase.com/).
2. In **SQL Editor**, run [`migrations/202610250001_secure_share.sql`](migrations/202610250001_secure_share.sql).
3. In **Project Settings > API Keys**, copy the project URL and a publishable key. Use the legacy anon key if that is what the project provides.
4. Copy a server-only secret key from the same settings page. Never place it in the frontend or commit it.
5. In **Authentication > Providers**, enable Email. Configure the email-confirmation behavior you want. For confirmation links, set the site URL to `http://localhost:5173` and add that URL to the allowed redirect URLs.

The migration creates the `profiles`, `files`, and `file_shares` tables, RLS policies, the `user_file_summary` view, and the private `encrypted-files` storage bucket.

Registration uses Supabase Auth and stores the display name in user metadata. The database trigger mirrors name and email into `profiles`. The backend verifies each Supabase access token and uses its server-only key for data and private storage operations; authorization is enforced again in the Express routes.

The backend encrypts file bytes with AES-256-GCM before upload. Its encryption key remains server-side, so this is server-side encryption, not end-to-end encryption. RLS and Storage policy behavior should be manually checked in your own Supabase project with at least two test accounts.
