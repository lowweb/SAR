const express = require('express');
const { db } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const { search, type_id, status_id, user_id, location } = req.query;
  let sql = `
    SELECT e.*, et.name as type_name, s.name as status_name, s.color as status_color,
           u.full_name as assigned_user_name, u.id as assigned_user_id
    FROM equipment e
    LEFT JOIN equipment_types et ON e.type_id = et.id
    LEFT JOIN statuses s ON e.status_id = s.id
    LEFT JOIN users u ON e.assigned_user_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role !== 'admin') {
    sql += ' AND e.assigned_user_id = ?';
    params.push(req.user.id);
  } else if (user_id) {
    sql += ' AND e.assigned_user_id = ?';
    params.push(user_id);
  }

  if (search) {
    sql += ' AND (e.name LIKE ? OR e.barcode LIKE ? OR e.serial_number LIKE ? OR e.inventory_number LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  if (type_id) { sql += ' AND e.type_id = ?'; params.push(type_id); }
  if (status_id) { sql += ' AND e.status_id = ?'; params.push(status_id); }
  if (location) { sql += ' AND e.location LIKE ?'; params.push(`%${location}%`); }

  sql += ' ORDER BY e.id DESC';

  const items = db.prepare(sql).all(...params);
  res.json(items);
});

router.get('/:id', authenticate, (req, res) => {
  const item = db.prepare(`
    SELECT e.*, et.name as type_name, s.name as status_name, s.color as status_color,
           u.full_name as assigned_user_name, u.id as assigned_user_id
    FROM equipment e
    LEFT JOIN equipment_types et ON e.type_id = et.id
    LEFT JOIN statuses s ON e.status_id = s.id
    LEFT JOIN users u ON e.assigned_user_id = u.id
    WHERE e.id = ?
  `).get(req.params.id);

  if (!item) return res.status(404).json({ error: 'Оборудование не найдено' });
  if (req.user.role !== 'admin' && item.assigned_user_id !== req.user.id) {
    return res.status(403).json({ error: 'Доступ запрещён' });
  }

  res.json(item);
});

router.post('/', authenticate, (req, res) => {
  const { name, serial_number, inventory_number, barcode, type_id, status_id, assigned_user_id, location, notes } = req.body;

  if (!name || !barcode || !type_id || !status_id) {
    return res.status(400).json({ error: 'Заполните обязательные поля: название, штрих-код, тип, статус' });
  }

  const existing = db.prepare('SELECT id FROM equipment WHERE barcode = ?').get(barcode);
  if (existing) return res.status(400).json({ error: 'Оборудование с таким штрих-кодом уже существует' });

  const finalUserId = req.user.role === 'admin' ? (assigned_user_id || null) : req.user.id;

  const result = db.prepare(`
    INSERT INTO equipment (name, serial_number, inventory_number, barcode, type_id, status_id, assigned_user_id, location, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, serial_number || null, inventory_number || null, barcode, type_id, status_id, finalUserId, location || null, notes || null);

  // Log movement
  db.prepare(`
    INSERT INTO movement_history (equipment_id, from_user_id, to_user_id, from_status_id, to_status_id, from_location, to_location, comment, moved_by)
    VALUES (?, NULL, ?, NULL, ?, NULL, ?, 'Добавлено оборудование', ?)
  `).run(result.lastInsertRowid, finalUserId, status_id, location || null, req.user.id);

  const item = db.prepare('SELECT * FROM equipment WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(item);
});

router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { name, serial_number, inventory_number, barcode, type_id, status_id, assigned_user_id, location, notes } = req.body;
  const existing = db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Оборудование не найдено' });

  if (barcode && barcode !== existing.barcode) {
    const dup = db.prepare('SELECT id FROM equipment WHERE barcode = ? AND id != ?').get(barcode, req.params.id);
    if (dup) return res.status(400).json({ error: 'Штрих-код уже используется' });
  }

  db.prepare(`
    UPDATE equipment SET name=?, serial_number=?, inventory_number=?, barcode=?, type_id=?, status_id=?, assigned_user_id=?, location=?, notes=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    name || existing.name,
    serial_number !== undefined ? serial_number : existing.serial_number,
    inventory_number !== undefined ? inventory_number : existing.inventory_number,
    barcode || existing.barcode,
    type_id || existing.type_id,
    status_id || existing.status_id,
    assigned_user_id !== undefined ? assigned_user_id : existing.assigned_user_id,
    location !== undefined ? location : existing.location,
    notes !== undefined ? notes : existing.notes,
    req.params.id
  );

  res.json({ success: true });
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM equipment WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Оборудование не найдено' });

  db.prepare('DELETE FROM movement_history WHERE equipment_id = ?').run(req.params.id);
  db.prepare('DELETE FROM equipment WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
