'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start, evt } = require('./helpers');
const { loadConfig } = require('../src/config');
const { runRetention } = require('../src/app');

const ANSWERS = { admire: ['warrior'], avoid: ['conflict'], fail: ['patience'], alive: ['building'], hate: ['laziness'], season: 'stuck', owe: 'His word.', values: ['Courage', 'Loyalty', 'Mastery', 'Freedom', 'Integrity'], miracle: 'Rise early.', exception: 'Once I did.', cost: 'Time.', emptychair: 'Go.' };
const ENV = { TESTER_EMAILS: '  Tester@Example.com , second@example.com ' };

test('defaults: owners are Zachary\'s two addresses, testers empty; lists trimmed and lower-cased', () => {
  const c = loadConfig({});
  assert.deepEqual(c.ownerEmails, ['menearz@gmail.com', 'menearz@yahoo.com']);
  assert.deepEqual(c.testerEmails, []);
  assert.deepEqual(loadConfig({ DW_OWNER_EMAILS: ' A@B.co ,', TESTER_EMAILS: 'X@Y.co' }).ownerEmails, ['a@b.co']);
  assert.deepEqual(loadConfig(ENV).testerEmails, ['tester@example.com', 'second@example.com']);
  // production config (github.io site URL) loads fine with both lists; no loopback rule for them
  assert.doesNotThrow(() => loadConfig({ ...ENV, DW_SITE_URL: 'https://menearz.github.io/daily-warrior-lesson' }));
});

test('owner (any case) is fully entitled with no payment and never touches Stripe', async () => {
  const t = await start({ env: ENV });
  try {
    const { accessToken: tok } = await t.signIn('MenearZ@Gmail.com ');
    const me = (await t.call('GET', '/me', { token: tok })).data;
    assert.equal(me.entitled, true); assert.equal(me.entitledVia, 'owner');
    assert.equal((await t.call('GET', '/questionnaire', { token: tok })).status, 200);
    assert.equal((await t.call('PUT', '/me/answers', { token: tok, body: { answers: ANSWERS } })).status, 200);
    assert.equal((await t.call('GET', '/me/lesson', { token: tok })).status, 200);
    assert.equal((await t.call('GET', '/me/profile', { token: tok })).data.planName, 'owner');
    assert.equal((await t.call('POST', '/billing/checkout', { token: tok, body: { plan: 'monthly' } })).data.error, 'free_access');
    assert.equal((await t.call('POST', '/billing/portal', { token: tok })).status, 409);
    assert.equal(t.stripe.calls.length, 0, 'no Stripe calls at all');
  } finally { await t.close(); }
});

test('tester (case-insensitive) is entitled, profile plan is tester, no Stripe', async () => {
  const t = await start({ env: ENV });
  try {
    const { accessToken: tok } = await t.signIn('TESTER@example.COM');
    const p = (await t.call('GET', '/me/profile', { token: tok })).data;
    assert.equal(p.entitled, true); assert.equal(p.entitledVia, 'tester'); assert.equal(p.plan.status, 'tester'); assert.equal(p.planName, 'tester');
    assert.equal((await t.call('GET', '/questionnaire', { token: tok })).status, 200);
    assert.equal((await t.call('POST', '/billing/checkout', { token: tok, body: { plan: 'yearly' } })).status, 409);
    assert.equal(t.stripe.calls.length, 0);
    // free access never sets a cancel date or a deletion date; retention leaves answers alone
    await t.call('PUT', '/me/answers', { token: tok, body: { answers: ANSWERS } });
    assert.deepEqual(runRetention(t.store, t.clock.t + 400 * 864e5), []);
    assert.ok(t.store.user('tester@example.com').answers);
    assert.equal(p.cancelDate, null); assert.equal(p.answersDeleteAt, null);
  } finally { await t.close(); }
});

test('a non-listed user gets 402; a paying user still gets cancel + 30-day deletion', async () => {
  const t = await start({ env: Object.assign({ DW_PAYWALL_ENABLED: '1' }, ENV) });
  try {
    const { accessToken: tok } = await t.signIn('stranger@example.com');
    assert.equal((await t.call('GET', '/questionnaire', { token: tok })).status, 402);
    assert.equal((await t.call('PUT', '/me/answers', { token: tok, body: { answers: ANSWERS } })).status, 402);
    assert.equal((await t.call('GET', '/me/lesson', { token: tok })).status, 402);
    assert.equal((await t.call('GET', '/me/profile', { token: tok })).data.planName, null);
    await t.webhook(evt('evt_p1', 'checkout.session.completed', { mode: 'subscription', status: 'complete', payment_status: 'paid', client_reference_id: 'stranger@example.com', customer: 'cus_P', subscription: 'sub_P', metadata: { plan: 'monthly' } }));
    await t.call('PUT', '/me/answers', { token: tok, body: { answers: ANSWERS } });
    await t.webhook(evt('evt_p2', 'customer.subscription.deleted', { id: 'sub_P', customer: 'cus_P', status: 'canceled' }, 1760400000));
    const p = (await t.call('GET', '/me/profile', { token: tok })).data;
    assert.ok(p.cancelDate); assert.equal(p.answersDeleteAt, p.cancelDate + 30 * 864e5);
    assert.deepEqual(runRetention(t.store, p.answersDeleteAt), ['stranger@example.com']);
  } finally { await t.close(); }
});

test('localhost-only override guard is unchanged', () => {
  assert.deepEqual(loadConfig({}).testOverrideEmails, []);
  assert.throws(() => loadConfig({ DW_TEST_OVERRIDE_EMAILS: 'a@b.co', DW_SITE_URL: 'https://menearz.github.io/daily-warrior-lesson' }), /loopback/);
  assert.throws(() => loadConfig({ DW_TEST_OVERRIDE_EMAILS: 'a@b.co' }), /loopback/);
  assert.deepEqual(loadConfig({ DW_TEST_OVERRIDE_EMAILS: 'a@b.co', DW_SITE_URL: 'http://127.0.0.1:5500' }).testOverrideEmails, ['a@b.co']);
});
