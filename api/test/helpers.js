'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Stripe = require('stripe');
const { loadConfig } = require('../src/config');
const { openStore } = require('../src/store');
const { createApp } = require('../src/app');
const { fakeTransport } = require('../src/mail');

const ORIGIN = 'https://menearz.github.io';
const WHSEC = 'whsec_test_fixture_secret';
const realStripe = Stripe('sk_test_fixture_not_a_real_key');

function fakeStripe() {
  const calls = [];
  return {
    calls,
    webhooks: realStripe.webhooks,
    customers: { create: async (p) => { calls.push(['customers.create', p]); return { id: 'cus_test_1' }; } },
    checkout: { sessions: { create: async (p) => { calls.push(['checkout.sessions.create', p]); return { id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }; } } },
    billingPortal: { sessions: { create: async (p) => { calls.push(['billingPortal.sessions.create', p]); return { url: 'https://billing.stripe.com/p/session/test_1' }; } } },
    subscriptions: { cancel: async (id) => { calls.push(['subscriptions.cancel', id]); return { id, status: 'canceled' }; } },
  };
}

async function start(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-api-'));
  const config = loadConfig({ DW_STORE_PATH: path.join(dir, 'store.json'), DW_STRIPE_WEBHOOK_SECRET: WHSEC, DW_STRIPE_SECRET_KEY: 'sk_test_fixture' });
  const clock = { t: opts.t || Date.UTC(2026, 9, 13, 18, 0, 0) };
  const store = openStore(config.storePath);
  const mail = opts.mail || fakeTransport();
  const stripe = opts.stripe === null ? null : (opts.stripe || fakeStripe());
  const { server } = createApp({ config, store, mail, stripe, now: () => clock.t });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(method, p, { body, token, cookie, origin = ORIGIN, headers = {} } = {}) {
    const h = Object.assign({ 'Content-Type': 'application/json', Origin: origin }, headers);
    if (token) h.Authorization = `Bearer ${token}`;
    if (cookie) h.Cookie = cookie;
    const res = await fetch(base + p, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
    let data = null; try { data = await res.json(); } catch (_) {}
    return { status: res.status, data, headers: res.headers };
  }
  function lastToken() { const m = mail.outbox[mail.outbox.length - 1]; return m && m.text.match(/#token=([A-Za-z0-9_-]{43})/)[1]; }
  async function signIn(email = 'reader@example.com', lang = 'en') {
    await call('POST', '/auth/magic', { body: { email, lang } });
    const r = await call('POST', '/auth/verify', { body: { token: lastToken() } });
    return r.data;
  }
  async function webhook(event) {
    const payload = JSON.stringify(event);
    const header = realStripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC, timestamp: Math.floor(Date.now() / 1000) });
    return call('POST', '/stripe/webhook', { body: payload, headers: { 'Stripe-Signature': header }, origin: undefined });
  }
  const close = () => new Promise((r) => { server.close(r); fs.rmSync(dir, { recursive: true, force: true }); });
  return { server, base, call, store, mail, stripe, clock, config, lastToken, signIn, webhook, close, dir };
}

function evt(id, type, object, created = 1760378400) { return { id, object: 'event', type, created, livemode: false, data: { object } }; }

module.exports = { start, evt, ORIGIN, WHSEC, fakeStripe };
