import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Device credential handling for the Hermes voice relay.
//
// A paired device holds a 32-byte secret. That secret is the only thing the
// watch ever needs — it is not a bearer token: it never travels on the wire
// after pairing, it only ever signs requests. Server-side the secret is sealed
// with AES-256-GCM under a key derived from AUTH_SECRET, so a leaked database
// dump does not hand an attacker the ability to forge captures.
// ---------------------------------------------------------------------------

const KEY_INFO = 'hermes.device-secret.v1';
const SEALED_VERSION = 'v1';

// HKDF-SHA256 from AUTH_SECRET. Deliberately derived rather than a separate env
// var: one less secret to manage, and rotating AUTH_SECRET (which already
// invalidates every session) also invalidates every device pairing.
function sealingKey(authSecret: string): Buffer {
  return Buffer.from(
    crypto.hkdfSync('sha256', Buffer.from(authSecret, 'utf8'), Buffer.alloc(0), Buffer.from(KEY_INFO), 32),
  );
}

export function newDeviceSecret(): string {
  return b64url(crypto.randomBytes(32));
}

/** AES-256-GCM. Layout: v1.<iv>.<tag>.<ciphertext>, all base64url. */
export function sealSecret(secret: string, authSecret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sealingKey(authSecret), iv);
  const ct = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [SEALED_VERSION, b64url(iv), b64url(cipher.getAuthTag()), b64url(ct)].join('.');
}

export function openSecret(sealed: string, authSecret: string): string | null {
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== SEALED_VERSION) return null;
  try {
    const [, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
    const decipher = crypto.createDecipheriv('aes-256-gcm', sealingKey(authSecret), b64urlDecode(ivB64));
    decipher.setAuthTag(b64urlDecode(tagB64));
    return Buffer.concat([decipher.update(b64urlDecode(ctB64)), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key (AUTH_SECRET rotated) or tampered ciphertext.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Request signing
// ---------------------------------------------------------------------------

export const SIGNATURE_HEADERS = {
  device: 'x-hermes-device',
  timestamp: 'x-hermes-timestamp',
  nonce: 'x-hermes-nonce',
  signature: 'x-hermes-signature',
} as const;

/** Signature validity window. Watches drift; 5 minutes each way is generous but bounded. */
export const SIGNATURE_SKEW_MS = 5 * 60 * 1000;

export type SignatureInput = {
  method: string;
  /** Path *including* query string, exactly as requested. */
  path: string;
  timestamp: number;
  nonce: string;
  body: string;
};

/**
 * The canonical string both sides hash. Every field that could be swapped by a
 * man-in-the-middle is bound in: method and path stop a signed capture from
 * being replayed against the revoke endpoint, and the body digest stops payload
 * tampering. Newline-joined with a version tag so the format can evolve.
 */
export function canonicalString(input: SignatureInput): string {
  const bodyHash = crypto.createHash('sha256').update(input.body, 'utf8').digest('hex');
  return [
    'HERMES-V1',
    input.method.toUpperCase(),
    input.path,
    String(input.timestamp),
    input.nonce,
    bodyHash,
  ].join('\n');
}

export function signRequest(input: SignatureInput, deviceSecret: string): string {
  return b64url(crypto.createHmac('sha256', deviceSecret).update(canonicalString(input)).digest());
}

export type SignatureVerdict =
  | { ok: true }
  | { ok: false; reason: 'bad_signature' | 'stale_timestamp' | 'malformed' };

export function verifySignature(
  input: SignatureInput,
  deviceSecret: string,
  presented: string,
  now = Date.now(),
): SignatureVerdict {
  if (!Number.isFinite(input.timestamp) || !input.nonce || !presented) {
    return { ok: false, reason: 'malformed' };
  }
  if (Math.abs(now - input.timestamp) > SIGNATURE_SKEW_MS) {
    return { ok: false, reason: 'stale_timestamp' };
  }
  const expected = signRequest(input, deviceSecret);
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Pairing codes
// ---------------------------------------------------------------------------

// Crockford base32 minus I/L/O/U: no character a human can misread on a watch
// face or mistype on a phone keyboard.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 8 characters ≈ 40 bits of entropy, alive for 10 minutes, single use. */
export function newPairingCode(): string {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Normalizes user typing (lowercase, stray spaces, missing dash) before hashing. */
export function normalizePairingCode(code: string): string {
  const stripped = code.toUpperCase().replace(/[^0-9A-Z]/g, '');
  return stripped.length === 8 ? `${stripped.slice(0, 4)}-${stripped.slice(4)}` : stripped;
}

export function hashPairingCode(code: string): string {
  return crypto.createHash('sha256').update(normalizePairingCode(code)).digest('hex');
}

// ---------------------------------------------------------------------------

export function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}
