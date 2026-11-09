const nodemailer = require('nodemailer');
const { db } = require('./db');

// Ключи настроек информирования (только оборудование)
const SETTING_KEYS = [
  'notify_enabled',
  'notify_on_assign',
  'notify_on_unassign',
  'notify_on_status',
  'smtp_host',
  'smtp_port',
  'smtp_secure',
  'smtp_user',
  'smtp_pass',
  'notify_from'
];

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    enabled: map.notify_enabled === '1',
    onAssign: map.notify_on_assign !== '0',
    onUnassign: map.notify_on_unassign !== '0',
    onStatus: map.notify_on_status !== '0',
    host: map.smtp_host || '',
    port: Number(map.smtp_port) || 465,
    secureMode: map.smtp_secure || 'ssl',
    user: map.smtp_user || '',
    pass: map.smtp_pass || '',
    from: map.notify_from || map.smtp_user || ''
  };
}

let transportCache = null;
let transportCacheKey = '';

function getTransport(cfg) {
  const key = JSON.stringify([cfg.host, cfg.port, cfg.secureMode, cfg.user, cfg.pass]);
  if (transportCache && transportCacheKey === key) return transportCache;
  transportCache = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secureMode === 'ssl', // ssl: прямое TLS (465); tls: STARTTLS (587); none: без шифрования
    requireTLS: cfg.secureMode === 'tls',
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined
  });
  transportCacheKey = key;
  return transportCache;
}

function invalidateTransport() {
  transportCache = null;
  transportCacheKey = '';
}

function getUser(id) {
  if (!id) return null;
  return db.prepare('SELECT id, full_name, email FROM users WHERE id = ?').get(id);
}

function getStatusName(id) {
  if (!id) return null;
  return db.prepare('SELECT name FROM statuses WHERE id = ?').get(id)?.name || null;
}

function buildItemBlock(ev) {
  const lines = [];
  lines.push(`Оборудование: ${ev.itemName}`);
  if (ev.barcode) lines.push(`Штрих-код: ${ev.barcode}`);
  if (ev.inventoryNumber) lines.push(`Инв. номер: ${ev.inventoryNumber}`);
  lines.push(`Статус: ${ev.fromStatusName || '—'} → ${ev.toStatusName || '—'}`);
  if (ev.location) lines.push(`Расположение: ${ev.location}`);
  if (ev.comment) lines.push(`Комментарий: ${ev.comment}`);
  if (ev.moverName) lines.push(`Кто выполнил перемещение: ${ev.moverName}`);
  return lines.join('\n');
}

// Отправка без блокировки ответа API: ошибки только логируются
function sendMailSafe(cfg, to, subject, text) {
  return getTransport(cfg)
    .sendMail({ from: cfg.from || cfg.user, to, subject: `[SAR] ${subject}`, text })
    .catch(err => console.error('[notify] ошибка отправки на', to, ':', err.message));
}

/**
 * Уведомление о перемещении/смене статуса оборудования.
 * ev: { itemName, barcode, inventoryNumber, fromUserId, toUserId, fromStatusId, toStatusId, location, comment, moverId }
 * Вызывается после успешной записи в БД; не бросает исключений.
 */
function notifyEquipmentMovement(ev) {
  try {
    const cfg = getSettings();
    if (!cfg.enabled || !cfg.host) return;

    const enriched = {
      ...ev,
      fromStatusName: getStatusName(ev.fromStatusId),
      toStatusName: getStatusName(ev.toStatusId),
      moverName: getUser(ev.moverId ?? null)?.full_name || 'система'
    };
    const body = buildItemBlock(enriched);
    const jobs = [];

    // Перемещение на пользователя с другого
    if (cfg.onAssign && ev.toUserId && ev.toUserId !== ev.fromUserId) {
      const u = getUser(ev.toUserId);
      if (u?.email) jobs.push(sendMailSafe(cfg, u.email, `Вам закреплено оборудование: ${ev.itemName}`, `${u.full_name}, вам закреплено оборудование.\n\n${body}`));
    }

    // Перемещение с пользователя (на другого или в освобождение)
    if (cfg.onUnassign && ev.fromUserId && ev.fromUserId !== ev.toUserId) {
      const u = getUser(ev.fromUserId);
      if (u?.email) jobs.push(sendMailSafe(cfg, u.email, `С вас снято оборудование: ${ev.itemName}`, `${u.full_name}, с вас снято оборудование.\n\n${body}`));
    }

    // Смена статуса в рамках пользователя
    if (cfg.onStatus && ev.fromUserId && ev.fromUserId === ev.toUserId && ev.fromStatusId !== ev.toStatusId) {
      const u = getUser(ev.toUserId);
      if (u?.email) jobs.push(sendMailSafe(cfg, u.email, `Смена статуса: ${ev.itemName}`, `${u.full_name}, изменён статус вашего оборудования.\n\n${body}`));
    }

    if (jobs.length) Promise.allSettled(jobs).catch(() => {});
  } catch (err) {
    console.error('[notify] notifyEquipmentMovement:', err.message);
  }
}

// Проверка SMTP тестовым письмом (ожидает результат — вызывается из админки)
async function sendTestEmail(to) {
  const cfg = getSettings();
  if (!cfg.host) throw new Error('Не указан SMTP-сервер');
  if (!to) throw new Error('Укажите адрес получателя');
  const info = await getTransport(cfg).sendMail({
    from: cfg.from || cfg.user,
    to,
    subject: '[SAR] Тестовое письмо информирования',
    text: 'Это тестовое письмо из системы учёта оборудования SAR.\nНастройки SMTP верны.'
  });
  return info.messageId;
}

module.exports = { SETTING_KEYS, getSettings, invalidateTransport, notifyEquipmentMovement, sendTestEmail };
