const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

// List cartridges (with filters)
router.get('/', authenticate, (req, res) => {
  const { search, type_id, status_id, location, user_id } = req.query;

  let sql = `
    SELECT c.*, 
      ct.name as type_name,
      s.name as status_name, s.color as status_color,
      u.full_name as assigned_user_name
    FROM cartridges c
    LEFT JOIN equipment_types ct ON c.type_id = ct.id
    LEFT JOIN statuses s ON c.status_id = s.id
    LEFT JOIN users u ON c.assigned_user_id = u.id
  `;
  const conditions = [];
  const params = [];

  if (search) {
    conditions.push('(c.name LIKE ? OR c.barcode LIKE ? OR c.location LIKE ? OR c.notes LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (type_id) { conditions.push('c.type_id = ?'); params.push(type_id); }
  if (status_id) { conditions.push('c.status_id = ?'); params.push(status_id); }
  if (location) { conditions.push('c.location LIKE ?'); params.push(`%${location}%`); }
  if (user_id) { conditions.push('c.assigned_user_id = ?'); params.push(user_id); }

  // Regular users see only their own cartridges
  if (req.user.role !== 'admin') {
    conditions.push('c.assigned_user_id = ?');
    params.push(req.user.id);
  }

  if (conditions.length) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY c.name';

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// Get cartridge by ID
router.get('/:id', authenticate, (req, res) => {
  const row = db.prepare(`
    SELECT c.*, 
      ct.name as type_name,
      s.name as status_name, s.color as status_color,
      u.full_name as assigned_user_name
    FROM cartridges c
    LEFT JOIN equipment_types ct ON c.type_id = ct.id
    LEFT JOIN statuses s ON c.status_id = s.id
    LEFT JOIN users u ON c.assigned_user_id = u.id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!row) return res.status(404).json({ error: 'Картридж не найден' });

  // Regular users can only view their own cartridges
  if (req.user.role !== 'admin' && row.assigned_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  res.json(row);
});

// Create cartridge (admin only)
router.post('/', authenticate, requireAdmin, (req, res) => {
  const { name, barcode, type_id, status_id, assigned_user_id, location, notes } = req.body;
  if (!name || !barcode || !type_id || !status_id) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO cartridges (name, barcode, type_id, status_id, assigned_user_id, location, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(name, barcode, type_id, status_id, assigned_user_id || null, location || null, notes || null);
    res.json({ id: result.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Штрих-код уже существует' });
    }
    res.status(500).json({ error: 'Ошибка создания' });
  }
});

// Update cartridge (admin only)
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { name, barcode, type_id, status_id, assigned_user_id, location, notes } = req.body;
  try {
    db.prepare(`
      UPDATE cartridges SET name=?, barcode=?, type_id=?, status_id=?, assigned_user_id=?, location=?, notes=?, updated_at=datetime('now')
      WHERE id=?
    `).run(name, barcode, type_id, status_id, assigned_user_id || null, location || null, notes || null, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Штрих-код уже существует' });
    }
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// Delete cartridge (admin only)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM cartridge_movements WHERE cartridge_id = ?').run(req.params.id);
  db.prepare('DELETE FROM cartridges WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
