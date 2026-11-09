const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { SETTING_KEYS, getSettings, invalidateTransport, sendTestEmail } = require('../notify');

const BOOL_KEYS = ['notify_enabled', 'notify_on_assign', 'notify_on_unassign', 'notify_on_status', 'notify_on_create', 'notify_on_delete'];

function publicSettings() {
  const cfg = getSettings();
  return {
    enabled: cfg.enabled,
    onAssign: cfg.onAssign,
    onUnassign: cfg.onUnassign,
    onStatus: cfg.onStatus,
    onCreate: cfg.onCreate,
    onDelete: cfg.onDelete,
    smtp_host: cfg.host,
    smtp_port: cfg.port,
    smtp_secure: cfg.secureMode,
    smtp_user: cfg.user,
    notify_from: cfg.from,
    smtp_pass_set: Boolean(cfg.pass)
  };
}

function upsert(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value == null ? '' : String(value));
}

// Получить настройки информирования (только админ)
router.get('/notifications', authenticate, requireAdmin, (req, res) => {
  res.json(publicSettings());
});

// Сохранить настройки информирования (только админ)
router.put('/notifications', authenticate, requireAdmin, (req, res) => {
  const b = req.body || {};

  for (const key of BOOL_KEYS) {
    if (b[key] !== undefined) upsert(key, b[key] ? '1' : '0');
  }
  if (b.smtp_host !== undefined) upsert('smtp_host', String(b.smtp_host).trim());
  if (b.smtp_port !== undefined) upsert('smtp_port', String(b.smtp_port).trim() || '465');
  if (b.smtp_secure !== undefined) {
    const mode = ['ssl', 'tls', 'none'].includes(b.smtp_secure) ? b.smtp_secure : 'ssl';
    upsert('smtp_secure', mode);
  }
  if (b.smtp_user !== undefined) upsert('smtp_user', String(b.smtp_user).trim());
  if (b.notify_from !== undefined) upsert('notify_from', String(b.notify_from).trim());
  // Пустой пароль = не менять сохранённый
  if (b.smtp_pass) upsert('smtp_pass', b.smtp_pass);

  invalidateTransport();
  res.json(publicSettings());
});

// Тестовая отправка письма (только админ)
router.post('/notifications/test', authenticate, requireAdmin, async (req, res) => {
  try {
    const messageId = await sendTestEmail((req.body?.to || '').trim());
    res.json({ ok: true, messageId });
  } catch (err) {
    res.status(502).json({ error: `Ошибка отправки: ${err.message}` });
  }
});

module.exports = router;
