const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(process.env.SAR_DB_PATH || path.join(__dirname, 'sar.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initialize() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS equipment_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6c757d',
      scope TEXT NOT NULL DEFAULT 'equipment' CHECK(scope IN ('equipment', 'cartridge')),
      UNIQUE(name, scope)
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user', 'admin')),
      department_id INTEGER,
      email TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      serial_number TEXT,
      inventory_number TEXT,
      barcode TEXT NOT NULL UNIQUE,
      type_id INTEGER NOT NULL,
      status_id INTEGER NOT NULL,
      assigned_user_id INTEGER,
      location TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (type_id) REFERENCES equipment_types(id),
      FOREIGN KEY (status_id) REFERENCES statuses(id),
      FOREIGN KEY (assigned_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS movement_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL,
      from_user_id INTEGER,
      to_user_id INTEGER,
      from_status_id INTEGER,
      to_status_id INTEGER,
      from_location TEXT,
      to_location TEXT,
      comment TEXT,
      moved_at TEXT DEFAULT (datetime('now')),
      moved_by INTEGER NOT NULL,
      FOREIGN KEY (equipment_id) REFERENCES equipment(id),
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (to_user_id) REFERENCES users(id),
      FOREIGN KEY (from_status_id) REFERENCES statuses(id),
      FOREIGN KEY (to_status_id) REFERENCES statuses(id),
      FOREIGN KEY (moved_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS cartridges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      barcode TEXT NOT NULL UNIQUE,
      type_id INTEGER NOT NULL,
      status_id INTEGER NOT NULL,
      assigned_user_id INTEGER,
      location TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (type_id) REFERENCES equipment_types(id),
      FOREIGN KEY (status_id) REFERENCES statuses(id),
      FOREIGN KEY (assigned_user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS cartridge_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cartridge_id INTEGER NOT NULL,
      from_user_id INTEGER,
      to_user_id INTEGER,
      from_status_id INTEGER,
      to_status_id INTEGER,
      from_location TEXT,
      to_location TEXT,
      comment TEXT,
      moved_at TEXT DEFAULT (datetime('now')),
      moved_by INTEGER NOT NULL,
      FOREIGN KEY (cartridge_id) REFERENCES cartridges(id),
      FOREIGN KEY (from_user_id) REFERENCES users(id),
      FOREIGN KEY (to_user_id) REFERENCES users(id),
      FOREIGN KEY (from_status_id) REFERENCES statuses(id),
      FOREIGN KEY (to_status_id) REFERENCES statuses(id),
      FOREIGN KEY (moved_by) REFERENCES users(id)
    );
  `);

  migrateStatusScopes();

  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt;
  if (userCount === 0) {
    seed();
  } else {
    const refillStatus = db.prepare("SELECT id FROM statuses WHERE name = 'Отдали на заправку' AND scope = 'cartridge'").get();
    if (!refillStatus) {
      db.prepare("INSERT INTO statuses (name, color, scope) VALUES ('Отдали на заправку', '#fd7e14', 'cartridge')").run();
    }
  }

  const cartridgeCount = db.prepare('SELECT COUNT(*) as cnt FROM cartridges').get().cnt;
  if (cartridgeCount === 0) {
    seedCartridges();
  }

  // Миграция: добавить поле inventory_number и заполнить уже существующие позиции
  const eqColumns = db.prepare('PRAGMA table_info(equipment)').all();
  if (!eqColumns.some((c) => c.name === 'inventory_number')) {
    db.exec('ALTER TABLE equipment ADD COLUMN inventory_number TEXT');
  }
  const unnumbered = db.prepare(
    "SELECT id FROM equipment WHERE inventory_number IS NULL OR inventory_number = '' ORDER BY id"
  ).all();
  if (unnumbered.length > 0) {
    const setNumber = db.prepare('UPDATE equipment SET inventory_number = ? WHERE id = ?');
    const backfill = db.transaction(() => {
      unnumbered.forEach((row, i) => {
        setNumber.run(String(i + 1).padStart(10, '0'), row.id);
      });
    });
    backfill();
  }
}

// Разделение справочника статусов: добавляем scope и выносим статусы,
// которые используют картриджи, в отдельный справочник (scope='cartridge').
function migrateStatusScopes() {
  const cols = db.prepare('PRAGMA table_info(statuses)').all();
  if (!cols.some((c) => c.name === 'scope')) {
    db.pragma('foreign_keys = OFF');
    const migrate = db.transaction(() => {
      db.exec(`
        CREATE TABLE statuses_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          color TEXT DEFAULT '#6c757d',
          scope TEXT NOT NULL DEFAULT 'equipment' CHECK(scope IN ('equipment', 'cartridge')),
          UNIQUE(name, scope)
        );
        INSERT INTO statuses_new (id, name, color, scope)
          SELECT id, name, color, 'equipment' FROM statuses;
        DROP TABLE statuses;
        ALTER TABLE statuses_new RENAME TO statuses;
      `);

      const usedIds = db.prepare(`
        SELECT DISTINCT status_id FROM cartridges WHERE status_id IS NOT NULL
        UNION
        SELECT DISTINCT from_status_id FROM cartridge_movements WHERE from_status_id IS NOT NULL
        UNION
        SELECT DISTINCT to_status_id FROM cartridge_movements WHERE to_status_id IS NOT NULL
      `).all();

      for (const { status_id } of usedIds) {
        const st = db.prepare('SELECT * FROM statuses WHERE id = ?').get(status_id);
        if (!st || st.scope !== 'equipment') continue;
        const copy = db.prepare("INSERT INTO statuses (name, color, scope) VALUES (?, ?, 'cartridge')").run(st.name, st.color);
        const newId = copy.lastInsertRowid;
        db.prepare('UPDATE cartridges SET status_id = ? WHERE status_id = ?').run(newId, status_id);
        db.prepare('UPDATE cartridge_movements SET from_status_id = ? WHERE from_status_id = ?').run(newId, status_id);
        db.prepare('UPDATE cartridge_movements SET to_status_id = ? WHERE to_status_id = ?').run(newId, status_id);
      }
    });
    migrate();
    db.pragma('foreign_keys = ON');
  }

  // Справочники полностью независимы: картриджные статусы не должны оставаться в списке оборудования
  const refillInEquip = db.prepare("SELECT id FROM statuses WHERE name = 'Отдали на заправку' AND scope = 'equipment'").get();
  if (refillInEquip) {
    const used = db.prepare('SELECT COUNT(*) as cnt FROM equipment WHERE status_id = ?').get(refillInEquip.id).cnt
      + db.prepare('SELECT COUNT(*) as cnt FROM movement_history WHERE from_status_id = ? OR to_status_id = ?').get(refillInEquip.id, refillInEquip.id).cnt;
    if (used === 0) {
      db.prepare('DELETE FROM statuses WHERE id = ?').run(refillInEquip.id);
    }
  }

  const refill = db.prepare("SELECT id FROM statuses WHERE name = 'Отдали на заправку' AND scope = 'cartridge'").get();
  if (!refill) {
    db.prepare("INSERT INTO statuses (name, color, scope) VALUES ('Отдали на заправку', '#fd7e14', 'cartridge')").run();
  }
}

function seed() {
  const insertDept = db.prepare('INSERT INTO departments (name) VALUES (?)');
  const insertType = db.prepare('INSERT INTO equipment_types (name) VALUES (?)');
  const insertStatus = db.prepare('INSERT INTO statuses (name, color, scope) VALUES (?, ?, ?)');
  const insertUser = db.prepare('INSERT INTO users (login, password_hash, full_name, role, department_id, email) VALUES (?, ?, ?, ?, ?, ?)');
  const insertEquipment = db.prepare('INSERT INTO equipment (name, serial_number, barcode, type_id, status_id, assigned_user_id, location, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insertMovement = db.prepare('INSERT INTO movement_history (equipment_id, from_user_id, to_user_id, from_status_id, to_status_id, from_location, to_location, comment, moved_at, moved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  const seedAll = db.transaction(() => {
    insertDept.run('IT-отдел');
    insertDept.run('Бухгалтерия');
    insertDept.run('Отдел продаж');
    insertDept.run('HR');
    insertDept.run('Руководство');

    // Equipment types (shared with cartridges)
    insertType.run('Компьютер');
    insertType.run('Монитор');
    insertType.run('МФУ');
    insertType.run('Ноутбук');
    insertType.run('Принтер');
    insertType.run('Телефон');
    insertType.run('Планшет');
    insertType.run('Сервер');
    insertType.run('Картридж HP LaserJet');
    insertType.run('Картридж Canon');
    insertType.run('Картридж Xerox');
    insertType.run('Картридж Brother');

    insertStatus.run('В использовании', '#198754', 'equipment');
    insertStatus.run('На складе', '#0d6efd', 'equipment');
    insertStatus.run('В ремонте', '#ffc107', 'equipment');
    insertStatus.run('Списано', '#dc3545', 'equipment');
    insertStatus.run('Резерв', '#6f42c1', 'equipment');
    insertStatus.run('В использовании', '#198754', 'cartridge');
    insertStatus.run('На складе', '#0d6efd', 'cartridge');
    insertStatus.run('Отдали на заправку', '#fd7e14', 'cartridge');

    const hash = bcrypt.hashSync('123456', 10);
    insertUser.run('admin', hash, 'Иванов Иван Иванович', 'admin', 1, 'admin@company.ru');
    insertUser.run('petrov', hash, 'Петров Пётр Петрович', 'user', 1, 'petrov@company.ru');
    insertUser.run('sidorova', hash, 'Сидорова Анна Михайловна', 'user', 2, 'sidorova@company.ru');
    insertUser.run('kozlov', hash, 'Козлов Дмитрий Сергеевич', 'user', 3, 'kozlov@company.ru');
    insertUser.run('nikitina', hash, 'Никитина Елена Владимировна', 'user', 4, 'nikitina@company.ru');
    insertUser.run('volkov', hash, 'Волков Алексей Николаевич', 'user', 5, 'volkov@company.ru');

    const items = [
      ['Компьютер HP ProDesk 400', 'SN-HP-001', '2001000000001', 1, 1, 2, 'Офис 101', null],
      ['Монитор Dell U2422H', 'SN-DL-001', '2001000000002', 2, 1, 2, 'Офис 101', null],
      ['Монитор Dell U2422H', 'SN-DL-002', '2001000000003', 2, 1, 2, 'Офис 101', null],
      ['МФУ Canon MF445dw', 'SN-CN-001', '2001000000004', 3, 1, 2, 'Офис 101', 'Общий'],
      ['Ноутбук Lenovo ThinkPad T14', 'SN-LN-001', '2001000000005', 4, 1, 3, 'Офис 202', null],
      ['Компьютер Dell OptiPlex 7090', 'SN-DL-003', '2001000000006', 1, 1, 3, 'Офис 202', null],
      ['Монитор LG 27UK850', 'SN-LG-001', '2001000000007', 2, 1, 3, 'Офис 202', null],
      ['Принтер HP LaserJet Pro', 'SN-HP-002', '2001000000008', 5, 1, 3, 'Офис 202', null],
      ['Ноутбук ASUS ZenBook 14', 'SN-AS-001', '2001000000009', 4, 1, 4, 'Офис 303', null],
      ['Компьютер HP ProDesk 400', 'SN-HP-003', '2001000000010', 1, 1, 4, 'Офис 303', null],
      ['Телефон Cisco IP Phone 8845', 'SN-CS-001', '2001000000011', 6, 1, 4, 'Офис 303', null],
      ['Монитор Samsung S27R650', 'SN-SM-001', '2001000000012', 2, 3, 4, 'Серверная', 'В ремонте'],
      ['Планшет iPad Air', 'SN-AP-001', '2001000000013', 7, 1, 5, 'Офис 404', null],
      ['Ноутбук MacBook Pro 14', 'SN-MB-001', '2001000000014', 4, 1, 5, 'Офис 404', null],
      ['МФУ Xerox B215', 'SN-XR-001', '2001000000015', 3, 1, 5, 'Офис 404', null],
      ['Компьютер Dell OptiPlex 7090', 'SN-DL-004', '2001000000016', 1, 2, null, 'Склад', null],
      ['Монитор Dell P2422H', 'SN-DL-005', '2001000000017', 2, 2, null, 'Склад', 'Резерв'],
      ['Принтер Canon i-SENSYS', 'SN-CN-002', '2001000000018', 5, 2, null, 'Склад', null],
      ['Сервер Dell PowerEdge T340', 'SN-DL-006', '2001000000019', 8, 1, 1, 'Серверная', null],
      ['Ноутбук Lenovo ThinkPad T14', 'SN-LN-002', '2001000000020', 4, 1, 6, 'Офис 505', null],
      ['Монитор BenQ PD2700U', 'SN-BQ-001', '2001000000021', 2, 1, 6, 'Офис 505', null],
      ['Компьютер HP EliteDesk 800', 'SN-HP-004', '2001000000022', 1, 4, null, 'Склад', 'Списано'],
    ];
    for (const item of items) { insertEquipment.run(...item); }

    const movements = [
      [1, null, 2, null, 1, null, 'Офис 101', 'Выдано сотруднику', '2025-01-15 09:00:00', 1],
      [2, null, 2, null, 1, null, 'Офис 101', 'Выдано сотруднику', '2025-01-15 09:00:00', 1],
      [3, null, 2, null, 1, null, 'Офис 101', 'Выдано сотруднику', '2025-01-15 09:00:00', 1],
      [5, null, 3, null, 1, null, 'Офис 202', 'Выдано сотруднику', '2025-02-01 10:00:00', 1],
      [6, null, 3, null, 1, null, 'Офис 202', 'Выдано сотруднику', '2025-02-01 10:00:00', 1],
      [7, null, 3, null, 1, null, 'Офис 202', 'Выдано сотруднику', '2025-02-01 10:00:00', 1],
      [9, null, 4, null, 1, null, 'Офис 303', 'Выдано сотруднику', '2025-03-10 11:00:00', 1],
      [10, null, 4, null, 1, null, 'Офис 303', 'Выдано сотруднику', '2025-03-10 11:00:00', 1],
      [12, 4, 4, 1, 3, 'Офис 303', 'Серверная', 'Отправлен в ремонт', '2025-06-01 14:00:00', 1],
      [13, null, 5, null, 1, null, 'Офис 404', 'Выдано сотруднику', '2025-04-01 09:00:00', 1],
      [14, null, 5, null, 1, null, 'Офис 404', 'Выдано сотруднику', '2025-04-01 09:00:00', 1],
      [16, null, null, null, 2, null, 'Склад', 'Поступление на склад', '2025-05-15 10:00:00', 1],
      [20, null, 6, null, 1, null, 'Офис 505', 'Выдано сотруднику', '2025-07-01 09:00:00', 1],
      [21, null, 6, null, 1, null, 'Офис 505', 'Выдано сотруднику', '2025-07-01 09:00:00', 1],
      [22, 2, null, 1, 4, 'Офис 101', 'Склад', 'Списание по акту', '2025-08-01 16:00:00', 1],
    ];
    for (const m of movements) { insertMovement.run(...m); }
  });

  seedAll();
}

function seedCartridges() {
  const insertCartridge = db.prepare('INSERT INTO cartridges (name, barcode, type_id, status_id, assigned_user_id, location, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertCartridgeMovement = db.prepare('INSERT INTO cartridge_movements (cartridge_id, from_user_id, to_user_id, from_status_id, to_status_id, from_location, to_location, comment, moved_at, moved_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  const refillId = db.prepare("SELECT id FROM statuses WHERE name = 'Отдали на заправку' AND scope = 'cartridge'").get().id;
  const inUseId = db.prepare("SELECT id FROM statuses WHERE name = 'В использовании' AND scope = 'cartridge'").get().id;
  const storageId = db.prepare("SELECT id FROM statuses WHERE name = 'На складе' AND scope = 'cartridge'").get().id;
  const hpTypeId = db.prepare("SELECT id FROM equipment_types WHERE name = 'Картридж HP LaserJet'").get().id;
  const canonTypeId = db.prepare("SELECT id FROM equipment_types WHERE name = 'Картридж Canon'").get().id;
  const xeroxTypeId = db.prepare("SELECT id FROM equipment_types WHERE name = 'Картридж Xerox'").get().id;
  const brotherTypeId = db.prepare("SELECT id FROM equipment_types WHERE name = 'Картридж Brother'").get().id;

  const seedAll = db.transaction(() => {
    const cartridges = [
      ['Картридж HP 26A (M404)', '3001000000001', hpTypeId, inUseId, 2, 'Офис 101', 'МФУ Canon MF445dw'],
      ['Картридж Canon 054 (MF445)', '3001000000002', canonTypeId, inUseId, 2, 'Офис 101', null],
      ['Картридж Xerox 006R04399 (B215)', '3001000000003', xeroxTypeId, refillId, 2, 'Сервис', 'На заправке'],
      ['Картридж HP 15A (M15a)', '3001000000004', hpTypeId, storageId, null, 'Склад', null],
      ['Картридж Brother TN-2420', '3001000000005', brotherTypeId, storageId, null, 'Склад', null],
      ['Картридж HP 26A (M404) #2', '3001000000006', hpTypeId, refillId, 3, 'Сервис', 'На заправке у Петрова'],
    ];
    for (const c of cartridges) { insertCartridge.run(...c); }

    const movements = [
      [1, null, 2, null, inUseId, null, 'Офис 101', 'Выдан сотруднику', '2025-03-01 09:00:00', 1],
      [2, null, 2, null, inUseId, null, 'Офис 101', 'Выдан сотруднику', '2025-03-01 09:00:00', 1],
      [3, 2, 2, inUseId, refillId, 'Офис 101', 'Сервис', 'Отдали на заправку', '2025-06-15 10:00:00', 2],
      [4, null, null, null, storageId, null, 'Склад', 'Поступление на склад', '2025-02-01 10:00:00', 1],
      [5, null, null, null, storageId, null, 'Склад', 'Поступление на склад', '2025-02-01 10:00:00', 1],
      [6, 3, 3, inUseId, refillId, 'Офис 202', 'Сервис', 'Отдали на заправку', '2025-07-01 11:00:00', 3],
    ];
    for (const m of movements) { insertCartridgeMovement.run(...m); }
  });

  seedAll();
}

module.exports = { db, initialize };
