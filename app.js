const STORAGE_KEY = "moteb_txns_v1";
const SESSION_KEY = "moteb_session_v1";

const loginView = document.getElementById("loginView");
const dashboardView = document.getElementById("dashboardView");
const logoutBtn = document.getElementById("logoutBtn");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginUsername = document.getElementById("loginUsername");
const loginPassword = document.getElementById("loginPassword");
const tabAdmin = document.getElementById("tabAdmin");
const tabClient = document.getElementById("tabClient");
const adminPanel = document.getElementById("adminPanel");
const clientPanel = document.getElementById("clientPanel");
const clientForm = document.getElementById("clientForm");
const clientError = document.getElementById("clientError");
const clientResult = document.getElementById("clientResult");
const requestForm = document.getElementById("requestForm");
const requestSuccess = document.getElementById("requestSuccess");
const toast = document.getElementById("toast");

const txnForm = document.getElementById("txnForm");
const txnList = document.getElementById("txnList");
const searchInput = document.getElementById("search");
const filterStatus = document.getElementById("filterStatus");

function loadTxns() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveTxns(txns) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(txns));
}

function setSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => {
    toast.classList.add("hidden");
  }, 3000);
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const statusFilter = filterStatus.value;
  const txns = loadTxns().filter((t) => {
    const matchesQuery =
      !query ||
      t.number.toLowerCase().includes(query) ||
      t.client.toLowerCase().includes(query) ||
      t.service.toLowerCase().includes(query);
    const matchesStatus = !statusFilter || t.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  txnList.innerHTML = "";
  if (txns.length === 0) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "لا توجد معاملات مطابقة.";
    txnList.appendChild(empty);
    return;
  }

  const template = document.getElementById("txnItemTemplate");
  txns.forEach((txn) => {
    const node = template.content.cloneNode(true);
    node.querySelector(".txn-title").textContent = `${txn.service} - ${txn.number}`;
    node.querySelector(".txn-meta").textContent =
      `العميل: ${txn.client} • الجوال: ${txn.phone} • الحالة: ${txn.status} • آخر تحديث: ${txn.updatedAt}`;
    node.querySelector(".txn-notes").textContent = txn.notes || "بدون ملاحظات.";
    node.querySelector(".txn-extra").textContent =
      `عرض السعر: ${txn.quote || "بانتظار عرض السعر"} • طريقة الدفع: ${txn.payment || "بانتظار الدفع"}`;

    const statusSelect = node.querySelector(".status-select");
    statusSelect.value = txn.status;
    statusSelect.addEventListener("change", () => {
      updateStatus(txn.id, statusSelect.value);
    });

    const quoteInput = node.querySelector(".quote-input");
    const paymentInput = node.querySelector(".payment-input");
    quoteInput.value = txn.quote || "";
    paymentInput.value = txn.payment || "";

    const updateBtn = node.querySelector(".update-btn");
    updateBtn.addEventListener("click", () => {
      updateDetails(txn.id, quoteInput.value.trim(), paymentInput.value.trim());
    });

    const deleteBtn = node.querySelector(".delete-btn");
    deleteBtn.addEventListener("click", () => {
      deleteTxn(txn.id);
    });

    txnList.appendChild(node);
  });
}

function formatDate() {
  const now = new Date();
  return now.toLocaleString("ar-SA");
}

function addTxn(data) {
  const txns = loadTxns();
  txns.unshift({
    id: crypto.randomUUID(),
    origin: data.origin || "admin",
    number: data.number,
    client: data.client,
    phone: data.phone,
    service: data.service,
    status: data.status,
    notes: data.notes,
    quote: data.quote || "",
    payment: data.payment || "",
    updatedAt: formatDate(),
  });
  saveTxns(txns);
  render();
}

function updateStatus(id, status) {
  const txns = loadTxns();
  const txn = txns.find((t) => t.id === id);
  if (!txn) return;
  txn.status = status;
  txn.updatedAt = formatDate();
  saveTxns(txns);
  render();
}

function updateDetails(id, quote, payment) {
  const txns = loadTxns();
  const txn = txns.find((t) => t.id === id);
  if (!txn) return;
  txn.quote = quote;
  txn.payment = payment;
  txn.updatedAt = formatDate();
  saveTxns(txns);
  render();
}

function deleteTxn(id) {
  const txns = loadTxns().filter((t) => t.id !== id);
  saveTxns(txns);
  render();
}

function showDashboard() {
  loginView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
  render();
}

function showLogin() {
  loginView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
  logoutBtn.classList.add("hidden");
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.classList.add("hidden");
  const username = loginUsername.value.trim();
  const password = loginPassword.value.trim();
  if (username !== "1" || password !== "2169") {
    loginError.classList.remove("hidden");
    return;
  }
  setSession({ username: "1", role: "admin" });
  showDashboard();
});

logoutBtn.addEventListener("click", () => {
  clearSession();
  showLogin();
});



// تم تعطيل أكواد التحقق لدخول الإدارة.

txnForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    number: document.getElementById("txnNumber").value.trim(),
    client: document.getElementById("clientName").value.trim(),
    phone: document.getElementById("clientPhoneInput").value.trim(),
    service: document.getElementById("serviceType").value.trim(),
    status: document.getElementById("status").value,
    notes: document.getElementById("notes").value.trim(),
    quote: document.getElementById("quote").value.trim(),
    payment: document.getElementById("payment").value.trim(),
    origin: "admin",
  };
  addTxn(data);
  txnForm.reset();
});

searchInput.addEventListener("input", render);
filterStatus.addEventListener("change", render);

const session = getSession();
if (session) {
  showDashboard();
} else {
  showLogin();
}

tabAdmin.addEventListener("click", () => {
  tabAdmin.classList.add("active");
  tabClient.classList.remove("active");
  adminPanel.classList.remove("hidden");
  clientPanel.classList.add("hidden");
});

tabClient.addEventListener("click", () => {
  tabClient.classList.add("active");
  tabAdmin.classList.remove("active");
  clientPanel.classList.remove("hidden");
  adminPanel.classList.add("hidden");
});

clientForm.addEventListener("submit", (e) => {
  e.preventDefault();
  clientError.classList.add("hidden");
  clientResult.classList.add("hidden");
  const number = document.getElementById("clientTxnNumber").value.trim();
  const phone = document.getElementById("clientPhone").value.trim();
  const txns = loadTxns();
  const txn = txns.find((t) => t.number === number && t.phone === phone);
  if (!txn) {
    clientError.classList.remove("hidden");
    return;
  }
  clientResult.innerHTML =
    `<div><strong>نوع الخدمة:</strong> ${txn.service}</div>` +
    `<div><strong>الحالة:</strong> ${txn.status}</div>` +
    `<div><strong>آخر تحديث:</strong> ${txn.updatedAt}</div>` +
    `<div><strong>عرض السعر:</strong> ${txn.quote || "بانتظار عرض السعر."}</div>` +
    `<div><strong>طريقة الدفع:</strong> ${txn.payment || "بانتظار تحديد طريقة الدفع."}</div>` +
    `<div><strong>ملاحظات:</strong> ${txn.notes || "بدون ملاحظات."}</div>`;
  clientResult.classList.remove("hidden");
});

requestForm.addEventListener("submit", (e) => {
  e.preventDefault();
  requestSuccess.classList.add("hidden");
  const reqNumber = `REQ-${Date.now()}`;
  const data = {
    number: reqNumber,
    client: document.getElementById("reqName").value.trim(),
    phone: document.getElementById("reqPhone").value.trim(),
    service: document.getElementById("reqService").value.trim(),
    status: "بانتظار عرض السعر",
    notes: document.getElementById("reqNotes").value.trim(),
    origin: "client",
  };
  addTxn(data);
  requestSuccess.textContent = `تم استلام طلبك. رقم المعاملة: ${reqNumber}`;
  document.getElementById("clientTxnNumber").value = reqNumber;
  document.getElementById("clientPhone").value = data.phone;
  requestForm.reset();
  requestSuccess.classList.remove("hidden");
  showToast(`تم إرسال الطلب. رقم المعاملة: ${reqNumber}`);
});





