import { z } from 'zod';

/**
 * Dynamic QR Pass Token payload.
 * Token = base64url(JSON payload) + "." + base64url(signature)
 * exp = iat + 60s
 */
export const passTokenPayloadSchema = z.object({
  v: z.literal(1),
  rid: z.string().min(1),
  eid: z.string().min(1),
  uid: z.string().min(1),
  name: z.string().min(1),
  iat: z.number().int(),
  exp: z.number().int(),
});
export type PassTokenPayload = z.infer<typeof passTokenPayloadSchema>;

export interface PassTokenResponse {
  token: string;
  expiresIn: number;
}

export interface EventPassDTO {
  id: string;
  registrationId: string;
  secretVersion: number;
  issuedAt: string;
  revokedAt: string | null;
}

/** Cross-platform base64url encoding and decoding utilities. */
export function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlEncodeString(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64url');
  }
  const bytes = new TextEncoder().encode(str);
  return base64UrlEncodeBytes(bytes);
}

export function base64UrlDecodeToBytes(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) {
    b64 += '=';
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64UrlDecodeToString(b64url: string): string {
  const bytes = base64UrlDecodeToBytes(b64url);
  return new TextDecoder().decode(bytes);
}
