// models/packageModel.js
import { query } from '../db.js';

// NUMERIC columns come back from pg as strings, so normalise rows here.
function format(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    features: row.features || [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getAllPackages(category) {
  const result = category
    ? await query('SELECT * FROM packages WHERE category = $1 ORDER BY price ASC, id ASC', [category])
    : await query('SELECT * FROM packages ORDER BY category ASC, price ASC, id ASC');
  return result.rows.map(format);
}

export async function getPackageById(id) {
  const result = await query('SELECT * FROM packages WHERE id = $1', [id]);
  return format(result.rows[0]);
}

export async function createPackage({ name, category, price, features }) {
  const result = await query(
    `INSERT INTO packages (name, category, price, features)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, category, price, features]
  );
  return format(result.rows[0]);
}

export async function updatePackage(id, { name, category, price, features }) {
  const result = await query(
    `UPDATE packages
     SET name = $1, category = $2, price = $3, features = $4, updated_at = CURRENT_TIMESTAMP
     WHERE id = $5
     RETURNING *`,
    [name, category, price, features, id]
  );
  return format(result.rows[0]);
}

export async function deletePackage(id) {
  const result = await query('DELETE FROM packages WHERE id = $1 RETURNING id', [id]);
  return result.rows.length > 0;
}