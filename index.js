// index.js
import dotenv from 'dotenv';
dotenv.config(); // must run before anything that reads process.env (e.g. the Cloudinary config)

import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './initdb.js';
import authRoutes from './routes/auth.js';
import packageRoutes from './routes/packages.js';
import meetingRoutes from './routes/meetings.js';
import mediaRoutes from './routes/media.js';
import { isCloudinaryConfigured } from './config/cloudinary.js';

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// Register Routes
app.use('/api/auth', authRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/media', mediaRoutes);

app.get('/', (req, res) => {
  res.json({ status: 'Blossom Snaps Studio API is running live 🌸' });
});

// Start Server and Initialize NeonDB Tables Immediately
async function startServer() {
  try {
    await initializeDatabase();

    if (!isCloudinaryConfigured()) {
      console.warn('[WARN] Cloudinary env vars are missing. Media uploads will not work until they are set.');
    }

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server due to database initialization failure:', error);
    process.exit(1);
  }
}

startServer();