'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { loadConfig, LEGAL_KEYS } = require('../src/config');
const { buildMagicLinkEmail, buildRenewalReminderEmail } = require('../src/mail');

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

test('renewal reminder refuses without a support address, renders with one', () => {
  assert.throws(() => buildRenewalReminderEmail({ lang: 'en', renewalDate: 'October 20, 2026', accountUrl: 'https://s/account.html' }), /DW_SUPPORT_EMAIL/);
  const m = buildRenewalReminderEmail({ lang: 'es', renewalDate: '20 de octubre de 2026', accountUrl: 'https://s/account.html', supportEmail: 'help@example.test' });
  assert.strictEqual(m.subject, 'Tu año de Daily Warrior se renueva el 20 de octubre de 2026');
  assert.match(m.text, /¿Preguntas\? Escríbenos a help@example\.test\.$/);
  assert.doesNotMatch(m.text, /\{|support@arbiterresearch/);
});
