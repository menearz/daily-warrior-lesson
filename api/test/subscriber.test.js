'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { start, evt } = require('./helpers');
const { loadConfig } = require('../src/config');
const { runRetention } = require('../src/app');
const { QUESTIONS, validateAnswers } = require('../src/questionnaire');
const { buildPersonalLesson, loadCatalog, defaultCatalogPath, FOCUS } = require('../src/personalize');
const { aiTells } = require('../../scripts/humanize');

const CATALOG = loadCatalog(defaultCatalogPath()); // the real published lessons, read only
const ANSWERS = {
  admire: ['warrior', 'thinker', 'faith'], avoid: ['hardconv', 'conflict'], fail: ['discipline', 'promises'],
  alive: ['building', 'tested'], hate: ['laziness'], season: 'stuck',
  owe: 'A good man owes his family his best hours, not his leftovers.', values: ['Discipline', 'Family', 'Courage', 'Faith', 'Honor'],
  miracle: 'I would get up early and train before work.', exception: 'Last spring I kept a 30 day training streak.',
  cost: 'It is costing me my health and my patience with my kids.', emptychair: 'Stop waiting to feel ready. Do the work today.',
};
const LOCAL = { DW_SITE_URL: 'http://127.0.0.1:5500', DW_TEST_OVERRIDE_EMAILS: 'owner@example.com' };
const DAY = 864e5;

test('questionnaire spec matches forge.html QUESTIONS (keys, types, values)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'forge.html'), 'utf8');
  const src = html.match(/const QUESTIONS = (\[[\s\S]*?\n\]);/)[1];
  const site = Function(`return ${src}`)();
  assert.equal(site.length, 12);
  assert.deepEqual(site.map((q) => q.key), QUESTIONS.map((q) => q.key));
  for (const [i, q] of site.entries()) {
    assert.equal(q.type, QUESTIONS[i].type);
    if (q.choices) assert.deepEqual(q.choices.map((c) => c.v), QUESTIONS[i].values);
    if (q.items) assert.deepEqual(q.items, QUESTIONS[i].values);
  }
});

test('validateAnswers: all 12 required, choices checked, unknown keys refused', () => {
  assert.ok(validateAnswers(ANSWERS).answers);
  assert.equal(validateAnswers({ ...ANSWERS, season: 'nope' }).error, 'bad_answer_season');
  assert.equal(validateAnswers({ ...ANSWERS, admire: ['warrior', 'thinker', 'builder', 'faith'] }).error, 'bad_answer_admire');
  assert.equal(validateAnswers({ ...ANSWERS, values: ['Courage'] }).error, 'bad_answer_values');
  const { emptychair, ...eleven } = ANSWERS;
  assert.equal(validateAnswers(eleven).error, 'bad_answer_emptychair');
  assert.equal(validateAnswers({ ...ANSWERS, extra: 'x' }).error, 'unknown_answer_extra');
});

test('override is off by default and refuses to start outside loopback or with launch on', () => {
  assert.deepEqual(loadConfig({}).testOverrideEmails, []);
  assert.throws(() => loadConfig({ DW_TEST_OVERRIDE_EMAILS: 'owner@example.com' }), /loopback/);
  assert.throws(() => loadConfig({ DW_TEST_OVERRIDE_EMAILS: 'a@b.co', DW_SITE_URL: 'https://menearz.github.io/daily-warrior-lesson' }), /loopback/);
  assert.throws(() => loadConfig({ ...LOCAL, DW_LAUNCH: '1', DW_SELLER_NAME: 'x', DW_SUPPORT_EMAIL: 's@x.co', DW_REFUND_POLICY: 'webcopy-2026-10-13' }), /loopback|DW_LAUNCH/);
  assert.deepEqual(loadConfig(LOCAL).testOverrideEmails, ['owner@example.com']);
});

test('free user: shared lesson only, questionnaire/answers/lesson are 402', async () => {
  const t = await start({ env: { DW_PAYWALL_ENABLED: '1' } });
  try {
    const { accessToken } = await t.signIn('free@example.com');
    assert.equal((await t.call('GET', '/questionnaire', { token: accessToken })).status, 402);
    assert.equal((await t.call('PUT', '/me/answers', { token: accessToken, body: { answers: ANSWERS } })).status, 402);
    assert.equal((await t.call('GET', '/me/lesson', { token: accessToken })).status, 402);
    const prof = await t.call('GET', '/me/profile', { token: accessToken });
    assert.equal(prof.status, 200); assert.equal(prof.data.entitled, false); assert.equal(prof.data.answers, null);
  } finally { await t.close(); }
});

test('profile: language, up to 3 themes, delivery time and IANA zone validated', async () => {
  const t = await start();
  try {
    const { accessToken: tok } = await t.signIn('p@example.com');
    const ok = await t.call('PUT', '/me/profile', { token: tok, body: { lang: 'es', themes: ['warrior', 'faith', 'builder'], deliveryTime: '06:40', timezone: 'America/Chicago' } });
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.data.lang, ok.data.themes, ok.data.deliveryTime, ok.data.timezone], ['es', ['warrior', 'faith', 'builder'], '06:40', 'America/Chicago']);
    for (const body of [{ themes: ['warrior', 'faith', 'builder', 'power'] }, { themes: ['ninja'] }, { deliveryTime: '25:00' }, { timezone: 'Mars/Base' }, { lang: 'fr' }]) {
      assert.equal((await t.call('PUT', '/me/profile', { token: tok, body })).status, 400, JSON.stringify(body));
    }
  } finally { await t.close(); }
});

test('Stripe TEST webhook unlocks the questionnaire; cancel sets cancel date; answers deleted 30 days later (job)', async () => {
  const t = await start({ env: { DW_PAYWALL_ENABLED: '1' } });
  try {
    const { accessToken: tok } = await t.signIn('sub@example.com');
    let r = await t.webhook(evt('evt_1', 'checkout.session.completed', { mode: 'subscription', status: 'complete', payment_status: 'paid', client_reference_id: 'sub@example.com', customer: 'cus_A', subscription: 'sub_A', metadata: { plan: 'monthly' } }));
    assert.equal(r.status, 200);
    r = await t.call('GET', '/questionnaire', { token: tok });
    assert.equal(r.status, 200); assert.equal(r.data.questions.length, 12);
    assert.equal((await t.call('PUT', '/me/answers', { token: tok, body: { answers: { ...ANSWERS, season: 'x' } } })).status, 400);
    r = await t.call('PUT', '/me/answers', { token: tok, body: { answers: ANSWERS } });
    assert.equal(r.status, 200); assert.equal(r.data.entitledVia, 'stripe'); assert.deepEqual(r.data.answers, ANSWERS);
    assert.equal((await t.call('GET', '/me/lesson', { token: tok })).status, 200);
    const canceledAt = t.clock.t;
    r = await t.webhook(evt('evt_2', 'customer.subscription.deleted', { id: 'sub_A', customer: 'cus_A', status: 'canceled', cancel_at_period_end: false, current_period_end: 1762000000 }, 1760400000));
    assert.equal(r.status, 200);
    r = await t.call('GET', '/me/profile', { token: tok });
    assert.equal(r.data.entitled, false); assert.equal(r.data.cancelDate, canceledAt); assert.equal(r.data.answersDeleteAt, canceledAt + 30 * DAY);
    assert.equal((await t.call('GET', '/questionnaire', { token: tok })).status, 402);
    assert.deepEqual(runRetention(t.store, canceledAt + 29 * DAY), []);
    assert.ok(t.store.user('sub@example.com').answers, 'kept for 29 days');
    assert.deepEqual(runRetention(t.store, canceledAt + 30 * DAY), ['sub@example.com']);
    const u = t.store.user('sub@example.com');
    assert.equal(u.answers, null); assert.deepEqual(u.sentLessons, []); assert.deepEqual(u.themes, []); assert.equal(u.deleteDataAfter, null);
    const disk = JSON.parse(fs.readFileSync(t.config.storePath, 'utf8')).users['sub@example.com'];
    assert.equal(disk.answers, null);
  } finally { await t.close(); }
});

test('owner/test override: full flow without payment, personalized lesson logged, no repeats', async () => {
  const t = await start({ env: Object.assign({ DW_PAYWALL_ENABLED: '1' }, LOCAL) });
  try {
    let { accessToken: tok } = await t.signIn('owner@example.com');
    let r = await t.call('GET', '/me', { token: tok });
    assert.equal(r.data.entitled, true); assert.equal(r.data.entitledVia, 'test_override'); assert.equal(r.data.plan.status, 'none');
    assert.equal((await t.call('PUT', '/me/profile', { token: tok, body: { themes: ['faith'], timezone: 'America/Chicago', deliveryTime: '06:40' } })).status, 200);
    assert.equal((await t.call('GET', '/me/lesson', { token: tok })).status, 409, 'answers first');
    assert.equal((await t.call('PUT', '/me/answers', { token: tok, body: { answers: ANSWERS } })).status, 200);
    const seen = new Set();
    for (let i = 0; i < 5; i++) {
      r = await t.call('GET', '/me/lesson', { token: tok });
      assert.equal(r.status, 200);
      const L = r.data.lesson;
      const src = CATALOG.find((l) => l.date === L.lessonDate);
      assert.ok(src, 'a real catalog lesson'); assert.equal(L.quote, src.quote); assert.equal(L.source, src.source); assert.equal(L.sourceUrl, src.sourceUrl);
      assert.ok(src.lanes.includes('faith'), 'theme honoured');
      assert.ok(!seen.has(L.lessonDate), 'no repeat'); seen.add(L.lessonDate);
      assert.ok(L.today.startsWith(src.today.slice(0, 20)));
      assert.ok(L.today.includes(L.personalized.focus));
      assert.equal(L.personalized.reminder.words, ANSWERS.emptychair);
      assert.deepEqual(aiTells(L.today), []);
      // same day again returns the same lesson and does not log twice
      const again = await t.call('GET', '/me/lesson', { token: tok });
      assert.equal(again.data.repeat, true); assert.equal(again.data.lesson.lessonDate, L.lessonDate);
      t.clock.t += DAY;
      ({ accessToken: tok } = await t.signIn('owner@example.com')); // 15-minute access tokens: sign in again next day
    }
    r = await t.call('GET', '/me/profile', { token: tok });
    assert.equal(r.data.sentLessons.length, 5);
    assert.deepEqual(r.data.sentLessons.map((s) => s.date), ['2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']);
    // a non-listed address on the same server is still gated
    const other = await t.signIn('someone@example.com');
    assert.equal((await t.call('GET', '/questionnaire', { token: other.accessToken })).status, 402);
  } finally { await t.close(); }
});

test('Spanish subscriber gets the Spanish fields and a Spanish focus line', () => {
  const user = { email: 'es@example.com', lang: 'es', themes: ['warrior'], answers: ANSWERS, sentLessons: [] };
  const L = buildPersonalLesson(CATALOG, user, '2026-10-14');
  const src = CATALOG.find((l) => l.date === L.lessonDate);
  assert.equal(L.lang, 'es'); assert.equal(L.quote, src.quote_es || src.quote);
  const esFocus = [...Object.values(FOCUS.fail), ...Object.values(FOCUS.avoid)].map((f) => f.es);
  assert.ok(esFocus.includes(L.personalized.focus));
  assert.ok(L.today.endsWith(L.personalized.focus));
});

test('every focus line passes the humanizer lint (no AI habits, EN and ES neutral)', () => {
  for (const group of Object.values(FOCUS)) for (const f of Object.values(group)) {
    assert.deepEqual(aiTells(f.en), [], f.en);
    assert.deepEqual(aiTells(f.es, { neutralOnly: true }), [], f.es);
  }
});

test('fact guard: a lesson whose wording would lose a number is refused, never served', () => {
  const day = CATALOG[0].date;
  const bad = [{ ...CATALOG[0], today: 'Train \u2014 20 to 30 minutes \u2014 then rest.', lesson: 'Plain words.', lanes: ['warrior'] }];
  // dashes are humanized into commas without losing numbers: still allowed
  assert.ok(buildPersonalLesson(bad, { email: 'g@x.co', lang: 'en', themes: [], answers: ANSWERS, sentLessons: [] }, day));
  const tell = [{ ...CATALOG[0], lesson: 'This is a vibrant tapestry of courage.' }];
  assert.throws(() => buildPersonalLesson(tell, { email: 'g@x.co', lang: 'en', themes: [], answers: ANSWERS, sentLessons: [] }, day), /AI writing habits/);
});
