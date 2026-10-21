// middleware/auth.js
import jwt from 'jsonwebtoken';

// Protects admin-only routes. Expects "Authorization: Bearer <token>".
// NOTE: make sure JWT_SECRET matches the secret your routes/auth.js uses to sign tokens.
export function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}