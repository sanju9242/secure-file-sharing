import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAuth } from '../src/security.js';

test('requireAuth rejects requests without a Supabase bearer token', async () => {
  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
  let nextCalled = false;

  await requireAuth({ headers: {}, cookies: { sfs_token: 'legacy-token' }, userId: 'spoofed-id' }, response, () => {
    nextCalled = true;
  });

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, 'Please log in.');
  assert.equal(nextCalled, false);
});