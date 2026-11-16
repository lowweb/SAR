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

// Роли:
//  user     — видит только свои остатки, может сдать свой картридж на заправку
//  operator — видит все остатки и выполняет любые перемещения/правки, как администратор,
//             но не имеет доступа к блоку администрирования
//  admin    — всё
const ROLES = ['user', 'operator', 'admin'];
const STAFF_ROLES = ['operator', 'admin'];

// Работа с остатками (видеть все, перемещать, редактировать)
function isStaff(user) {
  return STAFF_ROLES.includes(user?.role);
}

// Блок администрирования (пользователи, справочники, настройки уведомлений)
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Требуется роль администратора' });
  }
  next();
}

// Любые действия с остатками: администратор или оператор
function requireStaff(req, res, next) {
  if (!isStaff(req.user)) {
    return res.status(403).json({ error: 'Требуется роль оператора или администратора' });
  }
  next();
}

module.exports = { authenticate, requireAdmin, requireStaff, isStaff, ROLES, JWT_SECRET };
