import { afterEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import worker from '../../api/worker';
import { credentialVersion } from '../../api/platform';

afterEach(() => vi.unstubAllGlobals());

describe('Worker authorization and rotation', () => {
  it('keeps health public while private routes require API and admin credentials', async () => {
    const env = { SPILL_API_SECRET: 'local-api' };
    expect((await worker.fetch(new Request('https://local/health'), env)).status).toBe(200);
    expect((await worker.fetch(new Request('https://local/admin/auth/me'), env)).status).toBe(401);
    expect((await worker.fetch(new Request('https://local/admin/auth/me', { headers: { Authorization: 'Bearer local-api' } }), env)).status).toBe(401);
  });

  it('invalidates a previously valid token immediately when the environment password changes', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const oldVersion = await credentialVersion({ SPILL_ADMIN_PASSWORD: 'old-local-password' });
    const prune = vi.fn(async () => ({ success: true }));
    const env = {
      SPILL_API_SECRET: 'local-api', SPILL_ADMIN_PASSWORD: 'new-local-password',
      DB: { prepare(sql) {
        return { bind() { return this; },
          async first() { return { token: 'old-token', expires_at: '2099-01-01', credential_version: oldVersion, id: 'admin', role: 'admin' }; },
          run: sql.startsWith('DELETE') ? prune : vi.fn(),
        };
      } },
    };
    const response = await worker.fetch(new Request('https://local/admin/auth/me', { headers: { Authorization: 'Bearer local-api', 'X-Admin-Token': 'old-token' } }), env);
    expect(response.status).toBe(401);
    expect(prune).toHaveBeenCalledOnce();
    expect(await response.text()).not.toContain('password');
  });

  it('retains a valid session when the credential has not changed', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const version = await credentialVersion({ SPILL_ADMIN_PASSWORD: 'local-password' });
    const env = { SPILL_API_SECRET: 'local-api', SPILL_ADMIN_PASSWORD: 'local-password', DB: {
      prepare() { return { bind() { return this; }, async first() { return { token: 'token', expires_at: '2099-01-01', credential_version: version, id: 'admin', role: 'admin' }; } }; },
    } };
    const response = await worker.fetch(new Request('https://local/admin/auth/me', { headers: { Authorization: 'Bearer local-api', 'X-Admin-Token': 'token' } }), env);
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain(version);
  });
});
