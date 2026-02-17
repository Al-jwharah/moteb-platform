const path = require("path");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const fs = require("fs");
const {
  initDB, createUser, getUser, getAllUsers, deleteUser, verifyPassword,
  getAllTxns, getTxnById, getTxnByNumberAndPhone, createTxn, updateTxn, deleteTxn, searchTxns, getTxnsByStatus,
  getStats, getAuditLog, getAllAuditLogs,
  getNotifications, markNotificationRead, markAllNotificationsRead, getUnreadCount,
  createShareLink, getShareLink, getShareLinkByTxn,
  saveSetting, getSetting, getAllSettings,
  logMessage, getMessageLog, getMessageLogByTxn,
  getDailyReport
} = require("./db");

const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = "moteb_jwt_secret_2024_secure";

// ── Gemini AI with retry ──
const genAI = new GoogleGenerativeAI("AIzaSyCQC-5weHY8rKqT3nh28eC-WR8dK2kD15A");

const AI_MODELS = ["gemini-2.0-flash-lite", "gemini-2.0-flash", "gemini-1.5-flash"];

async function askAI(prompt, retries = 3) {
  for (const modelName of AI_MODELS) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (e) {
        console.log(`AI attempt ${attempt + 1} with ${modelName} failed: ${e.message}`);
        if (e.message.includes("429") || e.message.includes("quota")) {
          // Wait before retry
          await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
          continue;
        }
        break; // Non-quota error, try next model
      }
    }
  }
  throw new Error("جميع نماذج الذكاء الاصطناعي مشغولة حالياً. حاول مرة أخرى بعد قليل.");
}

// ── Multer for uploads ──
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadsDir));

// ── Auth Middleware ──
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ ok: false, message: "غير مصرح" });
  const token = header.replace("Bearer ", "");
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ ok: false, message: "جلسة منتهية" });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ ok: false, message: "صلاحيات غير كافية" });
  }
  next();
}

// ── Auth Routes ──
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  const user = getUser(username);
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ ok: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, fullName: user.fullName }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ ok: true, token, user: { id: user.id, username: user.username, role: user.role, fullName: user.fullName } });
});

// ── User Management ──
app.get("/api/users", auth, adminOnly, (req, res) => {
  res.json({ ok: true, users: getAllUsers() });
});

app.post("/api/users", auth, adminOnly, (req, res) => {
  try {
    const { username, password, role, fullName } = req.body;
    createUser(username, password, role || "employee", fullName);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ ok: false, message: "اسم المستخدم موجود مسبقاً" });
  }
});

app.delete("/api/users/:id", auth, adminOnly, (req, res) => {
  deleteUser(Number(req.params.id));
  res.json({ ok: true });
});

// ── Transactions ──
app.get("/api/txns", auth, (req, res) => {
  const { q, status } = req.query;
  const txns = (q || status) ? searchTxns(q, status) : getAllTxns();
  res.json({ ok: true, txns });
});

app.post("/api/txns", auth, (req, res) => {
  const data = req.body;
  data.id = crypto.randomUUID();
  if (!data.number) data.number = `TXN-${Date.now()}`;
  const txn = createTxn(data);
  res.json({ ok: true, txn });
});

app.put("/api/txns/:id", auth, (req, res) => {
  const txn = updateTxn(req.params.id, req.body, req.user.username);
  if (!txn) return res.status(404).json({ ok: false, message: "المعاملة غير موجودة" });
  res.json({ ok: true, txn });
});

app.delete("/api/txns/:id", auth, (req, res) => {
  deleteTxn(req.params.id, req.user.username);
  res.json({ ok: true });
});

// ── Client lookup (no auth) ──
app.post("/api/client/lookup", (req, res) => {
  const { number, phone } = req.body;
  const txn = getTxnByNumberAndPhone(number, phone);
  if (!txn) return res.status(404).json({ ok: false, message: "لا توجد معاملة مطابقة" });
  res.json({
    ok: true,
    txn: { number: txn.number, service: txn.service, status: txn.status, quote: txn.quote, payment: txn.payment, notes: txn.notes, updatedAt: txn.updatedAt }
  });
});

// ── Client request (no auth) ──
app.post("/api/client/request", (req, res) => {
  const data = req.body;
  data.id = crypto.randomUUID();
  data.number = `REQ-${Date.now()}`;
  data.status = "بانتظار عرض السعر";
  data.origin = "client";
  const txn = createTxn(data);
  res.json({ ok: true, number: txn.number });
});

// ── File Upload ──
app.post("/api/upload", auth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false, message: "لا يوجد ملف" });
  res.json({ ok: true, url: `/uploads/${req.file.filename}`, name: req.file.originalname });
});

// ── Stats ──
app.get("/api/stats", auth, (req, res) => {
  res.json({ ok: true, stats: getStats() });
});

// ── Audit Log ──
app.get("/api/audit", auth, (req, res) => {
  res.json({ ok: true, logs: getAllAuditLogs() });
});

app.get("/api/audit/:txnId", auth, (req, res) => {
  res.json({ ok: true, logs: getAuditLog(req.params.txnId) });
});

// ── Notifications ──
app.get("/api/notifications", auth, (req, res) => {
  const unreadOnly = req.query.unread === "true";
  res.json({ ok: true, notifications: getNotifications(unreadOnly), unreadCount: getUnreadCount() });
});

app.post("/api/notifications/:id/read", auth, (req, res) => {
  markNotificationRead(Number(req.params.id));
  res.json({ ok: true });
});

app.post("/api/notifications/read-all", auth, (req, res) => {
  markAllNotificationsRead();
  res.json({ ok: true });
});

// ── AI Chat ──
app.post("/api/ai/chat", async (req, res) => {
  try {
    const systemPrompt = `أنت مساعد ذكي لمنصة "معاملات متعب العنزي" لمتابعة المعاملات الحكومية والخدمات.
أجب دائماً باللغة العربية. كن مختصراً ومفيداً.
الخدمات المتاحة تشمل: إصدار تراخيص، تجديد سجلات، معاملات حكومية، وغيرها.
حالات المعاملة: جديد، بانتظار عرض السعر، بانتظار الدفع، بانتظار زيارة الوزارة، تمت الموافقة، مرفوض، مغلق.
إذا سأل العميل عن حالة معاملته، اطلب منه رقم المعاملة ورقم الجوال ليستخدم خاصية الاستعلام.`;

    const reply = await askAI(`${systemPrompt}\n\nسؤال العميل: ${req.body.message}`);
    res.json({ ok: true, reply });
  } catch (e) {
    console.error("AI Error:", e.message);
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ── AI Summarize ──
app.post("/api/ai/summarize", auth, async (req, res) => {
  try {
    const txns = getAllTxns();
    const stats = getStats();
    const prompt = `أنت محلل بيانات لمنصة "معاملات متعب العنزي".
لخّص الوضع الحالي للمعاملات بشكل مختصر وواضح باللغة العربية.

الإحصائيات:
- إجمالي المعاملات: ${stats.total}
- معاملات هذا الأسبوع: ${stats.recentWeek}
- حسب الحالة: ${JSON.stringify(stats.byStatus)}
- أكثر الخدمات طلباً: ${JSON.stringify(stats.topServices)}

آخر 10 معاملات:
${txns.slice(0, 10).map(t => `${t.number}: ${t.service} - ${t.status}`).join("\n")}

قدّم ملخصاً تنفيذياً مع توصيات لتحسين الأداء.`;

    const summary = await askAI(prompt);
    res.json({ ok: true, summary });
  } catch (e) {
    console.error("AI Summarize Error:", e.message);
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ── Export CSV ──
app.get("/api/export/csv", auth, (req, res) => {
  const txns = getAllTxns();
  const BOM = "\uFEFF";
  let csv = BOM + "رقم المعاملة,العميل,الجوال,الخدمة,الحالة,عرض السعر,طريقة الدفع,الملاحظات,تاريخ الإنشاء,آخر تحديث\n";
  txns.forEach(t => {
    csv += `"${t.number}","${t.client}","${t.phone}","${t.service}","${t.status}","${t.quote}","${t.payment}","${t.notes}","${t.createdAt}","${t.updatedAt}"\n`;
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=transactions.csv");
  res.send(csv);
});

// ── Share Links ──
app.post("/api/txns/:id/share-link", auth, (req, res) => {
  const txn = getTxnById(req.params.id);
  if (!txn) return res.status(404).json({ ok: false, message: "المعاملة غير موجودة" });
  // Check if link already exists
  let existing = getShareLinkByTxn(req.params.id);
  if (existing) {
    return res.json({ ok: true, code: existing.code, link: `/track/${existing.code}` });
  }
  const code = createShareLink(req.params.id);
  res.json({ ok: true, code, link: `/track/${code}` });
});

app.get("/api/track/:code", (req, res) => {
  const link = getShareLink(req.params.code);
  if (!link) return res.status(404).json({ ok: false, message: "رابط غير صالح" });
  const txn = getTxnById(link.txnId);
  if (!txn) return res.status(404).json({ ok: false, message: "المعاملة غير موجودة" });
  res.json({
    ok: true,
    txn: {
      number: txn.number,
      client: txn.client,
      service: txn.service,
      status: txn.status,
      quote: txn.quote,
      payment: txn.payment,
      notes: txn.notes,
      updatedAt: txn.updatedAt,
      createdAt: txn.createdAt
    }
  });
});

// ── WhatsApp ──
app.post("/api/txns/:id/whatsapp", auth, (req, res) => {
  const txn = getTxnById(req.params.id);
  if (!txn) return res.status(404).json({ ok: false, message: "المعاملة غير موجودة" });
  const { templateType } = req.body; // 'status', 'payment', 'reminder'
  const settings = getAllSettings();
  const templateKey = `whatsapp_template_${templateType || 'status'}`;
  let template = settings[templateKey] || settings['whatsapp_template_status'] || 'تحديث معاملتك {number}: {status}';

  // Generate share link
  let shareLink = getShareLinkByTxn(req.params.id);
  if (!shareLink) {
    const code = createShareLink(req.params.id);
    shareLink = { code };
  }
  const host = req.get('host');
  const protocol = req.protocol;
  const trackUrl = `${protocol}://${host}/track/${shareLink.code}`;

  // Replace template variables
  let message = template
    .replace(/\{client\}/g, txn.client)
    .replace(/\{number\}/g, txn.number)
    .replace(/\{status\}/g, txn.status)
    .replace(/\{quote\}/g, txn.quote || 'غير محدد')
    .replace(/\{payment\}/g, txn.payment || 'غير محدد')
    .replace(/\{link\}/g, trackUrl)
    .replace(/\{platform\}/g, settings['platform_name'] || 'معاملات متعب العنزي');

  // Clean phone number
  let phone = txn.phone.replace(/\s/g, '');
  if (phone.startsWith('05')) phone = '966' + phone.substring(1);
  if (phone.startsWith('5')) phone = '966' + phone;
  if (!phone.startsWith('+')) phone = '+' + phone;

  const waUrl = `https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(message)}`;

  // Log the message
  logMessage(req.params.id, txn.phone, message, 'whatsapp', req.user.username);

  res.json({ ok: true, waUrl, message, phone });
});

// ── Bulk WhatsApp ──
app.post("/api/bulk-whatsapp", auth, adminOnly, (req, res) => {
  const { status, templateType } = req.body;
  if (!status) return res.status(400).json({ ok: false, message: "يجب تحديد الحالة" });

  const txns = getTxnsByStatus(status);
  if (txns.length === 0) return res.json({ ok: true, count: 0, messages: [] });

  const settings = getAllSettings();
  const templateKey = `whatsapp_template_${templateType || 'status'}`;
  let template = settings[templateKey] || settings['whatsapp_template_status'];

  const messages = txns.map(txn => {
    let shareLink = getShareLinkByTxn(txn.id);
    if (!shareLink) {
      const code = createShareLink(txn.id);
      shareLink = { code };
    }
    const host = req.get('host');
    const protocol = req.protocol;
    const trackUrl = `${protocol}://${host}/track/${shareLink.code}`;

    let message = template
      .replace(/\{client\}/g, txn.client)
      .replace(/\{number\}/g, txn.number)
      .replace(/\{status\}/g, txn.status)
      .replace(/\{quote\}/g, txn.quote || 'غير محدد')
      .replace(/\{payment\}/g, txn.payment || 'غير محدد')
      .replace(/\{link\}/g, trackUrl)
      .replace(/\{platform\}/g, settings['platform_name'] || 'معاملات متعب العنزي');

    let phone = txn.phone.replace(/\s/g, '');
    if (phone.startsWith('05')) phone = '966' + phone.substring(1);
    if (phone.startsWith('5')) phone = '966' + phone;
    if (!phone.startsWith('+')) phone = '+' + phone;

    logMessage(txn.id, txn.phone, message, 'whatsapp_bulk', req.user.username);

    return {
      client: txn.client,
      phone: phone.replace('+', ''),
      number: txn.number,
      waUrl: `https://wa.me/${phone.replace('+', '')}?text=${encodeURIComponent(message)}`
    };
  });

  res.json({ ok: true, count: messages.length, messages });
});

// ── Settings ──
app.get("/api/settings", auth, (req, res) => {
  res.json({ ok: true, settings: getAllSettings() });
});

app.post("/api/settings", auth, adminOnly, (req, res) => {
  const { settings } = req.body;
  if (!settings) return res.status(400).json({ ok: false, message: "بيانات غير صحيحة" });
  Object.entries(settings).forEach(([key, value]) => {
    saveSetting(key, value);
  });
  res.json({ ok: true });
});

// ── Message Log ──
app.get("/api/messages", auth, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json({ ok: true, messages: getMessageLog(limit) });
});

app.get("/api/messages/:txnId", auth, (req, res) => {
  res.json({ ok: true, messages: getMessageLogByTxn(req.params.txnId) });
});

// ── Daily Report ──
app.get("/api/reports/daily", auth, (req, res) => {
  const date = req.query.date;
  res.json({ ok: true, report: getDailyReport(date) });
});

// ── Track Page (public) ──
app.get("/track/:code", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Fallback to index.html ──
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Start ──
(async () => {
  await initDB();
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
})();
