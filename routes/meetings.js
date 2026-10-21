// routes/meetings.js
import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  getAllMeetings,
  getMeetingById,
  createMeeting,
  updateMeeting,
  deleteMeeting,
} from '../models/meetingModel.js';

const router = express.Router();

// Meetings contain client details, so every route is admin-only.
router.use(requireAdmin);

const CATEGORIES = ['Client Consultation', 'Photo Shoot', 'Video Editing Deadline', 'Equipment Prep'];
const REMINDERS = ['15 mins before', '30 mins before', '1 hour before', '1 day before'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Validates and normalises a request body. Returns { error } or { data }.
function validate(body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const meeting_date = body.meeting_date;
  const start_time = body.start_time;
  const end_time = body.end_time;
  const category = body.category;
  const reminder = body.reminder;
  const client_email =
    typeof body.client_email === 'string' && body.client_email.trim()
      ? body.client_email.trim().toLowerCase()
      : null;
  const description = typeof body.description === 'string' ? body.description.trim() : '';

  if (!title) return { error: 'Title is required' };
  if (!DATE_RE.test(meeting_date || '') || Number.isNaN(Date.parse(meeting_date))) {
    return { error: 'A valid date (YYYY-MM-DD) is required' };
  }
  if (!TIME_RE.test(start_time || '')) return { error: 'A valid start time (HH:MM) is required' };
  if (!TIME_RE.test(end_time || '')) return { error: 'A valid end time (HH:MM) is required' };
  if (end_time <= start_time) return { error: 'End time must be after start time' };
  if (!CATEGORIES.includes(category)) {
    return { error: `Category must be one of: ${CATEGORIES.join(', ')}` };
  }
  if (!REMINDERS.includes(reminder)) {
    return { error: `Reminder must be one of: ${REMINDERS.join(', ')}` };
  }
  if (client_email && !EMAIL_RE.test(client_email)) {
    return { error: 'Client email is not valid' };
  }

  return {
    data: { title, meeting_date, start_time, end_time, category, client_email, description, reminder },
  };
}

// GET /api/meetings?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
      return res.status(400).json({ error: 'from/to must be in YYYY-MM-DD format' });
    }
    const meetings = await getAllMeetings({ from, to });
    res.json(meetings);
  } catch (err) {
    console.error('Failed to fetch meetings:', err);
    res.status(500).json({ error: 'Failed to fetch meetings' });
  }
});

// GET /api/meetings/:id
router.get('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid meeting id' });

    const meeting = await getMeetingById(id);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    res.json(meeting);
  } catch (err) {
    console.error('Failed to fetch meeting:', err);
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});

// POST /api/meetings
router.post('/', async (req, res) => {
  try {
    const { error, data } = validate(req.body);
    if (error) return res.status(400).json({ error });

    const meeting = await createMeeting(data);
    res.status(201).json(meeting);
  } catch (err) {
    console.error('Failed to create meeting:', err);
    res.status(500).json({ error: 'Failed to create meeting' });
  }
});

// PUT /api/meetings/:id
router.put('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid meeting id' });

    const { error, data } = validate(req.body);
    if (error) return res.status(400).json({ error });

    const meeting = await updateMeeting(id, data);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    res.json(meeting);
  } catch (err) {
    console.error('Failed to update meeting:', err);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// DELETE /api/meetings/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid meeting id' });

    const deleted = await deleteMeeting(id);
    if (!deleted) return res.status(404).json({ error: 'Meeting not found' });
    res.json({ success: true, id });
  } catch (err) {
    console.error('Failed to delete meeting:', err);
    res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

export default router;