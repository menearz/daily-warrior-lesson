'use strict';
/**
 * Sign-in email. AgentMail HTTP API, ported from arbiter-research
 * server/mail.js (sendViaAgentMail). Sender is configurable (DW_MAIL_FROM,
 * DW_AGENTMAIL_INBOX_ID). Tests and local runs pass a fake transport.
 * The result never carries the link or token.
 */

// Sign-in email copy: Web Copy gap file 2026-10-13, section 2 (verbatim).
const TEXT = {
  en: {
    subject: 'Your Daily Warrior sign-in link',
    preview: 'Tap to sign in. The link works once, for 15 minutes.',
    paras: (url) => [
      "Tap the link below to sign in to Daily Warrior's Lesson.",
      url,
      'The link works one time and stops working after 15 minutes. If it has expired, go back to the sign-in page and ask for a new one.',
      "If you didn't ask for this, you can ignore this email. No one can sign in without this link.",
    ],
  },
  es: {
    subject: 'Tu enlace para entrar a Daily Warrior',
    preview: 'Toca para entrar. El enlace sirve una vez, durante 15 minutos.',
    paras: (url) => [
      'Toca el enlace de abajo para entrar a la Lección del Guerrero Diario.',
      url,
      'El enlace sirve una sola vez y deja de funcionar después de 15 minutos. Si ya venció, vuelve a la página de inicio de sesión y pide uno nuevo.',
      'Si no pediste esto, puedes ignorar este correo. Nadie puede entrar sin este enlace.',
    ],
  },
};

function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function render(subject, preview, paras, linkUrl) {
  const text = paras.join('\n\n');
  const html = `<div style="display:none">${esc(preview)}</div>` + paras.map((p) => p === linkUrl
    ? `<p><a href="${esc(p)}">${esc(p)}</a></p>` : `<p>${esc(p)}</p>`).join('');
  return { subject, preview, text, html };
}

function buildMagicLinkEmail({ url, lang }) {
  const t = lang === 'es' ? TEXT.es : TEXT.en;
  return render(t.subject, t.preview, t.paras(url), url);
}

// Yearly renewal reminder (7 days before): gap file section 3 (verbatim).
// The support line needs DW_SUPPORT_EMAIL (pending Zachary's pick); without it
// this refuses to build, so no placeholder address can ever be mailed.
// Not wired to a job yet (gap file Flag 4).
const RENEWAL = {
  en: (d) => ({
    subject: `Your Daily Warrior year renews on ${d.renewal_date}`,
    preview: '$39.99 for another year of The Forge. Cancel anytime before then.',
    paras: [
      'This is a heads-up so nothing surprises you.',
      `Your yearly Forge plan renews on ${d.renewal_date}. On that day we'll charge $39.99 to the card you have on file, and you'll get another year of lessons aimed at your lanes.`,
      "You don't need to do anything to keep it.",
      `If you'd rather stop, go to your Account page before ${d.renewal_date} and choose "Manage plan". You'll keep The Forge until the end of the year you already paid for, and you won't be charged again.`,
      d.account_url,
      `Questions? Write to ${d.support}.`,
    ],
  }),
  es: (d) => ({
    subject: `Tu año de Daily Warrior se renueva el ${d.renewal_date}`,
    preview: 'US$39.99 por otro año de La Forja. Puedes cancelar antes de esa fecha.',
    paras: [
      'Te avisamos para que nada te tome por sorpresa.',
      `Tu plan anual de La Forja se renueva el ${d.renewal_date}. Ese día cobraremos US$39.99 a la tarjeta que tienes registrada, y tendrás otro año de lecciones dirigidas a tus caminos.`,
      'No tienes que hacer nada para mantenerlo.',
      `Si prefieres dejarlo, ve a la página de tu Cuenta antes del ${d.renewal_date} y elige "Administrar plan". Sigues teniendo La Forja hasta que termine el año que ya pagaste, y no se te cobra de nuevo.`,
      d.account_url,
      `¿Preguntas? Escríbenos a ${d.support}.`,
    ],
  }),
};

function buildRenewalReminderEmail({ lang, renewalDate, accountUrl, supportEmail }) {
  if (!supportEmail) throw new Error('renewal reminder needs DW_SUPPORT_EMAIL (pending)');
  const m = (lang === 'es' ? RENEWAL.es : RENEWAL.en)({ renewal_date: renewalDate, account_url: accountUrl, support: supportEmail });
  return render(m.subject, m.preview, m.paras, accountUrl);
}

function agentMailTransport(mailCfg, fetchFn = globalThis.fetch) {
  return {
    name: 'agentmail',
    configured: Boolean(mailCfg.apiKey && mailCfg.inboxId),
    async send({ to, subject, text, html }) {
      if (!this.configured) return { ok: false, skipped: true };
      const url = mailCfg.apiUrl || `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(mailCfg.inboxId)}/messages/send`;
      const payload = { to: [to], subject, text, html };
      if (mailCfg.from) payload.from = mailCfg.from;
      const res = await fetchFn(url, { method: 'POST', headers: { Authorization: `Bearer ${mailCfg.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) return { ok: false, error: `agentmail_http_${res.status}` };
      let messageId; try { const b = await res.json(); messageId = b.message_id || b.messageId; } catch (_) {}
      return { ok: true, transport: 'agentmail', messageId };
    },
  };
}

/** In-memory transport for tests and local e2e. Keeps every message. */
function fakeTransport() {
  const outbox = [];
  return { name: 'fake', configured: true, outbox, async send(m) { outbox.push(m); return { ok: true, transport: 'fake' }; } };
}

module.exports = { buildMagicLinkEmail, buildRenewalReminderEmail, agentMailTransport, fakeTransport };
