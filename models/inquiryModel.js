// models/inquiryModel.js
import { query } from '../db.js';

// event_date is returned as a plain "YYYY-MM-DD" string so the JS Date object
// pg would otherwise build can't shift the day across time zones.
const COLUMNS = `
  id, name, email, phone, service, package_name, package_price,
  to_char(event_date, 'YYYY-MM-DD') AS event_date,
  message, status, created_at, updated_at
`;

function format(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    service: row.service,
    package_name: row.package_name,
    package_price: row.package_price === null ? null : Number(row.package_price),
    event_date: row.event_date,
    message: row.message,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createInquiry(i) {
  const result = await query(
    `INSERT INTO inquiries
       (name, email, phone, service, package_name, package_price, event_date, message)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNS}`,
    [i.name, i.email, i.phone, i.service, i.package_name, i.package_price, i.event_date, i.message]
  );
  return format(result.rows[0]);
}

export async function getAllInquiries({ status } = {}) {
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = 'WHERE status = $1';
  }
  const result = await query(
    `SELECT ${COLUMNS} FROM inquiries ${where} ORDER BY created_at DESC, id DESC`,
    params
  );
  return result.rows.map(format);
}

export async function updateInquiryStatus(id, status) {
  const result = await query(
    `UPDATE inquiries
     SET status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING ${COLUMNS}`,
    [status, id]
  );
  return format(result.rows[0]);
}

export async function deleteInquiry(id) {
  const result = await query('DELETE FROM inquiries WHERE id = $1 RETURNING id', [id]);
  return result.rows.length > 0;
}