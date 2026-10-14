'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openStore } = require('../src/store');
const { loadConfig } = require('../src/config');
const { isEntitled } = require('../src/app');
const { runDeliveries, buildLessonEmail, localParts } = require('../src/delivery');
const { loadCatalog, defaultCatalogPath } = require('../src/personalize');
const { fakeTransport } = require('../src/mail');

const CATALOG = loadCatalog(defaultCatalogPath());
const ANSWERS = { admire: ['warrior'], avoid: ['conflict'], fail: ['patience'], alive: ['building'], hate: ['laziness'], season: 'stuck', owe: 'His word.', values: ['Courage', 'Loyalty', 'Mastery', 'Freedom', 'Integrity'], miracle: 'I would rise early.', exception: 'Once I did.', cost: 'Time.', emptychair: 'Get up and go.' };
// 2026-10-15 11:39 UTC = 06:39 in Chicago (CDT, UTC-5)
const T0 = Date.UTC(2026, 9, 15, 11, 39);
const MIN = 60e3;

function setup(users) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-deliv-'));
  const file = path.join(dir, 'store.json');
  const store = openStore(file);
  for (const u of users) Object.assign(store.upsertUser(u.email, T0), { plan: { status: 'active' }, answers: ANSWERS, deliveryTime: '06:40', timezone: 'America/Chicago' }, u);
  store.save();
  const config = loadConfig({ DW_STORE_PATH: file });
  return { dir, file, store, config };
}
const tick = (s, mail, now, extra = {}) => runDeliveries(Object.assign({ store: s.store, config: s.config, mail, getCatalog: () => CATALOG, entitled: (u) => isEntitled(u), now }, extra));

test('localParts follows the user zone (DST aware)', () => {
  assert.deepEqual(localParts(T0, 'America/Chicago'), { date: '2026-10-15', time: '06:39' });
  assert.deepEqual(localParts(Date.UTC(2026, 11, 15, 12, 40), 'America/Chicago'), { date: '2026-12-15', time: '06:40' });
});

test('sends at the delivery time in the user zone, once per day', async () => {
  const s = setup([{ email: 'a@example.com' }, { email: 'tokyo@example.com', timezone: 'Asia/Tokyo', deliveryTime: '21:00' }]);
  const mail = fakeTransport();
  assert.deepEqual((await tick(s, mail, T0)).sent, [], 'one minute early');
  assert.deepEqual((await tick(s, mail, T0 + MIN)).sent, ['a@example.com']); // 06:40 Chicago, 20:40 Tokyo
  assert.deepEqual((await tick(s, mail, T0 + 2 * MIN)).sent, []);
  assert.deepEqual((await tick(s, mail, T0 + 21 * MIN)).sent, ['tokyo@example.com']);
  assert.deepEqual((await tick(s, mail, T0 + 3 * 3600e3)).sent, []);
  assert.equal(mail.outbox.length, 2);
  const m = mail.outbox[0];
  assert.equal(m.to, 'a@example.com'); assert.match(m.subject, /^Today's lesson: /);
  assert.match(m.text, /Get up and go\./); assert.doesNotMatch(m.text + m.html, /arbiter/i);
  // next local day sends again, a different lesson, history grows
  assert.deepEqual((await tick(s, mail, T0 + 24 * 3600e3 + MIN)).sent, ['a@example.com']);
  const u = s.store.user('a@example.com');
  assert.equal(u.sentLessons.length, 2); assert.notEqual(u.sentLessons[0].lessonDate, u.sentLessons[1].lessonDate);
});

test('survives a restart with no double-send (reloaded store, and a crash mid-send)', async () => {
  const s = setup([{ email: 'a@example.com' }]);
  const mail = fakeTransport();
  await tick(s, mail, T0 + MIN);
  const reopened = Object.assign({}, s, { store: openStore(s.file) });
  assert.deepEqual((await tick(reopened, mail, T0 + 5 * MIN)).sent, []);
  assert.equal(mail.outbox.length, 1);
  // crash mid-send: row was reserved on disk as 'sending' before the mail call
  const s2 = setup([{ email: 'b@example.com' }]);
  const dying = { name: 'fake', configured: true, send: async () => { const disk = JSON.parse(fs.readFileSync(s2.file, 'utf8')); assert.equal(disk.deliveries['b@example.com|2026-10-15'].status, 'sending'); throw Object.assign(new Error('process killed'), { crash: true }); } };
  await tick(s2, dying, T0 + MIN).catch(() => {});
  const afterCrash = JSON.parse(fs.readFileSync(s2.file, 'utf8'));
  afterCrash.deliveries['b@example.com|2026-10-15'] = { status: 'sending', attempts: 1, at: T0 + MIN }; // as if the process died before marking
  fs.writeFileSync(s2.file, JSON.stringify(afterCrash));
  const m2 = fakeTransport();
  assert.deepEqual((await tick(Object.assign({}, s2, { store: openStore(s2.file) }), m2, T0 + 10 * MIN)).sent, []);
  assert.equal(m2.outbox.length, 0);
});

test('failures are logged and retried up to 3 times the same day', async () => {
  const s = setup([{ email: 'a@example.com' }]);
  const logs = []; let calls = 0;
  const flaky = { name: 'agentmail', configured: true, send: async () => { calls++; return calls < 3 ? { ok: false, error: 'agentmail_http_503' } : { ok: true, messageId: 'm1' }; } };
  for (let i = 1; i <= 5; i++) await tick(s, flaky, T0 + i * MIN, { log: (l) => logs.push(l) });
  assert.equal(calls, 3);
  assert.equal(logs.length, 2); assert.match(logs[0], /attempt 1\/3.*agentmail_http_503/); assert.doesNotMatch(logs.join(''), /@/, 'no email address in logs');
  assert.equal(s.store.data.deliveries['a@example.com|2026-10-15'].status, 'sent');
  const s2 = setup([{ email: 'b@example.com' }]); let n = 0;
  const down = { name: 'agentmail', configured: true, send: async () => { n++; return { ok: false, error: 'agentmail_http_500' }; } };
  for (let i = 1; i <= 6; i++) await tick(s2, down, T0 + i * MIN);
  assert.equal(n, 3); assert.equal(s2.store.data.deliveries['b@example.com|2026-10-15'].status, 'failed');
});

test('only entitled subscribers with answers, time and zone get mail', async () => {
  const s = setup([
    { email: 'paid@example.com' },
    { email: 'free@example.com', plan: { status: 'none' } },
    { email: 'canceled@example.com', plan: { status: 'canceled' } },
    { email: 'noanswers@example.com', answers: null },
    { email: 'notime@example.com', deliveryTime: null },
  ]);
  const mail = fakeTransport();
  assert.deepEqual((await tick(s, mail, T0 + MIN)).sent, ['paid@example.com']);
});

test('Spanish subscriber gets a Spanish email; sender config is Daily Warrior, never Arbiter', () => {
  const cfg = loadConfig({});
  assert.deepEqual(cfg.lessonMail, { inboxId: 'dailywarrior@agentmail.to', fromName: 'Daily Warrior' });
  const L = { lang: 'es', title: 'T', quote: 'Q', source: 'S', sourceUrl: 'https://example.org/x', lesson: 'L', today: 'H', personalized: { reminder: { label: 'R', words: 'W' } } };
  const m = buildLessonEmail(L, 'https://menearz.github.io/daily-warrior-lesson');
  assert.match(m.subject, /^La lección de hoy/); assert.match(m.text, /account\.html/);
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(src, /lessonMail\.inboxId/);
});
