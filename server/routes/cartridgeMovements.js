const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

// List cartridge movements
router.get('/', authenticate, (req, res) => {
  const { cartridge_id, search, user_id, status_id, date_from, date_to } = req.query;

  let sql = `
    SELECT cm.*, 
      c.name as cartridge_name, c.barcode,
      fu.full_name as from_user_name,
      tu.full_name as to_user_name,
      fs.name as from_status_name, fs.color as from_status_color,
      ts.name as to_status_name, ts.color as to_status_color
    FROM cartridge_movements cm
    LEFT JOIN cartridges c ON cm.cartridge_id = c.id
    LEFT JOIN users fu ON cm.from_user_id = fu.id
    LEFT JOIN users tu ON cm.to_user_id = tu.id
    LEFT JOIN statuses fs ON cm.from_status_id = fs.id
    LEFT JOIN statuses ts ON cm.to_status_id = ts.id
  `;
  const conditions = [];
  const params = [];

  if (cartridge_id) { conditions.push('cm.cartridge_id = ?'); params.push(cartridge_id); }
  if (search) {
    conditions.push('(c.name LIKE ? OR c.barcode LIKE ? OR cm.comment LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (user_id) { conditions.push('(cm.from_user_id = ? OR cm.to_user_id = ?)'); params.push(user_id, user_id); }
  if (status_id) { conditions.push('(cm.from_status_id = ? OR cm.to_status_id = ?)'); params.push(status_id, status_id); }
  if (date_from) { conditions.push('cm.moved_at >= ?'); params.push(date_from); }
  if (date_to) { conditions.push('cm.moved_at <= ?'); params.push(date_to); }

  if (req.user.role !== 'admin') {
    conditions.push('(cm.from_user_id = ? OR cm.to_user_id = ? OR c.assigned_user_id = ?)');
    params.push(req.user.id, req.user.id, req.user.id);
  }

  if (conditions.length) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY cm.moved_at DESC';

  res.json(db.prepare(sql).all(...params));
});

// Move cartridge
router.post('/move', authenticate, (req, res) => {
  const { cartridge_id, to_user_id, to_status_id, to_location, comment } = req.body;
  if (!cartridge_id) return res.status(400).json({ error: 'Укажите картридж' });

  const cartridge = db.prepare('SELECT * FROM cartridges WHERE id = ?').get(cartridge_id);
  if (!cartridge) return res.status(404).json({ error: 'Картридж не найден' });

  // Regular users can only move to "Отдали на заправку" status
  // AND only if cartridge is NOT already in "Отдали на заправку"
  if (req.user.role !== 'admin') {
    if (!to_status_id) return res.status(403).json({ error: 'Укажите статус "Отдали на заправку"' });

    const refillStatus = db.prepare("SELECT id FROM statuses WHERE name = 'Отдали на заправку' AND scope = 'cartridge'").get();
    if (Number(to_status_id) !== refillStatus.id) {
      return res.status(403).json({ error: 'Пользователи могут перемещать картриджи только в статус "Отдали на заправку"' });
    }

    // Already on refill — user cannot change it
    if (cartridge.status_id === refillStatus.id) {
      return res.status(403).json({ error: 'Картридж уже на заправке. Только администратор может изменить статус.' });
    }

    // User can only move their own cartridges
    if (cartridge.assigned_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Вы можете перемещать только картриджи, закрепленные за вами' });
    }
  }

  const from_user_id = cartridge.assigned_user_id;
  const from_status_id = cartridge.status_id;
  const from_location = cartridge.location;

  db.prepare(`
    INSERT INTO cartridge_movements (cartridge_id, from_user_id, to_user_id, from_status_id, to_status_id, from_location, to_location, comment, moved_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cartridge_id,
    from_user_id,
    to_user_id || null,
    from_status_id,
    to_status_id || null,
    from_location,
    to_location || null,
    comment || null,
    req.user.id
  );

  db.prepare(`
    UPDATE cartridges SET status_id=?, assigned_user_id=?, location=?, updated_at=datetime('now') WHERE id=?
  `).run(
    to_status_id || from_status_id,
    to_user_id || from_user_id,
    to_location || from_location,
    cartridge_id
  );

  res.json({ ok: true });
});

// Batch move cartridges
router.post('/batch-move', authenticate, (req, res) => {
  const { cartridge_ids, to_status_id, to_location, comment } = req.body;
  if (!Array.isArray(cartridge_ids) || !cartridge_ids.length) {
    return res.status(400).json({ error: 'Выберите картриджи' });
  }
  if (!to_status_id) return res.status(400).json({ error: 'Укажите новый статус' });

  const refillStatus = db.prepare("SELECT id FROM statuses WHERE name = 'Отдали на заправку' AND scope = 'cartridge'").get();

  // Validate access for each cartridge
  for (const cid of cartridge_ids) {
    const cartridge = db.prepare('SELECT * FROM cartridges WHERE id = ?').get(cid);
    if (!cartridge) return res.status(404).json({ error: `Картридж #${cid} не найден` });

    if (req.user.role !== 'admin') {
      if (Number(to_status_id) !== refillStatus.id) {
        return res.status(403).json({ error: 'Пользователи могут перемещать картриджи только в статус "Отдали на заправку"' });
      }
      if (cartridge.status_id === refillStatus.id) {
        return res.status(403).json({ error: `Картридж "${cartridge.name}" уже на заправке` });
      }
      if (cartridge.assigned_user_id !== req.user.id) {
        return res.status(403).json({ error: `Картридж "${cartridge.name}" не закреплен за вами` });
      }
    }
  }

  const insertMovement = db.prepare(`
    INSERT INTO cartridge_movements (cartridge_id, from_user_id, to_user_id, from_status_id, to_status_id, from_location, to_location, comment, moved_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateCartridge = db.prepare(`
    UPDATE cartridges SET status_id=?, location=?, updated_at=datetime('now') WHERE id=?
  `);

  const batch = db.transaction(() => {
    const results = [];
    for (const cid of cartridge_ids) {
      const cartridge = db.prepare('SELECT * FROM cartridges WHERE id = ?').get(cid);

      insertMovement.run(
        cid,
        cartridge.assigned_user_id,
        cartridge.assigned_user_id,
        cartridge.status_id,
        to_status_id,
        cartridge.location,
        to_location || cartridge.location,
        comment || `Пакетная смены статуса → "${db.prepare('SELECT name FROM statuses WHERE id = ?').get(to_status_id).name}"`,
        req.user.id
      );

      updateCartridge.run(
        to_status_id,
        to_location || cartridge.location,
        cid
      );

      results.push({ id: cid, name: cartridge.name, ok: true });
    }
    return results;
  });

  res.json({ results: batch(), count: cartridge_ids.length });
});

// Update movement (admin only)
router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const { comment } = req.body;
  db.prepare('UPDATE cartridge_movements SET comment=? WHERE id=?').run(comment, req.params.id);
  res.json({ ok: true });
});

// Delete movement (admin only)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM cartridge_movements WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
