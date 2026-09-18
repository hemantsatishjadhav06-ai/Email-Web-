// MailWave front-end — vanilla JS, no build step.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = 'toast'), 3400);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = (name, email) => (name || email || '?').trim().slice(0, 2).toUpperCase();
const fmtDate = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// small inline icons
const ICON = {
  campaign: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m3 11 18-5v12L3 14v-3Z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
  transactional: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>',
  contacts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
  sends: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  delivered: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>',
  rate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
};

// ---------------- nav (hash-routed, deep-linkable) ----------------
const TABS = ['dashboard', 'compose', 'campaign', 'contacts', 'templates', 'history', 'settings'];
function renderTab(name) {
  if (!TABS.includes(name)) name = 'dashboard';
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.page').forEach((p) => p.classList.toggle('active', p.id === name));
  if (name === 'dashboard') loadDashboard();
  if (name === 'history') loadHistory();
  if (name === 'settings') loadSettings();
  if (name === 'campaign') loadCampaignContacts();
}
function switchTab(name) {
  if (location.hash.slice(1) === name) renderTab(name);
  else location.hash = name; // triggers hashchange -> renderTab
}
window.addEventListener('hashchange', () => renderTab(location.hash.slice(1)));
$$('.nav-item').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
$$('[data-goto]').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.goto)));

// ---------------- settings / delivery ----------------
const MODE_LABEL = { smtp: 'SMTP', ethereal: 'Preview', stub: 'Log only', unconfigured: 'Loading' };

async function loadSettings() {
  const s = await api('/api/settings');
  paintModeChip(s.deliveryMode);
  $('#settings-body').innerHTML = `
    <dl class="kv">
      <dt>Delivery mode</dt><dd><span class="tag ${s.deliveryMode === 'smtp' ? 'purple' : s.deliveryMode === 'ethereal' ? 'amber' : 'slate'}">${esc(MODE_LABEL[s.deliveryMode] || s.deliveryMode)}</span></dd>
      <dt>SMTP configured</dt><dd>${s.smtpConfigured ? 'Yes' : 'No'}</dd>
      <dt>SMTP host</dt><dd>${esc(s.smtpHost || '—')}</dd>
      <dt>From name</dt><dd>${esc(s.fromName || '—')}</dd>
      <dt>From email</dt><dd>${esc(s.fromEmail || '—')}</dd>
      <dt>Connection</dt><dd id="conn-status"><span class="muted">Checking…</span></dd>
    </dl>`;
  // Verify the connection separately so the panel never blocks on a slow SMTP check.
  api('/api/settings/verify').then((t) => {
    const el = $('#conn-status');
    if (el) el.innerHTML = t.ok
      ? '<span class="pill sent">Connected</span>'
      : `<span class="pill failed">Not connected</span> <span class="muted">${esc(t.error || '')}</span>`;
  }).catch(() => {});
}

function paintModeChip(mode) {
  $('#mode-badge').textContent = MODE_LABEL[mode] || mode;
  $('#mode-dot').className = `dot ${mode}`;
}

// ---------------- dashboard ----------------
async function loadDashboard() {
  const s = await api('/api/stats');
  paintModeChip((await api('/api/settings')).deliveryMode);

  $('#stat-grid').innerHTML = [
    { ic: 'contacts', label: 'Contacts', val: s.contacts, sub: 'in your audience' },
    { ic: 'sends', label: 'Messages', val: s.sends, sub: 'total sends' },
    { ic: 'delivered', label: 'Delivered', val: s.delivered, sub: `of ${s.attempted} attempted` },
    { ic: 'rate', label: 'Delivery rate', val: s.deliveryRate + '%', sub: 'success rate' },
  ].map((c) => `
    <div class="stat">
      <div class="s-top"><span class="s-ico">${ICON[c.ic]}</span>${esc(c.label)}</div>
      <div class="s-val">${esc(String(c.val))}</div>
      <div class="s-sub">${esc(c.sub)}</div>
    </div>`).join('');

  const max = Math.max(1, ...s.series.map((d) => d.count));
  $('#chart').innerHTML = s.series.map((d) => {
    const h = d.count === 0 ? 4 : Math.round((d.count / max) * 168) + 6;
    return `<div class="bar-wrap">
        <div class="bar ${d.count === 0 ? 'zero' : ''}" style="height:${h}px" data-v="${d.count}"></div>
        <span class="b-label">${esc(d.label)}</span>
      </div>`;
  }).join('');

  $('#recent').innerHTML = s.recent.length
    ? s.recent.map((r) => {
        const n = Array.isArray(r.to) ? r.to.length : 1;
        return `<div class="r-row">
          <span class="r-ico ${esc(r.type)}">${ICON[r.type] || ICON.transactional}</span>
          <div class="r-meta"><strong>${esc(r.subject)}</strong><small>${esc(fmtDate(r.createdAt))} · ${n} recipient${n > 1 ? 's' : ''}</small></div>
          <span class="pill ${esc(r.status)}">${esc(r.status)}</span>
        </div>`;
      }).join('')
    : '<div class="empty">No activity yet. Send your first email.</div>';
}

// ---------------- contacts ----------------
let contactsCache = [];
async function loadContacts() {
  contactsCache = await api('/api/contacts');
  const rows = contactsCache.length
    ? contactsCache.map((c) => `
        <tr>
          <td><span class="avatar">${esc(initials(c.name, c.email))}</span><span class="t-name">${esc(c.name || '—')}</span></td>
          <td>${esc(c.email)}</td>
          <td class="t-actions"><button class="btn link danger" data-del-contact="${c.id}">Delete</button></td>
        </tr>`).join('')
    : '<tr class="t-empty"><td colspan="3">No contacts yet. Add one above.</td></tr>';
  $('#contacts-tbl').innerHTML =
    `<thead><tr><th>Name</th><th>Email</th><th></th></tr></thead><tbody>${rows}</tbody>`;
  populateTemplateSelects();
}

$('#contact-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/contacts', { method: 'POST', body: { name: f.name.value, email: f.email.value } });
    f.reset(); toast('Contact added', 'ok'); loadContacts();
  } catch (err) { toast(err.message, 'err'); }
});
$('#contacts-tbl').addEventListener('click', async (e) => {
  const id = e.target.dataset.delContact;
  if (!id || !confirm('Delete this contact?')) return;
  try { await api(`/api/contacts/${id}`, { method: 'DELETE' }); toast('Contact deleted', 'ok'); loadContacts(); }
  catch (err) { toast(err.message, 'err'); }
});

// ---------------- templates ----------------
let templatesCache = [];
async function loadTemplates() {
  templatesCache = await api('/api/templates');
  const rows = templatesCache.length
    ? templatesCache.map((t) => `
        <tr>
          <td class="t-name">${esc(t.name)}</td>
          <td>${esc(t.subject || '—')}</td>
          <td class="t-actions">
            <button class="btn link" data-edit-template="${t.id}">Edit</button>
            <button class="btn link danger" data-del-template="${t.id}">Delete</button>
          </td>
        </tr>`).join('')
    : '<tr class="t-empty"><td colspan="3">No templates yet.</td></tr>';
  $('#templates-tbl').innerHTML =
    `<thead><tr><th>Name</th><th>Subject</th><th></th></tr></thead><tbody>${rows}</tbody>`;
  populateTemplateSelects();
}

$('#template-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = { name: f.name.value, subject: f.subject.value, html: f.html.value };
  try {
    if (f.id.value) await api(`/api/templates/${f.id.value}`, { method: 'PUT', body });
    else await api('/api/templates', { method: 'POST', body });
    f.reset(); f.id.value = ''; toast('Template saved', 'ok'); loadTemplates();
  } catch (err) { toast(err.message, 'err'); }
});
$('#template-reset').addEventListener('click', () => { const f = $('#template-form'); f.reset(); f.id.value = ''; });
$('#templates-tbl').addEventListener('click', async (e) => {
  const editId = e.target.dataset.editTemplate;
  const delId = e.target.dataset.delTemplate;
  if (editId) {
    const t = templatesCache.find((x) => x.id === editId);
    const f = $('#template-form');
    f.id.value = t.id; f.name.value = t.name; f.subject.value = t.subject || ''; f.html.value = t.html || '';
    f.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  if (delId) {
    if (!confirm('Delete this template?')) return;
    try { await api(`/api/templates/${delId}`, { method: 'DELETE' }); toast('Deleted', 'ok'); loadTemplates(); }
    catch (err) { toast(err.message, 'err'); }
  }
});

function populateTemplateSelects() {
  ['#compose-template', '#campaign-template'].forEach((sel) => {
    const el = $(sel); if (!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="">None</option>' +
      templatesCache.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    el.value = cur;
  });
}
function applyTemplate(id, subjEl, htmlEl) {
  const t = templatesCache.find((x) => x.id === id); if (!t) return;
  if (subjEl && t.subject) subjEl.value = t.subject;
  if (htmlEl) htmlEl.value = t.html || '';
}
$('#compose-template').addEventListener('change', (e) => { const f = $('#compose-form'); applyTemplate(e.target.value, f.subject, f.html); });
$('#campaign-template').addEventListener('change', (e) => { const f = $('#campaign-form'); applyTemplate(e.target.value, f.subject, f.html); });

// ---------------- compose ----------------
$('#compose-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const r = await api('/api/send', { method: 'POST', body: { to: f.to.value, subject: f.subject.value, html: f.html.value } });
    toast('Email sent', 'ok');
    if (r.previewUrl) window.open(r.previewUrl, '_blank');
    f.reset();
  } catch (err) { toast(err.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Send email'; }
});

// ---------------- campaign ----------------
function loadCampaignContacts() {
  $('#campaign-contact-list').innerHTML = contactsCache.length
    ? contactsCache.map((c) => `<label><input type="checkbox" value="${c.id}" /> ${esc(c.name || c.email)} <small>&lt;${esc(c.email)}&gt;</small></label>`).join('')
    : '<div class="empty">No contacts yet — add some in the Contacts tab.</div>';
}
$$('input[name="audience"]').forEach((r) => r.addEventListener('change', (e) => {
  $('#campaign-contact-list').classList.toggle('hidden', e.target.value !== 'select');
}));
$('#campaign-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const audience = f.querySelector('input[name="audience"]:checked').value;
  let contactIds = null;
  if (audience === 'select') {
    contactIds = $$('#campaign-contact-list input:checked').map((c) => c.value);
    if (!contactIds.length) return toast('Select at least one contact', 'err');
  }
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const r = await api('/api/campaigns/send', { method: 'POST', body: { subject: f.subject.value, html: f.html.value, contactIds } });
    toast(`Campaign done — ${r.sent} sent, ${r.failed} failed`, r.failed ? 'err' : 'ok');
    f.reset(); $('#campaign-contact-list').classList.add('hidden');
  } catch (err) { toast(err.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Send campaign'; }
});

// ---------------- history / logs ----------------
async function loadHistory() {
  const rows = await api('/api/emails');
  const body = rows.length
    ? rows.map((r) => {
        const n = Array.isArray(r.to) ? r.to.length : 1;
        const preview = r.previewUrl ? `<a class="btn link" href="${esc(r.previewUrl)}" target="_blank">Preview</a>` : '';
        const counts = r.type === 'campaign' ? `<span class="muted">${r.sent ?? 0}/${r.total ?? n} delivered</span>` : '';
        return `<tr>
          <td class="t-name">${esc(r.subject)}</td>
          <td><span class="type-tag ${esc(r.type)}">${esc(r.type)}</span></td>
          <td>${n} ${counts}</td>
          <td>${esc(fmtDate(r.createdAt))}</td>
          <td><span class="pill ${esc(r.status)}">${esc(r.status)}</span></td>
          <td class="t-actions">${preview}</td>
        </tr>`;
      }).join('')
    : '<tr class="t-empty"><td colspan="6">Nothing sent yet.</td></tr>';
  $('#history-tbl').innerHTML =
    `<thead><tr><th>Subject</th><th>Type</th><th>Recipients</th><th>Sent at</th><th>Status</th><th></th></tr></thead><tbody>${body}</tbody>`;
}
$('#refresh-history').addEventListener('click', loadHistory);

// ---------------- boot ----------------
(async function init() {
  try {
    await Promise.all([loadContacts(), loadTemplates()]);
    renderTab(location.hash.slice(1) || 'dashboard');
  } catch (err) {
    toast('Could not reach the server', 'err');
  }
})();
