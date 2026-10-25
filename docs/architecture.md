# Architecture

Browser (React/Vite) → Supabase Auth and Express REST API → Supabase PostgreSQL and private encrypted Supabase Storage.

Upload flow:
1. Authenticated user uploads a file over HTTP in local development (use HTTPS in deployment).
2. Backend validates upload size and creates a random storage identifier.
3. Backend encrypts bytes using AES-256-GCM with a random 96-bit nonce and 256-bit key.
4. Encrypted bytes are uploaded to the private `encrypted-files` bucket; PostgreSQL stores `original_name`, storage path, MIME type, size, owner, and algorithm metadata.

Download flow:
1. Express verifies the Supabase access token and checks file ownership or an active, unexpired share.
2. Backend reads encrypted bytes and verifies the GCM authentication tag during decryption.
3. Only after successful verification, the plaintext is returned as a download.

This is server-side encryption because the server has the encryption key. It is not end-to-end encryption.
