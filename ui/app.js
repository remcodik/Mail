/* MailAI — frontend logic */

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  accounts: [],         // [{email, color, label, added}]
  emails: [],           // all loaded emails
  activeAccount: "all",
  activeTab: "urgent",
  currentEmail: null,
  version: null,
};

// ── API helpers ────────────────────────────────────────────────────────────
async function api(path, method = "GET", body = null) {
  const opts = { method, headers: {} };
  if (body) { opts.body = JSON.stringify(body); opts.headers["Content-Type"] = "application/json"; }
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json();
}

const post = (path, body) => api(path, "POST", body);

// ── Boot ───────────────────────────────────────────────────────────────────
async function boot() {
  // Check if account was just added via OAuth2
  const params = new URLSearchParams(location.search);
  if (params.has("account_added")) {
    history.replaceState({}, "", "/");
  }

  const [versionData, accounts] = await Promise.all([
    api("/api/version"),
    api("/api/accounts"),
  ]);

  state.version = versionData;
  state.accounts = accounts;

  updateVersionBadges();

  if (accounts.length === 0) {
    showScreen("login");
  } else {
    showScreen("app");
    renderAccountBar();
    await loadEmails();
  }
}

// ── Screens ────────────────────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  document.getElementById(`screen-${name}`).classList.remove("hidden");
}

function updateVersionBadges() {
  const label = state.version?.label || "";
  document.querySelectorAll(".version-badge").forEach(el => (el.textContent = label));
  const sv = document.getElementById("settings-version");
  if (sv) sv.textContent = `MailAI ${label}`;
}

// ── Account bar ────────────────────────────────────────────────────────────
function renderAccountBar() {
  const bar = document.getElementById("account-bar");
  bar.innerHTML = `<button class="account-chip ${state.activeAccount === "all" ? "active" : ""}" data-account="all">All</button>`;

  for (const acc of state.accounts) {
    const chip = document.createElement("button");
    chip.className = `account-chip ${state.activeAccount === acc.email ? "active" : ""}`;
    chip.dataset.account = acc.email;
    chip.style.setProperty("--chip-color", acc.color);
    chip.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${acc.color};margin-right:5px"></span>${acc.label}`;
    bar.appendChild(chip);
  }

  bar.addEventListener("click", e => {
    const chip = e.target.closest(".account-chip");
    if (!chip) return;
    state.activeAccount = chip.dataset.account;
    bar.querySelectorAll(".account-chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    renderEmailList();
  });
}

// ── Load emails ─────────────────────────────────────────────────────────────
async function loadEmails() {
  document.getElementById("loading").style.display = "";
  document.getElementById("empty").style.display = "none";
  document.getElementById("email-list").querySelectorAll(".email-card").forEach(c => c.remove());

  try {
    const emails = await api("/api/inbox/all");
    state.emails = emails;
    renderEmailList();
  } catch (e) {
    document.getElementById("loading").textContent = "Could not load emails.";
  }
}

// ── Render email list ──────────────────────────────────────────────────────
function renderEmailList() {
  const list = document.getElementById("email-list");
  list.querySelectorAll(".email-card").forEach(c => c.remove());
  document.getElementById("loading").style.display = "none";

  let filtered = state.emails.filter(e => e.category === state.activeTab);
  if (state.activeAccount !== "all") {
    filtered = filtered.filter(e => e.account === state.activeAccount);
  }

  if (filtered.length === 0) {
    document.getElementById("empty").style.display = "";
    return;
  }
  document.getElementById("empty").style.display = "none";

  const showAccountDot = state.activeAccount === "all" && state.accounts.length > 1;

  for (const email of filtered) {
    const acc = state.accounts.find(a => a.email === email.account);
    const color = acc?.color || "#999";
    const card = document.createElement("div");
    card.className = "email-card";
    card.dataset.id = email.id;
    card.dataset.account = email.account;

    card.innerHTML = `
      <div class="account-dot-sm" style="background:${color};${showAccountDot ? "" : "opacity:0"}"></div>
      <div class="card-body">
        <div class="card-sender">${esc(senderName(email.from))}</div>
        <div class="card-subject">${esc(email.subject)}</div>
        <div class="card-snippet">${esc(email.summary || email.snippet || "")}</div>
        <div class="card-meta">
          <span class="card-time">${esc(formatDate(email.date))}</span>
          ${showAccountDot ? `<span class="card-account-label" style="background:${color}">${esc(acc?.label || "")}</span>` : ""}
        </div>
      </div>
    `;

    card.addEventListener("click", () => openDetail(email));
    list.appendChild(card);
  }
}

// ── Detail sheet ───────────────────────────────────────────────────────────
function openDetail(email) {
  state.currentEmail = email;
  const acc = state.accounts.find(a => a.email === email.account);
  const color = acc?.color || "#999";

  document.getElementById("detail-subject").textContent = email.subject;
  document.getElementById("detail-from").textContent = email.from;
  document.getElementById("detail-account-dot").style.background = color;
  document.getElementById("detail-body").textContent = email.body || email.snippet || "";

  // Summary
  const summaryCard = document.getElementById("detail-summary-card");
  if (email.summary) {
    summaryCard.classList.remove("hidden");
    document.getElementById("detail-summary").textContent = email.summary;
  } else {
    summaryCard.classList.add("hidden");
  }

  // Tasks
  const tasksCard = document.getElementById("detail-tasks-card");
  const tasksList = document.getElementById("detail-tasks");
  if (email.tasks?.length) {
    tasksCard.classList.remove("hidden");
    tasksList.innerHTML = email.tasks.map(t =>
      `<li>✓ ${esc(t.task)}<span class="task-due">${t.due_date || ""}</span></li>`
    ).join("");
  } else {
    tasksCard.classList.add("hidden");
  }

  // Draft reply
  const replyCard = document.getElementById("detail-reply-card");
  if (email.draft_reply) {
    replyCard.classList.remove("hidden");
    document.getElementById("detail-reply-text").value = email.draft_reply;
  } else {
    replyCard.classList.add("hidden");
  }

  // Ticket
  const ticketCard = document.getElementById("detail-ticket-card");
  if (email.ticket_data) {
    ticketCard.classList.remove("hidden");
    const t = email.ticket_data;
    document.getElementById("detail-ticket-info").innerHTML =
      `<strong>${esc(t.type || "")}</strong>: ${esc(t.event || "")} — ${esc(t.date || "")}`;
  } else {
    ticketCard.classList.add("hidden");
  }

  showSheet("detail-sheet");
}

function closeDetail() { hideSheet("detail-sheet"); }

// ── Send reply ─────────────────────────────────────────────────────────────
document.getElementById("btn-send-reply").addEventListener("click", async () => {
  const email = state.currentEmail;
  const body = document.getElementById("detail-reply-text").value;
  const toMatch = email.from.match(/<(.+)>/);
  const to = toMatch ? toMatch[1] : email.from;
  await post(`/api/email/${encodeURIComponent(email.account)}/${email.id}/send_reply`, {
    to, subject: `Re: ${email.subject}`, body, thread_id: email.thread_id,
  });
  closeDetail();
  showToast("Reply sent");
});

document.getElementById("btn-discard-reply").addEventListener("click", () => {
  document.getElementById("detail-reply-text").value = "";
  document.getElementById("detail-reply-card").classList.add("hidden");
});

// ── Archive / Delete ───────────────────────────────────────────────────────
document.getElementById("btn-archive").addEventListener("click", async () => {
  const e = state.currentEmail;
  await post(`/api/email/${encodeURIComponent(e.account)}/${e.id}/archive`);
  removeEmailFromState(e.id);
  closeDetail();
  showToast("Archived");
});

document.getElementById("btn-delete").addEventListener("click", async () => {
  if (!confirm("Delete this email?")) return;
  const e = state.currentEmail;
  await post(`/api/email/${encodeURIComponent(e.account)}/${e.id}/delete`);
  removeEmailFromState(e.id);
  closeDetail();
  showToast("Deleted");
});

// ── Category correction ────────────────────────────────────────────────────
const CATEGORIES = [
  { id: "urgent", label: "🔴 Urgent" },
  { id: "reply_needed", label: "↩ Reply" },
  { id: "newsletter", label: "📰 Newsletter" },
  { id: "junk", label: "🗑 Junk" },
  { id: "fyi", label: "ℹ FYI" },
  { id: "ticket", label: "🎫 Ticket" },
  { id: "awaiting_reply", label: "⏳ Waiting" },
  { id: "scheduling", label: "📅 Scheduling" },
];

document.getElementById("btn-wrong-cat").addEventListener("click", () => {
  const grid = document.getElementById("cat-grid");
  const current = state.currentEmail?.category;
  grid.innerHTML = CATEGORIES
    .filter(c => c.id !== current)
    .map(c => `<button class="cat-btn" data-cat="${c.id}">${c.label}</button>`)
    .join("");
  showSheet("correction-modal");
});

document.getElementById("cat-grid").addEventListener("click", async e => {
  const btn = e.target.closest(".cat-btn");
  if (!btn) return;
  const email = state.currentEmail;
  const correct = btn.dataset.cat;
  await post(`/api/email/${encodeURIComponent(email.account)}/${email.id}/correct`, {
    wrong: email.category, correct,
  });
  email.category = correct;
  hideSheet("correction-modal");
  renderEmailList();
  showToast(`Moved to ${correct}`);
});

document.getElementById("correction-cancel").addEventListener("click", () => {
  hideSheet("correction-modal");
});

// ── Settings sheet ─────────────────────────────────────────────────────────
async function openSettings() {
  const container = document.getElementById("settings-accounts");
  const accounts = await api("/api/accounts");
  state.accounts = accounts;

  container.innerHTML = accounts.map(acc => `
    <div class="settings-account-row">
      <div class="settings-account-dot" style="background:${acc.color}"></div>
      <div class="settings-account-info">
        <div class="settings-account-email">${esc(acc.email)}</div>
        <div class="settings-account-date">Added ${esc(acc.added)}</div>
      </div>
      <button class="settings-remove-btn" data-email="${esc(acc.email)}">Remove</button>
    </div>
  `).join("") || "<p style='color:#999;font-size:14px'>No accounts yet.</p>";

  container.querySelectorAll(".settings-remove-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm(`Remove ${btn.dataset.email}?`)) return;
      await post(`/api/accounts/${encodeURIComponent(btn.dataset.email)}/remove`);
      await openSettings();
      state.accounts = await api("/api/accounts");
      renderAccountBar();
      if (state.accounts.length === 0) { hideSheet("settings-sheet"); showScreen("login"); }
    });
  });

  document.getElementById("settings-version").textContent = `MailAI ${state.version?.label || ""}`;
  showSheet("settings-sheet");
}

// ── Tasks sheet ────────────────────────────────────────────────────────────
async function openTasks() {
  const param = state.activeAccount !== "all" ? `?account=${encodeURIComponent(state.activeAccount)}` : "";
  const tasks = await api(`/api/tasks${param}`);
  const list = document.getElementById("tasks-list");

  if (!tasks.length) {
    list.innerHTML = "<p style='color:#999;padding:20px;font-size:14px'>No tasks yet.</p>";
  } else {
    list.innerHTML = tasks.map(t => {
      const acc = state.accounts.find(a => a.email === t.account);
      return `<div class="task-row">
        <div class="task-check"></div>
        <div class="task-account-dot" style="background:${acc?.color || "#999"}"></div>
        <div style="flex:1">${esc(t.task)}</div>
        <div class="task-due">${t.due_date || ""}</div>
      </div>`;
    }).join("");
  }

  showSheet("tasks-sheet");
}

// ── Bottom nav ─────────────────────────────────────────────────────────────
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const screen = btn.dataset.screen;
    if (screen === "tasks") openTasks();
    else if (screen === "settings") openSettings();
    else { hideSheet("tasks-sheet"); hideSheet("settings-sheet"); }
  });
});

// ── Tab bar ────────────────────────────────────────────────────────────────
document.getElementById("tab-bar").addEventListener("click", e => {
  const tab = e.target.closest(".tab");
  if (!tab) return;
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  tab.classList.add("active");
  state.activeTab = tab.dataset.tab;
  renderEmailList();
});

// ── Refresh button ─────────────────────────────────────────────────────────
document.getElementById("btn-refresh").addEventListener("click", async () => {
  // Clear cache on server by reloading
  await loadEmails();
});

// ── Settings button ────────────────────────────────────────────────────────
document.getElementById("btn-settings").addEventListener("click", openSettings);

// ── Close buttons ──────────────────────────────────────────────────────────
document.getElementById("detail-close").addEventListener("click", closeDetail);

// ── Sheet helpers ──────────────────────────────────────────────────────────
function showSheet(id) { document.getElementById(id).classList.remove("hidden"); }
function hideSheet(id) { document.getElementById(id).classList.add("hidden"); }

// Close sheet on backdrop click
document.querySelectorAll(".sheet").forEach(sheet => {
  sheet.addEventListener("click", e => {
    if (e.target === sheet) hideSheet(sheet.id);
  });
});

// ── Utility ────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function senderName(from) {
  const m = from.match(/^"?([^"<]+)"?\s*</);
  return m ? m[1].trim() : from.split("@")[0];
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (diff < 604800000) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  } catch { return dateStr; }
}

function removeEmailFromState(id) {
  state.emails = state.emails.filter(e => e.id !== id);
  renderEmailList();
}

let toastTimer;
function showToast(msg) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    Object.assign(toast.style, {
      position: "fixed", bottom: "calc(80px + env(safe-area-inset-bottom))",
      left: "50%", transform: "translateX(-50%)",
      background: "#333", color: "#fff",
      padding: "10px 20px", borderRadius: "20px",
      fontSize: "14px", zIndex: "999",
      transition: "opacity .3s",
    });
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.style.opacity = "0"), 2200);
}

// ── Start ──────────────────────────────────────────────────────────────────
boot();
