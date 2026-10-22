// routes/media.js
import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import cloudinary, { CLOUDINARY_FOLDER, isCloudinaryConfigured } from '../config/cloudinary.js';
import {
  getAllMedia,
  getMediaById,
  createMedia,
  updateMedia,
  deleteMedia,
} from '../models/mediaModel.js';

const router = express.Router();

const CATEGORIES = [
  'Weddings',
  'Personal Photoshoots',
  'Couples',
  'Family',
  'Baby Bump',
  'Events & Commercial',
  'Video Reels',
];
const MEDIA_TYPES = ['image', 'video'];

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normaliseTags(tags) {
  if (!Array.isArray(tags)) return [];
  const cleaned = tags
    .map(t => String(t).trim().replace(/^#/, ''))
    .filter(Boolean);
  return [...new Set(cleaned)];
}

function optionalInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// GET /api/media/signature  (admin)
// Gives the browser a short-lived signature so it can upload straight to Cloudinary
// without the API secret ever leaving the server.
router.get('/signature', requireAdmin, (req, res) => {
  if (!isCloudinaryConfigured()) {
    return res.status(500).json({ error: 'Cloudinary is not configured on the server' });
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = CLOUDINARY_FOLDER;
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    process.env.CLOUDINARY_API_SECRET
  );

  res.json({
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    timestamp,
    signature,
    folder,
  });
});

// GET /api/media?category=Weddings&media_type=image  (public so the site gallery can use it)
router.get('/', async (req, res) => {
  try {
    const { category, media_type } = req.query;
    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (media_type && !MEDIA_TYPES.includes(media_type)) {
      return res.status(400).json({ error: 'Invalid media type' });
    }
    res.json(await getAllMedia({ category, media_type }));
  } catch (err) {
    console.error('Failed to fetch media:', err);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// GET /api/media/:id
router.get('/:id', async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid media id' });

    const item = await getMediaById(id);
    if (!item) return res.status(404).json({ error: 'Media not found' });
    res.json(item);
  } catch (err) {
    console.error('Failed to fetch media item:', err);
    res.status(500).json({ error: 'Failed to fetch media item' });
  }
});

// POST /api/media  (admin) - saves the metadata after the browser finished uploading to Cloudinary
router.post('/', requireAdmin, async (req, res) => {
  try {
    const b = req.body;
    const title = typeof b.title === 'string' ? b.title.trim() : '';
    const file_name = typeof b.file_name === 'string' ? b.file_name.trim() : '';
    const url = typeof b.url === 'string' ? b.url : '';
    const public_id = typeof b.public_id === 'string' ? b.public_id : '';
    const file_size = Number(b.file_size);

    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!CATEGORIES.includes(b.category)) return res.status(400).json({ error: 'Invalid category' });
    if (!MEDIA_TYPES.includes(b.media_type)) return res.status(400).json({ error: 'Invalid media type' });
    if (!file_name) return res.status(400).json({ error: 'File name is required' });
    if (!Number.isFinite(file_size) || file_size < 0) {
      return res.status(400).json({ error: 'Invalid file size' });
    }

    // Only accept files that actually live in our Cloudinary account and folder.
    const expectedPrefix = `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/`;
    if (!url.startsWith(expectedPrefix) || !url.includes('/upload/')) {
      return res.status(400).json({ error: 'Invalid media URL' });
    }
    if (!public_id.startsWith(`${CLOUDINARY_FOLDER}/`)) {
      return res.status(400).json({ error: 'Invalid public id' });
    }

    const item = await createMedia({
      title,
      category: b.category,
      media_type: b.media_type,
      file_name,
      file_size: Math.round(file_size),
      width: optionalInt(b.width),
      height: optionalInt(b.height),
      url,
      public_id,
      tags: normaliseTags(b.tags),
    });
    res.status(201).json(item);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This file has already been saved' });
    }
    console.error('Failed to save media:', err);
    res.status(500).json({ error: 'Failed to save media' });
  }
});

// PUT /api/media/:id  (admin) - edit title, category, tags
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid media id' });

    const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!CATEGORIES.includes(req.body.category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const item = await updateMedia(id, {
      title,
      category: req.body.category,
      tags: normaliseTags(req.body.tags),
    });
    if (!item) return res.status(404).json({ error: 'Media not found' });
    res.json(item);
  } catch (err) {
    console.error('Failed to update media:', err);
    res.status(500).json({ error: 'Failed to update media' });
  }
});

// DELETE /api/media/:id  (admin) - removes the file from Cloudinary, then the database row
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid media id' });

    const item = await getMediaById(id);
    if (!item) return res.status(404).json({ error: 'Media not found' });

    try {
      const result = await cloudinary.uploader.destroy(item.public_id, {
        resource_type: item.media_type,
        invalidate: true,
      });
      // "not found" means it is already gone from Cloudinary, which is fine.
      if (result.result !== 'ok' && result.result !== 'not found') {
        throw new Error(`Cloudinary responded with: ${result.result}`);
      }
    } catch (cloudErr) {
      console.error('Cloudinary delete failed:', cloudErr);
      return res.status(502).json({ error: 'Could not delete the file from Cloudinary. Nothing was removed.' });
    }

    await deleteMedia(id);
    res.json({ success: true, id });
  } catch (err) {
    console.error('Failed to delete media:', err);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

export default router;