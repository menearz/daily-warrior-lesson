'use strict';
/**
 * Sign-in email. AgentMail HTTP API, ported from arbiter-research
 * server/mail.js (sendViaAgentMail). Sender is configurable (DW_MAIL_FROM,
 * DW_AGENTMAIL_INBOX_ID). Tests and local runs pass a fake transport.
 * The result never carries the link or token.
 */

// Web Copy did not draft the sign-in email body; this short text is ours
// and is flagged for Web Copy review in the PR.
const TEXT = {
  en: {
    subject: 'Your Daily Warrior sign-in link',
    body: (url) => `Tap this link to sign in to Daily Warrior's Lesson:\n\n${url}\n\nIt works once and expires in 15 minutes. If you did not ask for it, ignore this email.`,
  },
  es: {
    subject: 'Tu enlace para entrar a Daily Warrior',
    body: (url) => `Toca este enlace para iniciar sesión en Daily Warrior's Lesson:\n\n${url}\n\nSirve una sola vez y vence en 15 minutos. Si no lo pediste, ignora este correo.`,
  },
};

function buildMagicLinkEmail({ url, lang }) {
  const t = lang === 'es' ? TEXT.es : TEXT.en;
  const text = t.body(url);
  const safe = String(url).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const html = `<p>${text.split('\n\n')[0]}</p><p><a href="${safe}">${safe}</a></p><p>${text.split('\n\n')[2]}</p>`;
  return { subject: t.subject, text, html };
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

module.exports = { buildMagicLinkEmail, agentMailTransport, fakeTransport };
