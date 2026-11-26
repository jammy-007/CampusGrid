import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  base64UrlEncodeBytes,
  base64UrlEncodeString,
  type CheckinBundleDTO,
  type PassTokenPayload,
} from '@campusgrid/shared';
import { verifyScanToken } from '../src/features/checkin/scannerVerify';

function makeKeypair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  return {
    privateKey,
    publicKeyB64: base64UrlEncodeBytes(new Uint8Array(spkiDer)),
  };
}

function signPayload(payload: PassTokenPayload, privateKey: crypto.KeyObject): string {
  const payloadB64 = base64UrlEncodeString(JSON.stringify(payload));
  const sig = crypto.sign(null, Buffer.from(payloadB64, 'utf8'), privateKey);
  return `${payloadB64}.${base64UrlEncodeBytes(new Uint8Array(sig))}`;
}

function makeBundle(publicKey: string, overrides: Partial<CheckinBundleDTO> = {}): CheckinBundleDTO {
  return {
    eventId: 'evt_1',
    checkoutOpensAt: null,
    publicKey,
    alreadyCheckedIn: [],
    alreadyCheckedOut: [],
    registrations: [
      {
        rid: 'reg_1',
        uid: 'usr_1',
        name: 'Alice Student',
        usn: '1BY23CS001',
      },
    ],
    ...overrides,
  };
}

describe('verifyScanToken (offline Ed25519 QR verification)', () => {
  const nowSec = () => Math.floor(Date.now() / 1000);

  it('accepts a valid signed check-in token', async () => {
    const { privateKey, publicKeyB64 } = makeKeypair();
    const bundle = makeBundle(publicKeyB64);
    const token = signPayload(
      {
        v: 1,
        rid: 'reg_1',
        eid: 'evt_1',
        uid: 'usr_1',
        name: 'Alice Student',
        usn: '1BY23CS001',
        iat: nowSec(),
        exp: nowSec() + 60,
        jti: 'jti_1',
      },
      privateKey,
    );

    const res = await verifyScanToken(token, bundle, new Set());
    expect(res.valid).toBe(true);
    expect(res.attendee?.rid).toBe('reg_1');
  });

  it('rejects malformed tokens and tampered signatures', async () => {
    const { publicKeyB64 } = makeKeypair();
    const bundle = makeBundle(publicKeyB64);

    const badFormat = await verifyScanToken('not-a-valid-token', bundle, new Set());
    expect(badFormat.valid).toBe(false);
    expect(badFormat.reason).toBe('INVALID_FORMAT');

    const otherKey = makeKeypair();
    const forged = signPayload(
      {
        v: 1,
        rid: 'reg_1',
        eid: 'evt_1',
        uid: 'usr_1',
        name: 'Alice Student',
        usn: '1BY23CS001',
        iat: nowSec(),
        exp: nowSec() + 60,
        jti: 'jti_2',
      },
      otherKey.privateKey,
    );
    const badSig = await verifyScanToken(forged, bundle, new Set());
    expect(badSig.valid).toBe(false);
    expect(badSig.reason).toBe('SIGNATURE_INVALID');
  });

  it('rejects wrong event, expired token, and unknown registration', async () => {
    const { privateKey, publicKeyB64 } = makeKeypair();
    const bundle = makeBundle(publicKeyB64);

    const wrongEvent = signPayload(
      {
        v: 1,
        rid: 'reg_1',
        eid: 'evt_other',
        uid: 'usr_1',
        name: 'Alice Student',
        usn: null,
        iat: nowSec(),
        exp: nowSec() + 60,
        jti: 'jti_3',
      },
      privateKey,
    );
    expect((await verifyScanToken(wrongEvent, bundle, new Set())).reason).toBe('WRONG_EVENT');

    const expired = signPayload(
      {
        v: 1,
        rid: 'reg_1',
        eid: 'evt_1',
        uid: 'usr_1',
        name: 'Alice Student',
        usn: null,
        iat: nowSec() - 300,
        exp: nowSec() - 120,
        jti: 'jti_4',
      },
      privateKey,
    );
    expect((await verifyScanToken(expired, bundle, new Set())).reason).toBe('TOKEN_EXPIRED');

    const notInBundle = signPayload(
      {
        v: 1,
        rid: 'reg_unknown',
        eid: 'evt_1',
        uid: 'usr_99',
        name: 'Ghost',
        usn: null,
        iat: nowSec(),
        exp: nowSec() + 60,
        jti: 'jti_5',
      },
      privateKey,
    );
    expect((await verifyScanToken(notInBundle, bundle, new Set())).reason).toBe('NOT_IN_BUNDLE');
  });

  it('enforces two-stage check-in and check-out state and checkoutOpensAt window', async () => {
    const { privateKey, publicKeyB64 } = makeKeypair();
    const token = signPayload(
      {
        v: 1,
        rid: 'reg_1',
        eid: 'evt_1',
        uid: 'usr_1',
        name: 'Alice Student',
        usn: '1BY23CS001',
        iat: nowSec(),
        exp: nowSec() + 60,
        jti: 'jti_6',
      },
      privateKey,
    );

    const openBundle = makeBundle(publicKeyB64, {
      checkoutOpensAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const earlyBundle = makeBundle(publicKeyB64, {
      checkoutOpensAt: new Date(Date.now() + 3_600_000).toISOString(),
    });

    // Duplicate check-in rejected
    expect((await verifyScanToken(token, openBundle, new Set(['reg_1']), new Set(), 'CHECK_IN')).reason).toBe(
      'ALREADY_CHECKED_IN',
    );

    // Check-out before check-in rejected
    expect((await verifyScanToken(token, openBundle, new Set(), new Set(), 'CHECK_OUT')).reason).toBe(
      'NOT_CHECKED_IN',
    );

    // Check-out before checkoutOpensAt rejected
    expect((await verifyScanToken(token, earlyBundle, new Set(['reg_1']), new Set(), 'CHECK_OUT')).reason).toBe(
      'CHECKOUT_TOO_EARLY',
    );

    // Valid check-out accepted
    expect((await verifyScanToken(token, openBundle, new Set(['reg_1']), new Set(), 'CHECK_OUT')).valid).toBe(true);

    // Duplicate check-out rejected
    expect(
      (await verifyScanToken(token, openBundle, new Set(['reg_1']), new Set(['reg_1']), 'CHECK_OUT')).reason,
    ).toBe('ALREADY_CHECKED_OUT');
  });
});
