'use strict';
/**
 * Daily Warrior store: one JSON file (DW_STORE_PATH), atomic writes
 * (temp file + rename, mode 0600), ported from arbiter-research store.js.
 * Separate from Arbiter's store. Holds only:
 *   users[email] = { email, lang, forgedPath, reads, plan, stripeCustomerId,
 *                    stripeSubscriptionId, createdAt, deleteDataAfter,
 *                    answers, answersAt, themes, deliveryTime, timezone, sentLessons }
 * plus operational rows: magicLinks / refreshTokens / accessTokens / sessions
 * (SHA-256 hashes only, pruned when expired) and processed Stripe event ids.
 */
const fs = require('fs');
const path = require('path');

const VERSION = 1;
function empty() {
  return { version: VERSION, users: {}, magicLinks: {}, refreshTokens: {}, accessTokens: {}, sessions: {}, stripeEvents: {} };
}

function atomicWriteJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

function openStore(filePath) {
  let data = empty();
  if (fs.existsSync(filePath)) {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (raw.trim()) {
      const parsed = JSON.parse(raw); // a corrupt store must stop the boot, not be overwritten
      data = Object.assign(empty(), parsed);
    }
  }
  return {
    filePath,
    data,
    save() { atomicWriteJson(filePath, data); },
    user(email) { return data.users[normEmail(email)] || null; },
    upsertUser(email, now = Date.now()) {
      const key = normEmail(email);
      if (!data.users[key]) {
        data.users[key] = { email: key, lang: 'en', forgedPath: null, reads: [], plan: { status: 'none', interval: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, canceledAt: null }, stripeCustomerId: null, stripeSubscriptionId: null, createdAt: now, deleteDataAfter: null, answers: null, answersAt: null, themes: [], deliveryTime: null, timezone: null, sentLessons: [] };
      }
      return data.users[key];
    },
    userByCustomer(customerId) {
      if (!customerId) return null;
      return Object.values(data.users).find((u) => u.stripeCustomerId === customerId) || null;
    },
    deleteUser(email) { delete data.users[normEmail(email)]; for (const k of ['refreshTokens', 'accessTokens', 'sessions', 'magicLinks']) for (const [id, r] of Object.entries(data[k])) if (r.email === normEmail(email)) delete data[k][id]; },
  };
}

function normEmail(e) { return String(e || '').trim().toLowerCase(); }

module.exports = { openStore, atomicWriteJson, normEmail, empty };
