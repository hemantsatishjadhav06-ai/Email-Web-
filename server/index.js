// MailWave — email system server.
// An original, self-contained email app inspired by the Notifuse feature set
// (contacts, templates, campaigns, transactional sending, delivery tracking).
// Written from scratch; no third-party product code is used.

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { contacts, templates, emails } from './db.js';
import { sendMail, verifyTransport, deliveryMode } from './mailer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// --- small helpers ----------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = (v) => typeof v === 'string' && EMAIL_RE.test(v.trim());
const asyncH = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

// Fill {{name}} / {{email}} style placeholders from a contact record.
function renderTemplate(str, vars) {
  if (!str) return str;
  return str.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    vars[key] != null ? String(vars[key]) : ''
  );
}

// --- health & settings -------------------------------------------------------
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'MailWave' }));

// Fast: returns configuration without touching the network, so the UI paints instantly.
app.get('/api/settings', (_req, res) => {
  const live = deliveryMode();
  // Before the transport is built lazily, report the mode implied by config.
  const mode = live !== 'unconfigured' ? live : ((process.env.SMTP_HOST || '').trim() ? 'smtp' : 'ethereal');
  res.json({
    deliveryMode: mode,
    smtpConfigured: Boolean((process.env.SMTP_HOST || '').trim()),
    smtpHost: process.env.SMTP_HOST || null,
    fromName: process.env.MAIL_FROM_NAME || 'MailWave',
    fromEmail: process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER || null,
  });
});

// Slow: actually opens a connection to verify the transport (can take seconds).
app.get('/api/settings/verify', asyncH(async (_req, res) => res.json(await verifyTransport())));

// --- contacts ----------------------------------------------------------------
app.get('/api/contacts', asyncH(async (_req, res) => res.json(await contacts.list())));

app.post('/api/contacts', asyncH(async (req, res) => {
  const { email, name } = req.body || {};
  if (!isEmail(email)) return res.status(400).json({ error: 'A valid email is required' });
  const existing = (await contacts.list()).find(
    (c) => c.email.toLowerCase() === email.trim().toLowerCase()
  );
  if (existing) return res.status(409).json({ error: 'Contact already exists' });
  const row = await contacts.insert({ email: email.trim(), name: (name || '').trim() });
  res.status(201).json(row);
}));

app.put('/api/contacts/:id', asyncH(async (req, res) => {
  const { email, name } = req.body || {};
  if (email != null && !isEmail(email)) return res.status(400).json({ error: 'Invalid email' });
  const patch = {};
  if (email != null) patch.email = email.trim();
  if (name != null) patch.name = name.trim();
  const row = await contacts.update(req.params.id, patch);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
}));

app.delete('/api/contacts/:id', asyncH(async (req, res) => {
  const ok = await contacts.remove(req.params.id);
  res.status(ok ? 204 : 404).end();
}));

// --- templates ---------------------------------------------------------------
app.get('/api/templates', asyncH(async (_req, res) => res.json(await templates.list())));

app.post('/api/templates', asyncH(async (req, res) => {
  const { name, subject, html } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Template name is required' });
  const row = await templates.insert({
    name: name.trim(),
    subject: (subject || '').trim(),
    html: html || '',
  });
  res.status(201).json(row);
}));

app.put('/api/templates/:id', asyncH(async (req, res) => {
  const { name, subject, html } = req.body || {};
  const patch = {};
  if (name != null) patch.name = name.trim();
  if (subject != null) patch.subject = subject.trim();
  if (html != null) patch.html = html;
  const row = await templates.update(req.params.id, patch);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
}));

app.delete('/api/templates/:id', asyncH(async (req, res) => {
  const ok = await templates.remove(req.params.id);
  res.status(ok ? 204 : 404).end();
}));

// --- dashboard stats ---------------------------------------------------------
app.get('/api/stats', asyncH(async (_req, res) => {
  const [allContacts, allTemplates, allEmails] = await Promise.all([
    contacts.list(), templates.list(), emails.list(),
  ]);

  // Count individual recipient deliveries across every send.
  let delivered = 0;
  let attempted = 0;
  for (const e of allEmails) {
    if (e.type === 'campaign') {
      delivered += e.sent || 0;
      attempted += e.total || (Array.isArray(e.to) ? e.to.length : 0);
    } else {
      attempted += 1;
      if (e.status === 'sent') delivered += 1;
    }
  }

  // Build a 7-day time series of messages sent (by day).
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, label: d.toLocaleDateString('en-US', { weekday: 'short' }), count: 0 });
  }
  const byDay = Object.fromEntries(days.map((d) => [d.date, d]));
  for (const e of allEmails) {
    const key = (e.createdAt || '').slice(0, 10);
    if (byDay[key]) byDay[key].count += e.type === 'campaign' ? (e.sent || 0) : 1;
  }

  res.json({
    contacts: allContacts.length,
    templates: allTemplates.length,
    sends: allEmails.length,
    delivered,
    attempted,
    deliveryRate: attempted ? Math.round((delivered / attempted) * 100) : 0,
    series: days,
    recent: allEmails.slice(0, 6),
  });
}));

// --- sending: transactional (single) & campaign (many) -----------------------
app.get('/api/emails', asyncH(async (_req, res) => res.json(await emails.list())));

// Send to one recipient (transactional).
app.post('/api/send', asyncH(async (req, res) => {
  const { to, subject, html, text } = req.body || {};
  if (!isEmail(to)) return res.status(400).json({ error: 'A valid recipient email is required' });
  if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required' });

  const record = await emails.insert({
    type: 'transactional',
    to: [to.trim()],
    subject: subject.trim(),
    status: 'sending',
  });

  try {
    const result = await sendMail({ to: to.trim(), subject: subject.trim(), html, text });
    const updated = await emails.update(record.id, {
      status: 'sent',
      deliveryMode: result.mode,
      messageId: result.messageId,
      previewUrl: result.previewUrl,
    });
    res.status(201).json(updated);
  } catch (err) {
    await emails.update(record.id, { status: 'failed', error: err.message });
    res.status(502).json({ error: `Send failed: ${err.message}` });
  }
}));

// Send a campaign to many recipients (all contacts, or a chosen subset).
app.post('/api/campaigns/send', asyncH(async (req, res) => {
  const { subject, html, text, contactIds } = req.body || {};
  if (!subject || !subject.trim()) return res.status(400).json({ error: 'Subject is required' });

  const all = await contacts.list();
  const recipients = Array.isArray(contactIds) && contactIds.length
    ? all.filter((c) => contactIds.includes(c.id))
    : all;
  if (recipients.length === 0) return res.status(400).json({ error: 'No recipients selected' });

  const record = await emails.insert({
    type: 'campaign',
    to: recipients.map((c) => c.email),
    subject: subject.trim(),
    status: 'sending',
    total: recipients.length,
    sent: 0,
    failed: 0,
  });

  const results = [];
  for (const c of recipients) {
    const vars = { name: c.name || '', email: c.email };
    try {
      const r = await sendMail({
        to: c.email,
        subject: renderTemplate(subject.trim(), vars),
        html: renderTemplate(html || '', vars),
        text: renderTemplate(text || '', vars),
      });
      results.push({ email: c.email, ok: true, previewUrl: r.previewUrl });
    } catch (err) {
      results.push({ email: c.email, ok: false, error: err.message });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;
  const updated = await emails.update(record.id, {
    status: failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial',
    sent,
    failed,
    deliveryMode: deliveryMode(),
    results,
  });
  res.status(201).json(updated);
}));

app.listen(PORT, () => {
  console.log(`MailWave running at http://localhost:${PORT}  (delivery: ${deliveryMode()})`);
});
