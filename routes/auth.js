// routes/auth.js
import express from 'express';
import bcrypt from 'bcrypt';
import { query } from '../db.js';

const router = express.Router();

// 1. Verify Email
router.post('/verify-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const result = await query('SELECT email FROM admins WHERE email = $1', [email.trim().toLowerCase()]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Unauthorized email address.' });
    }

    return res.status(200).json({ success: true, message: 'Email verified' });
  } catch (error) {
    return res.status(500).json({ error: 'Server error during email verification' });
  }
});

// 2. Sign In & Compare Password Hash
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const result = await query('SELECT * FROM admins WHERE email = $1', [email.trim().toLowerCase()]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const admin = result.rows[0];

    // COMPARE TYPEWRITTEN PASSWORD WITH STORED HASH
    const isValid = await bcrypt.compare(password, admin.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

    return res.status(200).json({
      success: true,
      admin: { id: admin.id, email: admin.email, name: admin.name }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Server error during sign in' });
  }
});

export default router;