// models/paymentModel.js
import { query } from '../db.js';

// package_name / client_name come from the linked inquiry (they stay available even if
// the payment row outlives a deleted inquiry, which just shows them as null).
const SELECT = `
  SELECT p.id, p.inquiry_id, p.reference, p.email, p.amount, p.currency, p.status,
         p.channel, p.paid_at, p.created_at, p.updated_at,
         i.name AS client_name, i.package_name
  FROM payments p
  LEFT JOIN inquiries i ON i.id = p.inquiry_id
`;

function format(row) {
  if (!row) return null;
  return {
    id: row.id,
    inquiry_id: row.inquiry_id,
    reference: row.reference,
    email: row.email,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    channel: row.channel,
    paid_at: row.paid_at,
    client_name: row.client_name,
    package_name: row.package_name,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function createPayment(p) {
  await query(
    `INSERT INTO payments (inquiry_id, reference, email, amount, currency)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [p.inquiry_id, p.reference, p.email, p.amount, p.currency]
  );
  return getPaymentByReference(p.reference);
}

export async function getPaymentByReference(reference) {
  const result = await query(`${SELECT} WHERE p.reference = $1`, [reference]);
  return format(result.rows[0]);
}

export async function getAllPayments({ status } = {}) {
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = 'WHERE p.status = $1';
  }
  const result = await query(`${SELECT} ${where} ORDER BY p.created_at DESC, p.id DESC`, params);
  return result.rows.map(format);
}

// Only a payment that is still pending can become failed or abandoned.
export async function setPaymentStatus(reference, status) {
  await query(
    `UPDATE payments SET status = $2, updated_at = CURRENT_TIMESTAMP
     WHERE reference = $1 AND status = 'pending'`,
    [reference, status]
  );
}

// Marks the payment as paid and credits the inquiry, in ONE statement so the two can't
// disagree. It only does anything the first time: Paystack may confirm the same payment
// through the webhook and the verify call, and the deposit must be counted once.
// Returns true if this call is the one that recorded it.
export async function markPaymentSuccess(reference, { channel, paid_at }) {
  const result = await query(
    `WITH paid AS (
       UPDATE payments
       SET status = 'success',
           channel = $2,
           paid_at = COALESCE($3::timestamptz, CURRENT_TIMESTAMP),
           updated_at = CURRENT_TIMESTAMP
       WHERE reference = $1 AND status <> 'success'
       RETURNING inquiry_id, amount
     ), credit AS (
       UPDATE inquiries i
       SET amount_paid = LEAST(i.amount_paid + p.amount, COALESCE(i.package_price, i.amount_paid + p.amount)),
           status = CASE WHEN i.status IN ('new', 'contacted') THEN 'booked' ELSE i.status END,
           updated_at = CURRENT_TIMESTAMP
       FROM paid p
       WHERE i.id = p.inquiry_id
       RETURNING i.id
     )
     SELECT COUNT(*) AS applied FROM paid`,
    [reference, channel ?? null, paid_at ?? null]
  );
  return Number(result.rows[0].applied) > 0;
}