'use strict';
/**
 * Scheduled lesson email. Each tick (server.js runs it every minute and once
 * at boot) looks at every entitled subscriber who has answers, a delivery
 * time and a timezone. Once their local clock reaches the delivery time, they
 * get that day's personalized lesson, once per local day.
 *
 * No double-sends across restarts: a row in store.data.deliveries
 * (`email|YYYY-MM-DD`) is written and saved BEFORE the mail call. If the
 * process dies mid-send the row stays 'sending' and is never retried
 * (at most once). A send that the mailer reports as failed is marked
 * 'failed', logged, and retried on later ticks that same day, up to
 * MAX_ATTEMPTS. Sender: dailywarrior@agentmail.to as "Daily Warrior".
 */
const { lessonForDay } = require('./personalize');

const MAX_ATTEMPTS = 3;
const SENDER_NAME = 'Daily Warrior';
const SENDER_ADDRESS = 'dailywarrior@agentmail.to';

function localParts(ms, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
  const g = (t) => parts.find((x) => x.type === t).value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour')}:${g('minute')}` };
}

const COPY = {
  en: { subject: (t) => `Today's lesson: ${t}`, today: 'Today', source: 'Source', manage: 'Change your themes, language or delivery time:', why: 'Picked for you from your Forge answers.' },
  es: { subject: (t) => `La lección de hoy: ${t}`, today: 'Hoy', source: 'Fuente', manage: 'Cambia tus temas, idioma u hora de entrega:', why: 'Elegida para ti según tus respuestas de La Forja.' },
};
function esc(v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function buildLessonEmail(lesson, siteUrl) {
  const c = COPY[lesson.lang === 'es' ? 'es' : 'en'];
  const manage = `${siteUrl}/account.html`;
  const rem = lesson.personalized && lesson.personalized.reminder;
  const lines = [lesson.title, '', `"${lesson.quote}"`, `${c.source}: ${lesson.source}${lesson.sourceUrl ? ` (${lesson.sourceUrl})` : ''}`, '', lesson.lesson, '', `${c.today}: ${lesson.today}`];
  if (rem) lines.push('', `${rem.label} "${rem.words}"`);
  lines.push('', c.why, `${c.manage} ${manage}`);
  const html = `<h1>${esc(lesson.title)}</h1><blockquote>${esc(lesson.quote)}</blockquote>`
    + `<p>${esc(c.source)}: ${lesson.sourceUrl ? `<a href="${esc(lesson.sourceUrl)}">${esc(lesson.source)}</a>` : esc(lesson.source)}</p>`
    + `<p>${esc(lesson.lesson)}</p><p><b>${esc(c.today)}:</b> ${esc(lesson.today)}</p>`
    + (rem ? `<p><i>${esc(rem.label)} "${esc(rem.words)}"</i></p>` : '')
    + `<p>${esc(c.why)} <a href="${esc(manage)}">${esc(c.manage)}</a></p>`;
  return { subject: c.subject(lesson.title), text: lines.join('\n'), html };
}

/** One scheduler tick. Returns { sent, failed, skipped } email lists. */
async function runDeliveries({ store, config, mail, getCatalog, entitled, now = Date.now(), log = () => {} }) {
  store.data.deliveries = store.data.deliveries || {};
  const out = { sent: [], failed: [], skipped: [] };
  for (const u of Object.values(store.data.users)) {
    if (!entitled(u) || !u.answers || !u.deliveryTime || !u.timezone) continue;
    let local;
    try { local = localParts(now, u.timezone); } catch (_) { continue; }
    if (local.time < u.deliveryTime) continue;
    const key = `${u.email}|${local.date}`;
    const row = store.data.deliveries[key];
    if (row && (row.status === 'sent' || row.status === 'sending' || row.attempts >= MAX_ATTEMPTS)) continue;
    const attempts = (row ? row.attempts : 0) + 1;
    store.data.deliveries[key] = { status: 'sending', attempts, at: now };
    store.save(); // reserved on disk before the send: a restart can never send it twice
    let res;
    try {
      const { lesson } = lessonForDay(getCatalog(), u, local.date, now);
      store.save();
      res = await mail.send(Object.assign({ to: u.email }, buildLessonEmail(lesson, config.siteUrl)));
      if (res && res.ok) {
        store.data.deliveries[key] = { status: 'sent', attempts, at: now, lessonDate: lesson.lessonDate, messageId: res.messageId || null };
        out.sent.push(u.email);
      } else throw new Error((res && (res.error || (res.skipped && 'mail_unconfigured'))) || 'send_failed');
    } catch (err) {
      store.data.deliveries[key] = { status: 'failed', attempts, at: now, error: String(err.message || err).slice(0, 200) };
      out.failed.push(u.email);
      log(`lesson email failed (attempt ${attempts}/${MAX_ATTEMPTS}) for one subscriber: ${store.data.deliveries[key].error}`);
    }
    store.save();
  }
  for (const [k, r] of Object.entries(store.data.deliveries)) if (Number(r.at) + 40 * 864e5 <= now) delete store.data.deliveries[k];
  store.save();
  return out;
}

module.exports = { runDeliveries, buildLessonEmail, localParts, MAX_ATTEMPTS, SENDER_NAME, SENDER_ADDRESS };
