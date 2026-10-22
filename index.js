// index.js
import dotenv from 'dotenv';
dotenv.config(); // must run before anything that reads process.env (e.g. the Cloudinary config)

import express from 'express';
import cors from 'cors';
import { initializeDatabase } from './initdb.js';
import authRoutes from './routes/auth.js';
import packageRoutes from './routes/packages.js';
import analyticsRoutes from './routes/analytics.js';
import meetingRoutes from './routes/meetings.js';
import mediaRoutes from './routes/media.js';
import inquiryRoutes from './routes/inquiries.js';
import { isCloudinaryConfigured } from './config/cloudinary.js';

const app = express();
const PORT = process.env.PORT || 10000;

// The API sits behind a proxy on the host (Render etc.), so trust it.
// Without this, req.ip is the proxy's address and the enquiry rate limit would
// treat every visitor as the same person.
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(express.json());

// Register Routes
app.use('/api/auth', authRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/inquiries', inquiryRoutes);
app.use('/api/analytics', analyticsRoutes);


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