'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const DWAccount = require('../account-client.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'account.html'), 'utf8');

test('profile form has themes, language, delivery time, zone and a save button', () => {
  for (const id of ['profile-form', 'pf-themes', 'pf-lang', 'pf-time', 'pf-zone', 'pf-msg']) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(html, /<input type="time" id="pf-time"/);
  assert.match(html, /<option value="en">English<\/option><option value="es">Español<\/option>/);
  assert.match(html, /DW\.saveProfile\(body\)/); assert.match(html, /DW\.profile\(\)/);
});

test('phone-friendly: viewport meta, 44px+ tap targets, 16px inputs (no iOS zoom), one column under 380px', () => {
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1/);
  assert.match(html, /\.pf \.themes label \{[^}]*min-height:44px/);
  assert.match(html, /\.pf select, \.pf input\[type=time\] \{[^}]*font-size:16px[^}]*min-height:44px|\.pf select, \.pf input\[type=time\] \{[^}]*min-height:44px[^}]*font-size:16px/);
  assert.match(html, /@media \(max-width:380px\) \{ \.pf \.themes \{ grid-template-columns:1fr; \}/);
});

test('validateProfile mirrors the API rules', () => {
  const ok = { themes: ['warrior', 'faith'], lang: 'en', deliveryTime: '06:40', timezone: 'America/Chicago' };
  assert.equal(DWAccount.validateProfile(ok), null);
  assert.equal(DWAccount.validateProfile({ ...ok, themes: [] }), null);
  assert.equal(DWAccount.validateProfile({ ...ok, themes: ['warrior', 'faith', 'power', 'builder'] }), 'tooMany');
  assert.equal(DWAccount.validateProfile({ ...ok, themes: ['ninja'] }), 'tooMany');
  assert.equal(DWAccount.validateProfile({ ...ok, deliveryTime: '24:00' }), 'badTime');
  assert.equal(DWAccount.validateProfile({ ...ok, timezone: 'Mars/Base' }), 'badZone');
  assert.ok(DWAccount.timezones().includes('America/Chicago'));
  assert.deepEqual(DWAccount.LANES, require('../scripts/lesson-schema').LANES);
});

test('every profile string exists in English and Spanish', () => {
  const en = Object.keys(DWAccount.PROFILE_T.en).sort();
  assert.deepEqual(Object.keys(DWAccount.PROFILE_T.es).sort(), en);
  for (const m of html.matchAll(/data-pk="(\w+)"/g)) assert.ok(en.includes(m[1]), m[1]);
});

test('saveProfile sends PUT /me/profile with the bearer token', async () => {
  const store = {}; const s = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
  s.setItem('dw_auth', JSON.stringify({ accessToken: 'tok', refreshToken: 'r', exp: Date.now() + 600e3 }));
  const calls = [];
  const dw = DWAccount.create({ storage: s, apiBase: 'https://api.test', fetch: async (url, init) => { calls.push({ url, init }); return { status: 200, json: async () => ({ themes: ['faith'] }) }; } });
  const r = await dw.saveProfile({ themes: ['faith'], lang: 'en', deliveryTime: '06:40', timezone: 'America/Chicago' });
  assert.equal(r.status, 200);
  assert.equal(calls[0].url, 'https://api.test/me/profile'); assert.equal(calls[0].init.method, 'PUT');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(calls[0].init.body).themes, ['faith']);
});
