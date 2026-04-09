/* MailAI — iPhone web app frontend
 * All API calls go to the Flask server running on the same local network.
 */

const API = '';  // empty = same origin; set to 'http://<server-ip>:5000' if needed

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  screen: 'home',           // 'home' | 'tasks' | 'settings'
  tab: 'urgent',            // current category tab
  emails: [],               // cached inbox emails
  version: null,
  changelog: [],
};

// ── DOM refs ───────────────────────────────────────────────────────────────
const $content        = document.getElementById('content');
const $categoryTabs   = document.getElementById('category-tabs');
const $screenTitle    = document.getElementById('screen-title');
const $emailModal     = document.getElementById('email-modal');
const $emailDetail    = document.getElementById('email-detail-content');
const $changelogModal = document.getElementById('changelog-modal');
const $changelogContent = document.getElementById('changelog-content');
const $toast          = document.getElementById('toast');

// ── Utility ────────────────────────────────────────────────────────────────
function api(path, opts = {}) {
  return fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  }).then(r => {
    if (!r.ok && r.status === 401) {
      showToast('Not authenticated — visit /auth/login');
      throw new Error('unauthenticated');
    }
    return r.json();
  });
}

function showToast(msg, duration = 2500) {
  $toast.textContent = msg;
  $toast.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => $toast.classList.add('hidden'), duration);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtDatetime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function categoryBadge(cat) {
  const map = {
    urgent:         ['badge-urgent',  'Urgent'],
    reply_needed:   ['badge-reply',   'Reply'],
    newsletter:     ['badge-news',    'Newsletter'],
    junk:           ['badge-junk',    'Junk'],
    ticket:         ['badge-ticket',  'Ticket'],
    awaiting_reply: ['badge-waiting', 'Waiting'],
    scheduling:     ['badge-reply',   'Meeting'],
    fyi:            ['badge-junk',    'FYI'],
  };
  const [cls, label] = map[cat] || ['badge-junk', cat];
  return `<span class="badge ${cls}">${label}</span>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Navigation ─────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.screen = btn.dataset.screen;
    renderScreen();
  });
});

document.getElementById('refresh-btn').addEventListener('click', () => {
  loadInbox(true);
});

// ── Screens ────────────────────────────────────────────────────────────────
function renderScreen() {
  $categoryTabs.style.display = state.screen === 'home' ? 'flex' : 'none';
  switch (state.screen) {
    case 'home':     renderHomeScreen();     break;
    case 'tasks':    renderTasksScreen();    break;
    case 'settings': renderSettingsScreen(); break;
  }
}

// ── Home / Email list ──────────────────────────────────────────────────────
function renderHomeScreen() {
  $screenTitle.textContent = 'Inbox';
  if (state.emails.length === 0) {
    loadInbox();
  } else {
    renderEmailList();
  }
}

function loadInbox() {
  $content.innerHTML = '<div class="loading"></div>';
  api('/api/inbox').then(emails => {
    state.emails = emails;
    renderEmailList();
  }).catch(() => {
    $content.innerHTML = '<div class="empty">Could not load inbox. Is the server running?</div>';
  });
}

function renderEmailList() {
  if (state.tab === 'newsletter') { renderNewsletterScreen(); return; }
  if (state.tab === 'awaiting_reply') { renderWaitingScreen(); return; }

  const filtered = state.emails.filter(e => e.category === state.tab);
  if (filtered.length === 0) {
    $content.innerHTML = `<div class="empty">No ${state.tab.replace('_', ' ')} emails.</div>`;
    return;
  }

  $content.innerHTML = '<div class="email-list"></div>';
  const list = $content.querySelector('.email-list');

  filtered.forEach(email => {
    const card = document.createElement('div');
    card.className = 'email-card';
    card.innerHTML = `
      <div class="meta">
        <span class="sender">${escHtml(email.from || '')}</span>
        <span class="timestamp">${fmtDate(email.date)}</span>
      </div>
      <div class="subject">${escHtml(email.subject || '')}</div>
      <div class="snippet">${escHtml(email.summary || email.snippet || '')}</div>
      <div class="swipe-actions" id="actions-${email.id}">
        <button class="swipe-btn archive" data-id="${email.id}">Archive</button>
        <button class="swipe-btn delete"  data-id="${email.id}">Delete</button>
        <button class="swipe-btn snooze"  data-id="${email.id}">Snooze</button>
      </div>
    `;
    card.addEventListener('click', e => {
      if (e.target.classList.contains('swipe-btn')) return;
      openEmailDetail(email);
    });
    let pressTimer;
    card.addEventListener('touchstart', () => {
      pressTimer = setTimeout(() => {
        document.getElementById(`actions-${email.id}`)?.classList.toggle('visible');
      }, 400);
    }, { passive: true });
    card.addEventListener('touchend', () => clearTimeout(pressTimer), { passive: true });
    list.appendChild(card);
  });

  list.querySelectorAll('.swipe-btn.archive').forEach(btn => {
    btn.addEventListener('click', () => {
      api(`/api/email/${btn.dataset.id}/archive`, { method: 'POST' }).then(() => {
        state.emails = state.emails.filter(e => e.id !== btn.dataset.id);
        renderEmailList();
        showToast('Archived');
      });
    });
  });

  list.querySelectorAll('.swipe-btn.delete').forEach(btn => {
    btn.addEventListener('click', () => {
      api(`/api/email/${btn.dataset.id}/delete`, { method: 'POST' }).then(() => {
        state.emails = state.emails.filter(e => e.id !== btn.dataset.id);
        renderEmailList();
        showToast('Deleted');
      });
    });
  });

  list.querySelectorAll('.swipe-btn.snooze').forEach(btn => {
    btn.addEventListener('click', () => showToast('Snooze coming soon'));
  });
}

// ── Tab switching ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.tab = btn.dataset.tab;
    renderEmailList();
  });
});

// ── Email Detail ───────────────────────────────────────────────────────────
function openEmailDetail(email) {
  let html = `
    <h2 style="font-size:18px;font-weight:700;margin-bottom:6px;">${escHtml(email.subject || '')}</h2>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
      From: ${escHtml(email.from || '')} &nbsp;·&nbsp; ${fmtDate(email.date)}
      &nbsp;${categoryBadge(email.category)}
    </p>
  `;

  if (email.summary) {
    html += `
      <div class="detail-summary-card">
        <h3>AI Summary</h3>
        <p>${escHtml(email.summary)}</p>
      </div>
    `;
  }

  if (email.tasks && email.tasks.length > 0) {
    html += `<div class="task-list">`;
    email.tasks.forEach(t => {
      html += `
        <div class="task-item">
          <span>&#9744;</span>
          <div>
            <div>${escHtml(t.task)}</div>
            ${t.due_date ? `<div class="due">Due: ${t.due_date}</div>` : ''}
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  if (email.draft_reply) {
    html += `
      <div class="reply-card">
        <h3>Suggested Reply</h3>
        <div class="reply-text" id="reply-text" contenteditable="true">${escHtml(email.draft_reply)}</div>
        <div class="reply-actions">
          <button class="btn btn-primary"   id="send-reply-btn">Send</button>
          <button class="btn btn-danger"    id="discard-reply-btn">Discard</button>
        </div>
      </div>
    `;
  }

  if (email.appointment_proposal) {
    html += `
      <div class="reply-card">
        <h3>Appointment Proposal</h3>
        <div class="reply-text" id="appt-text" contenteditable="true">${escHtml(email.appointment_proposal)}</div>
        <div class="reply-actions">
          <button class="btn btn-primary" id="send-appt-btn">Send</button>
        </div>
      </div>
    `;
  }

  if (email.ticket_info) {
    const t = email.ticket_info;
    html += `
      <div class="detail-summary-card">
        <h3>&#127903; ${escHtml(t.type || 'Ticket')}</h3>
        <p>${escHtml(t.event || '')}${t.date ? ` · ${escHtml(t.date)}` : ''}${t.seat ? ` · Seat: ${escHtml(t.seat)}` : ''}</p>
        <button class="btn btn-wallet" id="add-to-wallet-btn" data-id="${email.id}" style="margin-top:12px;">
          &#128179; Add to Wallet
        </button>
      </div>
    `;
  }

  html += `
    <div class="detail-actions">
      <button class="btn btn-secondary" id="detail-archive-btn" data-id="${email.id}">Archive</button>
      <button class="btn btn-danger"    id="detail-delete-btn"  data-id="${email.id}">Delete</button>
    </div>
    <div class="correction-link" id="correct-btn" data-id="${email.id}" data-cat="${email.category}">
      Wrong category? Correct it
    </div>
  `;

  $emailDetail.innerHTML = html;
  $emailModal.classList.remove('hidden');

  // Archive / Delete
  document.getElementById('detail-archive-btn')?.addEventListener('click', () => {
    api(`/api/email/${email.id}/archive`, { method: 'POST' }).then(() => {
      state.emails = state.emails.filter(e => e.id !== email.id);
      $emailModal.classList.add('hidden');
      renderEmailList();
      showToast('Archived');
    });
  });

  document.getElementById('detail-delete-btn')?.addEventListener('click', () => {
    api(`/api/email/${email.id}/delete`, { method: 'POST' }).then(() => {
      state.emails = state.emails.filter(e => e.id !== email.id);
      $emailModal.classList.add('hidden');
      renderEmailList();
      showToast('Deleted');
    });
  });

  // Send reply
  document.getElementById('send-reply-btn')?.addEventListener('click', () => {
    const body = document.getElementById('reply-text')?.innerText || '';
    api(`/api/email/${email.id}/send-reply`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }).then(() => showToast('Reply sent!'));
  });

  document.getElementById('discard-reply-btn')?.addEventListener('click', () => {
    document.querySelector('.reply-card')?.remove();
  });

  // Send appointment proposal
  document.getElementById('send-appt-btn')?.addEventListener('click', () => {
    const body = document.getElementById('appt-text')?.innerText || '';
    api(`/api/email/${email.id}/send-reply`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }).then(() => showToast('Appointment proposal sent!'));
  });

  // Add to Wallet — triggers .pkpass download
  document.getElementById('add-to-wallet-btn')?.addEventListener('click', (e) => {
    const msgId = e.currentTarget.dataset.id;
    showToast('Generating pass…');
    fetch(`${API}/api/email/${msgId}/wallet`, { method: 'POST' })
      .then(r => {
        if (!r.ok) return r.json().then(j => { throw new Error(j.error || 'Failed'); });
        return r.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ticket-${msgId.slice(0, 8)}.pkpass`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Pass downloaded — open in Wallet');
      })
      .catch(err => showToast(`Wallet error: ${err.message}`));
  });

  // Category correction
  document.getElementById('correct-btn')?.addEventListener('click', () => {
    const cats = ['urgent','reply_needed','newsletter','junk','fyi','ticket','awaiting_reply','scheduling'];
    const current = email.category;
    const options = cats.filter(c => c !== current).join(' | ');
    const correct = prompt(`Current: ${current}\nCorrect category (${options}):`);
    if (correct && cats.includes(correct)) {
      api(`/api/email/${email.id}/correct`, {
        method: 'POST',
        body: JSON.stringify({ wrong: current, correct }),
      }).then(() => showToast(`Correction saved: ${correct}`));
    }
  });
}

document.getElementById('email-modal-back').addEventListener('click', () => {
  $emailModal.classList.add('hidden');
});

// ── Tasks Screen ───────────────────────────────────────────────────────────
function renderTasksScreen() {
  $screenTitle.textContent = 'Tasks';
  $content.innerHTML = '<div class="loading"></div>';
  api('/api/tasks').then(data => {
    $content.innerHTML = `<pre class="tasks-markdown">${escHtml(data.content)}</pre>`;
  });
}

// ── Settings Screen ────────────────────────────────────────────────────────
function renderSettingsScreen() {
  $screenTitle.textContent = 'Settings';

  const versionStr = state.version
    ? `v${state.version.version} · ${fmtDatetime(state.version.build_date)}`
    : 'Loading…';

  $content.innerHTML = `
    <div class="settings-section">
      <h3>About</h3>
      <div class="settings-row" id="version-row">
        <span class="label">Version</span>
        <span class="value version-badge" id="version-display">${escHtml(versionStr)}</span>
      </div>
      <div class="settings-row" id="changelog-row">
        <span class="label">What's New / Changelog</span>
        <span class="chevron">&#8250;</span>
      </div>
    </div>

    <div class="settings-section">
      <h3>Classification Rules</h3>
      <div id="rules-list"></div>
      <div class="add-rule-form" style="padding:12px 16px 14px;">
        <input type="text" id="new-rule-input" placeholder="e.g. Emails from my boss are urgent" />
        <button class="btn btn-primary" id="add-rule-btn" style="flex:0;padding:0 16px;height:44px;">Add</button>
      </div>
    </div>

    <div class="settings-section">
      <h3>Correction History</h3>
      <div id="corrections-list"><div class="loading"></div></div>
    </div>
  `;

  if (!state.version) {
    api('/api/version').then(v => {
      state.version = v;
      const display = document.getElementById('version-display');
      if (display) display.textContent = `v${v.version} · ${fmtDatetime(v.build_date)}`;
    });
  }

  document.getElementById('changelog-row').addEventListener('click', openChangelog);

  loadRules();

  document.getElementById('add-rule-btn').addEventListener('click', () => {
    const input = document.getElementById('new-rule-input');
    const text = input.value.trim();
    if (!text) return;
    api('/api/rules', { method: 'POST', body: JSON.stringify({ rule: text }) }).then(() => {
      input.value = '';
      loadRules();
      showToast('Rule added');
    });
  });

  api('/api/corrections').then(corrections => {
    const el = document.getElementById('corrections-list');
    if (!el) return;
    if (corrections.length === 0) {
      el.innerHTML = '<div style="padding:12px 16px;font-size:14px;color:var(--text-secondary);">No corrections yet.</div>';
      return;
    }
    el.innerHTML = corrections.slice(-10).reverse().map(c => `
      <div class="settings-row" style="flex-direction:column;align-items:flex-start;gap:4px;">
        <span style="font-size:13px;color:var(--text-secondary);">"${escHtml(c.snippet.slice(0,60))}…"</span>
        <span style="font-size:13px;">
          <span style="color:var(--danger);">${escHtml(c.wrong)}</span>
          &nbsp;→&nbsp;
          <span style="color:var(--success);">${escHtml(c.correct)}</span>
          &nbsp;·&nbsp;
          <span style="color:var(--text-secondary);">${fmtDatetime(c.timestamp)}</span>
        </span>
      </div>
    `).join('');
  });
}

function loadRules() {
  api('/api/rules').then(rules => {
    const el = document.getElementById('rules-list');
    if (!el) return;
    if (rules.length === 0) {
      el.innerHTML = '<div style="padding:12px 16px;font-size:14px;color:var(--text-secondary);">No rules yet.</div>';
      return;
    }
    el.innerHTML = rules.map((r, i) => `
      <div class="rule-item">
        <span class="rule-text">${escHtml(r.rule || JSON.stringify(r))}</span>
        <button class="rule-delete" data-index="${i}">&#10005;</button>
      </div>
    `).join('');
    el.querySelectorAll('.rule-delete').forEach(btn => {
      btn.addEventListener('click', () => {
        api(`/api/rules/${btn.dataset.index}`, { method: 'DELETE' }).then(() => {
          loadRules();
          showToast('Rule deleted');
        });
      });
    });
  });
}

// ── Changelog Modal ────────────────────────────────────────────────────────
function openChangelog() {
  const render = (changelog) => {
    $changelogContent.innerHTML = changelog.map(entry => `
      <div class="changelog-entry">
        <div class="cl-version">v${escHtml(entry.version)} — ${escHtml(entry.label || '')}</div>
        <div class="cl-date">${fmtDatetime(entry.date)}</div>
        <ul>
          ${entry.changes.map(c => `<li>${escHtml(c)}</li>`).join('')}
        </ul>
      </div>
    `).join('');
    $changelogModal.classList.remove('hidden');
  };

  if (state.changelog.length > 0) {
    render(state.changelog);
  } else {
    api('/api/changelog').then(cl => {
      state.changelog = cl;
      render(cl);
    });
  }
}

document.getElementById('changelog-modal-back').addEventListener('click', () => {
  $changelogModal.classList.add('hidden');
});

// ── Newsletter Screen ──────────────────────────────────────────────────────
function renderNewsletterScreen() {
  $content.innerHTML = '<div class="loading"></div>';
  api('/api/newsletters').then(emails => {
    if (emails.length === 0) {
      $content.innerHTML = '<div class="empty">No newsletters.</div>';
      return;
    }
    let html = '<div class="email-list">';
    emails.forEach(email => {
      html += `
        <div class="newsletter-item">
          <input type="checkbox" class="nl-check" data-id="${email.id}" />
          <div class="newsletter-info">
            <div class="sender">${escHtml(email.from || '')}</div>
            <div class="subject">${escHtml(email.subject || '')}</div>
          </div>
          <div class="newsletter-actions">
            <button class="btn-sm unsub"    data-id="${email.id}" data-unsub="${escHtml(email.list_unsubscribe || '')}">Unsub</button>
            <button class="btn-sm archive"  data-id="${email.id}">Archive</button>
          </div>
        </div>
      `;
    });
    html += `</div>
      <div class="bulk-bar">
        <button class="btn btn-danger" id="archive-all-btn">Archive All Selected</button>
      </div>`;
    $content.innerHTML = html;

    $content.querySelectorAll('.btn-sm.unsub').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!btn.dataset.unsub) return showToast('No unsubscribe link found');
        api(`/api/email/${btn.dataset.id}/unsubscribe`, { method: 'POST' }).then(r => {
          showToast(r.status || 'Unsubscribed');
        });
      });
    });

    $content.querySelectorAll('.btn-sm.archive').forEach(btn => {
      btn.addEventListener('click', () => {
        api(`/api/email/${btn.dataset.id}/archive`, { method: 'POST' }).then(() => {
          renderNewsletterScreen();
          showToast('Archived');
        });
      });
    });

    document.getElementById('archive-all-btn')?.addEventListener('click', () => {
      const checked = [...$content.querySelectorAll('.nl-check:checked')].map(c => c.dataset.id);
      if (checked.length === 0) return showToast('Select newsletters first');
      Promise.all(checked.map(id => api(`/api/email/${id}/archive`, { method: 'POST' }))).then(() => {
        renderNewsletterScreen();
        showToast(`Archived ${checked.length} newsletters`);
      });
    });
  });
}

// ── Waiting / Follow-up Screen ─────────────────────────────────────────────
function renderWaitingScreen() {
  $content.innerHTML = '<div class="loading"></div>';
  api('/api/waiting').then(waiting => {
    if (waiting.length === 0) {
      $content.innerHTML = '<div class="empty">No pending follow-ups.</div>';
      return;
    }
    let html = '';
    waiting.forEach(w => {
      const daysSent = Math.floor((Date.now() - new Date(w.sent_date)) / 86400000);
      html += `
        <div class="waiting-card">
          <div class="meta">
            <span class="sender">${escHtml(w.to || '')}</span>
            <span class="timestamp">${fmtDate(w.sent_date)}</span>
          </div>
          <div class="subject">${escHtml(w.subject || '')}</div>
          <div class="days ${w.overdue ? 'overdue' : ''}">
            ${daysSent}d since sent${w.overdue ? ' · OVERDUE' : ''}
          </div>
          <div class="waiting-card-actions">
            <button class="btn btn-primary  follow-up-btn" data-id="${w.id}">Follow Up</button>
            <button class="btn btn-secondary dismiss-btn"  data-id="${w.id}">Done</button>
          </div>
        </div>
      `;
    });
    $content.innerHTML = html;

    $content.querySelectorAll('.dismiss-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        api(`/api/waiting/${btn.dataset.id}/dismiss`, { method: 'POST' }).then(() => {
          renderWaitingScreen();
          showToast('Dismissed');
        });
      });
    });

    $content.querySelectorAll('.follow-up-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        api(`/api/waiting/${btn.dataset.id}/followup`, { method: 'POST' }).then(r => {
          alert(`Follow-up draft:\n\n${r.draft}`);
        });
      });
    });
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
(function init() {
  api('/api/version').then(v => { state.version = v; }).catch(() => {});
  renderScreen();
})();
