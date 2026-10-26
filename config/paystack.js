// config/paystack.js
// Thin wrapper around the Paystack API. Environment variables are read when a function
// runs (not when the file loads), so it works no matter when dotenv is initialised.
import crypto from 'crypto';

const PAYSTACK_BASE = 'https://api.paystack.co';

// PAYSTACK_SECRET_KEY  your secret key (sk_test_... while testing, sk_live_... for real money)
// SITE_URL             the public website, e.g. https://blossomsnaps.com (Paystack sends people back here)
// PAYSTACK_CURRENCY    optional, defaults to KES
export const isPaystackConfigured = () =>
  Boolean(process.env.PAYSTACK_SECRET_KEY && process.env.SITE_URL);

export const getSiteUrl = () => (process.env.SITE_URL || '').replace(/\/$/, '');

export const getCurrency = () => (process.env.PAYSTACK_CURRENCY || 'KES').toUpperCase();

async function paystackRequest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) {
    const err = new Error(json.message || `Paystack request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json.data;
}

// Starts a payment. Returns { authorization_url, access_code, reference }.
// `amount` must be in the smallest unit (cents for KES), so KSH 65,000 is 6500000.
export const initializeTransaction = payload =>
  paystackRequest('/transaction/initialize', { method: 'POST', body: payload });

// Asks Paystack what really happened to a payment.
export const verifyTransaction = reference =>
  paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);

// Webhook calls carry a signature: an HMAC of the exact bytes sent, made with your secret key.
export function isValidSignature(rawBody, signature) {
  if (!rawBody || !signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  const expected = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}