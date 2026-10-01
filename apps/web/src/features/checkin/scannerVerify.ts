import * as noble from '@noble/ed25519';
import {
  base64UrlDecodeToBytes,
  base64UrlDecodeToString,
  passTokenPayloadSchema,
  type CheckinAttendeeDTO,
  type CheckinBundleDTO,
  type PassTokenPayload,
} from '@campusgrid/shared';

function parsePublicKeyTo32Bytes(keyStr: string): Uint8Array {
  const trimmed = keyStr.trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === 64) {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      bytes[i] = parseInt(trimmed.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }

  const decoded = base64UrlDecodeToBytes(trimmed);
  if (decoded.length === 32) return decoded;
  if (decoded.length === 44) return decoded.subarray(12);
  if (decoded.length > 32) return decoded.subarray(decoded.length - 32);
  throw new Error(`Unexpected public key length: ${decoded.length}`);
}

export type ScanVerificationReason =
  | 'INVALID_FORMAT'
  | 'SIGNATURE_INVALID'
  | 'SCHEMA_INVALID'
  | 'WRONG_EVENT'
  | 'TOKEN_EXPIRED'
  | 'NOT_IN_BUNDLE'
  | 'ALREADY_CHECKED_IN';

export interface ScanVerificationResult {
  valid: boolean;
  reason?: ScanVerificationReason;
  message: string;
  attendee?: CheckinAttendeeDTO;
  payload?: PassTokenPayload;
}

/**
 * Entirely client-side verification of a scanned dynamic pass token.
 * 1. Checks token format: payloadB64.sigB64
 * 2. Checks Ed25519 signature validity against bundle.publicKey
 * 3. Checks eventId matches bundle.eventId
 * 4. Checks expiry (with 30s clock skew tolerance)
 * 5. Checks registration exists in bundle.registrations
 * 6. Checks registration is not already checked in
 */
export async function verifyScanToken(
  token: string,
  bundle: CheckinBundleDTO,
  checkedInSet: Set<string>,
): Promise<ScanVerificationResult> {
  const trimmed = token.trim();
  const parts = trimmed.split('.');

  if (parts.length !== 2) {
    return {
      valid: false,
      reason: 'INVALID_FORMAT',
      message: 'Invalid pass token format',
    };
  }

  const [payloadB64, sigB64] = parts;

  // 1. Signature verification
  let pubKeyBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    pubKeyBytes = parsePublicKeyTo32Bytes(bundle.publicKey);
    sigBytes = base64UrlDecodeToBytes(sigB64);
  } catch {
    return {
      valid: false,
      reason: 'SIGNATURE_INVALID',
      message: 'Invalid signature encoding',
    };
  }

  const msgBytes = new TextEncoder().encode(payloadB64);

  try {
    const isSigValid = await noble.verifyAsync(sigBytes, msgBytes, pubKeyBytes);
    if (!isSigValid) {
      return {
        valid: false,
        reason: 'SIGNATURE_INVALID',
        message: 'Invalid signature — pass may be forged or tampered',
      };
    }
  } catch {
    return {
      valid: false,
      reason: 'SIGNATURE_INVALID',
      message: 'Signature verification failed',
    };
  }

  // 2. Payload parsing & schema validation
  let rawJson: string;
  try {
    rawJson = base64UrlDecodeToString(payloadB64);
  } catch {
    return {
      valid: false,
      reason: 'SCHEMA_INVALID',
      message: 'Failed to decode pass payload',
    };
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawJson);
  } catch {
    return {
      valid: false,
      reason: 'SCHEMA_INVALID',
      message: 'Invalid payload JSON structure',
    };
  }

  const parsed = passTokenPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    return {
      valid: false,
      reason: 'SCHEMA_INVALID',
      message: 'Pass payload schema invalid',
    };
  }
  const payload = parsed.data;

  // Find attendee in bundle
  const attendee = bundle.registrations.find((r) => r.rid === payload.rid);

  // 3. Event check
  if (payload.eid !== bundle.eventId) {
    return {
      valid: false,
      reason: 'WRONG_EVENT',
      message: 'This pass is for a different event',
      attendee,
      payload,
    };
  }

  // 4. Expiry check (with 30 s clock skew tolerance)
  const now = Math.floor(Date.now() / 1000);
  if (now > payload.exp + 30) {
    return {
      valid: false,
      reason: 'TOKEN_EXPIRED',
      message: 'Dynamic QR pass expired. Ask attendee to refresh their screen.',
      attendee,
      payload,
    };
  }

  // 5. Registration existence check
  if (!attendee) {
    return {
      valid: false,
      reason: 'NOT_IN_BUNDLE',
      message: 'Registration not found in event roster',
      payload,
    };
  }

  // 6. Already scanned check
  if (checkedInSet.has(payload.rid)) {
    return {
      valid: false,
      reason: 'ALREADY_CHECKED_IN',
      message: 'Already checked in',
      attendee,
      payload,
    };
  }

  return {
    valid: true,
    attendee,
    payload,
    message: 'Check-in confirmed',
  };
}
