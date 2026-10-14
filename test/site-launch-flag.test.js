'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CONFIG = read('config.js');

// Minimal DOM stub: enough for config.js's gate.
function runConfig({ open, accountPage, lang = 'en' }) {
  const entries = [{ hidden: true }, { hidden: true }];
  const body = { children: ['original'], set textContent(v) { this.children = []; },
    hasAttribute: (n) => n === 'data-account-page' && accountPage, appendChild(c) { this.children.push(c); } };
  const el = () => ({ style: {}, children: [], setAttribute() {}, appendChild(c) { this.children.push(c); } });
  const classes = new Set();
  const document = { readyState: 'complete', body, documentElement: { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) } },
    querySelectorAll: (s) => (s === '[data-account-entry]' ? entries : []), createElement: el, addEventListener() {} };
  const window = {};
  const src = open ? CONFIG.replace('window.DW_ACCOUNTS_OPEN = false;', 'window.DW_ACCOUNTS_OPEN = true;') : CONFIG;
  vm.runInNewContext(src, { window, document, localStorage: { getItem: () => (lang === 'es' ? 'es' : null) } });
  return { window, entries, body, classes };
}

test('site launch flag is one switch and defaults OFF', () => {
  assert.equal((CONFIG.match(/^window\.DW_ACCOUNTS_OPEN = (true|false);$/gm) || []).length, 1);
  assert.match(CONFIG, /^window\.DW_ACCOUNTS_OPEN = false;$/m);
});

test('flag OFF: entry points hidden; account pages show only the not-open notice', () => {
  const r = runConfig({ open: false, accountPage: false });
  assert.ok(r.entries.every((e) => e.hidden === true));
  assert.equal(r.body.children[0], 'original');
  const p = runConfig({ open: false, accountPage: true, lang: 'es' });
  assert.equal(p.body.children.length, 1);
  assert.equal(p.body.children[0].children[0].textContent, p.window.DW_NOT_OPEN_NOTICE.es);
  assert.ok(!p.classes.has('dw-accounts-open'));
});

test('flag ON: entry points shown; account pages untouched', () => {
  const r = runConfig({ open: true, accountPage: true });
  assert.ok(r.entries.every((e) => e.hidden === false));
  assert.equal(r.body.children[0], 'original');
  assert.ok(r.classes.has('dw-accounts-open'));
});

test('markup fails closed: every entry link is marked and hidden by default', () => {
  for (const f of ['index.html', 'forge.html']) {
    const s = read(f);
    assert.match(s, /<script src="config\.js"><\/script>\n<\/head>/, f);
    const links = s.match(/<[^>]*href="\.\/(signin|plans|account)\.html"[^>]*>/g) || [];
    for (const tag of links) {
      const owner = s.slice(Math.max(0, s.lastIndexOf('<p', s.indexOf(tag))), s.indexOf(tag) + tag.length);
      assert.ok(/data-account-entry hidden/.test(tag) || /<p data-account-entry hidden/.test(owner), `${f}: ${tag}`);
    }
  }
  for (const f of ['signin.html', 'plans.html', 'account.html']) {
    const s = read(f);
    assert.match(s, /<body data-account-page>/, f);
    assert.match(s, /<script src="config\.js"><\/script>\n<style>html:not\(\.dw-accounts-open\) body\[data-account-page\] \.wrap\{display:none\}<\/style>\n<\/head>/, f);
  }
});

test('flag OFF: account client makes no network calls', async () => {
  global.window = { DW_ACCOUNTS_OPEN: false };
  delete require.cache[require.resolve('../account-client.js')];
  const DWA = require('../account-client.js');
  let calls = 0;
  const dw = DWA.create({ storage: { getItem: () => null, setItem() {}, removeItem() {} }, fetch: () => { calls++; return Promise.resolve({ status: 200, json: async () => ({}) }); }, apiBase: 'http://x' });
  await assert.rejects(dw.legal(), /accounts_not_open/);
  assert.equal(calls, 0);
  delete global.window;
});
