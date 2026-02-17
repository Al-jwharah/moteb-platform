/* ═══════════ MOTEB TRANSACTIONS PLATFORM v3 ═══════════ */

const API = "";
let token = localStorage.getItem("moteb_token");
let currentUser = JSON.parse(localStorage.getItem("moteb_user") || "null");
let uploadedFiles = [];

// ── Check if this is a tracking page ──
const isTrackingPage = window.location.pathname.startsWith('/track/');

// ── Helpers ──
function $(id) { return document.getElementById(id); }

function showToast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.add("hidden"); }, 3500);
}

async function api(method, url, body) {
    var opts = {
        method: method,
        headers: { "Content-Type": "application/json" }
    };
    if (token) opts.headers["Authorization"] = "Bearer " + token;
    if (body) opts.body = JSON.stringify(body);
    var res = await fetch(API + url, opts);
    var data = await res.json();
    if (!res.ok) throw new Error(data.message || "خطأ في الخادم");
    return data;
}

// ════════════════════════════════
//        AUTH
// ════════════════════════════════
function setAuth(data) {
    token = data.token;
    currentUser = data.user;
    localStorage.setItem("moteb_token", token);
    localStorage.setItem("moteb_user", JSON.stringify(currentUser));
}

function clearAuth() {
    token = null;
    currentUser = null;
    localStorage.removeItem("moteb_token");
    localStorage.removeItem("moteb_user");
}

function showLogin() {
    $("loginView").classList.remove("hidden");
    $("dashboardView").classList.add("hidden");
    $("headerActions").classList.add("hidden");
}

function showDashboard() {
    $("loginView").classList.add("hidden");
    $("dashboardView").classList.remove("hidden");
    $("headerActions").classList.remove("hidden");
    $("userName").textContent = currentUser.fullName || currentUser.username;
    if (currentUser.role !== "admin") {
        $("usersNavTab").style.display = "none";
    }
    switchPage("stats");
    loadNotifications();
}

// Login form
$("loginForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    $("loginError").classList.add("hidden");
    try {
        var data = await api("POST", "/api/login", {
            username: $("loginUsername").value.trim(),
            password: $("loginPassword").value.trim()
        });
        setAuth(data);
        showDashboard();
        showToast("مرحباً " + (data.user.fullName || data.user.username) + " 👋");
    } catch (err) {
        $("loginError").textContent = err.message;
        $("loginError").classList.remove("hidden");
    }
});

// Logout
$("logoutBtn").addEventListener("click", function () {
    clearAuth();
    showLogin();
});

// ── Auth Tabs (Landing page - 5 tabs) ──
var authTabs = [
    { btn: "tabClient", panel: "clientPanel" },
    { btn: "tabNewRequest", panel: "requestPanel" },
    { btn: "tabQuote", panel: "quotePanel" },
    { btn: "tabCommercial", panel: "commercialPanel" },
    { btn: "tabAdmin", panel: "adminPanel" }
];

authTabs.forEach(function (tab) {
    var btnEl = $(tab.btn);
    if (!btnEl) return;
    btnEl.addEventListener("click", function () {
        // Deactivate all
        authTabs.forEach(function (t) {
            var b = $(t.btn);
            var p = $(t.panel);
            if (b) b.classList.remove("active");
            if (p) p.classList.add("hidden");
        });
        // Activate clicked
        btnEl.classList.add("active");
        var panel = $(tab.panel);
        if (panel) panel.classList.remove("hidden");
    });
});

// ── Animated Counter (Intersection Observer) ──
var countersAnimated = false;
function animateCounters() {
    if (countersAnimated) return;
    countersAnimated = true;
    document.querySelectorAll('.achieve-num[data-count]').forEach(function (el) {
        var target = parseFloat(el.getAttribute('data-count'));
        var isDecimal = el.getAttribute('data-decimal') === 'true';
        var current = 0;
        var step = target / 60;
        var timer = setInterval(function () {
            current += step;
            if (current >= target) {
                current = target;
                clearInterval(timer);
            }
            el.textContent = '+' + (isDecimal ? current.toFixed(1) : Math.floor(current));
        }, 25);
    });
    // Animate progress bars
    document.querySelectorAll('.achieve-bar-fill').forEach(function (bar) {
        var w = bar.style.width;
        bar.style.width = '0%';
        setTimeout(function () { bar.style.width = w; }, 200);
    });
}
var achieveSection = document.querySelector('.achievements-section');
if (achieveSection && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) animateCounters();
    }, { threshold: 0.3 }).observe(achieveSection);
} else if (achieveSection) {
    animateCounters();
}

// ── Tracking Form ──
var trackForm = $("trackForm");
if (trackForm) {
    trackForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var num = $("trackNumber").value.trim();
        var phone = $("trackPhone").value.trim();
        var resultEl = $("trackResult");
        try {
            var res = await fetch(API + "/api/client/txn?number=" + encodeURIComponent(num) + "&phone=" + encodeURIComponent(phone));
            var data = await res.json();
            if (!data.ok) throw new Error(data.error || "المعاملة غير موجودة");
            var t = data.txn;
            resultEl.innerHTML = '<div style="text-align:right">' +
                '<h3 style="color:var(--accent);margin-bottom:12px">📋 ' + t.number + '</h3>' +
                '<p><strong>العنوان:</strong> ' + t.title + '</p>' +
                '<p><strong>الحالة:</strong> <span class="status-badge ' + t.status + '">' + t.status + '</span></p>' +
                '<p><strong>آخر تحديث:</strong> ' + (t.updatedAt || t.createdAt) + '</p>' +
                (t.notes ? '<p><strong>ملاحظات:</strong> ' + t.notes + '</p>' : '') +
                '</div>';
            resultEl.classList.remove("hidden");
        } catch (err) {
            resultEl.innerHTML = '<p style="color:var(--red);text-align:center">❌ ' + err.message + '</p>';
            resultEl.classList.remove("hidden");
        }
    });
}

// ── Send Track Link via WhatsApp ──
var sendTrackBtn = $("sendTrackLinkBtn");
if (sendTrackBtn) {
    sendTrackBtn.addEventListener("click", function () {
        var num = $("trackNumber").value.trim();
        var phone = $("trackPhone").value.trim();
        if (!num || !phone) { showToast("أدخل رقم المعاملة ورقم الجوال أولاً"); return; }
        var trackUrl = window.location.origin + "/track/" + encodeURIComponent(num);
        var waMsg = "مرحباً، رابط تتبع معاملتك رقم " + num + " في منصة 2169:\n" + trackUrl;
        var waPhone = phone.replace(/^0/, "966");
        window.open("https://wa.me/" + waPhone + "?text=" + encodeURIComponent(waMsg), "_blank");
    });
}

// ── Price Quote Form ──
var quoteForm = $("quoteForm");
if (quoteForm) {
    quoteForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var name = $("quoteName").value.trim();
        var phone = $("quotePhone").value.trim();
        var service = $("quoteService").value;
        var desc = $("quoteDesc").value.trim();
        try {
            await api("POST", "/api/client/register", { name: name, phone: phone, email: "" });
            var waMsg = "طلب عرض سعر جديد من منصة 2169:\n\n" +
                "الاسم: " + name + "\n" +
                "الجوال: " + phone + "\n" +
                "الخدمة: " + service + "\n" +
                (desc ? "التفاصيل: " + desc : "");
            window.open("https://wa.me/966502049200?text=" + encodeURIComponent(waMsg), "_blank");
            $("quoteSuccess").textContent = "✅ تم إرسال طلب عرض السعر! سنتواصل معك قريباً";
            $("quoteSuccess").classList.remove("hidden");
            quoteForm.reset();
        } catch (err) {
            showToast("خطأ: " + err.message);
        }
    });
}

// ── Commercial Service Form ──
var commForm = $("commercialForm");
if (commForm) {
    commForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var name = $("commName").value.trim();
        var phone = $("commPhone").value.trim();
        var service = $("commService").value;
        var business = $("commBusiness").value.trim();
        var notes = $("commNotes").value.trim();
        try {
            await api("POST", "/api/client/register", { name: name, phone: phone, email: "" });
            var waMsg = "طلب خدمة تجارية من منصة 2169:\n\n" +
                "الاسم: " + name + "\n" +
                "الجوال: " + phone + "\n" +
                "الخدمة: " + service + "\n" +
                (business ? "المنشأة: " + business + "\n" : "") +
                (notes ? "ملاحظات: " + notes : "");
            window.open("https://wa.me/966502049200?text=" + encodeURIComponent(waMsg), "_blank");
            $("commSuccess").textContent = "✅ تم إرسال طلب الخدمة التجارية! سنتواصل معك قريباً";
            $("commSuccess").classList.remove("hidden");
            commForm.reset();
        } catch (err) {
            showToast("خطأ: " + err.message);
        }
    });
}

// ── Hero Search Bar ──
var heroSearchForm = $("heroSearchForm");
if (heroSearchForm) {
    heroSearchForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var query = $("heroSearchInput").value.trim();
        var resultDiv = $("heroSearchResult");
        if (!query) return;
        resultDiv.classList.remove("hidden");
        resultDiv.innerHTML = '<p style="color:var(--muted)">جاري البحث...</p>';
        try {
            var data = await api("POST", "/api/client-lookup", {
                txnNumber: query,
                phone: ""
            });
            resultDiv.innerHTML = '<div style="padding:8px">' +
                '<div style="font-weight:800;font-size:16px;margin-bottom:8px">📋 ' + data.txnNumber + '</div>' +
                '<div>الحالة: <span style="color:var(--accent);font-weight:700">' + data.status + '</span></div>' +
                '<div>النوع: ' + data.serviceType + '</div>' +
                '</div>';
        } catch (err) {
            resultDiv.innerHTML = '<p style="color:var(--red)">❌ ' + err.message + '</p>' +
                '<p style="color:var(--muted);font-size:13px">جرب إدخال رقم المعاملة في خانة الاستعلام أدناه مع رقم الجوال</p>';
        }
    });
}

// ════════════════════════════════
//    CLIENT LOOKUP & REQUEST
// ════════════════════════════════
$("clientForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    $("clientError").classList.add("hidden");
    $("clientResult").classList.add("hidden");
    try {
        var data = await api("POST", "/api/client/lookup", {
            number: $("clientTxnNumber").value.trim(),
            phone: $("clientPhone").value.trim()
        });
        var t = data.txn;
        $("clientResult").innerHTML =
            "<div><strong>نوع الخدمة:</strong> " + t.service + "</div>" +
            "<div><strong>الحالة:</strong> " + t.status + "</div>" +
            "<div><strong>آخر تحديث:</strong> " + t.updatedAt + "</div>" +
            "<div><strong>عرض السعر:</strong> " + (t.quote || "بانتظار عرض السعر") + "</div>" +
            "<div><strong>طريقة الدفع:</strong> " + (t.payment || "بانتظار تحديد طريقة الدفع") + "</div>" +
            "<div><strong>ملاحظات:</strong> " + (t.notes || "بدون ملاحظات") + "</div>";
        $("clientResult").classList.remove("hidden");
    } catch (err) {
        $("clientError").textContent = err.message;
        $("clientError").classList.remove("hidden");
    }
});

$("requestForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    $("requestSuccess").classList.add("hidden");
    try {
        var name = $("reqName").value.trim();
        var phone = $("reqPhone").value.trim();
        var email = $("reqEmail") ? $("reqEmail").value.trim() : "";
        var service = $("reqService").value.trim();
        var notes = $("reqNotes").value.trim();

        // Register client
        try { await api("POST", "/api/client/register", { name: name, phone: phone, email: email }); } catch (e) { }

        // Create request
        var data = await api("POST", "/api/client/request", {
            client: name,
            phone: phone,
            service: service,
            notes: notes
        });
        $("requestSuccess").textContent = "تم استلام طلبك بنجاح! ✅ رقم المعاملة: " + data.number;
        $("clientTxnNumber").value = data.number;
        $("clientPhone").value = phone;
        $("requestForm").reset();
        $("requestSuccess").classList.remove("hidden");
        showToast("تم إرسال الطلب: " + data.number);
    } catch (err) {
        showToast("حدث خطأ: " + err.message);
    }
});


// ════════════════════════════════
//    DASHBOARD PAGE SWITCHING
// ════════════════════════════════
var allPages = ["stats", "txns", "addTxn", "audit", "users", "messages", "reports", "settings"];
var allNavTabs = document.querySelectorAll(".nav-tab");

function switchPage(pageName) {
    // Hide all pages
    allPages.forEach(function (p) {
        var el = $("page-" + p);
        if (el) el.classList.add("hidden");
    });
    // Show target page
    var target = $("page-" + pageName);
    if (target) target.classList.remove("hidden");

    // Update nav tabs
    allNavTabs.forEach(function (tab) {
        if (tab.dataset.view === pageName) {
            tab.classList.add("active");
        } else {
            tab.classList.remove("active");
        }
    });

    // Load data for the page
    if (pageName === "stats") loadStats();
    if (pageName === "txns") loadTxns();
    if (pageName === "audit") loadAudit();
    if (pageName === "users") loadUsers();
    if (pageName === "messages") loadMessageLog();
    if (pageName === "reports") loadDailyReport();
    if (pageName === "settings") loadSettings();
}

allNavTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
        switchPage(tab.dataset.view);
    });
});

// ════════════════════════════════
//         STATS
// ════════════════════════════════
async function loadStats() {
    try {
        var data = await api("GET", "/api/stats");
        var s = data.stats;
        $("statTotal").textContent = s.total;
        $("statWeek").textContent = s.recentWeek;

        var pending = (s.byStatus["جديد"] || 0) +
            (s.byStatus["بانتظار عرض السعر"] || 0) +
            (s.byStatus["بانتظار الدفع"] || 0) +
            (s.byStatus["بانتظار زيارة الوزارة"] || 0);
        $("statPending").textContent = pending;
        $("statDone").textContent = (s.byStatus["تمت الموافقة"] || 0) + (s.byStatus["مغلق"] || 0);

        // Status chart
        var entries = Object.entries(s.byStatus);
        if (entries.length > 0) {
            var maxVal = Math.max.apply(null, entries.map(function (e) { return e[1]; }));
            if (maxVal === 0) maxVal = 1;
            $("statusChart").innerHTML = entries.map(function (e) {
                var pct = Math.round(e[1] / maxVal * 100);
                return '<div class="chart-row">' +
                    '<span class="chart-label">' + e[0] + '</span>' +
                    '<div class="chart-bar-track"><div class="chart-bar-fill bar-accent" style="width:' + pct + '%">' + e[1] + '</div></div>' +
                    '</div>';
            }).join("");
        } else {
            $("statusChart").innerHTML = '<div class="empty-msg">لا توجد بيانات بعد</div>';
        }

        // Services chart
        if (s.topServices.length > 0) {
            var maxSvc = Math.max.apply(null, s.topServices.map(function (x) { return x.count; }));
            if (maxSvc === 0) maxSvc = 1;
            $("servicesChart").innerHTML = s.topServices.map(function (svc) {
                var pct = Math.round(svc.count / maxSvc * 100);
                return '<div class="chart-row">' +
                    '<span class="chart-label">' + svc.service + '</span>' +
                    '<div class="chart-bar-track"><div class="chart-bar-fill bar-blue" style="width:' + pct + '%">' + svc.count + '</div></div>' +
                    '</div>';
            }).join("");
        } else {
            $("servicesChart").innerHTML = '<div class="empty-msg">لا توجد بيانات بعد</div>';
        }
    } catch (err) {
        console.error("Stats error:", err);
    }
}

// AI Summarize
$("aiSummarizeBtn").addEventListener("click", async function () {
    var el = $("aiSummary");
    el.textContent = "جاري التحليل بالذكاء الاصطناعي... ⏳";
    el.style.opacity = "0.5";
    try {
        var data = await api("POST", "/api/ai/summarize");
        el.textContent = data.summary;
        el.style.opacity = "1";
    } catch (err) {
        el.textContent = "حدث خطأ: " + err.message;
        el.style.opacity = "1";
    }
});

// Export CSV
$("exportCsvBtn").addEventListener("click", async function () {
    try {
        var res = await fetch(API + "/api/export/csv", {
            headers: { "Authorization": "Bearer " + token }
        });
        var blob = await res.blob();
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = "transactions.csv";
        a.click();
        URL.revokeObjectURL(url);
        showToast("تم تصدير الملف ✅");
    } catch (err) {
        showToast("خطأ في التصدير");
    }
});

// ════════════════════════════════
//       TRANSACTIONS
// ════════════════════════════════
function getStatusClass(status) {
    if (status === "جديد") return "txn-status status-new";
    if (status === "تمت الموافقة") return "txn-status status-approved";
    if (status === "مرفوض") return "txn-status status-rejected";
    if (status === "مغلق") return "txn-status status-closed";
    return "txn-status status-waiting";
}

async function loadTxns() {
    try {
        var q = $("search") ? $("search").value.trim() : "";
        var status = $("filterStatus") ? $("filterStatus").value : "";
        var params = "";
        if (q) params += "q=" + encodeURIComponent(q);
        if (status) params += (params ? "&" : "") + "status=" + encodeURIComponent(status);
        var data = await api("GET", "/api/txns?" + params);
        renderTxns(data.txns);
    } catch (err) {
        console.error("Txns error:", err);
    }
}

function renderTxns(txns) {
    var list = $("txnList");
    if (!txns || txns.length === 0) {
        list.innerHTML = '<div class="empty-msg">لا توجد معاملات.</div>';
        return;
    }
    var html = "";
    txns.forEach(function (t) {
        html += '<div class="txn-item">' +
            '<div>' +
            '<div class="txn-title">' + t.service + ' - ' + t.number + '</div>' +
            '<div class="txn-meta">العميل: ' + t.client + ' • الجوال: ' + t.phone + ' • ' + t.updatedAt + '</div>' +
            '<div class="' + getStatusClass(t.status) + '">' + t.status + '</div>' +
            '</div>' +
            '<div class="txn-actions-col">' +
            '<button class="btn outline small" onclick="openTxnModal(\'' + t.id + '\')">التفاصيل</button>' +
            '<div class="txn-quick-actions">' +
            '<button class="btn wa-btn small" onclick="event.stopPropagation(); sendWhatsApp(\'' + t.id + '\')" title="إرسال واتساب">📱</button>' +
            '<button class="btn link-btn small" onclick="event.stopPropagation(); generateShareLink(\'' + t.id + '\')" title="رابط مختصر">🔗</button>' +
            '<button class="btn danger small" onclick="event.stopPropagation(); confirmDelete(\'' + t.id + '\')">حذف</button>' +
            '</div>' +
            '</div>' +
            '</div>';
    });
    list.innerHTML = html;
}

if ($("search")) $("search").addEventListener("input", loadTxns);
if ($("filterStatus")) $("filterStatus").addEventListener("change", loadTxns);

// ── Add Transaction ──
$("txnForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
        var data = {
            number: $("txnNumber").value.trim(),
            client: $("clientName").value.trim(),
            phone: $("clientPhoneInput").value.trim(),
            service: $("serviceType").value.trim(),
            status: $("status").value,
            notes: $("notes").value.trim(),
            quote: $("quote").value.trim(),
            payment: $("payment").value.trim(),
            attachments: uploadedFiles,
            origin: "admin"
        };
        await api("POST", "/api/txns", data);
        $("txnForm").reset();
        uploadedFiles = [];
        $("attachmentsList").innerHTML = "";
        showToast("تم حفظ المعاملة بنجاح ✅");
        switchPage("txns");
    } catch (err) {
        showToast("خطأ: " + err.message);
    }
});

// File Upload
$("attachmentInput").addEventListener("change", async function (e) {
    var files = e.target.files;
    for (var i = 0; i < files.length; i++) {
        var fd = new FormData();
        fd.append("file", files[i]);
        try {
            var res = await fetch(API + "/api/upload", {
                method: "POST",
                headers: { "Authorization": "Bearer " + token },
                body: fd
            });
            var data = await res.json();
            if (data.ok) {
                uploadedFiles.push({ url: data.url, name: data.name });
                $("attachmentsList").innerHTML += '<span class="attachment-chip">📎 ' + data.name + '</span>';
            }
        } catch (err) {
            showToast("خطأ في رفع الملف");
        }
    }
});

// ════════════════════════════════
//    TRANSACTION MODAL
// ════════════════════════════════
window.openTxnModal = async function (id) {
    try {
        var txnRes = await api("GET", "/api/txns?q=");
        var auditRes = await api("GET", "/api/audit/" + id);
        var txn = null;
        for (var i = 0; i < txnRes.txns.length; i++) {
            if (txnRes.txns[i].id === id) { txn = txnRes.txns[i]; break; }
        }
        if (!txn) { showToast("المعاملة غير موجودة"); return; }
        var logs = auditRes.logs;

        var statusOptions = ["جديد", "بانتظار عرض السعر", "بانتظار الدفع", "بانتظار زيارة الوزارة", "تمت الموافقة", "مرفوض", "مغلق"];
        var optionsHtml = statusOptions.map(function (s) {
            return '<option value="' + s + '"' + (s === txn.status ? ' selected' : '') + '>' + s + '</option>';
        }).join("");

        var attachHtml = "";
        if (txn.attachments && txn.attachments.length > 0) {
            attachHtml = '<div style="margin-top:12px"><strong>المرفقات:</strong><br/>';
            txn.attachments.forEach(function (a) {
                attachHtml += '<a href="' + a.url + '" target="_blank" class="attachment-link">📎 ' + a.name + '</a> ';
            });
            attachHtml += '</div>';
        }

        var auditHtml = "";
        if (logs.length > 0) {
            auditHtml = '<div class="audit-section"><h3 style="color:var(--accent);font-size:15px;margin-top:16px">سجل التعديلات</h3>';
            logs.forEach(function (l) {
                auditHtml += '<div class="audit-item">' +
                    '<span class="audit-action">' + (l.action === "update" ? "تحديث" : "حذف") + '</span>' +
                    (l.field ? ' — ' + l.field + ': ' + l.oldValue + ' → ' + l.newValue : '') +
                    '<div class="audit-time">بواسطة: ' + l.userId + ' • ' + l.createdAt + '</div>' +
                    '</div>';
            });
            auditHtml += '</div>';
        }

        $("modalTitle").textContent = txn.service + " - " + txn.number;
        $("modalBody").innerHTML =
            '<div class="detail-row"><span class="detail-label">العميل</span><span class="detail-value">' + txn.client + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">الجوال</span><span class="detail-value">' + txn.phone + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">الخدمة</span><span class="detail-value">' + txn.service + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">الحالة</span><span class="detail-value"><span class="' + getStatusClass(txn.status) + '">' + txn.status + '</span></span></div>' +
            '<div class="detail-row"><span class="detail-label">عرض السعر</span><span class="detail-value">' + (txn.quote || "—") + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">طريقة الدفع</span><span class="detail-value">' + (txn.payment || "—") + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">الملاحظات</span><span class="detail-value">' + (txn.notes || "—") + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">تاريخ الإنشاء</span><span class="detail-value">' + txn.createdAt + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">آخر تحديث</span><span class="detail-value">' + txn.updatedAt + '</span></div>' +
            attachHtml +
            '<div class="edit-section">' +
            '<h3 style="color:var(--accent);font-size:15px">تحديث سريع</h3>' +
            '<select id="modalStatus">' + optionsHtml + '</select>' +
            '<div style="display:flex;gap:8px"><input id="modalQuote" type="text" placeholder="عرض السعر" value="' + (txn.quote || "") + '"/>' +
            '<input id="modalPayment" type="text" placeholder="طريقة الدفع" value="' + (txn.payment || "") + '"/></div>' +
            '<textarea id="modalNotes" rows="2" placeholder="ملاحظات">' + (txn.notes || "") + '</textarea>' +
            '<button class="btn primary full-w" onclick="saveModalUpdate(\'' + id + '\')">حفظ التحديث</button>' +
            '</div>' +
            auditHtml;

        $("txnModal").classList.remove("hidden");
    } catch (err) {
        showToast("خطأ: " + err.message);
    }
};

window.saveModalUpdate = async function (id) {
    try {
        await api("PUT", "/api/txns/" + id, {
            status: $("modalStatus").value,
            quote: $("modalQuote").value.trim(),
            payment: $("modalPayment").value.trim(),
            notes: $("modalNotes").value.trim()
        });
        showToast("تم التحديث ✅");
        $("txnModal").classList.add("hidden");
        loadTxns();
    } catch (err) {
        showToast("خطأ: " + err.message);
    }
};

window.confirmDelete = async function (id) {
    if (!confirm("هل أنت متأكد من حذف هذه المعاملة؟")) return;
    try {
        await api("DELETE", "/api/txns/" + id);
        showToast("تم الحذف");
        loadTxns();
    } catch (err) {
        showToast("خطأ: " + err.message);
    }
};

// Modal close
$("modalClose").addEventListener("click", function () { $("txnModal").classList.add("hidden"); });
$("modalBackdrop").addEventListener("click", function () { $("txnModal").classList.add("hidden"); });

// ════════════════════════════════
//       AUDIT LOG
// ════════════════════════════════
async function loadAudit() {
    try {
        var data = await api("GET", "/api/audit");
        if (!data.logs || data.logs.length === 0) {
            $("auditList").innerHTML = '<div class="empty-msg">لا توجد تعديلات بعد.</div>';
            return;
        }
        var html = "";
        data.logs.forEach(function (l) {
            html += '<div class="audit-item">' +
                '<span class="audit-action">' + (l.action === "update" ? "تحديث" : "حذف") + '</span>' +
                ' — المعاملة: ' + (l.txnId ? l.txnId.substring(0, 8) + '...' : 'محذوفة') +
                (l.field ? ' • ' + l.field + ': <strong>' + l.oldValue + '</strong> → <strong>' + l.newValue + '</strong>' : '') +
                '<div class="audit-time">بواسطة: ' + l.userId + ' • ' + l.createdAt + '</div>' +
                '</div>';
        });
        $("auditList").innerHTML = html;
    } catch (err) {
        console.error("Audit error:", err);
    }
}

// ════════════════════════════════
//       USERS
// ════════════════════════════════
async function loadUsers() {
    try {
        var data = await api("GET", "/api/users");
        if (!data.users || data.users.length === 0) {
            $("usersList").innerHTML = '<div class="empty-msg">لا يوجد مستخدمين</div>';
            return;
        }
        var html = "";
        data.users.forEach(function (u) {
            html += '<div class="user-item">' +
                '<div class="user-info">' +
                '<strong>' + (u.fullName || u.username) + '</strong> ' +
                '<span class="user-role">' + (u.role === "admin" ? "مشرف" : "موظف") + '</span> ' +
                '<span class="muted" style="font-size:12px;margin-right:8px">@' + u.username + '</span>' +
                '</div>' +
                (u.username !== "admin" ? '<button class="btn danger small" onclick="deleteUserFn(' + u.id + ')">حذف</button>' : '') +
                '</div>';
        });
        $("usersList").innerHTML = html;
    } catch (err) {
        console.error("Users error:", err);
    }
}

$("addUserForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    try {
        await api("POST", "/api/users", {
            username: $("newUsername").value.trim(),
            password: $("newPassword").value.trim(),
            fullName: $("newFullName").value.trim(),
            role: $("newRole").value
        });
        $("addUserForm").reset();
        showToast("تم إضافة المستخدم ✅");
        loadUsers();
    } catch (err) {
        showToast("خطأ: " + err.message);
    }
});

window.deleteUserFn = async function (id) {
    if (!confirm("حذف هذا المستخدم؟")) return;
    try {
        await api("DELETE", "/api/users/" + id);
        showToast("تم حذف المستخدم");
        loadUsers();
    } catch (err) {
        showToast("خطأ: " + err.message);
    }
};

// ════════════════════════════════
//       NOTIFICATIONS
// ════════════════════════════════
async function loadNotifications() {
    try {
        var data = await api("GET", "/api/notifications");
        $("notifBadge").textContent = data.unreadCount;
        if (data.unreadCount > 0) {
            $("notifBadge").classList.remove("hidden");
        } else {
            $("notifBadge").classList.add("hidden");
        }
        if (!data.notifications || data.notifications.length === 0) {
            $("notifList").innerHTML = '<div class="empty-msg">لا توجد إشعارات</div>';
            return;
        }
        var html = "";
        data.notifications.forEach(function (n) {
            html += '<div class="notif-item ' + (n.isRead ? '' : 'unread') + '" onclick="markNotifRead(' + n.id + ')">' +
                n.message +
                '<div class="notif-time">' + n.createdAt + '</div>' +
                '</div>';
        });
        $("notifList").innerHTML = html;
    } catch (err) {
        console.error("Notif error:", err);
    }
}

function toggleDrawer() {
    $("notifDrawer").classList.toggle("hidden");
    $("overlay").classList.toggle("hidden");
    if (!$("notifDrawer").classList.contains("hidden")) loadNotifications();
}

$("notifBtn").addEventListener("click", toggleDrawer);
$("overlay").addEventListener("click", toggleDrawer);
$("closeDrawer").addEventListener("click", toggleDrawer);

$("markAllReadBtn").addEventListener("click", async function () {
    try {
        await api("POST", "/api/notifications/read-all");
        loadNotifications();
    } catch (err) { console.error(err); }
});

window.markNotifRead = async function (id) {
    try {
        await api("POST", "/api/notifications/" + id + "/read");
        loadNotifications();
    } catch (err) { console.error(err); }
};

// ════════════════════════════════
//       AI CHATBOT
// ════════════════════════════════
$("chatFab").addEventListener("click", function () {
    $("chatPanel").classList.toggle("hidden");
});

$("chatClose").addEventListener("click", function () {
    $("chatPanel").classList.add("hidden");
});

$("chatForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var input = $("chatInput");
    var msg = input.value.trim();
    if (!msg) return;

    var msgs = $("chatMessages");
    msgs.innerHTML += '<div class="chat-bubble user">' + msg + '</div>';
    input.value = "";
    msgs.scrollTop = msgs.scrollHeight;

    var loadId = "load-" + Date.now();
    msgs.innerHTML += '<div class="chat-bubble bot" id="' + loadId + '">⏳ جاري الرد...</div>';
    msgs.scrollTop = msgs.scrollHeight;

    try {
        var data = await api("POST", "/api/ai/chat", { message: msg });
        document.getElementById(loadId).textContent = data.reply;
    } catch (err) {
        document.getElementById(loadId).textContent = "عذراً، حدث خطأ: " + err.message;
    }
    msgs.scrollTop = msgs.scrollHeight;
});

// Refresh notifications every 30s
setInterval(function () {
    if (token) loadNotifications();
}, 30000);

// ════════════════════════════════
//       WHATSAPP & SHARE LINKS
// ════════════════════════════════
window.sendWhatsApp = async function (id) {
    try {
        var data = await api("POST", "/api/txns/" + id + "/whatsapp", { templateType: "status" });
        window.open(data.waUrl, "_blank");
        showToast("تم فتح الواتساب ✅");
    } catch (err) {
        showToast("خطأ: " + err.message);
    }
};

window.sendWhatsAppPayment = async function (id) {
    try {
        var data = await api("POST", "/api/txns/" + id + "/whatsapp", { templateType: "payment" });
        window.open(data.waUrl, "_blank");
        showToast("تم فتح الواتساب ✅");
    } catch (err) {
        showToast("خطأ: " + err.message);
    }
};

window.sendWhatsAppReminder = async function (id) {
    try {
        var data = await api("POST", "/api/txns/" + id + "/whatsapp", { templateType: "reminder" });
        window.open(data.waUrl, "_blank");
        showToast("تم فتح الواتساب ✅");
    } catch (err) {
        showToast("خطأ: " + err.message);
    }
};

window.generateShareLink = async function (id) {
    try {
        var data = await api("POST", "/api/txns/" + id + "/share-link");
        var fullLink = window.location.origin + data.link;
        await navigator.clipboard.writeText(fullLink);
        showToast("تم نسخ الرابط المختصر 📎\n" + fullLink);
    } catch (err) {
        showToast("خطأ: " + err.message);
    }
};

// ════════════════════════════════
//       BULK WHATSAPP
// ════════════════════════════════
if ($("bulkWaBtn")) {
    $("bulkWaBtn").addEventListener("click", async function () {
        var status = $("bulkStatus").value;
        var templateType = $("bulkTemplate").value;
        if (!status) { showToast("اختر الحالة أولاً"); return; }
        try {
            var data = await api("POST", "/api/bulk-whatsapp", { status: status, templateType: templateType });
            if (data.count === 0) {
                showToast("لا توجد معاملات بهذه الحالة");
                return;
            }
            var resultsDiv = $("bulkResults");
            var html = '<div class="bulk-header">📢 تم إعداد ' + data.count + ' رسالة. اضغط على كل عميل لفتح الواتساب:</div>';
            data.messages.forEach(function (m) {
                html += '<div class="bulk-item">' +
                    '<span>' + m.client + ' (' + m.number + ')</span>' +
                    '<a href="' + m.waUrl + '" target="_blank" class="btn wa-btn small">📱 فتح الواتساب</a>' +
                    '</div>';
            });
            resultsDiv.innerHTML = html;
            resultsDiv.classList.remove("hidden");
            showToast("تم إعداد " + data.count + " رسالة ✅");
        } catch (err) {
            showToast("خطأ: " + err.message);
        }
    });
}

// ════════════════════════════════
//       MESSAGE LOG
// ════════════════════════════════
async function loadMessageLog() {
    try {
        var data = await api("GET", "/api/messages?limit=50");
        var el = $("messageLog");
        if (!data.messages || data.messages.length === 0) {
            el.innerHTML = '<div class="empty-msg">لا توجد رسائل مرسلة بعد</div>';
            return;
        }
        var html = '';
        data.messages.forEach(function (m) {
            var typeLabel = m.type === 'whatsapp_bulk' ? '📢 جماعي' : '📱 فردي';
            html += '<div class="msg-item">' +
                '<div class="msg-header">' +
                '<span class="msg-type">' + typeLabel + '</span>' +
                '<span class="msg-phone">' + m.phone + '</span>' +
                '<span class="msg-time">' + m.createdAt + '</span>' +
                '</div>' +
                '<div class="msg-body">' + m.message.substring(0, 100) + (m.message.length > 100 ? '...' : '') + '</div>' +
                '<div class="msg-footer">بواسطة: ' + (m.sentBy || 'admin') + '</div>' +
                '</div>';
        });
        el.innerHTML = html;
    } catch (err) {
        console.error("Messages error:", err);
    }
}

// ════════════════════════════════
//       DAILY REPORT
// ════════════════════════════════
async function loadDailyReport() {
    try {
        var dateInput = $("reportDate");
        if (!dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
        var data = await api("GET", "/api/reports/daily?date=" + dateInput.value);
        var rp = data.report;
        $("rpNew").textContent = rp.newCount;
        $("rpUpdated").textContent = rp.updatedCount;
        $("rpCompleted").textContent = rp.completedCount;
        $("rpMessages").textContent = rp.messagesCount;

        // Report transactions
        var list = $("reportTxnList");
        if (!rp.transactions || rp.transactions.length === 0) {
            list.innerHTML = '<div class="empty-msg">لا توجد معاملات في هذا اليوم</div>';
            return;
        }
        var html = '';
        rp.transactions.forEach(function (t) {
            html += '<div class="txn-item">' +
                '<div>' +
                '<div class="txn-title">' + t.service + ' - ' + t.number + '</div>' +
                '<div class="txn-meta">العميل: ' + t.client + ' • ' + t.updatedAt + '</div>' +
                '<div class="' + getStatusClass(t.status) + '">' + t.status + '</div>' +
                '</div>' +
                '</div>';
        });
        list.innerHTML = html;
    } catch (err) {
        console.error("Report error:", err);
    }
}

if ($("loadReportBtn")) {
    $("loadReportBtn").addEventListener("click", loadDailyReport);
}

// ════════════════════════════════
//       SETTINGS
// ════════════════════════════════
async function loadSettings() {
    try {
        var data = await api("GET", "/api/settings");
        var s = data.settings;
        if ($("settPlatformName")) $("settPlatformName").value = s.platform_name || '';
        if ($("settContactPhone")) $("settContactPhone").value = s.contact_phone || '';
        if ($("settTemplateStatus")) $("settTemplateStatus").value = s.whatsapp_template_status || '';
        if ($("settTemplatePayment")) $("settTemplatePayment").value = s.whatsapp_template_payment || '';
        if ($("settTemplateReminder")) $("settTemplateReminder").value = s.whatsapp_template_reminder || '';
    } catch (err) {
        console.error("Settings error:", err);
    }
}

if ($("settingsForm")) {
    $("settingsForm").addEventListener("submit", async function (e) {
        e.preventDefault();
        try {
            await api("POST", "/api/settings", {
                settings: {
                    platform_name: $("settPlatformName").value.trim(),
                    contact_phone: $("settContactPhone").value.trim(),
                    whatsapp_template_status: $("settTemplateStatus").value,
                    whatsapp_template_payment: $("settTemplatePayment").value,
                    whatsapp_template_reminder: $("settTemplateReminder").value
                }
            });
            showToast("تم حفظ الإعدادات ✅");
        } catch (err) {
            showToast("خطأ: " + err.message);
        }
    });
}

// ════════════════════════════════
//       TRACKING PAGE
// ════════════════════════════════
async function loadTrackingPage() {
    var pathParts = window.location.pathname.split('/');
    var code = pathParts[pathParts.length - 1];
    if (!code) return;

    // Hide login and dashboard, show tracking view
    if ($("loginView")) $("loginView").classList.add("hidden");
    if ($("dashboardView")) $("dashboardView").classList.add("hidden");
    if ($("headerActions")) $("headerActions").classList.add("hidden");
    if ($("trackingView")) $("trackingView").classList.remove("hidden");
    if ($("chatFab")) $("chatFab").style.display = "none";

    try {
        var res = await fetch(API + "/api/track/" + code);
        var data = await res.json();
        if (!data.ok) {
            $("trackingContent").innerHTML = '<div class="error-msg">❌ الرابط غير صالح أو المعاملة غير موجودة</div>';
            return;
        }
        var t = data.txn;
        var statusClass = getStatusClass(t.status);
        $("trackingContent").innerHTML =
            '<div class="tracking-card">' +
            '<div class="tracking-number">📋 ' + t.number + '</div>' +
            '<div class="tracking-status"><span class="' + statusClass + '">' + t.status + '</span></div>' +
            '<div class="tracking-details">' +
            '<div class="detail-row"><span class="detail-label">العميل</span><span class="detail-value">' + t.client + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">الخدمة</span><span class="detail-value">' + t.service + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">عرض السعر</span><span class="detail-value">' + (t.quote || '—') + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">طريقة الدفع</span><span class="detail-value">' + (t.payment || '—') + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">الملاحظات</span><span class="detail-value">' + (t.notes || '—') + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">تاريخ الإنشاء</span><span class="detail-value">' + t.createdAt + '</span></div>' +
            '<div class="detail-row"><span class="detail-label">آخر تحديث</span><span class="detail-value">' + t.updatedAt + '</span></div>' +
            '</div>' +
            '</div>';
    } catch (err) {
        $("trackingContent").innerHTML = '<div class="error-msg">❌ حدث خطأ في تحميل بيانات المعاملة</div>';
    }
}

// ── Add WhatsApp buttons to modal ──
var originalOpenTxnModal = window.openTxnModal;
var _origSaveModalUpdate = window.saveModalUpdate;

// ── INIT ──
if (isTrackingPage) {
    loadTrackingPage();
} else if (token && currentUser) {
    showDashboard();
} else {
    showLogin();
}

// ════════════════════════════════
//    FLOATING AI CHATBOT
// ════════════════════════════════
(function () {
    var toggle = $("aiChatToggle");
    var panel = $("aiChatPanel");
    var chatIcon = toggle ? toggle.querySelector(".ai-chat-icon") : null;
    var chatClose = toggle ? toggle.querySelector(".ai-chat-close") : null;
    var chatForm = $("aiChatForm");
    var chatInput = $("aiChatInput");
    var chatMessages = $("aiChatMessages");
    var isOpen = false;

    if (!toggle) return;

    toggle.addEventListener("click", function () {
        isOpen = !isOpen;
        if (isOpen) {
            panel.classList.remove("hidden");
            chatIcon.classList.add("hidden");
            chatClose.classList.remove("hidden");
            chatInput.focus();
        } else {
            panel.classList.add("hidden");
            chatIcon.classList.remove("hidden");
            chatClose.classList.add("hidden");
        }
    });

    function addMsg(text, type) {
        var div = document.createElement("div");
        div.className = "ai-msg " + type;
        var bubble = document.createElement("div");
        bubble.className = "ai-msg-bubble";
        bubble.innerHTML = text.replace(/\n/g, "<br>");
        div.appendChild(bubble);
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return div;
    }

    function addTyping() {
        var div = document.createElement("div");
        div.className = "ai-msg bot";
        div.id = "aiTyping";
        div.innerHTML = '<div class="ai-msg-typing"><span></span><span></span><span></span></div>';
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function removeTyping() {
        var t = $("aiTyping");
        if (t) t.remove();
    }

    if (chatForm) {
        chatForm.addEventListener("submit", async function (e) {
            e.preventDefault();
            var msg = chatInput.value.trim();
            if (!msg) return;
            addMsg(msg, "user");
            chatInput.value = "";
            addTyping();

            try {
                var data = await api("POST", "/api/ai/chat", { message: msg });
                removeTyping();
                addMsg(data.reply, "bot");
            } catch (err) {
                removeTyping();
                addMsg("عذراً، حدث خطأ. يرجى المحاولة مرة أخرى أو التواصل عبر واتساب: 966502049200", "bot");
            }
        });
    }
})();

