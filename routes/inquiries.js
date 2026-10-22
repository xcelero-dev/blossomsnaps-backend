// routes/inquiries.js
import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  createInquiry,
  getAllInquiries,
  updateInquiryStatus,
  deleteInquiry,
} from '../models/inquiryModel.js';

const router = express.Router();

// Keep in sync with the CHECK constraint in initdb.js and the select in Contact.tsx.
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
const STATUSES = ['new', 'contacted', 'booked', 'closed'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function str(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidDate(value) {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// ---------------------------------------------------------------------------
// Tiny in-memory rate limiter (per IP) so the public form can't be spammed.
// Resets if the server restarts, which is fine for this purpose.
// ---------------------------------------------------------------------------
const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map();

function rateLimit(req, res, next) {
  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    return res
      .status(429)
      .json({ error: 'Too many enquiries from this connection. Please try again in a few minutes.' });
  }
  recent.push(now);
  hits.set(req.ip, recent);
  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of hits) {
    const recent = times.filter(t => now - t < WINDOW_MS);
    if (recent.length) hits.set(ip, recent);
    else hits.delete(ip);
  }
}, WINDOW_MS).unref();

// POST /api/inquiries  (public) - the contact form on the website
router.post('/', rateLimit, async (req, res) => {
  try {
    const b = req.body || {};

    // Honeypot: real visitors never see or fill this field, bots usually do.
    // Pretend it worked so the bot doesn't learn anything.
    if (str(b.website)) {
      return res.status(201).json({ success: true });
    }

    const name = str(b.name);
    const email = str(b.email);
    const phone = str(b.phone);
    const service = str(b.service);
    const message = str(b.message);
    const package_name = str(b.package_name) || null;
    const event_date = str(b.event_date) || null;

    if (name.length < 2 || name.length > 255) {
      return res.status(400).json({ error: 'Please enter your name.' });
    }
    if (!EMAIL_RE.test(email) || email.length > 255) {
      return res.status(400).json({ error: 'Please enter a valid email.' });
    }
    if (phone.length < 7 || phone.length > 50) {
      return res.status(400).json({ error: 'Please enter a valid phone number.' });
    }
    if (!SERVICES.includes(service)) {
      return res.status(400).json({ error: 'Please choose a valid service.' });
    }
    if (message.length < 10 || message.length > 5000) {
      return res.status(400).json({ error: 'Please tell us a little more (10 to 5000 characters).' });
    }
    if (package_name && package_name.length > 255) {
      return res.status(400).json({ error: 'Invalid package.' });
    }
    if (event_date && !isValidDate(event_date)) {
      return res.status(400).json({ error: 'Invalid event date.' });
    }

    let package_price = null;
    if (package_name && b.package_price !== undefined && b.package_price !== null && b.package_price !== '') {
      package_price = Number(b.package_price);
      if (!Number.isFinite(package_price) || package_price < 0) {
        return res.status(400).json({ error: 'Invalid package price.' });
      }
    }

    const item = await createInquiry({
      name,
      email,
      phone,
      service,
      package_name,
      package_price,
      event_date,
      message,
    });

    // Only the id goes back; the public endpoint never echoes personal details.
    res.status(201).json({ success: true, id: item.id });
  } catch (err) {
    console.error('Failed to save inquiry:', err);
    res.status(500).json({ error: 'Could not send your enquiry. Please try again or chat with us on WhatsApp.' });
  }
});

// GET /api/inquiries?status=new  (admin)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    if (status && !STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    res.json(await getAllInquiries({ status }));
  } catch (err) {
    console.error('Failed to fetch inquiries:', err);
    res.status(500).json({ error: 'Failed to fetch inquiries' });
  }
});

// PATCH /api/inquiries/:id/status  (admin) - mark as new / contacted / booked / closed
router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid inquiry id' });

    const status = str(req.body?.status);
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const item = await updateInquiryStatus(id, status);
    if (!item) return res.status(404).json({ error: 'Inquiry not found' });
    res.json(item);
  } catch (err) {
    console.error('Failed to update inquiry:', err);
    res.status(500).json({ error: 'Failed to update inquiry' });
  }
});

// DELETE /api/inquiries/:id  (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid inquiry id' });

    const removed = await deleteInquiry(id);
    if (!removed) return res.status(404).json({ error: 'Inquiry not found' });
    res.json({ success: true, id });
  } catch (err) {
    console.error('Failed to delete inquiry:', err);
    res.status(500).json({ error: 'Failed to delete inquiry' });
  }
});

export default router;