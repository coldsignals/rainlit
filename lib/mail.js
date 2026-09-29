'use strict';

// Email: password resets, and confirming that an email address is really yours. Sent through
// Resend (resend.com): set RESEND_API_KEY and MAIL_FROM ("Rainlit <noreply@yourdomain>", on a
// domain you've verified with Resend), and MAIL_REPLY_TO for where replies go. A server without
// them sends no email, and its admin makes reset links by hand instead (Admin > Accounts).
//
// (MAIL_OUTBOX, for trying things out: emails are written to that file, one per line, instead of
// being sent.)

const fs = require('fs');

const KEY = String(process.env.RESEND_API_KEY || '').trim();
const FROM = String(process.env.MAIL_FROM || '').trim();
const REPLY_TO = String(process.env.MAIL_REPLY_TO || '').trim();
const OUTBOX = String(process.env.MAIL_OUTBOX || '').trim();
const enabled = Boolean((KEY && FROM) || OUTBOX);

async function send({ to, subject, text, html }) {
  if (!enabled) throw new Error('Email is not set up.');
  const email = { from: FROM || 'Rainlit <noreply@localhost>', to: [to], subject, text, html, ...(REPLY_TO ? { reply_to: REPLY_TO } : {}) };
  if (OUTBOX) {
    fs.appendFileSync(OUTBOX, JSON.stringify({ ...email, at: Date.now() }) + '\n');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(email),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Resend said ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
}

// Sends without waiting, and only notes it in the logs if it didn't go (someone asking for a
// reset shouldn't learn from how long it takes whether an account exists).
function sendLater(email, what) {
  send(email).catch((err) => console.error(`[mail] couldn't send ${what}: ${err.message}`));
}

// ---------- The emails ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Plain, and readable anywhere: a few lines of words and one button (and the link spelled out,
// for email apps that don't show buttons).
function letter({ to, subject, lines, button, url, after = [] }) {
  const text = [...lines, '', `${button}: ${url}`, '', ...after, '', '-- Rainlit'].join('\n');
  const para = (s) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#2b2233">${esc(s)}</p>`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f1ea">
<div style="max-width:520px;margin:0 auto;padding:32px 20px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<p style="margin:0 0 20px;font-size:22px;font-weight:800;letter-spacing:-0.02em"><span style="color:#5d6b86">rain</span><span style="color:#d9962a">lit</span></p>
<div style="background:#ffffff;border-radius:14px;padding:26px 24px">
${lines.map(para).join('\n')}
<p style="margin:22px 0"><a href="${esc(url)}" style="display:inline-block;padding:12px 20px;background:#f5b94a;color:#22190a;border-radius:10px;font-weight:700;font-size:16px;text-decoration:none">${esc(button)}</a></p>
${after.map(para).join('\n')}
<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#6c6475">If the button doesn't work, copy this link into your browser:<br><a href="${esc(url)}" style="color:#6c6475;word-break:break-all">${esc(url)}</a></p>
</div>
</div></body></html>`;
  return { to, subject, text, html };
}

function resetEmail(user, url) {
  return letter({
    to: user.email,
    subject: 'Reset your Rainlit password',
    lines: [`Hi ${user.display_name},`, `Someone (hopefully you) asked to reset the password for your Rainlit account, @${user.username}. This link works once, for the next hour.`],
    button: 'Choose a new password',
    url,
    after: ["If it wasn't you, you can ignore this email: your password stays the same."],
  });
}

function confirmEmail(user, email, url) {
  return letter({
    to: email,
    subject: 'Confirm your email for Rainlit',
    lines: [`Hi ${user.display_name},`, `Confirm that this is your email address, so it can help you get back into your Rainlit account, @${user.username}, if you ever forget your password. The link works for 3 days.`],
    button: 'Confirm my email',
    url,
    after: ["If you didn't make a Rainlit account, you can ignore this email."],
  });
}

// To the old address, when it's changed: in case it wasn't them.
function changedEmail(user, oldEmail, newEmail, url) {
  const [name, domain] = newEmail.split('@');
  const hidden = `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
  return letter({
    to: oldEmail,
    subject: 'Your Rainlit email was changed',
    lines: [`Hi ${user.display_name},`, `The email address for your Rainlit account, @${user.username}, was just changed to ${hidden}.`],
    button: 'Open Rainlit',
    url,
    after: ["If that was you, there's nothing to do. If it wasn't, reply to this email straight away."],
  });
}

// Off the waitlist: an invite.
function waitlistEmail(email, code, url) {
  return letter({
    to: email,
    subject: "There's room for you on Rainlit",
    lines: ["You're off the waitlist! Here's your invite to Rainlit.", `Your invite code is ${code}. It works once.`],
    button: 'Make your account',
    url,
    after: ["If you didn't ask to join Rainlit, you can ignore this email."],
  });
}

module.exports = { enabled, send, sendLater, resetEmail, confirmEmail, changedEmail, waitlistEmail };
