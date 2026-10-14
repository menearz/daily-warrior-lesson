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

const IDEA = 'https://docs.google.com/forms/d/e/1FAIpQLSehRZ6PBTylJ9W8Df3mB_wS1d0FKaV75jPN9qfPAJFyz1kfkw/viewform';
function runIdea(url, open = false) {
  const link = { hidden: true, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
  const document = { readyState: 'complete', body: { hasAttribute: () => false },
    documentElement: { classList: { toggle() {} } },
    querySelectorAll: (s) => (s === '[data-idea-link]' ? [link] : []), createElement() {}, addEventListener() {} };
  let src = url === null ? CONFIG : CONFIG.replace(/^window\.DW_IDEA_FORM_URL = .*;$/m, `window.DW_IDEA_FORM_URL = ${JSON.stringify(url)};`);
  if (open) src = src.replace('window.DW_ACCOUNTS_OPEN = false;', 'window.DW_ACCOUNTS_OPEN = true;');
  vm.runInNewContext(src, { window: {}, document, localStorage: { getItem: () => null } });
  return link;
}

test('idea form link: unset shows nothing (no placeholder href)', () => {
  const l = runIdea('');
  assert.equal(l.hidden, true);
  assert.equal(l.attrs.href, undefined);
  assert.match(read('index.html'), /<a class="archive" data-idea-link hidden data-i18n="ideaNav">/);
  assert.doesNotMatch(read('index.html'), /data-idea-link[^>]*href=/);
  assert.equal(runIdea('javascript:alert(1)').hidden, true);
});

test('idea form link: configured URL shows with accounts flag OFF and ON, new tab + noopener', () => {
  assert.ok(CONFIG.includes("window.DW_IDEA_FORM_URL = '" + IDEA + "';"));
  for (const open of [false, true]) {
    const l = runIdea(null, open);
    assert.equal(l.hidden, false, 'open=' + open);
    assert.equal(l.attrs.href, IDEA);
    assert.equal(l.attrs.target, '_blank');
    assert.equal(l.attrs.rel, 'noopener');
  }
  const WL = require('../lesson.js');
  assert.equal(WL.STRINGS.en.ideaNav, 'Send an idea →');
  assert.equal(WL.STRINGS.es.ideaNav, 'Envía una idea →');
});

test('no arbiterresearch.net email address anywhere in DW pages or copy', () => {
  const { execFileSync } = require('node:child_process');
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter((f) => f && !/node_modules|package-lock/.test(f) && /\.(html|js|json|md|txt|example|template|webmanifest)$/.test(f));
  const hits = files.filter((f) => /[A-Za-z0-9._%+-]+@([a-z0-9-]+\.)*arbiterresearch\.net/i.test(read(f)));
  assert.deepEqual(hits, []);
});

test('account delete ends paid access the same day: privacy and refund copy agree', () => {
  const p = read('privacy.html');
  assert.match(p, /Your paid access to The Forge ends that same day/);
  assert.match(p, /Tu acceso pagado a La Forja termina ese mismo día/);
  const DWA = require('../account-client.js');
  const pol = DWA.REFUND['webcopy-2026-10-13'];
  assert.ok(pol.en.items.includes('If you delete your account, your plan stops right away, and so does your access to The Forge.'));
  assert.ok(pol.es.items.includes('Si borras tu cuenta, tu plan termina en ese momento, y también tu acceso a La Forja.'));
});
