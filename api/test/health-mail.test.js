'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { start } = require('./helpers');
const { agentMailTransport } = require('../src/mail');

async function healthMail(mail) {
  const h = await start({ mail });
  try { const r = await h.call('GET', '/health'); return r.body ? r.body.mail : (r.data || r.json).mail; } finally { await h.close(); }
}

test('/health mail: unconfigured when AgentMail vars are unset', async () => {
  assert.strictEqual(await healthMail(agentMailTransport({ apiKey: '', inboxId: '' }, async () => { throw new Error('no net'); })), 'unconfigured');
  assert.strictEqual(await healthMail(agentMailTransport({ apiKey: 'k', inboxId: '' }, async () => { throw new Error('no net'); })), 'unconfigured');
});

test('/health mail: agentmail only when key + inbox are set', async () => {
  assert.strictEqual(await healthMail(agentMailTransport({ apiKey: 'fixture', inboxId: 'inbox@example.test' }, async () => { throw new Error('no net'); })), 'agentmail');
});
