'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('index.html fetches lessons.json without a Date.now cache buster', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /lessons\.json\?v=/);
  assert.doesNotMatch(html, /lessons\.json['"]\s*\+\s*Date\.now/);
  assert.match(html, /lesson\.js/);
});

test('archive.html fetches lessons.json without a Date.now cache buster', () => {
  const html = fs.readFileSync(path.join(root, 'archive.html'), 'utf8');
  assert.doesNotMatch(html, /lessons\.json\?v=/);
  assert.doesNotMatch(html, /Date\.now\(\)/);
});

test('index.html does not unregister service workers on every load', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /getRegistrations\s*\(/);
  assert.doesNotMatch(html, /\.unregister\s*\(/);
});

test('index.html does not delete all caches on every page load', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /caches\.keys\s*\(/);
  assert.doesNotMatch(html, /caches\.delete\s*\(/);
});

test('index.html registers the service worker without wiping storage first', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /serviceWorker\.register\s*\(\s*['"]\.\/sw\.js['"]\s*\)/);
});

test('service worker precaches lessons.json', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /lessons\.json/);
  assert.match(sw, /addAll\s*\(/);
  assert.match(sw, /warrior-lesson-v(?!8\b)\d+/);
});
