// models/inquiryModel.js
import { query } from '../db.js';

// Only a booked inquiry can show a payment status; everything else is still "Pending".
// 50% or more of the price counts as "50% Deposit Paid" (the studio's deposit rule).
// Worked out from the money columns, so it can never go out of sync with them.
export const PAYMENT_STATUS_SQL = `
  CASE
    WHEN status <> 'booked' THEN 'Pending'
    WHEN package_price > 0 AND amount_paid >= package_price THEN 'Fully Paid'
    WHEN package_price > 0 AND amount_paid >= package_price * 0.5 THEN '50% Deposit Paid'
    ELSE 'Pending'
  END
`;

// event_date is returned as a plain "YYYY-MM-DD" string so the JS Date object
// pg would otherwise build can't shift the day across time zones.
const COLUMNS = `
  id, name, email, phone, service, package_name, package_price, amount_paid,
  to_char(event_date, 'YYYY-MM-DD') AS event_date,
  message, status, ${PAYMENT_STATUS_SQL} AS payment_status, created_at, updated_at
`;

function format(row) {
  if (!row) return null;
  const price = row.package_price === null ? null : Number(row.package_price);
  const paid = Number(row.amount_paid);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    service: row.service,
    package_name: row.package_name,
    package_price: price,
    amount_paid: paid,
    balance: price === null ? null : Math.round((price - paid) * 100) / 100,
    event_date: row.event_date,
    message: row.message,
    status: row.status,
    payment_status: row.payment_status,
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

export async function getInquiryById(id) {
  const result = await query(`SELECT ${COLUMNS} FROM inquiries WHERE id = $1`, [id]);
  return format(result.rows[0]);
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

// Only these columns can be changed here. The names are whitelisted in this file,
// never taken from the request.
const EDITABLE = ['status', 'package_price', 'amount_paid'];

export async function updateInquiry(id, changes) {
  const sets = [];
  const params = [];
  for (const key of EDITABLE) {
    if (Object.prototype.hasOwnProperty.call(changes, key)) {
      params.push(changes[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) return getInquiryById(id);

  params.push(id);
  const result = await query(
    `UPDATE inquiries
     SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${params.length}
     RETURNING ${COLUMNS}`,
    params
  );
  return format(result.rows[0]);
}

// An enquiry from the same person for the same package in the last 24 hours that has
// had no payment yet, so a second click on "pay deposit" reuses it.
export async function findOpenInquiry({ email, package_name }) {
  const result = await query(
    `SELECT ${COLUMNS} FROM inquiries
     WHERE lower(email) = lower($1)
       AND package_name = $2
       AND status IN ('new', 'contacted')
       AND amount_paid = 0
       AND created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
     ORDER BY created_at DESC
     LIMIT 1`,
    [email, package_name]
  );
  return format(result.rows[0]);
}

// Brings an open enquiry up to date with what the visitor just typed.
export async function refreshInquiry(id, i) {
  const result = await query(
    `UPDATE inquiries
     SET name = $1, phone = $2, service = $3, package_price = $4,
         event_date = $5, message = $6, updated_at = CURRENT_TIMESTAMP
     WHERE id = $7
     RETURNING ${COLUMNS}`,
    [i.name, i.phone, i.service, i.package_price, i.event_date, i.message, id]
  );
  return format(result.rows[0]);
}

export async function deleteInquiry(id) {
  const result = await query('DELETE FROM inquiries WHERE id = $1 RETURNING id', [id]);
  return result.rows.length > 0;
}