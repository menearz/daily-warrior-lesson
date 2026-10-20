'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const DWAccount = require('../account-client.js');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
function outside(html) {
  return html.replace(/<template id="dw-app">[\s\S]*?<\/template>/, '');
}
function mem(init = {}) {
  const m = Object.assign({}, init);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
    key: (i) => Object.keys(m)[i] || null,
    get length() { return Object.keys(m).length; },
    clear() { Object.keys(m).forEach((k) => { delete m[k]; }); },
    _m: m,
  };
}
function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const { status, data } = await handler(url, init, calls.length);
    return { status, json: async () => data };
  };
  fn.calls = calls;
  return fn;
}
function el(tag) {
  return {
    tag, children: [], attrs: {}, style: {}, textContent: '', value: '', id: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(type, fn) { this._ev = this._ev || {}; (this._ev[type] = this._ev[type] || []).push(fn); },
    remove() { this.removed = true; },
  };
}
function textOf(node) {
  if (!node) return '';
  return (node.textContent || '') + (node.children || []).map(textOf).join(' ');
}
function docWith(gate, lesson) {
  const body = el('body');
  const tpl = { content: { cloneNode() { return lesson; } } };
  return {
    body,
    getElementById(id) {
      if (id === 'dw-gate') return gate && gate.removed ? null : gate;
      if (id === 'dw-app') return tpl;
      return null;
    },
    createElement: el,
  };
}

test('lesson pages keep titles, quotes, and body text out of the initial document', () => {
  for (const f of ['index.html', 'archive.html', 'forge.html']) {
    const html = read(f);
    const live = outside(html);
    assert.match(html, /id="dw-gate"/, f);
    assert.match(html, /<template id="dw-app">/, f);
    assert.match(html, /openWhenSignedIn/, f);
    assert.doesNotMatch(live, /id="quote"/, f);
    assert.doesNotMatch(live, /id="title"/, f);
    assert.doesNotMatch(live, /id="lesson"/, f);
    assert.doesNotMatch(live, /id="qText"/, f);
    assert.doesNotMatch(live, /id="list"/, f);
    assert.doesNotMatch(live, /king and the pawn/, f);
  }
  assert.match(read('account-client.js'), /Create an account/);
  assert.match(read('config.js'), /^window\.DW_PAYWALL_ENABLED = false;$/m);
  assert.doesNotMatch([read('index.html'), read('archive.html'), read('forge.html'), read('plans.html'), read('config.js'), read('account-client.js')].join('\n'), /coming soon/i);
});

test('signed-out visitor gets the create-account screen and no lesson node', async () => {
  const gate = el('div');
  const lesson = el('div');
  lesson.id = 'quote';
  lesson.textContent = 'Secret quote that must stay out of the document';
  const doc = docWith(gate, lesson);
  const dw = DWAccount.create({
    storage: mem(),
    fetch: fakeFetch(async () => ({ status: 401, data: { error: 'signed_out' } })),
    apiBase: 'https://api.test',
  });
  const ready = [];
  await DWAccount.openWhenSignedIn({ document: doc, client: dw, storage: mem(), onReady(me) { ready.push(me); } });
  assert.deepEqual(ready, []);
  assert.equal(doc.body.children.includes(lesson), false);
  assert.match(textOf(gate), /Create an account/);
  assert.equal(lesson.textContent.includes('Secret quote'), true);
  assert.equal(textOf(doc.body).includes('Secret quote'), false);
});

test('signed-in visitor mounts the lesson only after /me', async () => {
  const gate = el('div');
  const lesson = el('div');
  lesson.textContent = 'Today lesson body';
  const doc = docWith(gate, lesson);
  const storage = mem({ dw_auth: JSON.stringify({ accessToken: 'tok', refreshToken: 'r', exp: Date.now() + 600e3 }) });
  const dw = DWAccount.create({
    storage,
    fetch: fakeFetch(async () => ({ status: 200, data: { email: 'a@ex.co', entitled: true, entitledVia: 'testing', forgedPath: { primary: 'warrior', secondary: 'faith', at: 4 } } })),
    apiBase: 'https://api.test',
  });
  let seen = null;
  await DWAccount.openWhenSignedIn({ document: doc, client: dw, storage, onReady(me) { seen = me; } });
  assert.equal(seen.email, 'a@ex.co');
  assert.equal(seen.forgedPath.primary, 'warrior');
  assert.equal(gate.removed, true);
  assert.equal(doc.body.children.includes(lesson), true);
});

test('two accounts stay separate on the phone after sign-out and sign-in', async () => {
  const users = {
    'a@ex.co': { email: 'a@ex.co', entitled: true, entitledVia: 'testing', plan: { status: 'none' }, answers: { emptychair: 'alpha path' }, forgedPath: { primary: 'warrior', secondary: 'faith', at: 10 }, reads: ['2026-10-01'] },
    'b@ex.co': { email: 'b@ex.co', entitled: true, entitledVia: 'testing', plan: { status: 'none' }, answers: { emptychair: 'beta path' }, forgedPath: { primary: 'builder', secondary: 'odyssey', at: 20 }, reads: ['2026-10-02'] },
  };
  const sessions = { tokA: 'a@ex.co', tokB: 'b@ex.co' };
  const cacheStore = [{ url: 'https://api.test/me' }, { url: 'https://api.test/lessons.json' }];
  const caches = {
    keys: async () => ['warrior-lesson-v23'],
    open: async () => ({
      keys: async () => cacheStore.map((r) => ({ url: r.url })),
      delete: async (req) => {
        const i = cacheStore.findIndex((r) => r.url === req.url);
        if (i >= 0) cacheStore.splice(i, 1);
        return true;
      },
    }),
  };
  const fetchFn = fakeFetch(async (url, init) => {
    const path = url.replace('https://api.test', '');
    const token = String((init.headers && init.headers.Authorization) || '').replace('Bearer ', '');
    const who = sessions[token];
    const body = init && init.body ? JSON.parse(init.body) : {};
    if (path === '/auth/logout') return { status: 200, data: { ok: true } };
    if (path === '/auth/verify') {
      if (body.token !== 'linkB') return { status: 400, data: {} };
      return { status: 200, data: { accessToken: 'tokB', refreshToken: 'rB', expiresIn: 900, me: users['b@ex.co'] } };
    }
    if (!who) return { status: 401, data: { error: 'signed_out' } };
    const u = users[who];
    if (path === '/me') return { status: 200, data: u };
    if (path === '/me/history' && (!init.method || init.method === 'GET')) return { status: 200, data: { reads: u.reads.slice() } };
    if (path === '/me/history' && init.method === 'POST') {
      if (u.reads.indexOf(body.date) < 0) u.reads.push(body.date);
      return { status: 200, data: { reads: u.reads.slice() } };
    }
    if (path === '/questionnaire') return { status: 200, data: { questions: [], answers: u.answers } };
    if (path === '/me/answers') { u.answers = body.answers; return { status: 200, data: Object.assign({}, u) }; }
    if (path === '/sync') { if (body.forgedPath) u.forgedPath = body.forgedPath; return { status: 200, data: Object.assign({}, u) }; }
    return { status: 404, data: {} };
  });
  const storage = mem({
    dw_auth: JSON.stringify({ accessToken: 'tokA', refreshToken: 'rA', exp: Date.now() + 600e3 }),
    forged_path: JSON.stringify({ primary: 'warrior', at: 10 }),
    dw_reads: JSON.stringify(['2026-10-01']),
    dw_answers: JSON.stringify({ emptychair: 'alpha path' }),
    'dw-lang': 'en',
  });
  const session = mem({ scratch: 'a-secret' });
  const dw = DWAccount.create({ storage, sessionStorage: session, fetch: fetchFn, apiBase: 'https://api.test', caches });
  assert.equal((await dw.me()).data.forgedPath.primary, 'warrior');
  assert.deepEqual((await dw.history()).data.reads, ['2026-10-01']);
  assert.equal((await dw.questionnaire()).data.answers.emptychair, 'alpha path');
  await dw.signOut();
  assert.equal(storage.getItem('dw_auth'), null);
  assert.equal(storage.getItem('forged_path'), null);
  assert.equal(storage.getItem('dw_reads'), null);
  assert.equal(storage.getItem('dw_answers'), null);
  assert.equal(storage.getItem('dw-lang'), 'en');
  assert.equal(session.getItem('scratch'), null);
  assert.deepEqual(cacheStore.map((r) => r.url), ['https://api.test/lessons.json']);
  await dw.verify('linkB');
  const meB = await dw.me();
  assert.equal(meB.data.email, 'b@ex.co');
  assert.equal(meB.data.forgedPath.primary, 'builder');
  assert.equal((await dw.questionnaire()).data.answers.emptychair, 'beta path');
  assert.deepEqual((await dw.history()).data.reads, ['2026-10-02']);
  assert.equal(storage.getItem('forged_path'), null);
  assert.equal(users['a@ex.co'].forgedPath.primary, 'warrior');
  assert.deepEqual(users['a@ex.co'].reads, ['2026-10-01']);
  assert.equal(users['a@ex.co'].answers.emptychair, 'alpha path');
});

test('sign-up gate reuses the lesson palette, full-width controls, and the existing language chips', () => {
  for (const f of ['index.html', 'archive.html', 'forge.html']) {
    const html = read(f);
    assert.match(html, /#dw-gate[\s\S]*#ece6da/, f);
    assert.match(html, /#dw-gate input\[type="email"\] \{[\s\S]*width:100%/, f);
    assert.match(html, /#dw-gate button\[type="submit"\] \{[\s\S]*width:100%/, f);
    assert.match(html, /#dw-gate \.lang-chip\.active/, f);
    assert.match(html, /--accent:#FF6A1A/, f);
  }
});

test('a session token shows Loading… until /me returns, and not the sign-up form', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const gate = el('div');
  const lesson = el('div');
  const doc = docWith(gate, lesson);
  const storage = mem({ dw_auth: JSON.stringify({ accessToken: 'tok', refreshToken: 'r', exp: Date.now() + 600e3 }) });
  const dw = DWAccount.create({
    storage,
    fetch: () => pending.then((body) => ({ status: body.status, json: async () => body.data })),
    apiBase: 'https://api.test',
  });
  const ready = [];
  const done = DWAccount.openWhenSignedIn({ document: doc, client: dw, storage, onReady(me) { ready.push(me); } });
  assert.match(textOf(gate), /Loading…/);
  assert.doesNotMatch(textOf(gate), /Create an account/);
  assert.equal(doc.body.children.includes(lesson), false);
  release({ status: 200, data: { email: 'a@ex.co', entitled: true } });
  await done;
  assert.equal(ready.length, 1);
  assert.equal(gate.removed, true);
  assert.doesNotMatch(textOf(gate), /Create an account/);
});

test('sign-up form appears only after /me returns 401, not while it is pending', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const gate = el('div');
  const doc = docWith(gate, el('div'));
  const storage = mem({ dw_auth: JSON.stringify({ accessToken: 'tok', refreshToken: 'r', exp: Date.now() + 600e3 }) });
  const dw = DWAccount.create({
    storage,
    fetch: () => pending.then((body) => ({ status: body.status, json: async () => body.data })),
    apiBase: 'https://api.test',
  });
  const done = DWAccount.openWhenSignedIn({ document: doc, client: dw, storage });
  assert.doesNotMatch(textOf(gate), /Create an account/);
  assert.match(textOf(gate), /Loading…/);
  release({ status: 401, data: { error: 'signed_out' } });
  await done;
  assert.match(textOf(gate), /Create an account/);
  assert.equal(storage.getItem('dw_auth'), null);
});

test('a network error with a token does not show the sign-up form', async () => {
  const gate = el('div');
  const storage = mem({ dw_auth: JSON.stringify({ accessToken: 'tok', refreshToken: 'r', exp: Date.now() + 600e3 }), 'dw-lang': 'en' });
  const dw = DWAccount.create({
    storage,
    fetch: async () => { throw new Error('offline'); },
    apiBase: 'https://api.test',
  });
  await DWAccount.openWhenSignedIn({ document: docWith(gate, el('div')), client: dw, storage });
  assert.doesNotMatch(textOf(gate), /Create an account/);
  assert.match(textOf(gate), /couldn't connect/i);
  assert.equal(storage.getItem('dw_auth') != null, true);
});

test('a non-401 failure with a token does not show the sign-up form', async () => {
  const gate = el('div');
  const storage = mem({ dw_auth: JSON.stringify({ accessToken: 'tok', refreshToken: 'r', exp: Date.now() + 600e3 }) });
  const dw = DWAccount.create({
    storage,
    fetch: async () => ({ status: 500, json: async () => ({ error: 'down' }) }),
    apiBase: 'https://api.test',
  });
  await DWAccount.openWhenSignedIn({ document: docWith(gate, el('div')), client: dw, storage });
  assert.doesNotMatch(textOf(gate), /Create an account/);
  assert.match(textOf(gate), /couldn't connect/i);
});

test('Spanish gate loading uses the existing Cargando line', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const gate = el('div');
  const storage = mem({ dw_auth: JSON.stringify({ accessToken: 'tok', refreshToken: 'r', exp: Date.now() + 600e3 }), 'dw-lang': 'es' });
  const dw = DWAccount.create({
    storage,
    fetch: () => pending.then(() => ({ status: 200, json: async () => ({ email: 'a@ex.co' }) })),
    apiBase: 'https://api.test',
  });
  const done = DWAccount.openWhenSignedIn({ document: docWith(gate, el('div')), client: dw, storage });
  assert.match(textOf(gate), /Cargando…/);
  assert.doesNotMatch(textOf(gate), /Crea una cuenta/);
  release();
  await done;
});

function classBag() {
  const set = new Set();
  return { add(c) { set.add(c); }, contains(c) { return set.has(c); }, set };
}

test('sign-out clears Signed in as synchronously, before logout finishes', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const calls = [];
  const storage = mem({
    dw_auth: JSON.stringify({ accessToken: 'tok', refreshToken: 'ref', exp: Date.now() + 600e3 }),
    forged_path: JSON.stringify({ primary: 'warrior', at: 1 }),
    'dw-lang': 'en',
  });
  const who = { textContent: 'Signed in as a@ex.co', className: '' };
  const signedIn = { textContent: 'account body', className: '', classList: classBag() };
  const plan = { textContent: 'The Forge, Monthly.', className: '' };
  const nodes = {
    who,
    'signed-in': signedIn,
    'plan-line': plan,
    'sync-line': { textContent: 'saved', className: '' },
    confirm: { textContent: '', className: '', classList: classBag() },
    'tester-badge': { textContent: 'Tester', className: '', classList: classBag() },
    'confirm-body': { textContent: 'forged', className: '' },
    'pf-msg': { textContent: 'Saved.', className: '' },
  };
  const doc = { getElementById(id) { return nodes[id] || null; } };
  const dw = DWAccount.create({
    storage,
    fetch: (url, init) => {
      calls.push({ url, init });
      return pending.then(() => ({ status: 200, json: async () => ({ ok: true }) }));
    },
    apiBase: 'https://api.test',
  });
  const html = read('account.html');
  const handler = html.slice(html.indexOf('getElementById("signout").onclick'));
  assert.ok(handler.indexOf('clearSignedInUi(document)') < handler.indexOf('DW.signOut()'));
  DWAccount.clearSignedInUi(doc);
  const out = dw.signOut();
  assert.equal(who.textContent, '');
  assert.equal(plan.textContent, '');
  assert.equal(signedIn.classList.contains('hidden'), true);
  assert.match(String(signedIn.className), /hidden/);
  assert.equal(storage.getItem('dw_auth'), null);
  assert.equal(storage.getItem('forged_path'), null);
  assert.equal(storage.getItem('dw-lang'), 'en');
  assert.equal(calls.length, 1);
  assert.match(calls[0].init.body, /"refreshToken":"ref"/);
  assert.match(calls[0].init.headers.Authorization, /Bearer tok/);
  release();
  await out;
});

test('paywall flag off hides subscribe entry points', () => {
  const offers = { hidden: false };
  const included = { hidden: true };
  const document = {
    readyState: 'complete',
    body: { hasAttribute: () => false },
    documentElement: { classList: { toggle() {} } },
    querySelectorAll(s) {
      if (s === '[data-paywall-entry]') return [offers];
      if (s === '[data-paywall-off]') return [included];
      return [];
    },
    createElement() { return { style: {}, children: [], setAttribute() {}, appendChild() {} }; },
    addEventListener() {},
  };
  vm.runInNewContext(read('config.js'), { window: {}, document, localStorage: { getItem: () => null } });
  assert.equal(offers.hidden, true);
  assert.equal(included.hidden, false);
  assert.match(read('plans.html'), /data-paywall-entry hidden/);
  assert.match(read('plans.html'), /data-k="included"/);
  assert.match(read('plans.html'), /window\.DW_PAYWALL_ENABLED !== true/);
});
