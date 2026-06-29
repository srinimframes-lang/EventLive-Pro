import crypto from 'crypto';
import { env } from '../config/env.js';

/**
 * PhonePe payment gateway integration.
 *
 * The module is written so live keys can be dropped in later without touching
 * any calling code: set PHONEPE_MERCHANT_ID / PHONEPE_SALT_KEY (+ optional
 * PHONEPE_SALT_INDEX / PHONEPE_HOST) on the server and it switches from mock
 * mode to real API calls automatically.
 *
 * Docs: https://developer.phonepe.com/v1/reference/pay-api
 */

export function isConfigured() {
  return env.phonepe.enabled;
}

function sign(base64Payload, path) {
  const { saltKey, saltIndex } = env.phonepe;
  const hash = crypto
    .createHash('sha256')
    .update(base64Payload + path + saltKey)
    .digest('hex');
  return `${hash}###${saltIndex}`;
}

/**
 * Verify the X-VERIFY checksum PhonePe sends on its server-to-server callback.
 * `responseBase64` is the raw base64 `response` field from the callback body.
 */
export function verifyCallbackChecksum(responseBase64, xVerifyHeader) {
  if (!isConfigured()) return true; // mock mode
  const { saltKey, saltIndex } = env.phonepe;
  const expected =
    crypto
      .createHash('sha256')
      .update(String(responseBase64) + saltKey)
      .digest('hex') + `###${saltIndex}`;
  return expected === xVerifyHeader;
}

/**
 * Initiate a payment. Returns a redirect URL the customer is sent to.
 * In mock mode (no keys) it returns the app's payment-return URL directly so
 * the full credit flow can be exercised without a live gateway.
 *
 * @returns {Promise<{ redirectUrl: string, mock: boolean }>}
 */
export async function initiatePayment({ merchantTransactionId, amountRupees, userId, redirectUrl, callbackUrl }) {
  if (!isConfigured()) {
    // Mock: skip the gateway and let the return page finalize the payment.
    const url = new URL(redirectUrl);
    url.searchParams.set('mtid', merchantTransactionId);
    url.searchParams.set('mock', '1');
    return { redirectUrl: url.toString(), mock: true };
  }

  const payload = {
    merchantId: env.phonepe.merchantId,
    merchantTransactionId,
    merchantUserId: String(userId),
    amount: Math.round(amountRupees * 100), // paise
    redirectUrl,
    redirectMode: 'REDIRECT',
    callbackUrl,
    paymentInstrument: { type: 'PAY_PAGE' },
  };

  const base64 = Buffer.from(JSON.stringify(payload)).toString('base64');
  const xVerify = sign(base64, '/pg/v1/pay');

  const resp = await fetch(`${env.phonepe.host}/pg/v1/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-VERIFY': xVerify },
    body: JSON.stringify({ request: base64 }),
  });
  const data = await resp.json();

  const url = data?.data?.instrumentResponse?.redirectInfo?.url;
  if (!url) {
    throw new Error(data?.message || 'Failed to initiate PhonePe payment');
  }
  return { redirectUrl: url, mock: false };
}

/**
 * Query the live status of a transaction. In mock mode it always reports paid.
 * @returns {Promise<{ paid: boolean, raw?: any }>}
 */
export async function checkStatus(merchantTransactionId) {
  if (!isConfigured()) {
    return { paid: true, mock: true };
  }
  const { merchantId } = env.phonepe;
  const path = `/pg/v1/status/${merchantId}/${merchantTransactionId}`;
  const xVerify = sign('', path);

  const resp = await fetch(`${env.phonepe.host}${path}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': xVerify,
      'X-MERCHANT-ID': merchantId,
    },
  });
  const data = await resp.json();
  const paid = data?.success === true && data?.code === 'PAYMENT_SUCCESS';
  return { paid, raw: data };
}
