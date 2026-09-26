import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './helpers';

describe('app', () => {
  it('serves /api/health', async () => {
    const res = await request(app).get('/api/health');
    expect(res.body).toEqual({ ok: true });
  });

  it('returns the contract error shape for unknown routes and bad JSON', async () => {
    const missing = await request(app).get('/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');

    const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{"oops');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_JSON');
  });
});
