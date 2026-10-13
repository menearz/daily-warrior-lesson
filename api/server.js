#!/usr/bin/env node
'use strict';
// Daily Warrior API entry point. LIVE MODE OFF: Ancilla payouts paused (see src/config.js).
const { loadConfig } = require('./src/config');
const { openStore } = require('./src/store');
const { createApp, runRetention } = require('./src/app');
const { agentMailTransport, fakeTransport } = require('./src/mail');

let config;
try { config = loadConfig(); } catch (err) { console.error('[dw-api] ' + err.message); process.exit(1); }
const store = openStore(config.storePath);
let stripe = null;
if (config.stripe.secretKey) {
  const Stripe = require('stripe');
  const opts = {};
  if (config.stripe.apiHost) opts.host = config.stripe.apiHost;
  if (config.stripe.apiPort) opts.port = config.stripe.apiPort;
  if (config.stripe.apiProtocol) opts.protocol = config.stripe.apiProtocol;
  stripe = Stripe(config.stripe.secretKey, opts);
}
const mail = process.env.DW_MAIL_TRANSPORT === 'fake' ? fakeTransport() : agentMailTransport(config.mail);
if (mail.name === 'fake') { const send = mail.send.bind(mail); mail.send = async (m) => { const r = await send(m); require('fs').appendFileSync(process.env.DW_FAKE_OUTBOX || '/dev/null', JSON.stringify(m) + '\n'); return r; }; }
const { server } = createApp({ config, store, mail, stripe, log: (m) => console.log('[dw-api] ' + m) });
runRetention(store);
setInterval(() => { const p = runRetention(store); if (p.length) console.log(`[dw-api] retention purged ${p.length} account(s)`); }, 60 * 60 * 1000).unref();
server.listen(config.port, config.host, () => console.log(`[dw-api] listening on ${config.host}:${config.port} (Stripe TEST mode, live mode off)`));
