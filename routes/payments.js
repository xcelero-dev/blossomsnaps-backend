// routes/payments.js
import express from 'express';
import crypto from 'crypto';
import { requireAdmin } from '../middleware/auth.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { getAllPackages } from '../models/packageModel.js';
import { createInquiry, findOpenInquiry, refreshInquiry } from '../models/inquiryModel.js';
import {
  createPayment,
  getPaymentByReference,
  getAllPayments,
  markPaymentSuccess,
  setPaymentStatus,
} from '../models/paymentModel.js';
import {
  getCurrency,
  getSiteUrl,
  initializeTransaction,
  isPaystackConfigured,
  isValidSignature,
  verifyTransaction,
} from '../config/paystack.js';

const router = express.Router();

// The studio asks for 50% down to confirm a booking.
const DEPOSIT_RATE = 0.5;

// Keep in sync with routes/inquiries.js and the contact form.
const SERVICES = [
  'Wedding',
  'Culture that matters',
  'Birthday',
  'Portrait',
  'Event',
  'Fashion & Lifestyle',
  'Music Video',
  'Corporate Video',
  'Social Media Content',
];
const STATUSES = ['pending', 'success', 'failed', 'abandoned'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REFERENCE_RE = /^[A-Za-z0-9_.=-]{6,100}$/;

const str = value => (typeof value === 'string' ? value.trim() : '');
const round2 = n => Math.round(n * 100) / 100;

function isValidDate(value) {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

const startLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'Too many payment attempts from this connection. Please try again in a few minutes.',
});
const verifyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 40,
  message: 'Too many requests. Please wait a moment and try again.',
});

// Takes what Paystack says about a payment and updates our records to match.
// Used by both the webhook and the verify endpoint. Returns the payment's status.
async function applyTransaction(payment, tx) {
  if (tx.status === 'success') {
    // Never credit a payment whose amount or currency differs from what we asked for.
    const expected = Math.round(payment.amount * 100);
    if (Number(tx.amount) !== expected || String(tx.currency).toUpperCase() !== payment.currency) {
      console.error(
        `[PAYSTACK] Amount/currency mismatch for ${payment.reference}: expected ${expected} ${payment.currency}, got ${tx.amount} ${tx.currency}`
      );
      return payment.status;
    }
    await markPaymentSuccess(payment.reference, { channel: tx.channel, paid_at: tx.paid_at });
    return 'success';
  }

  if (tx.status === 'failed' || tx.status === 'abandoned') {
    await setPaymentStatus(payment.reference, tx.status);
    return tx.status;
  }

  return payment.status; // still in progress
}

// POST /api/payments/initialize  (public)
// Saves the enquiry, works out the 50% deposit from the package price stored on the
// server (never from the browser), and returns the Paystack checkout link.
router.post('/initialize', startLimiter, async (req, res) => {
  try {
    if (!isPaystackConfigured()) {
      return res.status(500).json({ error: 'Online payments are not set up yet. Please chat with us on WhatsApp.' });
    }

    const b = req.body || {};

    // Honeypot: real visitors never fill this in.
    if (str(b.website)) return res.status(400).json({ error: 'Could not start the payment.' });

    const name = str(b.name);
    const email = str(b.email);
    const phone = str(b.phone);
    const service = str(b.service);
    const message = str(b.message);
    const package_name = str(b.package_name);
    const event_date = str(b.event_date) || null;

    if (name.length < 2 || name.length > 255) return res.status(400).json({ error: 'Please enter your name.' });
    if (!EMAIL_RE.test(email) || email.length > 255) return res.status(400).json({ error: 'Please enter a valid email.' });
    if (phone.length < 7 || phone.length > 50) return res.status(400).json({ error: 'Please enter a valid phone number.' });
    if (!SERVICES.includes(service)) return res.status(400).json({ error: 'Please choose a valid service.' });
    if (message.length < 10 || message.length > 5000) {
      return res.status(400).json({ error: 'Please tell us a little more (10 to 5000 characters).' });
    }
    if (!package_name) {
      return res.status(400).json({ error: 'Choose a package to pay its deposit. For a custom package, send an enquiry instead.' });
    }
    if (event_date && !isValidDate(event_date)) return res.status(400).json({ error: 'Invalid event date.' });

    // The price comes from our own packages table.
    const packages = await getAllPackages();
    const pkg = packages.find(p => String(p.name).trim().toLowerCase() === package_name.toLowerCase());
    const price = pkg ? Number(pkg.price) : 0;
    if (!pkg || !(price > 0)) {
      return res.status(400).json({ error: 'That package is not available for online payment. Please send an enquiry instead.' });
    }
    const deposit = round2(price * DEPOSIT_RATE);

    // Reuse an open enquiry from the same person for the same package, so clicking "pay"
    // twice doesn't create duplicate enquiries.
    const details = { name, email, phone, service, package_name: pkg.name, package_price: price, event_date, message };
    const existing = await findOpenInquiry({ email, package_name: pkg.name });
    let inquiryId;
    if (existing) {
      await refreshInquiry(existing.id, details);
      inquiryId = existing.id;
    } else {
      inquiryId = (await createInquiry(details)).id;
    }

    const reference = `BS-${crypto.randomBytes(8).toString('hex')}`;
    const currency = getCurrency();
    await createPayment({ inquiry_id: inquiryId, reference, email, amount: deposit, currency });

    let session;
    try {
      session = await initializeTransaction({
        email,
        amount: Math.round(deposit * 100), // Paystack wants the smallest unit (cents)
        currency,
        reference,
        callback_url: `${getSiteUrl()}/payment-success`,
        metadata: { inquiry_id: inquiryId, package_name: pkg.name, client_name: name },
      });
    } catch (err) {
      await setPaymentStatus(reference, 'failed');
      console.error('Paystack initialize failed:', err.message);
      return res
        .status(502)
        .json({ error: 'Could not reach the payment provider. Please try again or chat with us on WhatsApp.' });
    }

    res.status(201).json({
      authorization_url: session.authorization_url,
      reference,
      amount: deposit,
      currency,
    });
  } catch (err) {
    console.error('Failed to start payment:', err);
    res.status(500).json({ error: 'Could not start the payment. Please try again or chat with us on WhatsApp.' });
  }
});

// GET /api/payments/verify/:reference  (public)
// The "payment received" page calls this after Paystack sends the visitor back.
router.get('/verify/:reference', verifyLimiter, async (req, res) => {
  try {
    const { reference } = req.params;
    if (!REFERENCE_RE.test(reference)) return res.status(400).json({ error: 'Invalid payment reference' });

    const payment = await getPaymentByReference(reference);
    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    let status = payment.status;
    if (status !== 'success') {
      let tx;
      try {
        tx = await verifyTransaction(reference);
      } catch (err) {
        console.error('Paystack verify failed:', err.message);
        return res.status(502).json({ error: 'Could not confirm the payment right now. Please try again shortly.' });
      }
      status = await applyTransaction(payment, tx);
    }

    // Only what the visitor needs to see; no personal details.
    res.json({
      reference: payment.reference,
      status,
      amount: payment.amount,
      currency: payment.currency,
      package_name: payment.package_name,
    });
  } catch (err) {
    console.error('Failed to verify payment:', err);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

// POST /api/payments/webhook  (called by Paystack, not by the website)
// Add this URL in the Paystack dashboard under Settings > API Keys & Webhooks.
// This is what records a payment even if the visitor closes the tab after paying.
router.post('/webhook', async (req, res) => {
  if (!isValidSignature(req.rawBody, req.get('x-paystack-signature'))) {
    return res.sendStatus(401);
  }

  try {
    const { event, data } = req.body || {};
    if (event === 'charge.success' && data?.reference) {
      const payment = await getPaymentByReference(data.reference);
      if (payment) await applyTransaction(payment, data);
    }
    res.sendStatus(200);
  } catch (err) {
    console.error('Paystack webhook failed:', err);
    res.sendStatus(500); // Paystack will retry
  }
});

// GET /api/payments?status=success  (admin)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    if (status && !STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    res.json(await getAllPayments({ status }));
  } catch (err) {
    console.error('Failed to fetch payments:', err);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

export default router;