// models/meetingModel.js
import { query } from '../db.js';

// Format DATE / TIME columns as plain strings so the frontend never deals with timezone shifts.
const COLUMNS = `
  id,
  title,
  to_char(meeting_date, 'YYYY-MM-DD') AS meeting_date,
  to_char(start_time, 'HH24:MI') AS start_time,
  to_char(end_time, 'HH24:MI') AS end_time,
  category,
  client_email,
  description,
  reminder,
  created_at,
  updated_at
`;

export async function getAllMeetings({ from, to } = {}) {
  const conditions = [];
  const params = [];

  if (from) {
    params.push(from);
    conditions.push(`meeting_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`meeting_date <= $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await query(
    `SELECT ${COLUMNS} FROM meetings ${where} ORDER BY meeting_date ASC, start_time ASC, id ASC`,
    params
  );
  return result.rows;
}

export async function getMeetingById(id) {
  const result = await query(`SELECT ${COLUMNS} FROM meetings WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function createMeeting(m) {
  const result = await query(
    `INSERT INTO meetings
       (title, meeting_date, start_time, end_time, category, client_email, description, reminder)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNS}`,
    [m.title, m.meeting_date, m.start_time, m.end_time, m.category, m.client_email, m.description, m.reminder]
  );
  return result.rows[0];
}

export async function updateMeeting(id, m) {
  const result = await query(
    `UPDATE meetings
     SET title = $1,
         meeting_date = $2,
         start_time = $3,
         end_time = $4,
         category = $5,
         client_email = $6,
         description = $7,
         reminder = $8,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $9
     RETURNING ${COLUMNS}`,
    [m.title, m.meeting_date, m.start_time, m.end_time, m.category, m.client_email, m.description, m.reminder, id]
  );
  return result.rows[0] || null;
}

export async function deleteMeeting(id) {
  const result = await query('DELETE FROM meetings WHERE id = $1 RETURNING id', [id]);
  return result.rows.length > 0;
}