// index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './initdb.js';
import authRoutes from './routes/auth.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());

// Register Auth Routes
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
  res.json({ status: 'Blossom Snaps Studio Admin Auth API is running live 🌸' });
});

// Start Server and Initialize NeonDB Admins Table Immediately
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server due to database initialization failure:', error);
    process.exit(1);
  }
}

startServer();