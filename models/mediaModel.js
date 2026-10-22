// models/mediaModel.js
import { query } from '../db.js';

// Inserts a Cloudinary transformation right after "/upload/" in a delivery URL.
function withTransformation(url, transformation) {
  return url.replace('/upload/', `/upload/${transformation}/`);
}

function format(row) {
  if (!row) return null;
  const isVideo = row.media_type === 'video';

  // Thumbnails are generated on the fly by Cloudinary, so nothing extra is stored.
  const thumbnail_url = isVideo
    ? withTransformation(row.url, 'so_0,c_fill,w_600,h_400,q_auto').replace(/\.[^./]+$/, '.jpg')
    : withTransformation(row.url, 'c_fill,w_600,h_400,q_auto,f_auto');

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    media_type: row.media_type,
    file_name: row.file_name,
    file_size: Number(row.file_size),
    dimensions: row.width && row.height ? `${row.width} x ${row.height}` : null,
    url: row.url,
    thumbnail_url,
    public_id: row.public_id,
    tags: row.tags || [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getAllMedia({ category, media_type } = {}) {
  const conditions = [];
  const params = [];

  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }
  if (media_type) {
    params.push(media_type);
    conditions.push(`media_type = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT * FROM media ${where} ORDER BY created_at DESC, id DESC`,
    params
  );
  return result.rows.map(format);
}

export async function getMediaById(id) {
  const result = await query('SELECT * FROM media WHERE id = $1', [id]);
  return format(result.rows[0]);
}

export async function createMedia(m) {
  const result = await query(
    `INSERT INTO media
       (title, category, media_type, file_name, file_size, width, height, url, public_id, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [m.title, m.category, m.media_type, m.file_name, m.file_size, m.width, m.height, m.url, m.public_id, m.tags]
  );
  return format(result.rows[0]);
}

// Only the editable metadata can change; the Cloudinary file itself stays as uploaded.
export async function updateMedia(id, { title, category, tags }) {
  const result = await query(
    `UPDATE media
     SET title = $1, category = $2, tags = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $4
     RETURNING *`,
    [title, category, tags, id]
  );
  return format(result.rows[0]);
}

export async function deleteMedia(id) {
  const result = await query('DELETE FROM media WHERE id = $1 RETURNING id', [id]);
  return result.rows.length > 0;
}