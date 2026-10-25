# API quick reference

Base URL: `http://localhost:5000/api`

Supabase Auth registration, login, and logout run in the frontend Supabase client. Protected API requests send `Authorization: Bearer <supabase-access-token>`; the backend verifies that token with Supabase Auth.

- `GET /health`
- `GET /auth/me` returns the authenticated user, or `{ "user": null }` if no bearer token is provided.
- `POST /files/upload` multipart form field `file`
- `GET /files`
- `GET /files/:id/download`
- `DELETE /files/:id`
- `POST /shares` JSON `{ "fileId": "...", "recipientEmail": "...", "expiresAt": null }`
- `GET /shares/sent`
- `GET /shares/received`
- `POST /shares/:id/revoke`
