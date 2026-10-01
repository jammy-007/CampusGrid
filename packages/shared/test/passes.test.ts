import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import * as noble from '@noble/ed25519';
import {
  base64UrlDecodeToBytes,
  base64UrlDecodeToString,
  base64UrlEncodeBytes,
  base64UrlEncodeString,
  type PassTokenPayload,
  passTokenPayloadSchema,
  checkinSyncRequestSchema,
} from '../src';

describe('Passes & Ed25519 Token Signing / Verification', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const rawPub = new Uint8Array(spkiDer.subarray(spkiDer.length - 32));

  function signToken(payload: PassTokenPayload) {
    const payloadJson = JSON.stringify(payload);
    const payloadB64 = base64UrlEncodeString(payloadJson);
    const sigBuffer = crypto.sign(null, Buffer.from(payloadB64, 'ascii'), privateKey);
    const sigB64 = base64UrlEncodeBytes(new Uint8Array(sigBuffer));
    return `${payloadB64}.${sigB64}`;
  }

  async function verifyToken(
    token: string,
    options?: { expectedEventId?: string; now?: number; clockSkew?: number },
  ) {
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false, reason: 'INVALID_FORMAT' };
    const [payloadB64, sigB64] = parts;

    const sigBytes = base64UrlDecodeToBytes(sigB64);
    const msgBytes = new TextEncoder().encode(payloadB64);

    // Verify signature with @noble/ed25519
    const sigValid = await noble.verifyAsync(sigBytes, msgBytes, rawPub);
    if (!sigValid) return { valid: false, reason: 'SIGNATURE_INVALID' };

    const payloadJson = base64UrlDecodeToString(payloadB64);
    const raw = JSON.parse(payloadJson);
    const parsed = passTokenPayloadSchema.safeParse(raw);
    if (!parsed.success) return { valid: false, reason: 'SCHEMA_INVALID' };

    const payload = parsed.data;
    const now = options?.now ?? Math.floor(Date.now() / 1000);
    const clockSkew = options?.clockSkew ?? 30;

    if (now > payload.exp + clockSkew) {
      return { valid: false, reason: 'TOKEN_EXPIRED', payload };
    }

    if (options?.expectedEventId && payload.eid !== options.expectedEventId) {
      return { valid: false, reason: 'WRONG_EVENT', payload };
    }

    return { valid: true, payload };
  }

  it('signs and verifies a valid token successfully', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: PassTokenPayload = {
      v: 1,
      rid: 'reg-123',
      eid: 'event-456',
      uid: 'user-789',
      name: 'Alice Student',
      iat: now,
      exp: now + 60,
    };

    const token = signToken(payload);
    expect(token).toContain('.');

    const result = await verifyToken(token, { expectedEventId: 'event-456', now });
    expect(result.valid).toBe(true);
    expect(result.payload?.name).toBe('Alice Student');
    expect(result.payload?.rid).toBe('reg-123');
  });

  it('rejects tampered signature', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: PassTokenPayload = {
      v: 1,
      rid: 'reg-123',
      eid: 'event-456',
      uid: 'user-789',
      name: 'Alice Student',
      iat: now,
      exp: now + 60,
    };

    const token = signToken(payload);
    const [payloadB64, sigB64] = token.split('.');

    const sigBytes = base64UrlDecodeToBytes(sigB64);
    sigBytes[0] ^= 0xff;
    const tamperedSig = base64UrlEncodeBytes(sigBytes);
    const tamperedToken = `${payloadB64}.${tamperedSig}`;

    const result = await verifyToken(tamperedToken, { expectedEventId: 'event-456', now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('SIGNATURE_INVALID');
  });

  it('rejects tampered payload without corresponding valid signature', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: PassTokenPayload = {
      v: 1,
      rid: 'reg-123',
      eid: 'event-456',
      uid: 'user-789',
      name: 'Alice Student',
      iat: now,
      exp: now + 60,
    };

    const token = signToken(payload);
    const [, sigB64] = token.split('.');

    // Create a modified payload with a different name
    const tamperedPayload: PassTokenPayload = { ...payload, name: 'Attacker Impersonator' };
    const tamperedPayloadB64 = base64UrlEncodeString(JSON.stringify(tamperedPayload));
    const tamperedToken = `${tamperedPayloadB64}.${sigB64}`;

    const result = await verifyToken(tamperedToken, { expectedEventId: 'event-456', now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('SIGNATURE_INVALID');
  });

  it('rejects expired token beyond the 30s clock skew window', async () => {
    const pastTime = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago
    const payload: PassTokenPayload = {
      v: 1,
      rid: 'reg-123',
      eid: 'event-456',
      uid: 'user-789',
      name: 'Alice Student',
      iat: pastTime,
      exp: pastTime + 60, // expired 60s ago
    };

    const token = signToken(payload);
    const now = Math.floor(Date.now() / 1000);

    const result = await verifyToken(token, { expectedEventId: 'event-456', now, clockSkew: 30 });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('TOKEN_EXPIRED');
  });

  it('accepts token within the 30s clock skew window', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: PassTokenPayload = {
      v: 1,
      rid: 'reg-123',
      eid: 'event-456',
      uid: 'user-789',
      name: 'Alice Student',
      iat: now - 75,
      exp: now - 15, // expired 15s ago, which is <= 30s skew
    };

    const token = signToken(payload);

    const result = await verifyToken(token, { expectedEventId: 'event-456', now, clockSkew: 30 });
    expect(result.valid).toBe(true);
  });

  it('rejects token presented at the wrong event', async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload: PassTokenPayload = {
      v: 1,
      rid: 'reg-123',
      eid: 'event-A',
      uid: 'user-789',
      name: 'Alice Student',
      iat: now,
      exp: now + 60,
    };

    const token = signToken(payload);

    const result = await verifyToken(token, { expectedEventId: 'event-B', now });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('WRONG_EVENT');
  });

  it('validates checkinSyncRequestSchema', () => {
    const valid = {
      scans: [
        {
          clientScanId: 'uuid-1',
          rid: 'reg-1',
          scannedAt: new Date().toISOString(),
          deviceId: 'device-phone',
        },
      ],
    };
    expect(checkinSyncRequestSchema.safeParse(valid).success).toBe(true);
    expect(checkinSyncRequestSchema.safeParse({ scans: [{ clientScanId: '' }] }).success).toBe(false);
  });
});
