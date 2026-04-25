"use strict";

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  emails: [],
  category: "all",
  currentEmailId: null,
  previousView: "view-inbox",
};

// ── DOM refs ───────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const emailList   = $("email-list");
const detailContent = $("email-detail-content");
const loadingEl   = $("loading");
const toastEl     = $("toast");

// ── View switching ─────────────────────────────────────────────────────────
function showView(viewId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $(viewId).classList.add("active");

  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === viewId);
  });

  if (viewId === "view-tasks")   loadTasks();
  if (viewId === "view-waiting") loadWaiting();
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

// ── Detail navigation ──────────────────────────────────────────────────────
function openDetail(emailId) {
  state.previousView = document.querySelector(".view.active").id;
  state.currentEmailId = emailId;
  renderDetail(state.emails.find((e) => e.id === emailId));
  showView("view-detail");
}

$("btn-back").addEventListener("click", () => showView(state.previousView));

// ── Category tabs ──────────────────────────────────────────────────────────
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.category = tab.dataset.category;
    renderEmailList();
  });
});

// ── Refresh / process inbox ────────────────────────────────────────────────
$("btn-refresh").addEventListener("click", processInbox);

async function processInbox() {
  loadingEl.classList.remove("hidden");
  const maxResults = parseInt($("setting-max-results").value) || 30;
  try {
    const res = await api("POST", "/api/process", { max_results: maxResults });
    toast(`Processed ${res.processed} emails`);
    await fetchEmails();
  } catch (e) {
    toast("Error: " + e.message, true);
  } finally {
    loadingEl.classList.add("hidden");
  }
}

async function fetchEmails() {
  const data = await api("GET", "/api/emails");
  state.emails = Array.isArray(data) ? data : [];
  renderEmailList();
}

// ── Render email list ──────────────────────────────────────────────────────
function renderEmailList() {
  const emails =
    state.category === "all"
      ? state.emails
      : state.emails.filter((e) => e.category === state.category);

  if (emails.length === 0) {
    emailList.innerHTML = `<p class="empty-state">No emails in this category</p>`;
    return;
  }

  emailList.innerHTML = "";
  emails.forEach((email) => emailList.appendChild(buildCard(email)));
}

function buildCard(email) {
  const wrapper = document.createElement("div");
  wrapper.className = "card-wrapper";

  // Action buttons (revealed on swipe left)
  wrapper.innerHTML = `
    <div class="card-actions">
      <button class="card-action-btn archive" data-id="${email.id}">
        <span class="btn-icon">✓</span>Archive
      </button>
      <button class="card-action-btn delete" data-id="${email.id}">
        <span class="btn-icon">✕</span>Delete
      </button>
    </div>`;

  const card = document.createElement("div");
  card.className = "email-card";
  card.innerHTML = `
    <span class="category-badge badge-${email.category}">${labelName(email.category)}</span>
    <div class="card-row1">
      <span class="card-sender">${esc(senderName(email.from))}</span>
      <span class="card-time">${relativeTime(email.date)}</span>
    </div>
    <div class="card-subject">${esc(email.subject || "(no subject)")}</div>
    ${email.summary ? `<div class="card-summary">${esc(email.summary)}</div>` : `<div class="card-summary">${esc(email.snippet || "")}</div>`}
  `;

  card.addEventListener("click", () => openDetail(email.id));
  wrapper.appendChild(card);

  setupSwipe(wrapper, card, email.id);

  wrapper.querySelector(".archive").addEventListener("click", (e) => {
    e.stopPropagation();
    archiveEmail(email.id, wrapper);
  });
  wrapper.querySelector(".delete").addEventListener("click", (e) => {
    e.stopPropagation();
    deleteEmail(email.id, wrapper);
  });

  return wrapper;
}

// ── Swipe gesture ──────────────────────────────────────────────────────────
function setupSwipe(wrapper, card, emailId) {
  let startX = 0, startY = 0, currentX = 0, dragging = false, decided = false;
  const ACTION_WIDTH = 160; // 2 × 80px buttons
  const THRESHOLD = 60;

  card.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentX = 0;
    dragging = true;
    decided = false;
    card.style.transition = "none";
  }, { passive: true });

  card.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (!decided) {
      if (Math.abs(dy) > Math.abs(dx)) { dragging = false; return; }
      decided = true;
    }

    e.preventDefault();
    currentX = Math.min(0, Math.max(-ACTION_WIDTH, dx));
    card.style.transform = `translateX(${currentX}px)`;
  }, { passive: false });

  card.addEventListener("touchend", () => {
    if (!dragging) return;
    dragging = false;
    card.style.transition = "transform 0.2s ease";

    if (currentX < -THRESHOLD) {
      card.style.transform = `translateX(-${ACTION_WIDTH}px)`;
    } else {
      card.style.transform = "translateX(0)";
    }
  });
}

// ── Email actions ──────────────────────────────────────────────────────────
async function archiveEmail(id, wrapperEl) {
  try {
    await api("POST", `/api/email/${id}/archive`);
    wrapperEl?.remove();
    state.emails = state.emails.filter((e) => e.id !== id);
    toast("Archived");
    if ($("view-detail").classList.contains("active")) showView(state.previousView);
  } catch (e) {
    toast("Archive failed", true);
  }
}

async function deleteEmail(id, wrapperEl) {
  if (!confirm("Delete this email?")) return;
  try {
    await api("POST", `/api/email/${id}/delete`);
    wrapperEl?.remove();
    state.emails = state.emails.filter((e) => e.id !== id);
    toast("Deleted");
    if ($("view-detail").classList.contains("active")) showView(state.previousView);
  } catch (e) {
    toast("Delete failed", true);
  }
}

// ── Detail render ──────────────────────────────────────────────────────────
function renderDetail(email) {
  if (!email) { detailContent.innerHTML = "<p>Email not found.</p>"; return; }

  const tasksHtml = (email.tasks || []).length
    ? `<div class="ai-card">
        <h3>Tasks</h3>
        ${email.tasks.map((t) => `<div class="task-item">${esc(t.task)}${t.due_date ? ` <em>(${t.due_date})</em>` : ""}</div>`).join("")}
       </div>`
    : "";

  const draftHtml = email.draft_reply
    ? `<div class="ai-card">
        <h3>Suggested reply</h3>
        <textarea class="draft-textarea" id="reply-body">${esc(email.draft_reply)}</textarea>
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-send-reply">Send</button>
          <button class="btn btn-neutral" id="btn-discard-reply">Discard</button>
        </div>
       </div>`
    : "";

  const appointmentHtml = email.appointment_proposal
    ? `<div class="ai-card">
        <h3>Appointment proposal</h3>
        <textarea class="draft-textarea" id="reply-body">${esc(email.appointment_proposal)}</textarea>
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-send-reply">Send</button>
        </div>
       </div>`
    : "";

  const unsubHtml = email.category === "newsletter"
    ? `<div class="btn-row">
        <button class="btn btn-neutral" id="btn-unsubscribe">Unsubscribe</button>
       </div>`
    : "";

  const categories = ["urgent","reply_needed","newsletter","junk","fyi","ticket","awaiting_reply","scheduling"];
  const correctHtml = `
    <div class="correct-category">
      Wrong category?
      <select id="correct-select">
        <option value="">Change to…</option>
        ${categories.filter((c) => c !== email.category).map((c) => `<option value="${c}">${labelName(c)}</option>`).join("")}
      </select>
    </div>`;

  detailContent.innerHTML = `
    <div class="detail-meta">
      <div class="detail-subject">${esc(email.subject || "(no subject)")}</div>
      <div class="detail-from">${esc(email.from)}</div>
      <div class="detail-date">${email.date || ""}</div>
    </div>
    ${email.summary ? `<div class="ai-card"><h3>Summary</h3><p>${esc(email.summary)}</p></div>` : ""}
    ${tasksHtml}
    ${draftHtml}
    ${appointmentHtml}
    <div class="ai-card">
      <h3>Body</h3>
      <div class="body-text" style="white-space:pre-wrap;font-size:14px">${esc(email.body || email.snippet || "")}</div>
    </div>
    ${unsubHtml}
    <div class="btn-row">
      <button class="btn btn-neutral" id="btn-detail-archive">Archive</button>
      <button class="btn btn-danger"  id="btn-detail-delete">Delete</button>
    </div>
    ${correctHtml}
  `;

  $("btn-detail-archive").addEventListener("click", () => archiveEmail(email.id));
  $("btn-detail-delete").addEventListener("click", () => deleteEmail(email.id));

  const sendBtn = $("btn-send-reply");
  if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
      const body = $("reply-body").value;
      try {
        await api("POST", `/api/email/${email.id}/reply`, { body });
        toast("Reply sent");
        state.emails = state.emails.filter((e) => e.id !== email.id);
        showView(state.previousView);
      } catch (e) { toast("Send failed", true); }
    });
  }

  const discardBtn = $("btn-discard-reply");
  if (discardBtn) discardBtn.addEventListener("click", () => showView(state.previousView));

  const unsubBtn = $("btn-unsubscribe");
  if (unsubBtn) {
    unsubBtn.addEventListener("click", async () => {
      try {
        await api("POST", `/api/email/${email.id}/unsubscribe`);
        toast("Unsubscribed");
        state.emails = state.emails.filter((e) => e.id !== email.id);
        showView(state.previousView);
      } catch (e) { toast("Unsubscribe failed", true); }
    });
  }

  $("correct-select").addEventListener("change", async (e) => {
    const val = e.target.value;
    if (!val) return;
    try {
      await api("POST", `/api/email/${email.id}/correct`, { correct_label: val });
      email.category = val;
      toast(`Moved to ${labelName(val)}`);
      renderEmailList();
    } catch (err) { toast("Could not save correction", true); }
  });
}

// ── Tasks ──────────────────────────────────────────────────────────────────
async function loadTasks() {
  const data = await api("GET", "/api/tasks").catch(() => ({ tasks: [] }));
  const list = $("task-list");
  if (!data.tasks.length) {
    list.innerHTML = `<p class="empty-state">No tasks yet</p>`;
    return;
  }
  list.innerHTML = data.tasks
    .map((t) => `<div class="task-row">${esc(t)}</div>`)
    .join("");
}

// ── Waiting ────────────────────────────────────────────────────────────────
async function loadWaiting() {
  const data = await api("GET", "/api/waiting").catch(() => []);
  const list = $("waiting-list");
  const items = Array.isArray(data) ? data : [];
  if (!items.length) {
    list.innerHTML = `<p class="empty-state">No pending follow-ups</p>`;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  list.innerHTML = items
    .map((w) => {
      const overdue = w.follow_up_date && w.follow_up_date < today;
      return `
      <div class="waiting-card" data-id="${w.id}">
        <div class="waiting-subject">${esc(w.subject || "(no subject)")}</div>
        <div class="waiting-to">To: ${esc(w.to)}</div>
        <div class="waiting-due ${overdue ? "overdue" : ""}">
          Follow up: ${w.follow_up_date || "—"}${overdue ? " ⚠ overdue" : ""}
        </div>
        <div class="btn-row">
          <button class="btn btn-primary btn-followup" data-id="${w.id}">Follow up</button>
          <button class="btn btn-neutral btn-dismiss" data-id="${w.id}">Done</button>
        </div>
      </div>`;
    })
    .join("");

  list.querySelectorAll(".btn-followup").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api("POST", `/api/email/${btn.dataset.id}/followup`);
        toast("Follow-up sent");
        loadWaiting();
      } catch (e) { toast("Failed to send follow-up", true); }
    });
  });

  list.querySelectorAll(".btn-dismiss").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await api("POST", `/api/email/${btn.dataset.id}/dismiss-waiting`).catch(() => {});
      loadWaiting();
    });
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function senderName(from) {
  const m = from.match(/^([^<]+)</);
  return m ? m[1].trim() : from.replace(/<[^>]+>/, "").trim();
}

function relativeTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function labelName(cat) {
  return {
    urgent: "Urgent", reply_needed: "Reply", newsletter: "Newsletter",
    junk: "Junk", fyi: "FYI", ticket: "Ticket",
    awaiting_reply: "Waiting", scheduling: "Meeting",
  }[cat] || cat;
}

let toastTimer;
function toast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.style.background = isError ? "#c0392b" : "#333";
  toastEl.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add("hidden"), 2800);
}

// ── Init ───────────────────────────────────────────────────────────────────
fetchEmails();
