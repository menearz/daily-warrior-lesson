'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('./helpers');
const { loadConfig } = require('../src/config');

const A = {
  admire: ['warrior', 'thinker', 'faith'], avoid: ['hardconv', 'conflict'], fail: ['discipline', 'promises'],
  alive: ['building', 'tested'], hate: ['laziness'], season: 'stuck',
  owe: 'Account A owes his family his best hours.', values: ['Discipline', 'Family', 'Courage', 'Faith', 'Honor'],
  miracle: 'I would get up early and train before work.', exception: 'Last spring I kept a 30 day training streak.',
  cost: 'It is costing me my health.', emptychair: 'Alpha does the work today.',
};
const B = {
  admire: ['builder', 'thinker', 'faith'], avoid: ['fear', 'conflict'], fail: ['courage', 'promises'],
  alive: ['creating', 'serving'], hate: ['dishonesty'], season: 'mentor',
  owe: 'Account B owes the work, not the speech.', values: ['Wisdom', 'Integrity', 'Patience', 'Justice', 'Loyalty'],
  miracle: 'I would write one honest page a day.', exception: 'I finished a hard talk last winter.',
  cost: 'It is costing me my attention.', emptychair: 'Beta starts the page today.',
};

test('DW_PAYWALL_ENABLED defaults off and accepts 1/true only', () => {
  assert.equal(loadConfig({}).paywallEnabled, false);
  assert.equal(loadConfig({ DW_PAYWALL_ENABLED: '' }).paywallEnabled, false);
  assert.equal(loadConfig({ DW_PAYWALL_ENABLED: '0' }).paywallEnabled, false);
  assert.equal(loadConfig({ DW_PAYWALL_ENABLED: 'false' }).paywallEnabled, false);
  assert.equal(loadConfig({ DW_PAYWALL_ENABLED: '1' }).paywallEnabled, true);
  assert.equal(loadConfig({ DW_PAYWALL_ENABLED: 'true' }).paywallEnabled, true);
});

test('two accounts keep separate answers, path, and history on the server', async () => {
  const t = await start();
  try {
    const a = await t.signIn('alpha@example.com');
    const b = await t.signIn('beta@example.com');
    assert.equal((await t.call('PUT', '/me/answers', { token: a.accessToken, body: { answers: A } })).status, 200);
    assert.equal((await t.call('PUT', '/sync', { token: a.accessToken, body: { forgedPath: { primary: 'warrior', secondary: 'faith', at: 10 } } })).status, 200);
    assert.equal((await t.call('POST', '/me/history', { token: a.accessToken, body: { date: '2026-10-01' } })).status, 200);
    assert.equal((await t.call('POST', '/me/history', { token: a.accessToken, body: { date: '2026-10-01' } })).data.reads.length, 1, 'a date is recorded once');
    assert.equal((await t.call('PUT', '/me/answers', { token: b.accessToken, body: { answers: B } })).status, 200);
    assert.equal((await t.call('PUT', '/sync', { token: b.accessToken, body: { forgedPath: { primary: 'builder', secondary: 'odyssey', at: 20 } } })).status, 200);
    assert.deepEqual((await t.call('POST', '/me/history', { token: b.accessToken, body: { date: '2026-10-02' } })).data.reads, ['2026-10-02']);

    const aMe = (await t.call('GET', '/me', { token: a.accessToken })).data;
    const bMe = (await t.call('GET', '/me', { token: b.accessToken })).data;
    assert.equal(aMe.forgedPath.primary, 'warrior');
    assert.equal(bMe.forgedPath.primary, 'builder');
    assert.deepEqual((await t.call('GET', '/me/history', { token: a.accessToken })).data.reads, ['2026-10-01']);
    assert.deepEqual((await t.call('GET', '/me/history', { token: b.accessToken })).data.reads, ['2026-10-02']);
    assert.equal((await t.call('GET', '/questionnaire', { token: a.accessToken })).data.answers.emptychair, A.emptychair);
    assert.equal((await t.call('GET', '/questionnaire', { token: b.accessToken })).data.answers.emptychair, B.emptychair);
    assert.equal(t.store.user('alpha@example.com').answers.emptychair, A.emptychair);
    assert.equal(t.store.user('beta@example.com').answers.emptychair, B.emptychair);
    assert.notEqual(t.store.user('alpha@example.com'), t.store.user('beta@example.com'));
    assert.equal((await t.call('POST', '/me/history', { token: a.accessToken, body: { date: 'nope' } })).status, 400);
    assert.equal((await t.call('GET', '/me/history')).status, 401);
  } finally { await t.close(); }
});

test('signed-in account has free access while the paywall flag is off', async () => {
  const t = await start();
  try {
    const health = await t.call('GET', '/health');
    assert.equal(health.data.paywallEnabled, false);
    const { accessToken } = await t.signIn('free-tester@example.com');
    const me = (await t.call('GET', '/me', { token: accessToken })).data;
    assert.equal(me.entitled, true);
    assert.equal(me.entitledVia, 'testing');
    assert.equal(me.plan.status, 'none');
    assert.equal((await t.call('GET', '/questionnaire', { token: accessToken })).status, 200);
    assert.equal((await t.call('PUT', '/me/answers', { token: accessToken, body: { answers: A } })).status, 200);
    assert.equal((await t.call('GET', '/me/lesson', { token: accessToken })).status, 200);
    assert.equal((await t.call('PUT', '/sync', { token: accessToken, body: { forgedPath: { primary: 'faith', at: 3 } } })).status, 200);
  } finally { await t.close(); }
});

test('paywall on restores subscriber gating; history still belongs to the signed-in account', async () => {
  const t = await start({ env: { DW_PAYWALL_ENABLED: 'true' } });
  try {
    assert.equal((await t.call('GET', '/health')).data.paywallEnabled, true);
    const { accessToken } = await t.signIn('gated@example.com');
    const me = (await t.call('GET', '/me', { token: accessToken })).data;
    assert.equal(me.entitled, false);
    assert.equal(me.entitledVia, null);
    assert.equal((await t.call('GET', '/questionnaire', { token: accessToken })).status, 402);
    assert.equal((await t.call('PUT', '/me/answers', { token: accessToken, body: { answers: A } })).status, 402);
    assert.equal((await t.call('GET', '/me/lesson', { token: accessToken })).status, 402);
    assert.equal((await t.call('PUT', '/sync', { token: accessToken, body: { forgedPath: { primary: 'warrior', at: 1 } } })).status, 402);
    assert.deepEqual((await t.call('POST', '/me/history', { token: accessToken, body: { date: '2026-10-03' } })).data.reads, ['2026-10-03']);
    const other = await t.signIn('other-gated@example.com');
    assert.deepEqual((await t.call('GET', '/me/history', { token: other.accessToken })).data.reads, []);
    assert.deepEqual((await t.call('GET', '/me/history', { token: accessToken })).data.reads, ['2026-10-03']);
  } finally { await t.close(); }
});
