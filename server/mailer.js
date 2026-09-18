// Email delivery for MailWave.
// Uses real SMTP when SMTP_HOST is configured; otherwise transparently falls
// back to a throwaway Ethereal test inbox so sending is always testable.

import nodemailer from 'nodemailer';

let transportPromise = null;
let mode = 'unconfigured';

function buildFrom() {
  const name = process.env.MAIL_FROM_NAME || 'MailWave';
  const email = process.env.MAIL_FROM_EMAIL || process.env.SMTP_USER || 'no-reply@example.com';
  return `"${name}" <${email}>`;
}

async function createTransport() {
  const host = (process.env.SMTP_HOST || '').trim();

  // Fail fast on unreachable servers instead of hanging on a socket timeout.
  const timeouts = { connectionTimeout: 10000, greetingTimeout: 8000, socketTimeout: 15000 };

  if (host) {
    mode = 'smtp';
    return nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
      ...timeouts,
    });
  }

  // No SMTP configured -> spin up a dev preview account.
  try {
    const testAccount = await nodemailer.createTestAccount();
    mode = 'ethereal';
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
      ...timeouts,
    });
  } catch (err) {
    // Even the dev fallback needs network; if unreachable, use a JSON stub
    // transport so the UI still works end-to-end (nothing is actually sent).
    mode = 'stub';
    return nodemailer.createTransport({ jsonTransport: true });
  }
}

function getTransport() {
  if (!transportPromise) transportPromise = createTransport();
  return transportPromise;
}

export function deliveryMode() {
  return mode;
}

/**
 * Send an email.
 * @returns {Promise<{ok, mode, messageId, previewUrl}>}
 */
export async function sendMail({ to, subject, html, text, cc, bcc }) {
  const transport = await getTransport();
  const info = await transport.sendMail({
    from: buildFrom(),
    to,
    cc: cc || undefined,
    bcc: bcc || undefined,
    subject,
    text: text || undefined,
    html: html || undefined,
  });

  return {
    ok: true,
    mode,
    messageId: info.messageId,
    // Ethereal returns a browser-viewable preview URL for the sent message.
    previewUrl: nodemailer.getTestMessageUrl(info) || null,
  };
}

/** Verify the current transport can connect (for the Settings page). */
export async function verifyTransport() {
  const transport = await getTransport();
  if (typeof transport.verify !== 'function') return { ok: true, mode };
  try {
    await transport.verify();
    return { ok: true, mode };
  } catch (err) {
    return { ok: false, mode, error: err.message };
  }
}

/** Force the transport to be rebuilt (e.g. after config changes). */
export function resetTransport() {
  transportPromise = null;
  mode = 'unconfigured';
}
