// initdb.js
import { query } from './db.js';
import bcrypt from 'bcrypt';

export async function initializeDatabase() {
  try {
    console.log("Initializing NeonDB tables for Blossom Snaps (Admins only)...");

    // 1. Admins Table
    await query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) DEFAULT 'Jerry Rawlings',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed Master Admin Account: blossomsnapsstudios@gmail.com
    const masterEmail = 'blossomsnapsstudios@gmail.com';
    const rawPassword = 'blossomsnapsadmin2026!!@';
    
    const adminCheck = await query('SELECT * FROM admins WHERE email = $1', [masterEmail]);
    
    if (adminCheck.rows.length === 0) {
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(rawPassword, saltRounds);
      
      await query(
        'INSERT INTO admins (email, password_hash, name) VALUES ($1, $2, $3)',
        [masterEmail, passwordHash, 'Jerry Rawlings']
      );
      console.log(`[SEED] Master admin account created successfully (${masterEmail}).`);
    } else {
      console.log("[SEED] Master admin account already exists.");
    }

    console.log("Database initialization (Admins table) completed successfully.");
  } catch (error) {
    console.error("Failed to initialize database tables:", error);
    throw error;
  }
}