import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api, ApiError } from '../client/src/api.js';

test('invalid JSON is rejected instead of becoming workspace data, preserving HTTP status', async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const status of [200, 401]) {
      globalThis.fetch = async () =>
        new Response('<html>Upstream response unavailable</html>', {
          status,
          headers: { 'Content-Type': 'text/html' },
        });
      await assert.rejects(api('/workspace'), (error: unknown) => {
        assert(error instanceof ApiError);
        assert.equal(error.status, status);
        assert.match(error.message, /dữ liệu không hợp lệ/);
        return true;
      });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
