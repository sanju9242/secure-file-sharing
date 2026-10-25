# Security model and limitations

- Supabase Auth handles password storage and authentication; the application never stores plaintext passwords.
- File contents are encrypted using AES-256-GCM with random per-file nonces.
- GCM authentication tags detect ciphertext modification.
- Access checks run on the backend for file downloads.
- Encrypted files are stored outside the frontend public directory.
- File names are sanitized before use in download headers.
- Protected REST requests carry a Supabase access token in the Authorization bearer header; the backend verifies it with Supabase Auth.
- The backend Supabase secret key and file encryption key are stored only in backend environment variables.

Limitations:
- This project has not undergone an independent security audit.
- The backend can decrypt stored files because it controls the encryption key. This is not end-to-end encryption.
- For deployment, add HTTPS, CSRF defenses appropriate to the deployment, robust key rotation and backup procedures, malware scanning, monitoring, and professional security review.
- Revoking sharing blocks future app downloads but cannot erase copies already downloaded by a recipient.
