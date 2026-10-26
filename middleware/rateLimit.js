// middleware/rateLimit.js
// Small in-memory limiter (per IP) for public endpoints. It resets when the server
// restarts, which is fine for stopping spam. Needs `app.set('trust proxy', 1)` behind a host proxy.
export function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [ip, times] of hits) {
      const recent = times.filter(t => now - t < windowMs);
      if (recent.length) hits.set(ip, recent);
      else hits.delete(ip);
    }
  }, windowMs).unref();

  return function rateLimit(req, res, next) {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter(t => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: message });
    }
    recent.push(now);
    hits.set(req.ip, recent);
    next();
  };
}