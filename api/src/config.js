'use strict';
/**
 * Daily Warrior API configuration (all from env).
 *
 * LIVE MODE OFF: Ancilla's Stripe payouts are paused, so this API runs in
 * Stripe TEST mode only. loadConfig() refuses to start with a live key
 * (sk_live_ / rk_live_). Turning live mode on is a deliberate code change
 * plus Zachary's OK, not an env flip.
 */
const path = require('path');

const LIVE_MODE_OFF = true;
const LIVE_MODE_OFF_REASON = 'Live mode off: Ancilla payouts paused';

// Launch flag: ON means customer-facing launch (refund + seller + support
// shown). Off by default. Turning it on with any legal value unset refuses.
// The three values are pending Zachary's pick and have NO defaults.
const LEGAL_KEYS = ['DW_SELLER_NAME', 'DW_SUPPORT_EMAIL', 'DW_REFUND_POLICY'];
// Refund policy is chosen by id. 'webcopy-2026-10-13' = Web Copy's proposal.
const REFUND_POLICIES = ['webcopy-2026-10-13'];

function legalFrom(env) {
  const v = (k) => String(env[k] || '').trim() || null;
  return { sellerName: v('DW_SELLER_NAME'), supportEmail: v('DW_SUPPORT_EMAIL'), refundPolicy: v('DW_REFUND_POLICY') };
}
function missingLegal(env) { return LEGAL_KEYS.filter((k) => !String(env[k] || '').trim()); }

function int(v, d) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : d; }

function loadConfig(env = process.env) {
  const key = String(env.DW_STRIPE_SECRET_KEY || '').trim();
  if (/^(sk|rk)_live_/.test(key)) {
    throw new Error(`Refusing to start: DW_STRIPE_SECRET_KEY is a LIVE key. ${LIVE_MODE_OFF_REASON}. Use an sk_test_ key.`);
  }
  if (key && !/^(sk|rk)_test_/.test(key)) throw new Error('DW_STRIPE_SECRET_KEY must be an sk_test_ key');
  const launch = String(env.DW_LAUNCH || '') === '1';
  const missing = missingLegal(env);
  if (launch && missing.length) throw new Error(`Refusing to start: DW_LAUNCH=1 but ${missing.join(', ')} unset`);
  const legal = legalFrom(env);
  if (legal.refundPolicy && !REFUND_POLICIES.includes(legal.refundPolicy)) throw new Error(`DW_REFUND_POLICY must be one of: ${REFUND_POLICIES.join(', ')}`);
  if (legal.supportEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(legal.supportEmail)) throw new Error('DW_SUPPORT_EMAIL is not an email address');
  const webhookSecret = String(env.DW_STRIPE_WEBHOOK_SECRET || '').trim();
  const cfg = {
    port: int(env.DW_API_PORT, 8787),
    host: String(env.DW_API_HOST || '127.0.0.1'),
    storePath: path.resolve(String(env.DW_STORE_PATH || path.join(__dirname, '..', 'data', 'dw-store.json'))),
    allowedOrigin: String(env.DW_ALLOWED_ORIGIN || 'https://menearz.github.io'),
    siteUrl: String(env.DW_SITE_URL || 'https://menearz.github.io/daily-warrior-lesson').replace(/\/$/, ''),
    cookieSecure: String(env.DW_COOKIE_INSECURE || '') !== '1',
    stripe: {
      secretKey: key,
      webhookSecret,
      apiHost: env.DW_STRIPE_API_HOST || null, // e.g. 127.0.0.1 for stripe-mock
      apiPort: env.DW_STRIPE_API_PORT ? Number(env.DW_STRIPE_API_PORT) : null,
      apiProtocol: env.DW_STRIPE_API_PROTOCOL || null,
    },
    // Price is config (Zachary): $4.99/mo or $39.99/yr, USD cents. If Stripe
    // Price ids are set they are used; otherwise Checkout gets inline price_data.
    plans: {
      monthly: { amount: int(env.DW_PRICE_MONTHLY_CENTS, 499), interval: 'month', priceId: env.DW_STRIPE_PRICE_MONTHLY || null },
      yearly: { amount: int(env.DW_PRICE_YEARLY_CENTS, 3999), interval: 'year', priceId: env.DW_STRIPE_PRICE_YEARLY || null },
    },
    currency: 'usd',
    productName: String(env.DW_PRODUCT_NAME || 'The Forge (Daily Warrior\u2019s Lesson)'),
    mail: {
      apiKey: String(env.DW_AGENTMAIL_API_KEY || '').trim(),
      inboxId: String(env.DW_AGENTMAIL_INBOX_ID || '').trim(),
      from: String(env.DW_MAIL_FROM || '').trim(), // sender is configurable; NEED from Zachary
      apiUrl: String(env.DW_AGENTMAIL_API_URL || '').trim(),
    },
    magicLinkTtlMs: 15 * 60 * 1000,
    accessTtlMs: 15 * 60 * 1000,
    refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
    sessionCookieTtlMs: 30 * 24 * 60 * 60 * 1000,
    retentionMs: 30 * 24 * 60 * 60 * 1000,
    liveModeOff: LIVE_MODE_OFF,
    launch,
    legal,
    legalComplete: missing.length === 0,
  };
  return cfg;
}

module.exports = { loadConfig, LEGAL_KEYS, REFUND_POLICIES, missingLegal, LIVE_MODE_OFF, LIVE_MODE_OFF_REASON };
