'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const DWAccount = require('../account-client.js');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
function mem(init = {}) { const m = Object.assign({}, init); return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m }; }
function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init }); const { status, data } = await handler(url, init, calls.length); return { status, json: async () => data }; };
  fn.calls = calls; return fn;
}

test('verify stores bearer + refresh tokens and caches entitlement', async () => {
  const s = mem();
  const f = fakeFetch(async () => ({ status: 200, data: { accessToken: 'a1', refreshToken: 'r1', expiresIn: 900, me: { entitled: true } } }));
  const dw = DWAccount.create({ storage: s, fetch: f, apiBase: 'https://api.test' });
  await dw.verify('t'.repeat(43));
  assert.equal(JSON.parse(s._m.dw_auth).refreshToken, 'r1');
  assert.equal(DWAccount.isEntitledCached(s), true);
  assert.equal(f.calls[0].init.credentials, 'include');
});

test('a 401 triggers one refresh with rotation, then the call is retried', async () => {
  const s = mem({ dw_auth: JSON.stringify({ accessToken: 'old', refreshToken: 'r1', exp: Date.now() + 600e3 }) });
  const f = fakeFetch(async (url, init) => {
    if (url.endsWith('/auth/refresh')) return { status: 200, data: { accessToken: 'new', refreshToken: 'r2', expiresIn: 900 } };
    return init.headers.Authorization === 'Bearer new' ? { status: 200, data: { email: 'a@b.co', entitled: false } } : { status: 401, data: {} };
  });
  const dw = DWAccount.create({ storage: s, fetch: f, apiBase: 'https://api.test' });
  const r = await dw.me();
  assert.equal(r.status, 200);
  assert.equal(JSON.parse(s._m.dw_auth).refreshToken, 'r2');
  assert.equal(JSON.parse(f.calls[1].init.body).refreshToken, 'r1');
});

test('sync uploads local forged_path + reads and merges the account copy back', async () => {
  const local = { primary: 'builder', secondary: 'odyssey', at: 10 };
  const s = mem({ dw_auth: JSON.stringify({ accessToken: 'a', refreshToken: 'r', exp: Date.now() + 600e3 }), forged_path: JSON.stringify(local), dw_reads: JSON.stringify(['2026-10-01']) });
  const f = fakeFetch(async (url, init) => ({ status: 200, data: { entitled: true, forgedPath: { primary: 'faith', secondary: 'power', at: 20 }, reads: ['2026-10-01', '2026-10-05'] } }));
  const dw = DWAccount.create({ storage: s, fetch: f, apiBase: 'https://api.test' });
  await dw.sync();
  const sent = JSON.parse(f.calls[0].init.body);
  assert.deepEqual(sent.forgedPath, local); assert.deepEqual(sent.reads, ['2026-10-01']);
  assert.equal(JSON.parse(s._m.forged_path).primary, 'faith');
  assert.deepEqual(JSON.parse(s._m.dw_reads), ['2026-10-01', '2026-10-05']);
});

test('without a plan, sync keeps the phone copy untouched and the 70/30 gate stays closed', async () => {
  const s = mem({ dw_auth: JSON.stringify({ accessToken: 'a', refreshToken: 'r', exp: Date.now() + 600e3 }), forged_path: JSON.stringify({ primary: 'power', at: 5 }) });
  const f = fakeFetch(async () => ({ status: 402, data: { error: 'plan_required' } }));
  const dw = DWAccount.create({ storage: s, fetch: f, apiBase: 'https://api.test' });
  const r = await dw.sync();
  assert.equal(r.status, 402);
  assert.equal(JSON.parse(s._m.forged_path).primary, 'power');
  assert.equal(DWAccount.isEntitledCached(s), false);
  s.setItem('dw_entitlement', JSON.stringify({ entitled: true, at: Date.now() - 4 * 864e5 }));
  assert.equal(DWAccount.isEntitledCached(s), false, 'stale cache expires after 3 days');
});

test('recordRead keeps unique, sorted dates', () => {
  const s = mem();
  DWAccount.recordRead(s, '2026-10-13'); DWAccount.recordRead(s, '2026-10-01'); DWAccount.recordRead(s, '2026-10-13'); DWAccount.recordRead(s, 'junk');
  assert.deepEqual(JSON.parse(s._m.dw_reads), ['2026-10-01', '2026-10-13']);
});

test('every string key exists in English and Spanish; Web Copy wording is used verbatim', () => {
  const { en, es } = DWAccount.STRINGS;
  assert.deepEqual(Object.keys(en).sort(), Object.keys(es).sort());
  for (const k of Object.keys(en)) assert.ok(en[k] && es[k], k);
  assert.equal(en.sendLink, 'Send my sign-in link'); assert.equal(es.sendLink, 'Enviarme el enlace');
  assert.equal(en.monthly, 'Monthly: $4.99 a month.'); assert.equal(es.yearly, 'Anual: US$39.99 al año.');
  assert.equal(en.deleteBtn, 'Delete my account and answers');
  for (const page of ['signin.html', 'plans.html', 'account.html']) {
    const html = read(page);
    for (const m of html.matchAll(/data-k="(\w+)"/g)) assert.ok(en[m[1]], `${page} uses unknown key ${m[1]}`);
    assert.match(html, /<script src="config.js"><\/script>/);
  }
});

test('index aims from the account path and records the read on the API; sign-in strips the token from the URL', () => {
  const index = read('index.html');
  assert.match(index, /me\.forgedPath/);
  assert.match(index, /DW\.recordHistory\(result\.lesson\.date\)/);
  assert.match(index, /id="dw-gate"/);
  assert.match(index, /<template id="dw-app">/);
  assert.match(read('signin.html'), /history\.replaceState\(null, "", location\.pathname\)/);
  assert.match(read('config.js'), /https:\/\/dw-api\.arbiterresearch\.net/);
  const sw = read('sw.js');
  assert.match(sw, /url\.origin !== self\.location\.origin && req\.destination !== "image"\) return;/, 'service worker never caches API calls');
  assert.match(sw, /isPerUserApi/);
  assert.match(sw, /warrior-lesson-v24/);
});

test('privacy.html describes accounts, the data kept, Stripe, and the 30-day delete in EN and ES', () => {
  const p = read('privacy.html');
  assert.doesNotMatch(p, /We do not create user accounts/);
  for (const s of ['emailed link', 'Stripe', '30 days', 'Delete my account and answers', 'AgentMail', 'Eliminar mi cuenta y mis respuestas', '30 días']) assert.ok(p.includes(s), s);
  assert.doesNotMatch(p, /\{[A-Z_]+\}/, 'no unfilled placeholders');
});

test('refund/seller block hidden until /legal is complete; no placeholders', () => {
  const DWA = require('../account-client.js');
  assert.strictEqual(DWA.legalBlock('en', { pending: true }), null);
  assert.strictEqual(DWA.legalBlock('en', { pending: false, sellerName: 'S', supportEmail: '', refundPolicy: 'webcopy-2026-10-13' }), null);
  const b = DWA.legalBlock('es', { pending: false, sellerName: 'Seller LLC', supportEmail: 'h@e.test', refundPolicy: 'webcopy-2026-10-13' });
  assert.strictEqual(b.title, 'Reembolsos y cancelación');
  assert.strictEqual(b.seller, 'Daily Warrior es un producto de Seller LLC.');
  assert.ok(![b.title, b.prices, b.seller].concat(b.items).some((x) => /[{}]/.test(x)));
});

test('aimed line uses Spanish lane labels in ES', () => {
  const WL = require('../lesson.js');
  assert.match(WL.formatAimed('es', 'Warrior / Thinker'), /Guerrero \/ Pensador/);
  assert.match(WL.formatAimed('en', 'Warrior / Thinker'), /Warrior \/ Thinker/);
});
