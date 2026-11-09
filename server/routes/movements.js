const express = require('express');
const { db } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { notifyEquipmentMovement } = require('../notify');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const { search, equipment_id, user_id, date_from, date_to, status_id, type_id } = req.query;
  let sql = `
    SELECT mh.*,
      e.name as equipment_name, e.barcode,
      fu.full_name as from_user_name, tu.full_name as to_user_name,
      fs.name as from_status_name, ts.name as to_status_name
    FROM movement_history mh
    LEFT JOIN equipment e ON mh.equipment_id = e.id
    LEFT JOIN users fu ON mh.from_user_id = fu.id
    LEFT JOIN users tu ON mh.to_user_id = tu.id
    LEFT JOIN statuses fs ON mh.from_status_id = fs.id
    LEFT JOIN statuses ts ON mh.to_status_id = ts.id
    WHERE 1=1
  `;
  const params = [];

  if (req.user.role !== 'admin') {
    sql += ' AND (e.assigned_user_id = ? OR mh.from_user_id = ? OR mh.to_user_id = ?)';
    params.push(req.user.id, req.user.id, req.user.id);
  } else if (user_id) {
    sql += ' AND (mh.from_user_id = ? OR mh.to_user_id = ?)';
    params.push(user_id, user_id);
  }

  if (equipment_id) { sql += ' AND mh.equipment_id = ?'; params.push(equipment_id); }
  if (search) {
    sql += ' AND (e.name LIKE ? OR e.barcode LIKE ? OR mh.comment LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (date_from) { sql += ' AND mh.moved_at >= ?'; params.push(date_from); }
  if (date_to) { sql += ' AND mh.moved_at <= ?'; params.push(date_to + ' 23:59:59'); }
  if (status_id) { sql += ' AND (mh.from_status_id = ? OR mh.to_status_id = ?)'; params.push(status_id, status_id); }
  if (type_id) { sql += ' AND e.type_id = ?'; params.push(type_id); }

  sql += ' ORDER BY mh.moved_at DESC';
  const items = db.prepare(sql).all(...params);
  res.json(items);
});

router.post('/move', authenticate, requireAdmin, (req, res) => {
  const { equipment_id, to_user_id, to_status_id, to_location, comment } = req.body;

  if (!equipment_id) return res.status(400).json({ error: 'Укажите оборудование' });

  const equipment = db.prepare('SELECT * FROM equipment WHERE id = ?').get(equipment_id);
  if (!equipment) return res.status(404).json({ error: 'Оборудование не найдено' });

  db.prepare(`
    INSERT INTO movement_history (equipment_id, from_user_id, to_user_id, from_status_id, to_status_id, from_location, to_location, comment, moved_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    equipment_id,
    equipment.assigned_user_id,
    to_user_id !== undefined ? to_user_id : equipment.assigned_user_id,
    equipment.status_id,
    to_status_id || equipment.status_id,
    equipment.location,
    to_location || equipment.location,
    comment || null,
    req.user.id
  );

  const updates = [];
  const updateParams = [];
  if (to_user_id !== undefined) { updates.push('assigned_user_id = ?'); updateParams.push(to_user_id); }
  if (to_status_id) { updates.push('status_id = ?'); updateParams.push(to_status_id); }
  if (to_location !== undefined) { updates.push('location = ?'); updateParams.push(to_location); }
  updates.push("updated_at = datetime('now')");
  updateParams.push(equipment_id);

  db.prepare(`UPDATE equipment SET ${updates.join(', ')} WHERE id = ?`).run(...updateParams);

  const effectiveToUser = to_user_id !== undefined ? to_user_id : equipment.assigned_user_id;
  notifyEquipmentMovement({
    itemName: equipment.name,
    barcode: equipment.barcode,
    inventoryNumber: equipment.inventory_number,
    fromUserId: equipment.assigned_user_id,
    toUserId: effectiveToUser,
    fromStatusId: equipment.status_id,
    toStatusId: to_status_id || equipment.status_id,
    location: to_location !== undefined ? to_location : equipment.location,
    comment: comment || null,
    moverId: req.user.id
  });

  res.json({ success: true });
});

router.put('/:id', authenticate, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM movement_history WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Запись не найдена' });

  const { from_user_id, to_user_id, from_status_id, to_status_id, from_location, to_location, comment, moved_at } = req.body;

  db.prepare(`
    UPDATE movement_history SET
      from_user_id = ?, to_user_id = ?, from_status_id = ?, to_status_id = ?,
      from_location = ?, to_location = ?, comment = ?, moved_at = ?
    WHERE id = ?
  `).run(
    from_user_id ?? existing.from_user_id,
    to_user_id ?? existing.to_user_id,
    from_status_id ?? existing.from_status_id,
    to_status_id ?? existing.to_status_id,
    from_location ?? existing.from_location,
    to_location ?? existing.to_location,
    comment ?? existing.comment,
    moved_at ?? existing.moved_at,
    req.params.id
  );

  res.json({ success: true });
});

router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM movement_history WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Запись не найдена' });

  db.prepare('DELETE FROM movement_history WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
