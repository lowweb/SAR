const jwt = require('jsonwebtoken');

const JWT_SECRET = 'sar-secret-key-change-in-production';

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'Требуется авторизация' });

  const token = header.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Недействительный токен' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Требуется роль администратора' });
  }
  next();
}

module.exports = { authenticate, requireAdmin, JWT_SECRET };
