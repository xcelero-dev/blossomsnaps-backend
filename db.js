// db.js
import { Pool } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.DATABASE_URL) {
  console.error("CRITICAL ERROR: DATABASE_URL is not set in environment variables.");
  process.exit(1);
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    console.error("Database Query Error:", { text, error: error.message });
    throw error;
  }
}