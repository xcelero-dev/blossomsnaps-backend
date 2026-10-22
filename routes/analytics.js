// routes/analytics.js
import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { getAnalytics } from '../models/analyticsModel.js';

const router = express.Router();

// GET /api/analytics?year=2026  (admin)
// One call returns everything the Analytics page shows: KPI cards, the 12-month
// revenue and shoot series, the category split and the recent client activity.
router.get('/', requireAdmin, async (req, res) => {
  try {
    let year;
    if (req.query.year !== undefined) {
      year = Number(req.query.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return res.status(400).json({ error: 'Invalid year' });
      }
    }
    res.json(await getAnalytics(year));
  } catch (err) {
    console.error('Failed to load analytics:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

export default router;