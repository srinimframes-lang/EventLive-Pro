import crypto from 'crypto';
import Razorpay from 'razorpay';

/**
 * Razorpay helpers (Test Mode or Live — driven by env keys).
 * Key secret and webhook secret never leave the server.
 * Reads process.env at call time so tests can inject secrets safely.
 */

function keyId() {
  return String(process.env.RAZORPAY_KEY_ID || '').trim();
}
function keySecret() {
  return String(process.env.RAZORPAY_KEY_SECRET || '').trim();
}
function webhookSecret() {
  return String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
}

export function isRazorpayConfigured() {
  return Boolean(keyId() && keySecret());
}

export function getPublicRazorpayKeyId() {
  return isRazorpayConfigured() ? keyId() : '';
}

let _client = null;
let _clientKey = '';

/** Lazily construct the Razorpay SDK client (or null if not configured). */
export function getRazorpayClient() {
  if (!isRazorpayConfigured()) return null;
  const id = keyId();
  const secret = keySecret();
  if (!_client || _clientKey !== `${id}:${secret}`) {
    _client = new Razorpay({ key_id: id, key_secret: secret });
    _clientKey = `${id}:${secret}`;
  }
  return _client;
}

/** Reset cached client (tests). */
export function resetRazorpayClient() {
  _client = null;
  _clientKey = '';
}

/**
 * Verify Checkout payment signature:
 * HMAC_SHA256(order_id + "|" + payment_id, key_secret)
 */
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const secret = keySecret();
  if (!secret) return false;
  const oid = String(orderId || '');
  const pid = String(paymentId || '');
  const sig = String(signature || '');
  if (!oid || !pid || !sig) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${oid}|${pid}`).digest('hex');

  return timingSafeEqualHex(expected, sig);
}

/**
 * Verify Razorpay webhook signature:
 * HMAC_SHA256(rawBody, webhook_secret) === X-Razorpay-Signature
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = webhookSecret();
  if (!secret) return false;
  const sig = String(signatureHeader || '');
  if (!sig) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ''), 'utf8');

  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');

  return timingSafeEqualHex(expected, sig);
}

function timingSafeEqualHex(a, b) {
  try {
    const bufA = Buffer.from(String(a), 'utf8');
    const bufB = Buffer.from(String(b), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/** Amount in paise for Razorpay (₹ × 100). */
export function inrToPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}
