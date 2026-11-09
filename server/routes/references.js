const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// --- Departments ---
router.get('/departments', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM departments ORDER BY name').all());
});

router.post('/departments', authenticate, requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название' });
  try {
    const r = db.prepare('INSERT INTO departments (name) VALUES (?)').run(name);
    res.status(201).json({ id: r.lastInsertRowid, name });
  } catch {
    res.status(400).json({ error: 'Департамент уже существует' });
  }
});

router.put('/departments/:id', authenticate, requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название' });
  db.prepare('UPDATE departments SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ success: true });
});

router.delete('/departments/:id', authenticate, requireAdmin, (req, res) => {
  const used = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE department_id = ?').get(req.params.id).cnt;
  if (used > 0) return res.status(400).json({ error: 'Департамент используется пользователями' });
  db.prepare('DELETE FROM departments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- Equipment Types ---
router.get('/equipment-types', authenticate, (req, res) => {
  res.json(db.prepare('SELECT * FROM equipment_types ORDER BY name').all());
});

router.post('/equipment-types', authenticate, requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название' });
  try {
    const r = db.prepare('INSERT INTO equipment_types (name) VALUES (?)').run(name);
    res.status(201).json({ id: r.lastInsertRowid, name });
  } catch {
    res.status(400).json({ error: 'Тип уже существует' });
  }
});

router.put('/equipment-types/:id', authenticate, requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название' });
  db.prepare('UPDATE equipment_types SET name = ? WHERE id = ?').run(name, req.params.id);
  res.json({ success: true });
});

router.delete('/equipment-types/:id', authenticate, requireAdmin, (req, res) => {
  const used = db.prepare('SELECT COUNT(*) as cnt FROM equipment WHERE type_id = ?').get(req.params.id).cnt;
  if (used > 0) return res.status(400).json({ error: 'Тип используется оборудованием' });
  db.prepare('DELETE FROM equipment_types WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- Statuses ---
router.get('/statuses', authenticate, (req, res) => {
  const { scope } = req.query;
  if (scope === 'equipment' || scope === 'cartridge') {
    return res.json(db.prepare('SELECT * FROM statuses WHERE scope = ? ORDER BY id').all(scope));
  }
  res.json(db.prepare('SELECT * FROM statuses ORDER BY id').all());
});

router.post('/statuses', authenticate, requireAdmin, (req, res) => {
  const { name, color, scope } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название' });
  const finalScope = scope === 'cartridge' ? 'cartridge' : 'equipment';
  try {
    const r = db.prepare('INSERT INTO statuses (name, color, scope) VALUES (?, ?, ?)').run(name, color || '#6c757d', finalScope);
    res.status(201).json({ id: r.lastInsertRowid, name, color: color || '#6c757d', scope: finalScope });
  } catch {
    res.status(400).json({ error: 'Статус уже существует' });
  }
});

router.put('/statuses/:id', authenticate, requireAdmin, (req, res) => {
  const { name, color, scope } = req.body;
  if (!name) return res.status(400).json({ error: 'Укажите название' });
  const status = db.prepare('SELECT * FROM statuses WHERE id = ?').get(req.params.id);
  if (!status) return res.status(404).json({ error: 'Статус не найден' });
  if (scope && scope !== status.scope) {
    return res.status(400).json({ error: 'Статус относится к другому справочнику' });
  }
  db.prepare('UPDATE statuses SET name = ?, color = ? WHERE id = ?').run(name, color || '#6c757d', req.params.id);
  res.json({ success: true });
});

router.delete('/statuses/:id', authenticate, requireAdmin, (req, res) => {
  const status = db.prepare('SELECT * FROM statuses WHERE id = ?').get(req.params.id);
  if (!status) return res.status(404).json({ error: 'Статус не найден' });
  const id = req.params.id;
  const used = status.scope === 'cartridge'
    ? db.prepare('SELECT COUNT(*) as cnt FROM cartridges WHERE status_id = ?').get(id).cnt
      + db.prepare('SELECT COUNT(*) as cnt FROM cartridge_movements WHERE from_status_id = ? OR to_status_id = ?').get(id, id).cnt
    : db.prepare('SELECT COUNT(*) as cnt FROM equipment WHERE status_id = ?').get(id).cnt
      + db.prepare('SELECT COUNT(*) as cnt FROM movement_history WHERE from_status_id = ? OR to_status_id = ?').get(id, id).cnt;
  if (used > 0) return res.status(400).json({ error: 'Статус используется' });
  db.prepare('DELETE FROM statuses WHERE id = ?').run(id);
  res.json({ success: true });
});

// --- Users ---
router.get('/users', authenticate, requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.login, u.full_name, u.role, u.department_id, u.email, u.created_at,
           d.name as department_name
    FROM users u LEFT JOIN departments d ON u.department_id = d.id
    ORDER BY u.full_name
  `).all();
  res.json(users);
});

router.get('/users/all', authenticate, (req, res) => {
  const users = db.prepare('SELECT id, full_name, login FROM users ORDER BY full_name').all();
  res.json(users);
});

router.post('/users', authenticate, requireAdmin, (req, res) => {
  const { login, password, full_name, role, department_id, email } = req.body;
  if (!login || !password || !full_name) {
    return res.status(400).json({ error: 'Заполните обязательные поля: логин, пароль, ФИО' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE login = ?').get(login);
  if (existing) return res.status(400).json({ error: 'Логин уже существует' });

  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare('INSERT INTO users (login, password_hash, full_name, role, department_id, email) VALUES (?, ?, ?, ?, ?, ?)')
    .run(login, hash, full_name, role || 'user', department_id || null, email || null);
  res.status(201).json({ id: r.lastInsertRowid, login, full_name, role: role || 'user' });
});

router.put('/users/:id', authenticate, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Пользователь не найден' });

  const { login, password, full_name, role, department_id, email } = req.body;

  if (login && login !== existing.login) {
    const dup = db.prepare('SELECT id FROM users WHERE login = ? AND id != ?').get(login, req.params.id);
    if (dup) return res.status(400).json({ error: 'Логин уже используется' });
  }

  const hash = password ? bcrypt.hashSync(password, 10) : existing.password_hash;
  db.prepare('UPDATE users SET login=?, password_hash=?, full_name=?, role=?, department_id=?, email=? WHERE id=?')
    .run(
      login || existing.login, hash,
      full_name || existing.full_name,
      role || existing.role,
      department_id !== undefined ? department_id : existing.department_id,
      email !== undefined ? email : existing.email,
      req.params.id
    );
  res.json({ success: true });
});

router.delete('/users/:id', authenticate, requireAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Нельзя удалить свою учётную запись' });
  }
  const hasEquipment = db.prepare('SELECT COUNT(*) as cnt FROM equipment WHERE assigned_user_id = ?').get(req.params.id).cnt;
  if (hasEquipment > 0) return res.status(400).json({ error: 'Пользователь имеет закреплённое оборудование' });
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
