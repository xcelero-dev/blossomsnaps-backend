// routes/packages.js
import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  getAllPackages,
  getPackageById,
  createPackage,
  updatePackage,
  deletePackage,
} from '../models/packageModel.js';

const router = express.Router();

const CATEGORIES = ['photoshoot', 'event'];

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Validates and normalises a request body. Returns { error } or { data }.
function validate(body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const category = body.category;
  const price = Number(body.price);
  const features = Array.isArray(body.features)
    ? body.features.map(f => String(f).trim()).filter(Boolean)
    : [];

  if (!name) return { error: 'Package name is required' };
  if (!CATEGORIES.includes(category)) {
    return { error: `Category must be one of: ${CATEGORIES.join(', ')}` };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { error: 'Price must be a valid non-negative number' };
  }

  return { data: { name, category, price, features } };
}

// GET /api/packages?category=photoshoot  (public so the site can show rates)
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    const packages = await getAllPackages(category);
    res.json(packages);
  } catch (err) {
    console.error('Failed to fetch packages:', err);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

// GET /api/packages/:id
router.get('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid package id' });

    const pkg = await getPackageById(id);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });
    res.json(pkg);
  } catch (err) {
    console.error('Failed to fetch package:', err);
    res.status(500).json({ error: 'Failed to fetch package' });
  }
});

// POST /api/packages  (admin)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { error, data } = validate(req.body);
    if (error) return res.status(400).json({ error });

    const pkg = await createPackage(data);
    res.status(201).json(pkg);
  } catch (err) {
    console.error('Failed to create package:', err);
    res.status(500).json({ error: 'Failed to create package' });
  }
});

// PUT /api/packages/:id  (admin)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid package id' });

    const { error, data } = validate(req.body);
    if (error) return res.status(400).json({ error });

    const pkg = await updatePackage(id, data);
    if (!pkg) return res.status(404).json({ error: 'Package not found' });
    res.json(pkg);
  } catch (err) {
    console.error('Failed to update package:', err);
    res.status(500).json({ error: 'Failed to update package' });
  }
});

// DELETE /api/packages/:id  (admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid package id' });

    const deleted = await deletePackage(id);
    if (!deleted) return res.status(404).json({ error: 'Package not found' });
    res.json({ success: true, id });
  } catch (err) {
    console.error('Failed to delete package:', err);
    res.status(500).json({ error: 'Failed to delete package' });
  }
});

export default router;