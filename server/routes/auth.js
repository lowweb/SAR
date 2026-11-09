const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { JWT_SECRET, authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: 'Укажите логин и пароль' });
  }

  const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }

  const token = jwt.sign(
    { id: user.id, login: user.login, role: user.role, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  const dept = user.department_id
    ? db.prepare('SELECT name FROM departments WHERE id = ?').get(user.department_id)
    : null;

  res.json({
    token,
    user: {
      id: user.id,
      login: user.login,
      full_name: user.full_name,
      role: user.role,
      department_id: user.department_id,
      department_name: dept?.name || null,
      email: user.email
    }
  });
});

router.get('/me', authenticate, (req, res) => {
  const user = db.prepare(`
    SELECT u.*, d.name as department_name
    FROM users u LEFT JOIN departments d ON u.department_id = d.id
    WHERE u.id = ?
  `).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  res.json({
    id: user.id,
    login: user.login,
    full_name: user.full_name,
    role: user.role,
    department_id: user.department_id,
    department_name: user.department_name,
    email: user.email
  });
});

module.exports = router;
