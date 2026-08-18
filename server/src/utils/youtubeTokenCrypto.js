import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function resolveSecret() {
  const dedicated = String(process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY || '').trim();
  if (dedicated.length >= 16) return dedicated;
  if (process.env.NODE_ENV === 'production') return '';
  return String(process.env.JWT_SECRET || '').trim();
}

export function youtubeTokenEncryptionReady() {
  return resolveSecret().length >= 16;
}

function encryptionKey() {
  const secret = resolveSecret();
  if (secret.length < 16) {
    throw new Error('YouTube token encryption is not configured');
  }
  return crypto.createHash('sha256').update(secret).digest();
}

/** Encrypt a token string. Returns iv:tag:ciphertext (hex). Never log the input. */
export function encryptYoutubeToken(plain) {
  const value = String(plain || '');
  if (!value) return '';
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

/** Decrypt a stored token blob. Returns '' for empty input. */
export function decryptYoutubeToken(blob) {
  const packed = String(blob || '');
  if (!packed) return '';
  const parts = packed.split(':');
  if (parts.length !== 3) {
    throw new Error('Stored YouTube token is unreadable');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv(ALGO, encryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

export function looksEncryptedToken(blob) {
  const parts = String(blob || '').split(':');
  return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p) && p.length >= 8);
}
