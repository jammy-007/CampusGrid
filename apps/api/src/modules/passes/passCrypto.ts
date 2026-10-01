import crypto from 'node:crypto';
import {
  type PassTokenPayload,
  passTokenPayloadSchema,
  base64UrlEncodeBytes,
  base64UrlEncodeString,
  base64UrlDecodeToBytes,
  base64UrlDecodeToString,
} from '@campusgrid/shared';

// ASN.1 DER prefixes for Ed25519
const SPKI_ED25519_HEADER = Buffer.from('302a300506032b6570032100', 'hex'); // 12 bytes
const PKCS8_ED25519_HEADER = Buffer.from('302e020100300506032b657004220420', 'hex'); // 16 bytes

let defaultPrivateKey: crypto.KeyObject | null = null;
let defaultPublicKey: crypto.KeyObject | null = null;
let defaultRawPublicKey: Uint8Array | null = null;

/**
 * Initializes or retrieves the default Ed25519 keys from process.env or falls back to
 * a generated keypair in dev/test.
 */
export function getPassSigningKeys(): {
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  rawPublicKey: Uint8Array;
} {
  if (defaultPrivateKey && defaultPublicKey && defaultRawPublicKey) {
    return {
      privateKey: defaultPrivateKey,
      publicKey: defaultPublicKey,
      rawPublicKey: defaultRawPublicKey,
    };
  }

  const envPriv = process.env.PASS_SIGNING_PRIVATE_KEY?.trim();
  const envPub = process.env.PASS_SIGNING_PUBLIC_KEY?.trim();

  if (envPriv && envPub) {
    try {
      const priv = parsePrivateKey(envPriv);
      const { pubKeyObject, rawPubBytes } = parsePublicKeyWithBytes(envPub);
      defaultPrivateKey = priv;
      defaultPublicKey = pubKeyObject;
      defaultRawPublicKey = rawPubBytes;
      return { privateKey: priv, publicKey: pubKeyObject, rawPublicKey: rawPubBytes };
    } catch (err) {
      console.warn('[passCrypto] Failed to parse keys from env, generating ephemeral keypair:', err);
    }
  }

  // Generate ephemeral keypair if not configured
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
  const rawPub = spkiDer.subarray(spkiDer.length - 32);

  defaultPrivateKey = privateKey;
  defaultPublicKey = publicKey;
  defaultRawPublicKey = new Uint8Array(rawPub);

  return {
    privateKey: defaultPrivateKey,
    publicKey: defaultPublicKey,
    rawPublicKey: defaultRawPublicKey,
  };
}

/** Helper to parse private key from PEM, base64 DER, hex, or raw 32-byte seed. */
export function parsePrivateKey(input: string): crypto.KeyObject {
  const trimmed = input.trim();
  if (trimmed.includes('-----BEGIN')) {
    return crypto.createPrivateKey({ key: trimmed, format: 'pem' });
  }

  let buf: Buffer;
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === 64) {
    buf = Buffer.from(trimmed, 'hex');
  } else {
    buf = Buffer.from(trimmed, 'base64');
  }

  if (buf.length === 32) {
    // 32-byte raw seed, prepend PKCS8 header
    return crypto.createPrivateKey({
      key: Buffer.concat([PKCS8_ED25519_HEADER, buf]),
      format: 'der',
      type: 'pkcs8',
    });
  } else if (buf.length === 48 || buf.length > 32) {
    return crypto.createPrivateKey({
      key: buf,
      format: 'der',
      type: 'pkcs8',
    });
  }

  throw new Error(`Invalid private key length: ${buf.length} bytes`);
}

/** Helper to parse public key and return both crypto.KeyObject and raw 32-byte Uint8Array. */
export function parsePublicKeyWithBytes(input: string): {
  pubKeyObject: crypto.KeyObject;
  rawPubBytes: Uint8Array;
} {
  const trimmed = input.trim();
  if (trimmed.includes('-----BEGIN')) {
    const keyObj = crypto.createPublicKey({ key: trimmed, format: 'pem' });
    const der = keyObj.export({ type: 'spki', format: 'der' });
    const rawPub = der.subarray(der.length - 32);
    return { pubKeyObject: keyObj, rawPubBytes: new Uint8Array(rawPub) };
  }

  let buf: Buffer;
  if (/^[0-9a-fA-F]+$/.test(trimmed) && (trimmed.length === 64 || trimmed.length === 88)) {
    buf = Buffer.from(trimmed, 'hex');
  } else {
    buf = Buffer.from(trimmed, 'base64');
  }

  let rawBytes: Buffer;
  let keyObj: crypto.KeyObject;

  if (buf.length === 32) {
    rawBytes = buf;
    keyObj = crypto.createPublicKey({
      key: Buffer.concat([SPKI_ED25519_HEADER, buf]),
      format: 'der',
      type: 'spki',
    });
  } else if (buf.length === 44 || buf.length > 32) {
    rawBytes = buf.subarray(buf.length - 32);
    keyObj = crypto.createPublicKey({
      key: buf,
      format: 'der',
      type: 'spki',
    });
  } else {
    throw new Error(`Invalid public key length: ${buf.length} bytes`);
  }

  return { pubKeyObject: keyObj, rawPubBytes: new Uint8Array(rawBytes) };
}

/** Get the public key string to distribute in the scanner offline bundle (hex encoded 32 bytes). */
export function getPassSigningPublicKeyHex(): string {
  const { rawPublicKey } = getPassSigningKeys();
  return Buffer.from(rawPublicKey).toString('hex');
}

/**
 * Signs a pass token payload into the format:
 * Token = base64url(JSON payload) + "." + base64url(signature)
 */
export function signPassToken(
  payload: PassTokenPayload,
  customPrivateKey?: crypto.KeyObject,
): string {
  const privKey = customPrivateKey ?? getPassSigningKeys().privateKey;
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncodeString(payloadJson);
  const sigBuffer = crypto.sign(null, Buffer.from(payloadB64, 'ascii'), privKey);
  const sigB64 = base64UrlEncodeBytes(new Uint8Array(sigBuffer));
  return `${payloadB64}.${sigB64}`;
}

export interface VerifyTokenOptions {
  eventId?: string;
  clockSkewSeconds?: number;
  nowSeconds?: number;
  customPublicKey?: crypto.KeyObject;
}

export interface VerifyTokenResult {
  valid: boolean;
  payload?: PassTokenPayload;
  reason?: string;
}

/**
 * Verifies a pass token against the Ed25519 public key.
 * Allows 30 s clock skew by default (as specified in contract).
 */
export function verifyPassToken(
  token: string,
  options?: VerifyTokenOptions,
): VerifyTokenResult {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'INVALID_TOKEN_FORMAT' };
  }
  const [payloadB64, sigB64] = parts;
  let sigBytes: Uint8Array;
  try {
    sigBytes = base64UrlDecodeToBytes(sigB64);
  } catch {
    return { valid: false, reason: 'INVALID_SIGNATURE_ENCODING' };
  }

  const pubKey = options?.customPublicKey ?? getPassSigningKeys().publicKey;
  const verified = crypto.verify(
    null,
    Buffer.from(payloadB64, 'ascii'),
    pubKey,
    Buffer.from(sigBytes),
  );

  if (!verified) {
    return { valid: false, reason: 'SIGNATURE_INVALID' };
  }

  let payloadJson: string;
  try {
    payloadJson = base64UrlDecodeToString(payloadB64);
  } catch {
    return { valid: false, reason: 'INVALID_PAYLOAD_ENCODING' };
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(payloadJson);
  } catch {
    return { valid: false, reason: 'INVALID_PAYLOAD_JSON' };
  }

  const parseResult = passTokenPayloadSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    return { valid: false, reason: 'INVALID_PAYLOAD_SCHEMA' };
  }
  const payload = parseResult.data;

  const now = options?.nowSeconds ?? Math.floor(Date.now() / 1000);
  const clockSkew = options?.clockSkewSeconds ?? 30;

  if (now > payload.exp + clockSkew) {
    return { valid: false, reason: 'TOKEN_EXPIRED', payload };
  }

  if (options?.eventId && payload.eid !== options.eventId) {
    return { valid: false, reason: 'WRONG_EVENT', payload };
  }

  return { valid: true, payload };
}
