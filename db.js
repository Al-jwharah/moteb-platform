const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const DB_PATH = path.join(__dirname, "data.db");
let db = null;

async function initDB() {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
        const buf = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buf);
    } else {
        db = new SQL.Database();
    }

    db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      fullName TEXT,
      createdAt TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      number TEXT UNIQUE NOT NULL,
      client TEXT NOT NULL,
      phone TEXT NOT NULL,
      service TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'جديد',
      notes TEXT DEFAULT '',
      quote TEXT DEFAULT '',
      payment TEXT DEFAULT '',
      origin TEXT DEFAULT 'admin',
      attachments TEXT DEFAULT '[]',
      createdAt TEXT DEFAULT (datetime('now','localtime')),
      updatedAt TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txnId TEXT NOT NULL,
      action TEXT NOT NULL,
      field TEXT,
      oldValue TEXT,
      newValue TEXT,
      userId TEXT,
      createdAt TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      txnId TEXT,
      isRead INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS share_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      txnId TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now','localtime')),
      expiresAt TEXT
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

    db.run(`
    CREATE TABLE IF NOT EXISTS message_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txnId TEXT,
      phone TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'whatsapp',
      sentBy TEXT,
      createdAt TEXT DEFAULT (datetime('now','localtime'))
    )
  `);

    // Clients table for registration
    db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      createdAt TEXT DEFAULT (datetime('now','localtime'))
    )
    `);

    // Default settings
    const existingSettings = db.exec("SELECT key FROM settings WHERE key = 'platform_name'");
    if (existingSettings.length === 0) {
        db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", ["platform_name", "منصة 2169"]);
        db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", ["contact_phone", "966502049200"]);
        db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", ["whatsapp_template_status", "مرحباً {client}،\nتم تحديث حالة معاملتك رقم {number} إلى: {status}\n\nلمتابعة معاملتك: {link}\n\nمع تحيات {platform}"]);
        db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", ["whatsapp_template_payment", "مرحباً {client}،\nنود إبلاغك بأن معاملتك رقم {number} بانتظار الدفع.\nالمبلغ المطلوب: {quote}\n\nلمتابعة معاملتك: {link}\n\nمع تحيات {platform}"]);
        db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", ["whatsapp_template_reminder", "مرحباً {client}،\nتذكير بخصوص معاملتك رقم {number}\nالحالة الحالية: {status}\n\nلمتابعة معاملتك: {link}\n\nمع تحيات {platform}"]);
    }
    // Update platform name if old value
    db.run("UPDATE settings SET value = 'منصة 2169' WHERE key = 'platform_name' AND value = 'معاملات متعب العنزي'");
    db.run("UPDATE settings SET value = '966502049200' WHERE key = 'contact_phone' AND value = ''");

    // Create default admin if not exists
    const admin = db.exec("SELECT id FROM users WHERE username = 'admin'");
    if (admin.length === 0) {
        const hash = bcrypt.hashSync("2169", 10);
        db.run("INSERT INTO users (username, password, role, fullName) VALUES (?, ?, ?, ?)",
            ["admin", hash, "admin", "المشرف"]);
    }

    // Create default employee "1" if not exists
    const emp = db.exec("SELECT id FROM users WHERE username = '1'");
    if (emp.length === 0) {
        const hash = bcrypt.hashSync("2169", 10);
        db.run("INSERT INTO users (username, password, role, fullName) VALUES (?, ?, ?, ?)",
            ["1", hash, "admin", "متعب العنزي"]);
    }

    save();
    return db;
}

function save() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
}

function getDB() {
    return db;
}

// ── Users ──
function createUser(username, password, role, fullName) {
    const hash = bcrypt.hashSync(password, 10);
    db.run("INSERT INTO users (username, password, role, fullName) VALUES (?, ?, ?, ?)",
        [username, hash, role, fullName]);
    save();
}

function getUser(username) {
    const rows = db.exec("SELECT * FROM users WHERE username = ?", [username]);
    if (rows.length === 0 || rows[0].values.length === 0) return null;
    const cols = rows[0].columns;
    const vals = rows[0].values[0];
    const user = {};
    cols.forEach((c, i) => user[c] = vals[i]);
    return user;
}

function getAllUsers() {
    const rows = db.exec("SELECT id, username, role, fullName, createdAt FROM users");
    if (rows.length === 0) return [];
    return rows[0].values.map(v => {
        const obj = {};
        rows[0].columns.forEach((c, i) => obj[c] = v[i]);
        return obj;
    });
}

function deleteUser(id) {
    db.run("DELETE FROM users WHERE id = ? AND username != 'admin'", [id]);
    save();
}

function verifyPassword(plain, hash) {
    return bcrypt.compareSync(plain, hash);
}

// ── Transactions ──
function rowsToObjects(result) {
    if (result.length === 0) return [];
    return result[0].values.map(v => {
        const obj = {};
        result[0].columns.forEach((c, i) => {
            obj[c] = v[i];
        });
        if (obj.attachments) {
            try { obj.attachments = JSON.parse(obj.attachments); } catch { obj.attachments = []; }
        }
        return obj;
    });
}

function getAllTxns() {
    const rows = db.exec("SELECT * FROM transactions ORDER BY updatedAt DESC");
    return rowsToObjects(rows);
}

function getTxnById(id) {
    const rows = db.exec("SELECT * FROM transactions WHERE id = ?", [id]);
    const arr = rowsToObjects(rows);
    return arr.length > 0 ? arr[0] : null;
}

function getTxnByNumberAndPhone(number, phone) {
    const rows = db.exec("SELECT * FROM transactions WHERE number = ? AND phone = ?", [number, phone]);
    const arr = rowsToObjects(rows);
    return arr.length > 0 ? arr[0] : null;
}

function createTxn(data) {
    const id = data.id || crypto.randomUUID();
    db.run(
        `INSERT INTO transactions (id, number, client, phone, service, status, notes, quote, payment, origin, attachments)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, data.number, data.client, data.phone, data.service, data.status || "جديد",
            data.notes || "", data.quote || "", data.payment || "", data.origin || "admin", JSON.stringify(data.attachments || [])]
    );
    save();
    addNotification("new_txn", `معاملة جديدة: ${data.number} - ${data.client}`, id);
    return getTxnById(id);
}

function updateTxn(id, updates, userId) {
    const txn = getTxnById(id);
    if (!txn) return null;

    const fields = ["status", "notes", "quote", "payment", "client", "phone", "service"];
    fields.forEach(f => {
        if (updates[f] !== undefined && updates[f] !== txn[f]) {
            addAuditLog(id, "update", f, String(txn[f]), String(updates[f]), userId);
            if (f === "status") {
                addNotification("status_change", `تم تحديث حالة المعاملة ${txn.number} إلى: ${updates[f]}`, id);
            }
        }
    });

    const status = updates.status !== undefined ? updates.status : txn.status;
    const notes = updates.notes !== undefined ? updates.notes : txn.notes;
    const quote = updates.quote !== undefined ? updates.quote : txn.quote;
    const payment = updates.payment !== undefined ? updates.payment : txn.payment;
    const client = updates.client !== undefined ? updates.client : txn.client;
    const phone = updates.phone !== undefined ? updates.phone : txn.phone;
    const service = updates.service !== undefined ? updates.service : txn.service;
    const attachments = updates.attachments !== undefined ? JSON.stringify(updates.attachments) : JSON.stringify(txn.attachments || []);

    db.run(
        `UPDATE transactions SET status=?, notes=?, quote=?, payment=?, client=?, phone=?, service=?, attachments=?, updatedAt=datetime('now','localtime') WHERE id=?`,
        [status, notes, quote, payment, client, phone, service, attachments, id]
    );
    save();
    return getTxnById(id);
}

function deleteTxn(id, userId) {
    const txn = getTxnById(id);
    if (txn) {
        addAuditLog(id, "delete", null, JSON.stringify(txn), null, userId);
    }
    db.run("DELETE FROM transactions WHERE id = ?", [id]);
    save();
}

function searchTxns(query, statusFilter) {
    let sql = "SELECT * FROM transactions WHERE 1=1";
    const params = [];
    if (query) {
        sql += " AND (number LIKE ? OR client LIKE ? OR service LIKE ?)";
        const q = `%${query}%`;
        params.push(q, q, q);
    }
    if (statusFilter) {
        sql += " AND status = ?";
        params.push(statusFilter);
    }
    sql += " ORDER BY updatedAt DESC";
    const rows = db.exec(sql, params);
    return rowsToObjects(rows);
}

// ── Stats ──
function getStats() {
    const total = db.exec("SELECT COUNT(*) as c FROM transactions");
    const byStatus = db.exec("SELECT status, COUNT(*) as c FROM transactions GROUP BY status");
    const byService = db.exec("SELECT service, COUNT(*) as c FROM transactions GROUP BY service ORDER BY c DESC LIMIT 5");
    const recent = db.exec("SELECT COUNT(*) as c FROM transactions WHERE createdAt >= datetime('now','-7 days','localtime')");

    const statusMap = {};
    if (byStatus.length > 0) {
        byStatus[0].values.forEach(v => { statusMap[v[0]] = v[1]; });
    }

    const serviceList = [];
    if (byService.length > 0) {
        byService[0].values.forEach(v => { serviceList.push({ service: v[0], count: v[1] }); });
    }

    return {
        total: total.length > 0 ? total[0].values[0][0] : 0,
        recentWeek: recent.length > 0 ? recent[0].values[0][0] : 0,
        byStatus: statusMap,
        topServices: serviceList
    };
}

// ── Audit Log ──
function addAuditLog(txnId, action, field, oldValue, newValue, userId) {
    db.run(
        "INSERT INTO audit_log (txnId, action, field, oldValue, newValue, userId) VALUES (?, ?, ?, ?, ?, ?)",
        [txnId, action, field, oldValue, newValue, userId || "system"]
    );
    save();
}

function getAuditLog(txnId) {
    const rows = db.exec("SELECT * FROM audit_log WHERE txnId = ? ORDER BY createdAt DESC", [txnId]);
    return rowsToObjects(rows);
}

function getAllAuditLogs() {
    const rows = db.exec("SELECT * FROM audit_log ORDER BY createdAt DESC LIMIT 100");
    return rowsToObjects(rows);
}

// ── Notifications ──
function addNotification(type, message, txnId) {
    db.run("INSERT INTO notifications (type, message, txnId) VALUES (?, ?, ?)", [type, message, txnId || null]);
    save();
}

function getNotifications(unreadOnly) {
    const sql = unreadOnly
        ? "SELECT * FROM notifications WHERE isRead = 0 ORDER BY createdAt DESC LIMIT 50"
        : "SELECT * FROM notifications ORDER BY createdAt DESC LIMIT 50";
    const rows = db.exec(sql);
    return rowsToObjects(rows);
}

function markNotificationRead(id) {
    db.run("UPDATE notifications SET isRead = 1 WHERE id = ?", [id]);
    save();
}

function markAllNotificationsRead() {
    db.run("UPDATE notifications SET isRead = 1 WHERE isRead = 0");
    save();
}

function getUnreadCount() {
    const rows = db.exec("SELECT COUNT(*) as c FROM notifications WHERE isRead = 0");
    return rows.length > 0 ? rows[0].values[0][0] : 0;
}

// ── Share Links ──
function createShareLink(txnId) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    db.run("INSERT INTO share_links (code, txnId) VALUES (?, ?)", [code, txnId]);
    save();
    return code;
}

function getShareLink(code) {
    const rows = db.exec("SELECT * FROM share_links WHERE code = ?", [code]);
    if (rows.length === 0 || rows[0].values.length === 0) return null;
    const cols = rows[0].columns;
    const vals = rows[0].values[0];
    const obj = {};
    cols.forEach((c, i) => obj[c] = vals[i]);
    return obj;
}

function getShareLinkByTxn(txnId) {
    const rows = db.exec("SELECT * FROM share_links WHERE txnId = ? ORDER BY createdAt DESC LIMIT 1", [txnId]);
    if (rows.length === 0 || rows[0].values.length === 0) return null;
    const cols = rows[0].columns;
    const vals = rows[0].values[0];
    const obj = {};
    cols.forEach((c, i) => obj[c] = vals[i]);
    return obj;
}

// ── Settings ──
function saveSetting(key, value) {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
    save();
}

function getSetting(key) {
    const rows = db.exec("SELECT value FROM settings WHERE key = ?", [key]);
    if (rows.length === 0 || rows[0].values.length === 0) return null;
    return rows[0].values[0][0];
}

function getAllSettings() {
    const rows = db.exec("SELECT * FROM settings");
    if (rows.length === 0) return {};
    const settings = {};
    rows[0].values.forEach(v => { settings[v[0]] = v[1]; });
    return settings;
}

// ── Message Log ──
function logMessage(txnId, phone, message, type, sentBy) {
    db.run("INSERT INTO message_log (txnId, phone, message, type, sentBy) VALUES (?, ?, ?, ?, ?)",
        [txnId, phone, message, type || "whatsapp", sentBy || "admin"]);
    save();
}

function getMessageLog(limit) {
    const rows = db.exec("SELECT * FROM message_log ORDER BY createdAt DESC LIMIT ?", [limit || 50]);
    return rowsToObjects(rows);
}

function getMessageLogByTxn(txnId) {
    const rows = db.exec("SELECT * FROM message_log WHERE txnId = ? ORDER BY createdAt DESC", [txnId]);
    return rowsToObjects(rows);
}

// ── Daily Report ──
function getDailyReport(date) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const newTxns = db.exec("SELECT COUNT(*) as c FROM transactions WHERE date(createdAt) = ?", [targetDate]);
    const updatedTxns = db.exec("SELECT COUNT(*) as c FROM transactions WHERE date(updatedAt) = ? AND date(createdAt) != date(updatedAt)", [targetDate]);
    const completedTxns = db.exec("SELECT COUNT(*) as c FROM transactions WHERE date(updatedAt) = ? AND status IN ('تمت الموافقة', 'مغلق')", [targetDate]);
    const msgCount = db.exec("SELECT COUNT(*) as c FROM message_log WHERE date(createdAt) = ?", [targetDate]);
    const byStatus = db.exec("SELECT status, COUNT(*) as c FROM transactions GROUP BY status");
    const recentTxns = db.exec("SELECT * FROM transactions WHERE date(createdAt) = ? OR date(updatedAt) = ? ORDER BY updatedAt DESC LIMIT 20", [targetDate, targetDate]);

    const statusMap = {};
    if (byStatus.length > 0) {
        byStatus[0].values.forEach(v => { statusMap[v[0]] = v[1]; });
    }

    return {
        date: targetDate,
        newCount: newTxns.length > 0 ? newTxns[0].values[0][0] : 0,
        updatedCount: updatedTxns.length > 0 ? updatedTxns[0].values[0][0] : 0,
        completedCount: completedTxns.length > 0 ? completedTxns[0].values[0][0] : 0,
        messagesCount: msgCount.length > 0 ? msgCount[0].values[0][0] : 0,
        byStatus: statusMap,
        transactions: rowsToObjects(recentTxns)
    };
}

// ── Txns by Status ──
function getTxnsByStatus(status) {
    const rows = db.exec("SELECT * FROM transactions WHERE status = ? ORDER BY updatedAt DESC", [status]);
    return rowsToObjects(rows);
}

// ── Clients Registration ──
function registerClient(name, phone, email) {
    // Check existing
    const existing = db.exec("SELECT * FROM clients WHERE phone = ?", [phone]);
    if (existing.length > 0 && existing[0].values.length > 0) {
        // Update name/email
        db.run("UPDATE clients SET name = ?, email = ? WHERE phone = ?", [name, email || '', phone]);
        save();
        return rowsToObjects(db.exec("SELECT * FROM clients WHERE phone = ?", [phone]))[0];
    }
    db.run("INSERT INTO clients (name, phone, email) VALUES (?, ?, ?)", [name, phone, email || '']);
    save();
    return rowsToObjects(db.exec("SELECT * FROM clients WHERE phone = ?", [phone]))[0];
}

function getClientByPhone(phone) {
    const rows = db.exec("SELECT * FROM clients WHERE phone = ?", [phone]);
    return rowsToObjects(rows)[0] || null;
}

function getAllClients() {
    const rows = db.exec("SELECT * FROM clients ORDER BY createdAt DESC");
    return rowsToObjects(rows);
}

// ── Search by number only (for AI agent) ──
function searchTxnByNumber(number) {
    const rows = db.exec("SELECT * FROM transactions WHERE number = ?", [number]);
    return rowsToObjects(rows)[0] || null;
}

module.exports = {
    initDB, getDB, save,
    createUser, getUser, getAllUsers, deleteUser, verifyPassword,
    getAllTxns, getTxnById, getTxnByNumberAndPhone, createTxn, updateTxn, deleteTxn, searchTxns, getTxnsByStatus,
    searchTxnByNumber,
    getStats,
    addAuditLog, getAuditLog, getAllAuditLogs,
    addNotification, getNotifications, markNotificationRead, markAllNotificationsRead, getUnreadCount,
    createShareLink, getShareLink, getShareLinkByTxn,
    saveSetting, getSetting, getAllSettings,
    logMessage, getMessageLog, getMessageLogByTxn,
    getDailyReport,
    registerClient, getClientByPhone, getAllClients
};

