// MailWave front-end. Vanilla JS, no build step.
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// --- tiny API helper ---------------------------------------------------------
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
  setTimeout(() => (t.className = 'toast'), 3200);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- tab switching -----------------------------------------------------------
$$('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.remove('active'));
    $$('.panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    $(`#${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'history') loadHistory();
    if (tab.dataset.tab === 'settings') loadSettings();
    if (tab.dataset.tab === 'campaign') loadCampaignContacts();
  });
});

// --- settings / delivery badge ----------------------------------------------
const MODE_LABEL = { smtp: 'SMTP', ethereal: 'Preview', stub: 'Log only', unconfigured: '…' };

async function loadSettings() {
  const s = await api('/api/settings');
  $('#mode-badge').textContent = MODE_LABEL[s.deliveryMode] || s.deliveryMode;
  const t = s.transport || {};
  $('#settings-body').innerHTML = `
    <dl class="kv">
      <dt>Delivery mode</dt><dd><strong>${esc(MODE_LABEL[s.deliveryMode] || s.deliveryMode)}</strong></dd>
      <dt>SMTP configured</dt><dd>${s.smtpConfigured ? 'Yes' : 'No'}</dd>
      <dt>SMTP host</dt><dd>${esc(s.smtpHost || '—')}</dd>
      <dt>From name</dt><dd>${esc(s.fromName || '—')}</dd>
      <dt>From email</dt><dd>${esc(s.fromEmail || '—')}</dd>
      <dt>Connection</dt><dd>${t.ok
        ? '<span class="pill sent">OK</span>'
        : `<span class="pill failed">Error</span> <small>${esc(t.error || '')}</small>`}</dd>
    </dl>`;
}

// --- contacts ----------------------------------------------------------------
let contactsCache = [];

async function loadContacts() {
  contactsCache = await api('/api/contacts');
  const el = $('#contacts-list');
  if (!contactsCache.length) {
    el.innerHTML = '<div class="item-empty">No contacts yet. Add one above.</div>';
  } else {
    el.innerHTML = contactsCache.map((c) => `
      <div class="item">
        <div class="meta">
          <strong>${esc(c.name || '(no name)')}</strong>
          <small>${esc(c.email)}</small>
        </div>
        <div class="actions">
          <button class="btn danger small" data-del-contact="${c.id}">Delete</button>
        </div>
      </div>`).join('');
  }
  populateTemplateSelects();
}

$('#contact-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/contacts', { method: 'POST', body: { name: f.name.value, email: f.email.value } });
    f.reset();
    toast('Contact added', 'ok');
    loadContacts();
  } catch (err) { toast(err.message, 'err'); }
});

$('#contacts-list').addEventListener('click', async (e) => {
  const id = e.target.dataset.delContact;
  if (!id) return;
  if (!confirm('Delete this contact?')) return;
  try {
    await api(`/api/contacts/${id}`, { method: 'DELETE' });
    toast('Contact deleted', 'ok');
    loadContacts();
  } catch (err) { toast(err.message, 'err'); }
});

// --- templates ---------------------------------------------------------------
let templatesCache = [];

async function loadTemplates() {
  templatesCache = await api('/api/templates');
  const el = $('#templates-list');
  if (!templatesCache.length) {
    el.innerHTML = '<div class="item-empty">No templates yet.</div>';
  } else {
    el.innerHTML = templatesCache.map((t) => `
      <div class="item">
        <div class="meta">
          <strong>${esc(t.name)}</strong>
          <small>${esc(t.subject || 'No subject')}</small>
        </div>
        <div class="actions">
          <button class="btn ghost small" data-edit-template="${t.id}">Edit</button>
          <button class="btn danger small" data-del-template="${t.id}">Delete</button>
        </div>
      </div>`).join('');
  }
  populateTemplateSelects();
}

$('#template-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const body = { name: f.name.value, subject: f.subject.value, html: f.html.value };
  try {
    if (f.id.value) {
      await api(`/api/templates/${f.id.value}`, { method: 'PUT', body });
    } else {
      await api('/api/templates', { method: 'POST', body });
    }
    f.reset(); f.id.value = '';
    toast('Template saved', 'ok');
    loadTemplates();
  } catch (err) { toast(err.message, 'err'); }
});

$('#template-reset').addEventListener('click', () => {
  const f = $('#template-form'); f.reset(); f.id.value = '';
});

$('#templates-list').addEventListener('click', async (e) => {
  const editId = e.target.dataset.editTemplate;
  const delId = e.target.dataset.delTemplate;
  if (editId) {
    const t = templatesCache.find((x) => x.id === editId);
    const f = $('#template-form');
    f.id.value = t.id; f.name.value = t.name; f.subject.value = t.subject || ''; f.html.value = t.html || '';
    f.scrollIntoView({ behavior: 'smooth' });
  }
  if (delId) {
    if (!confirm('Delete this template?')) return;
    try { await api(`/api/templates/${delId}`, { method: 'DELETE' }); toast('Deleted', 'ok'); loadTemplates(); }
    catch (err) { toast(err.message, 'err'); }
  }
});

function populateTemplateSelects() {
  ['#compose-template', '#campaign-template'].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.innerHTML = '<option value="">—</option>' +
      templatesCache.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  });
}

function applyTemplate(templateId, subjectInput, htmlInput) {
  const t = templatesCache.find((x) => x.id === templateId);
  if (!t) return;
  if (subjectInput && t.subject) subjectInput.value = t.subject;
  if (htmlInput) htmlInput.value = t.html || '';
}

$('#compose-template').addEventListener('change', (e) => {
  const f = $('#compose-form');
  applyTemplate(e.target.value, f.subject, f.html);
});
$('#campaign-template').addEventListener('change', (e) => {
  const f = $('#campaign-form');
  applyTemplate(e.target.value, f.subject, f.html);
});

// --- compose (transactional) -------------------------------------------------
$('#compose-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const r = await api('/api/send', {
      method: 'POST',
      body: { to: f.to.value, subject: f.subject.value, html: f.html.value },
    });
    toast('Email sent ✓', 'ok');
    if (r.previewUrl) toast('Preview: opening in new tab', 'ok') || window.open(r.previewUrl, '_blank');
    f.reset();
  } catch (err) { toast(err.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Send email'; }
});

// --- campaign ----------------------------------------------------------------
function loadCampaignContacts() {
  const box = $('#campaign-contact-list');
  box.innerHTML = contactsCache.length
    ? contactsCache.map((c) => `
        <label><input type="checkbox" value="${c.id}" />
        ${esc(c.name || c.email)} <small>&lt;${esc(c.email)}&gt;</small></label>`).join('')
    : '<div class="item-empty">No contacts yet — add some in the Contacts tab.</div>';
}

$$('input[name="audience"]').forEach((r) =>
  r.addEventListener('change', (e) => {
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
    const r = await api('/api/campaigns/send', {
      method: 'POST',
      body: { subject: f.subject.value, html: f.html.value, contactIds },
    });
    toast(`Campaign done — ${r.sent} sent, ${r.failed} failed`, r.failed ? 'err' : 'ok');
    f.reset();
    $('#campaign-contact-list').classList.add('hidden');
  } catch (err) { toast(err.message, 'err'); }
  finally { btn.disabled = false; btn.textContent = 'Send campaign'; }
});

// --- history -----------------------------------------------------------------
async function loadHistory() {
  const rows = await api('/api/emails');
  const el = $('#history-list');
  if (!rows.length) { el.innerHTML = '<div class="item-empty">Nothing sent yet.</div>'; return; }
  el.innerHTML = rows.map((r) => {
    const when = new Date(r.createdAt).toLocaleString();
    const recips = Array.isArray(r.to) ? r.to.length : 1;
    const preview = (r.previewUrl)
      ? `<a class="preview-link" href="${esc(r.previewUrl)}" target="_blank">View preview →</a>` : '';
    const counts = r.type === 'campaign'
      ? `<small>${r.sent ?? 0}/${r.total ?? recips} delivered</small>` : '';
    return `
      <div class="item">
        <div class="meta">
          <strong>${esc(r.subject)}</strong>
          <small>${esc(when)} · ${recips} recipient${recips > 1 ? 's' : ''}</small>
          ${counts} ${preview}
        </div>
        <div class="actions">
          <span class="pill ${esc(r.type)}">${esc(r.type)}</span>
          <span class="pill ${esc(r.status)}">${esc(r.status)}</span>
        </div>
      </div>`;
  }).join('');
}
$('#refresh-history').addEventListener('click', loadHistory);

// --- boot --------------------------------------------------------------------
(async function init() {
  try {
    await Promise.all([loadContacts(), loadTemplates(), loadSettings()]);
  } catch (err) {
    toast('Could not reach the server', 'err');
  }
})();
