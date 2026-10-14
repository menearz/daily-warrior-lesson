'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadConfig, LEGAL_KEYS } = require('../src/config');
const { buildMagicLinkEmail } = require('../src/mail');
const mailModule = require('../src/mail');

const BASE = { DW_STORE_PATH: '/tmp/dw-unused.json' };
const LEGAL = { DW_SELLER_NAME: 'Seller Fixture LLC', DW_SUPPORT_EMAIL: 'help@example.test', DW_REFUND_POLICY: 'webcopy-2026-10-13' };

test('legal values have no defaults', () => {
  const c = loadConfig(BASE);
  assert.deepStrictEqual(c.legal, { sellerName: null, supportEmail: null, refundPolicy: null });
  assert.strictEqual(c.legalComplete, false);
  assert.strictEqual(c.launch, false);
});

test('launch flag ON fails when any legal value is unset', () => {
  for (const k of LEGAL_KEYS) {
    const env = { ...BASE, ...LEGAL, DW_LAUNCH: '1' }; delete env[k];
    assert.throws(() => loadConfig(env), new RegExp(`DW_LAUNCH=1 but .*${k}`));
  }
  assert.throws(() => loadConfig({ ...BASE, DW_LAUNCH: '1' }), /DW_SELLER_NAME, DW_SUPPORT_EMAIL, DW_REFUND_POLICY unset/);
  assert.strictEqual(loadConfig({ ...BASE, ...LEGAL, DW_LAUNCH: '1' }).legalComplete, true);
});

test('launch flag in the shipped environment: if ON, every legal value must be set', () => {
  const env = process.env;
  if (String(env.DW_LAUNCH || '') !== '1') return;
  assert.deepStrictEqual(LEGAL_KEYS.filter((k) => !String(env[k] || '').trim()), []);
});

test('unknown refund policy id refused', () => {
  assert.throws(() => loadConfig({ ...BASE, ...LEGAL, DW_REFUND_POLICY: 'whatever' }), /DW_REFUND_POLICY/);
});

test('magic-link email is Web Copy text, EN and ES', () => {
  const en = buildMagicLinkEmail({ url: 'https://x.test/s#t=1', lang: 'en' });
  assert.strictEqual(en.subject, 'Your Daily Warrior sign-in link');
  assert.match(en.text, /^Tap the link below to sign in to Daily Warrior's Lesson\.\n\nhttps:\/\/x\.test\/s#t=1\n\nThe link works one time/);
  assert.match(en.html, /Tap to sign in\. The link works once, for 15 minutes\./);
  const es = buildMagicLinkEmail({ url: 'https://x.test/s', lang: 'es' });
  assert.strictEqual(es.subject, 'Tu enlace para entrar a Daily Warrior');
  assert.match(es.text, /Nadie puede entrar sin este enlace\.$/);
});

test('no custom renewal reminder: Stripe sends it', () => {
  assert.strictEqual(mailModule.buildRenewalReminderEmail, undefined);
  const fs = require('node:fs'); const path = require('node:path');
  const src = fs.readdirSync(path.join(__dirname, '..', 'src')).map((f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8')).join('\n');
  assert.doesNotMatch(src, /renews on|se renueva el|renewal_date/);
});

test('approved production values pass the launch check', () => {
  const fs = require('node:fs'); const path = require('node:path');
  const env = { ...BASE };
  for (const line of fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8').split('\n')) {
    const m = line.match(/^(DW_[A-Z_]+)=(.*)$/); if (!m) continue;
    let v = m[2].trim(); if (/^'.*'$/.test(v)) v = v.slice(1, -1);
    if (v) env[m[1]] = v;
  }
  assert.strictEqual(env.DW_SELLER_NAME, 'Ancilla Dynamic, LLC');
  assert.strictEqual(env.DW_SUPPORT_EMAIL, 'dailywarrior@agentmail.to');
  assert.strictEqual(env.DW_MAIL_FROM, 'Daily Warrior <dailywarrior@agentmail.to>');
  assert.strictEqual(env.DW_REFUND_POLICY, 'webcopy-2026-10-13');
  const c = loadConfig({ ...env, DW_LAUNCH: '1' });
  assert.strictEqual(c.legalComplete, true);
  assert.strictEqual(c.mail.from, 'Daily Warrior <dailywarrior@agentmail.to>');
});

test('price ids accepted as DW_STRIPE_PRICE_* or DW_PRICE_MONTHLY/YEARLY (price_ only)', () => {
  const c = loadConfig({ ...BASE, DW_PRICE_MONTHLY: 'price_fixtureM', DW_PRICE_YEARLY: 'price_fixtureY' });
  assert.strictEqual(c.plans.monthly.priceId, 'price_fixtureM');
  assert.strictEqual(c.plans.yearly.priceId, 'price_fixtureY');
  assert.strictEqual(loadConfig({ ...BASE, DW_PRICE_MONTHLY: '499' }).plans.monthly.priceId, null);
});
