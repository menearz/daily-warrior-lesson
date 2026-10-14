'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { start, evt } = require('./helpers');
const { loadConfig, LIVE_MODE_OFF, LIVE_MODE_OFF_REASON } = require('../src/config');
const { runRetention, mergeSync } = require('../src/app');
const { hashToken } = require('../src/tokens');

const DAY = 864e5;
const active = (email) => evt('evt_cs_' + email, 'checkout.session.completed', { id: 'cs_test_1', object: 'checkout.session', mode: 'subscription', status: 'complete', payment_status: 'paid', customer: 'cus_test_1', subscription: 'sub_test_1', client_reference_id: email, metadata: { plan: 'monthly', email } });

test('live key refusal: config and server.js refuse sk_live and rk_live keys', () => {
  assert.equal(LIVE_MODE_OFF, true);
  assert.match(LIVE_MODE_OFF_REASON, /Live mode off: Ancilla payouts paused/);
  for (const k of ['sk_live_x', 'rk_live_y']) assert.throws(() => loadConfig({ DW_STRIPE_SECRET_KEY: k }), /LIVE key.*Ancilla payouts paused/);
  assert.throws(() => loadConfig({ DW_STRIPE_SECRET_KEY: 'pk_test_x' }), /sk_test_/);
  assert.equal(loadConfig({ DW_STRIPE_SECRET_KEY: 'sk_test_ok' }).stripe.secretKey, 'sk_test_ok');
  const env = { PATH: process.env.PATH, DW_STRIPE_SECRET_KEY: 'sk_live_fixture_refuse', DW_STORE_PATH: '/tmp/dw-never-written.json' };
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, encoding: 'utf8', timeout: 5000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Refusing to start: .*LIVE key\. Live mode off: Ancilla payouts paused/);
  assert.doesNotMatch(r.stderr + r.stdout, /sk_live_fixture_refuse/, 'key never printed');
  assert.equal(fs.existsSync('/tmp/dw-never-written.json'), false);
});

test('magic link: email sent with a one-time link; only the hash is stored; works once', async () => {
  const a = await start();
  try {
    const r = await a.call('POST', '/auth/magic', { body: { email: 'Reader@Example.com', lang: 'es' } });
    assert.equal(r.status, 202);
    assert.equal(a.mail.outbox.length, 1);
    assert.equal(a.mail.outbox[0].to, 'reader@example.com');
    assert.match(a.mail.outbox[0].subject, /enlace/);
    assert.match(a.mail.outbox[0].text, /signin\.html#token=/);
    const token = a.lastToken();
    const raw = fs.readFileSync(a.config.storePath, 'utf8');
    assert.equal(raw.includes(token), false, 'raw token never stored');
    assert.ok(raw.includes(hashToken(token)));
    const v = await a.call('POST', '/auth/verify', { body: { token } });
    assert.equal(v.status, 200);
    assert.ok(v.data.accessToken && v.data.refreshToken);
    assert.equal(v.data.me.email, 'reader@example.com');
    assert.equal(v.data.me.lang, 'es');
    assert.match(v.headers.get('set-cookie'), /dw_sid=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; Secure; SameSite=None/);
    const again = await a.call('POST', '/auth/verify', { body: { token } });
    assert.equal(again.status, 400); assert.equal(again.data.error, 'link_used');
    const bad = await a.call('POST', '/auth/verify', { body: { token: 'x'.repeat(43) } });
    assert.equal(bad.data.error, 'link_invalid');
    const r2 = await a.call('POST', '/auth/magic', { body: { email: 'nope' } });
    assert.equal(r2.status, 400);
  } finally { await a.close(); }
});

test('magic link expires after 15 minutes; a new request replaces the old link', async () => {
  const a = await start();
  try {
    await a.call('POST', '/auth/magic', { body: { email: 'r@example.com' } });
    const first = a.lastToken();
    await a.call('POST', '/auth/magic', { body: { email: 'r@example.com' } });
    const second = a.lastToken();
    assert.equal((await a.call('POST', '/auth/verify', { body: { token: first } })).data.error, 'link_invalid');
    a.clock.t += 15 * 60e3 + 1;
    assert.equal((await a.call('POST', '/auth/verify', { body: { token: second } })).data.error, 'link_expired');
    await a.call('POST', '/auth/magic', { body: { email: 'r@example.com' } });
    a.clock.t += 14 * 60e3;
    assert.equal((await a.call('POST', '/auth/verify', { body: { token: a.lastToken() } })).status, 200);
  } finally { await a.close(); }
});

test('rate limit: 3 links per email and 10 per IP per 15 minutes; verify capped per IP', async () => {
  const a = await start();
  try {
    for (let i = 0; i < 3; i++) assert.equal((await a.call('POST', '/auth/magic', { body: { email: 'x@example.com' } })).status, 202);
    const r = await a.call('POST', '/auth/magic', { body: { email: 'x@example.com' } });
    assert.equal(r.status, 429); assert.ok(Number(r.headers.get('retry-after')) > 0);
    assert.equal(a.mail.outbox.length, 3);
    for (let i = 0; i < 7; i++) await a.call('POST', '/auth/magic', { body: { email: `y${i}@example.com` } });
    assert.equal((await a.call('POST', '/auth/magic', { body: { email: 'z@example.com' } })).status, 429, 'IP cap');
    let last;
    for (let i = 0; i < 21; i++) last = await a.call('POST', '/auth/verify', { body: { token: 'a'.repeat(43) } });
    assert.equal(last.status, 429);
    a.clock.t += 15 * 60e3 + 1;
    assert.equal((await a.call('POST', '/auth/magic', { body: { email: 'x@example.com' } })).status, 202, 'window resets');
  } finally { await a.close(); }
});

test('bearer + rotating refresh: access expires in 15 min; refresh rotates; reuse revokes the family', async () => {
  const a = await start();
  try {
    const s = await a.signIn();
    assert.equal((await a.call('GET', '/me', { token: s.accessToken })).data.authVia, 'bearer');
    a.clock.t += 15 * 60e3 + 1;
    assert.equal((await a.call('GET', '/me', { token: s.accessToken })).status, 401);
    const r1 = await a.call('POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
    assert.equal(r1.status, 200);
    assert.notEqual(r1.data.refreshToken, s.refreshToken);
    assert.equal((await a.call('GET', '/me', { token: r1.data.accessToken })).status, 200);
    const reuse = await a.call('POST', '/auth/refresh', { body: { refreshToken: s.refreshToken } });
    assert.equal(reuse.data.error, 'refresh_reused');
    assert.equal((await a.call('POST', '/auth/refresh', { body: { refreshToken: r1.data.refreshToken } })).status, 401, 'family revoked');
  } finally { await a.close(); }
});

test('cookie session also authenticates; logout clears it', async () => {
  const a = await start();
  try {
    await a.call('POST', '/auth/magic', { body: { email: 'c@example.com' } });
    const v = await a.call('POST', '/auth/verify', { body: { token: a.lastToken() } });
    const cookie = v.headers.get('set-cookie').split(';')[0];
    const me = await a.call('GET', '/me', { cookie });
    assert.equal(me.status, 200); assert.equal(me.data.authVia, 'cookie');
    await a.call('POST', '/auth/logout', { cookie });
    assert.equal((await a.call('GET', '/me', { cookie })).status, 401);
  } finally { await a.close(); }
});

test('CORS: only https://menearz.github.io gets credentials; other origins refused', async () => {
  const a = await start();
  try {
    const ok = await a.call('OPTIONS', '/me');
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://menearz.github.io');
    assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
    const bad = await a.call('OPTIONS', '/me', { origin: 'https://evil.example' });
    assert.equal(bad.status, 403); assert.equal(bad.headers.get('access-control-allow-origin'), null);
    assert.equal((await a.call('POST', '/auth/magic', { origin: 'https://evil.example', body: { email: 'e@example.com' } })).status, 403);
  } finally { await a.close(); }
});

test('entitlement: free account cannot sync or get its path; active plan can; today stays free', async () => {
  const a = await start();
  try {
    const s = await a.signIn('p@example.com');
    const fp = { primary: 'builder', secondary: 'odyssey', lanes: { builder: 5, odyssey: 3 }, at: 1000, answers: { q1: 'x' } };
    let r = await a.call('PUT', '/sync', { token: s.accessToken, body: { forgedPath: fp, reads: ['2026-10-12'] } });
    assert.equal(r.status, 402); assert.equal(r.data.error, 'plan_required');
    r = await a.call('GET', '/me', { token: s.accessToken });
    assert.equal(r.data.entitled, false); assert.equal(r.data.forgedPath, undefined);
    assert.equal((await a.webhook(active('p@example.com'))).status, 200);
    r = await a.call('PUT', '/sync', { token: s.accessToken, body: { forgedPath: fp, reads: ['2026-10-12', 'junk'] } });
    assert.equal(r.status, 200); assert.equal(r.data.entitled, true);
    assert.deepEqual(r.data.reads, ['2026-10-12']);
    assert.equal(r.data.forgedPath.primary, 'builder');
    // merge: older path loses, newer wins, reads union
    r = await a.call('PUT', '/sync', { token: s.accessToken, body: { forgedPath: Object.assign({}, fp, { primary: 'faith', at: 500 }), reads: ['2026-10-13'] } });
    assert.equal(r.data.forgedPath.primary, 'builder'); assert.deepEqual(r.data.reads, ['2026-10-12', '2026-10-13']);
    r = await a.call('PUT', '/sync', { token: s.accessToken, body: { forgedPath: Object.assign({}, fp, { primary: 'faith', at: 2000 }) } });
    assert.equal(r.data.forgedPath.primary, 'faith');
    assert.equal((await a.call('PUT', '/sync', { token: s.accessToken, body: { forgedPath: { primary: 'wizard', at: 3 } } })).status, 400);
  } finally { await a.close(); }
});

test('webhook: bad signature refused; events idempotent; live events refused; updated/deleted apply', async () => {
  const a = await start();
  try {
    await a.signIn('w@example.com');
    const bad = await a.call('POST', '/stripe/webhook', { body: JSON.stringify(active('w@example.com')), headers: { 'Stripe-Signature': 't=1,v1=deadbeef' }, origin: undefined });
    assert.equal(bad.status, 400); assert.equal(bad.data.error, 'bad_signature');
    assert.equal(a.store.user('w@example.com').plan.status, 'none');
    assert.equal((await a.webhook(active('w@example.com'))).data.received, true);
    assert.equal(a.store.user('w@example.com').plan.status, 'active');
    assert.equal(a.store.user('w@example.com').stripeCustomerId, 'cus_test_1');
    const dup = await a.webhook(active('w@example.com'));
    assert.equal(dup.data.duplicate, true);
    const live = Object.assign(evt('evt_live', 'customer.subscription.deleted', { id: 'sub_test_1', customer: 'cus_test_1' }), { livemode: true });
    assert.equal((await a.webhook(live)).data.error, 'live_event_refused');
    const upd = evt('evt_upd', 'customer.subscription.updated', { id: 'sub_test_1', object: 'subscription', customer: 'cus_test_1', status: 'active', cancel_at_period_end: true, items: { data: [{ current_period_end: 1763000000 }] } }, 1760378500);
    await a.webhook(upd);
    let u = a.store.user('w@example.com');
    assert.equal(u.plan.cancelAtPeriodEnd, true); assert.equal(u.plan.currentPeriodEnd, 1763000000 * 1000); assert.equal(u.plan.status, 'active');
    const stale = evt('evt_stale', 'customer.subscription.updated', { id: 'sub_test_1', customer: 'cus_test_1', status: 'past_due' }, 1760378450);
    await a.webhook(stale);
    assert.equal(a.store.user('w@example.com').plan.status, 'active', 'older event ignored');
    await a.webhook(evt('evt_del', 'customer.subscription.deleted', { id: 'sub_test_1', object: 'subscription', customer: 'cus_test_1', status: 'canceled' }, 1760378600));
    u = a.store.user('w@example.com');
    assert.equal(u.plan.status, 'canceled');
    assert.equal(u.deleteDataAfter, a.clock.t + 30 * DAY);
  } finally { await a.close(); }
});

test('30-day delete: answers and history kept 30 days after cancel, then deleted by the retention job', async () => {
  const a = await start();
  try {
    const s = await a.signIn('d@example.com');
    await a.webhook(active('d@example.com'));
    await a.call('PUT', '/sync', { token: s.accessToken, body: { forgedPath: { primary: 'power', secondary: 'thinker', at: 1 }, reads: ['2026-10-01'] } });
    await a.webhook(evt('evt_del2', 'customer.subscription.deleted', { id: 'sub_test_1', customer: 'cus_test_1', status: 'canceled' }, 1760378700));
    a.clock.t += 29 * DAY;
    assert.deepEqual(runRetention(a.store, a.clock.t), []);
    const me = await a.call('GET', '/me', { cookie: undefined, token: (await a.signIn('d@example.com')).accessToken });
    assert.equal(me.data.hasSavedPath, true, 'kept during the 30 days');
    a.clock.t += 1 * DAY + 1;
    assert.deepEqual(runRetention(a.store, a.clock.t), ['d@example.com']);
    const u = a.store.user('d@example.com');
    assert.equal(u.forgedPath, null); assert.deepEqual(u.reads, []);
    const disk = JSON.parse(fs.readFileSync(a.config.storePath, 'utf8')).users['d@example.com'];
    assert.equal(disk.forgedPath, null); assert.deepEqual(disk.reads, []);
    // a resubscribe inside 30 days cancels the deletion
    const b = await start();
    try {
      const t = await b.signIn('k@example.com');
      await b.webhook(active('k@example.com'));
      await b.call('PUT', '/sync', { token: t.accessToken, body: { forgedPath: { primary: 'faith', at: 1 } } });
      await b.webhook(evt('evt_d3', 'customer.subscription.deleted', { id: 'sub_test_1', customer: 'cus_test_1', status: 'canceled' }, 1760378700));
      await b.webhook(evt('evt_u3', 'customer.subscription.updated', { id: 'sub_test_2', customer: 'cus_test_1', status: 'active' }, 1760378800));
      b.clock.t += 31 * DAY;
      assert.deepEqual(runRetention(b.store, b.clock.t), []);
      assert.equal(b.store.user('k@example.com').forgedPath.primary, 'faith');
    } finally { await b.close(); }
  } finally { await a.close(); }
});

test('checkout: subscription session with configured price ($4.99/mo, $39.99/yr); portal; already-subscribed refused', async () => {
  const a = await start();
  try {
    const s = await a.signIn('b@example.com', 'es');
    assert.equal((await a.call('POST', '/billing/checkout', { body: { plan: 'monthly' } })).status, 401);
    assert.equal((await a.call('POST', '/billing/checkout', { token: s.accessToken, body: { plan: 'weekly' } })).status, 400);
    const r = await a.call('POST', '/billing/checkout', { token: s.accessToken, body: { plan: 'yearly' } });
    assert.equal(r.status, 200); assert.match(r.data.url, /^https:\/\/checkout\.stripe\.com\//);
    const [, params] = a.stripe.calls.find((c) => c[0] === 'checkout.sessions.create');
    assert.equal(params.mode, 'subscription');
    assert.equal(params.line_items[0].price_data.unit_amount, 3999);
    assert.equal(params.line_items[0].price_data.recurring.interval, 'year');
    assert.equal(params.locale, 'es');
    assert.equal(params.client_reference_id, 'b@example.com');
    assert.equal(params.customer, 'cus_test_1');
    assert.equal(params.subscription_data.trial_period_days, undefined, 'no trial');
    await a.call('POST', '/billing/checkout', { token: s.accessToken, body: { plan: 'monthly' } });
    const monthly = a.stripe.calls.filter((c) => c[0] === 'checkout.sessions.create')[1][1];
    assert.equal(monthly.line_items[0].price_data.unit_amount, 499);
    const p = await a.call('POST', '/billing/portal', { token: s.accessToken });
    assert.match(p.data.url, /billing\.stripe\.com/);
    await a.webhook(active('b@example.com'));
    assert.equal((await a.call('POST', '/billing/checkout', { token: s.accessToken, body: { plan: 'monthly' } })).status, 409);
  } finally { await a.close(); }
});

test('delete account: cancels the Stripe subscription and removes the user now', async () => {
  const a = await start();
  try {
    const s = await a.signIn('del@example.com');
    await a.webhook(active('del@example.com'));
    const r = await a.call('DELETE', '/me', { token: s.accessToken });
    assert.equal(r.status, 200);
    assert.deepEqual(a.stripe.calls.find((c) => c[0] === 'subscriptions.cancel'), ['subscriptions.cancel', 'sub_test_1']);
    assert.equal(a.store.user('del@example.com'), null);
    assert.equal(JSON.parse(fs.readFileSync(a.config.storePath, 'utf8')).users['del@example.com'], undefined);
    // Paid access ends the same day: old token is dead, a fresh sign-in is not entitled.
    assert.equal((await a.call('GET', '/me', { token: s.accessToken })).status, 401);
    const again = await a.signIn('del@example.com');
    const me = await a.call('GET', '/me', { token: again.accessToken });
    assert.equal(me.data.entitled, false);
    assert.equal((await a.call('PUT', '/sync', { token: again.accessToken, body: { reads: [] } })).status, 402);
  } finally { await a.close(); }
});

test('store keeps only the listed account fields', async () => {
  const a = await start();
  try {
    await a.signIn('f@example.com');
    const u = JSON.parse(fs.readFileSync(a.config.storePath, 'utf8')).users['f@example.com'];
    assert.deepEqual(Object.keys(u).sort(), ['answers', 'answersAt', 'createdAt', 'deleteDataAfter', 'deliveryTime', 'email', 'forgedPath', 'lang', 'plan', 'reads', 'sentLessons', 'stripeCustomerId', 'stripeSubscriptionId', 'themes', 'timezone']);
    assert.equal(fs.statSync(a.config.storePath).mode & 0o777, 0o600);
  } finally { await a.close(); }
});

test('mergeSync unit rules', () => {
  const u = { forgedPath: null, reads: [] };
  assert.deepEqual(mergeSync(u, { reads: 'x' }), { error: 'bad_reads' });
  assert.deepEqual(mergeSync(u, { forgedPath: { primary: 'warrior', at: 'x' } }), { error: 'bad_forged_path' });
  assert.deepEqual(mergeSync(u, { forgedPath: { primary: 'warrior', at: 5, evil: 1 } }), { ok: true });
  assert.equal(u.forgedPath.evil, undefined);
});

test('Stripe API failure on checkout returns 502 stripe_error with type/code only', async () => {
  const { fakeStripe } = require('./helpers');
  const st = fakeStripe();
  st.checkout = { sessions: { create: async () => { const e = new Error('No such price: price_secretish'); e.type = 'StripeInvalidRequestError'; e.code = 'resource_missing'; e.param = 'line_items[0][price]'; e.statusCode = 400; throw e; } } };
  const a = await start({ stripe: st });
  try {
    const s = await a.signIn('se@example.com');
    const r = await a.call('POST', '/billing/checkout', { token: s.accessToken, body: { plan: 'monthly' } });
    assert.equal(r.status, 502);
    assert.deepEqual(r.data, { error: 'stripe_error', stripeType: 'StripeInvalidRequestError', stripeCode: 'resource_missing' });
  } finally { await a.close(); }
});
