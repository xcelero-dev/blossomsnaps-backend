// routes/auth.js
import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const router = express.Router();

// Creates a signed JWT for an admin. "Remember me" keeps the session for 30 days, otherwise 1 day.
function signToken(admin, rememberMe) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set');
  }
  return jwt.sign(
    { id: admin.id, email: admin.email },
    process.env.JWT_SECRET,
    { expiresIn: rememberMe ? '30d' : '1d' }
  );
}

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
    const { email, password, rememberMe } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const result = await query('SELECT * FROM admins WHERE email = $1', [email.trim().toLowerCase()]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const admin = result.rows[0];

    // COMPARE TYPEWRITTEN PASSWORD WITH STORED HASH
    const isValid = await bcrypt.compare(password, admin.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

    // Issue the session token
    const token = signToken(admin, Boolean(rememberMe));

    return res.status(200).json({
      success: true,
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name }
    });
  } catch (error) {
    console.error('Sign in error:', error);
    return res.status(500).json({ error: 'Server error during sign in' });
  }
});

export default router;