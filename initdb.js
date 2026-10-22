// initdb.js
import { query } from './db.js';
import bcrypt from 'bcrypt';

export async function initializeDatabase() {
  try {
    console.log("Initializing NeonDB tables for Blossom Snaps...");

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

    // 2. Packages (Rates) Table
    await query(`
      CREATE TABLE IF NOT EXISTS packages (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(50) NOT NULL CHECK (category IN ('photoshoot', 'event')),
        price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
        features TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_packages_category ON packages (category);
    `);

    // 3. Meetings Table
    await query(`
      CREATE TABLE IF NOT EXISTS meetings (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        meeting_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        category VARCHAR(100) NOT NULL CHECK (category IN (
          'Client Consultation',
          'Photo Shoot',
          'Video Editing Deadline',
          'Equipment Prep'
        )),
        client_email VARCHAR(255),
        description TEXT NOT NULL DEFAULT '',
        reminder VARCHAR(50) NOT NULL CHECK (reminder IN (
          '15 mins before',
          '30 mins before',
          '1 hour before',
          '1 day before'
        )),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings (meeting_date, start_time);
    `);

    // 4. Media (Cloudinary-backed gallery) Table
    await query(`
      CREATE TABLE IF NOT EXISTS media (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL CHECK (category IN (
          'Weddings',
          'Personal Photoshoots',
          'Couples',
          'Family',
          'Baby Bump',
          'Events & Commercial',
          'Video Reels'
        )),
        media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('image', 'video')),
        file_name VARCHAR(255) NOT NULL,
        file_size BIGINT NOT NULL DEFAULT 0,
        width INTEGER,
        height INTEGER,
        url TEXT NOT NULL,
        public_id TEXT UNIQUE NOT NULL,
        tags TEXT[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_media_category ON media (category);
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_media_type ON media (media_type);
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

    console.log("Database initialization (Admins, Packages, Meetings, Media tables) completed successfully.");
  } catch (error) {
    console.error("Failed to initialize database tables:", error);
    throw error;
  }
}