// models/analyticsModel.js
// Everything here is worked out from the inquiries table:
//   - an inquiry with status 'booked' is a booking
//   - package_price is the agreed price, amount_paid is money received so far
//   - a booking counts as completed once its event_date has passed
import { query } from '../db.js';
import { PAYMENT_STATUS_SQL } from './inquiryModel.js';

const TZ = 'Africa/Nairobi';

// Today's date and the date a booking counts towards, both on Nairobi time.
// A booking with no event date yet falls back to the day the enquiry arrived.
const TODAY_SQL = `(CURRENT_TIMESTAMP AT TIME ZONE '${TZ}')::date`;
const JOB_DATE_SQL = `COALESCE(event_date, (created_at AT TIME ZONE '${TZ}')::date)`;

// Current year and month (0-11) in Nairobi, so month boundaries match the studio's clock.
function nairobiNow() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: 'numeric' }).formatToParts(new Date());
  const get = type => Number(parts.find(p => p.type === type).value);
  return { year: get('year'), month: get('month') - 1 };
}

const round1 = n => Math.round(n * 10) / 10;

// % change from previous to current. Going from 0 to something counts as +100%.
function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return round1(((current - previous) / previous) * 100);
}

function actionText(row) {
  if (row.status === 'booked') {
    return `Booked ${row.package_name ? `${row.package_name} package` : row.service}`;
  }
  if (row.status === 'contacted') return `Contacted · ${row.service}`;
  return `New enquiry · ${row.service}`;
}

export async function getAnalytics(requestedYear) {
  const now = nairobiNow();
  const year = requestedYear ?? now.year;

  // "vs last month" compares the current month (or December for past years).
  const refMonth = year === now.year ? now.month : 11;
  const prevMonth = refMonth - 1; // -1 means there is no earlier month this year

  const [monthlyRes, categoryRes, inquiryRes, outstandingRes, activeRes, recentRes] = await Promise.all([
    // Revenue = money received on booked inquiries; shoots = booked jobs whose date has passed.
    query(
      `SELECT EXTRACT(MONTH FROM ${JOB_DATE_SQL})::int AS month,
              COALESCE(SUM(amount_paid), 0) AS revenue,
              COUNT(*) FILTER (WHERE event_date IS NOT NULL AND event_date < ${TODAY_SQL}) AS shoots
       FROM inquiries
       WHERE status = 'booked'
         AND ${JOB_DATE_SQL} >= make_date($1::int, 1, 1)
         AND ${JOB_DATE_SQL} < make_date($1::int + 1, 1, 1)
       GROUP BY 1`,
      [year]
    ),
    // Completed shoots by service (the donut).
    query(
      `SELECT service, COUNT(*) AS value
       FROM inquiries
       WHERE status = 'booked'
         AND event_date IS NOT NULL AND event_date < ${TODAY_SQL}
         AND event_date >= make_date($1::int, 1, 1) AND event_date < make_date($1::int + 1, 1, 1)
       GROUP BY service
       ORDER BY value DESC, service`,
      [year]
    ),
    // Enquiries received per month, and how many of them ended up booked.
    query(
      `SELECT EXTRACT(MONTH FROM created_at AT TIME ZONE '${TZ}')::int AS month,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'booked') AS booked
       FROM inquiries
       WHERE (created_at AT TIME ZONE '${TZ}') >= make_date($1::int, 1, 1)
         AND (created_at AT TIME ZONE '${TZ}') < make_date($1::int + 1, 1, 1)
       GROUP BY 1`,
      [year]
    ),
    // Money still owed on booked jobs with an agreed price. Not tied to the selected year.
    query(
      `SELECT COALESCE(SUM(package_price - amount_paid), 0) AS outstanding
       FROM inquiries
       WHERE status = 'booked' AND package_price IS NOT NULL AND package_price > amount_paid`
    ),
    query(`SELECT COUNT(*) AS active FROM inquiries WHERE status IN ('new', 'contacted')`),
    query(
      `SELECT id, name, service, package_name, package_price, status,
              ${PAYMENT_STATUS_SQL} AS payment_status, updated_at
       FROM inquiries
       WHERE status <> 'closed'
       ORDER BY updated_at DESC, id DESC
       LIMIT 8`
    ),
  ]);

  const revenue = Array(12).fill(0);
  const shoots = Array(12).fill(0);
  for (const r of monthlyRes.rows) {
    revenue[r.month - 1] = Number(r.revenue);
    shoots[r.month - 1] = Number(r.shoots);
  }

  const inquiryTotal = Array(12).fill(0);
  const inquiryBooked = Array(12).fill(0);
  for (const r of inquiryRes.rows) {
    inquiryTotal[r.month - 1] = Number(r.total);
    inquiryBooked[r.month - 1] = Number(r.booked);
  }
  const monthlyRate = m => (m >= 0 && inquiryTotal[m] > 0 ? (inquiryBooked[m] / inquiryTotal[m]) * 100 : 0);

  const sum = list => list.reduce((s, n) => s + n, 0);
  const totalInquiries = sum(inquiryTotal);
  const conversionRate = totalInquiries > 0 ? round1((sum(inquiryBooked) / totalInquiries) * 100) : 0;

  return {
    year,
    revenue,
    shoots,
    categories: categoryRes.rows.map(r => ({ label: r.service, value: Number(r.value) })),
    kpis: {
      revenue: {
        total: sum(revenue),
        change: pctChange(revenue[refMonth], prevMonth >= 0 ? revenue[prevMonth] : 0),
      },
      bookings: {
        total: sum(shoots),
        change: pctChange(shoots[refMonth], prevMonth >= 0 ? shoots[prevMonth] : 0),
      },
      outstanding: {
        total: Number(outstandingRes.rows[0].outstanding),
        activeInquiries: Number(activeRes.rows[0].active),
      },
      conversion: {
        rate: conversionRate,
        // Percentage-point difference between this month's rate and last month's.
        change: round1(monthlyRate(refMonth) - monthlyRate(prevMonth)),
      },
    },
    recent: recentRes.rows.map(r => ({
      id: r.id,
      name: r.name,
      action: actionText(r),
      time: r.updated_at,
      amount: r.package_price === null ? null : Number(r.package_price),
      status: r.payment_status,
    })),
  };
}