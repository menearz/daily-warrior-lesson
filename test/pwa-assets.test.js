'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function extractPrecache(swSource) {
  const match = swSource.match(/const PRECACHE = (\[[\s\S]*?\]);/);
  assert.ok(match, 'PRECACHE array is present');
  return vm.runInNewContext(match[1]);
}

test('manifest.json lists 192 any, 512 any, 512 maskable, svg any', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.deepEqual(manifest.icons, [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ]);
});

test('icon-192.png and icon-512.png exist as PNG files', () => {
  for (const name of ['icon-192.png', 'icon-512.png']) {
    const buf = fs.readFileSync(path.join(root, name));
    assert.ok(buf.length > 32, `${name} is not empty`);
    assert.ok(buf.subarray(0, 8).equals(PNG_MAGIC), `${name} is a PNG`);
  }
});

test('hero image files exist as JPEGs', () => {
  for (const name of ['images/2026-08-29.jpg', 'images/2026-08-28.jpg', 'images/default-endure.jpg']) {
    const buf = fs.readFileSync(path.join(root, name));
    assert.ok(buf.length > 32, `${name} is not empty`);
    assert.ok(buf.subarray(0, 3).equals(JPEG_MAGIC), `${name} is a JPEG`);
  }
});

test('lessons.json image and fallback are same-origin dated files', () => {
  const catalog = JSON.parse(read('lessons.json'));
  assert.ok(Array.isArray(catalog.lessons) && catalog.lessons.length > 0);
  for (const lesson of catalog.lessons) {
    const expected = `./images/${lesson.date}.jpg`;
    assert.equal(lesson.image, expected);
    assert.equal(lesson.fallback, expected);
    assert.ok(lesson.imageAlt && lesson.imageAlt.length > 0);
    assert.ok(fs.existsSync(path.join(root, lesson.image.replace(/^\.\//, ''))));
    assert.doesNotMatch(lesson.image, /upload\.wikimedia\.org/);
    assert.doesNotMatch(lesson.fallback, /upload\.wikimedia\.org/);
  }
});

test('service worker CACHE is past v9 and PRECACHE includes shell, icons, and images', () => {
  const sw = read('sw.js');
  assert.match(sw, /const CACHE = ["']warrior-lesson-v(?![89]\b)\d+["']/);
  const precache = extractPrecache(sw);
  const required = [
    './',
    './index.html',
    './manifest.json',
    './sw.js',
    './icon-192.png',
    './icon-512.png',
    './icon.svg',
    './lessons.json',
    './images/2026-08-29.jpg',
    './images/2026-08-28.jpg',
    './images/default-endure.jpg',
  ];
  for (const item of required) {
    assert.ok(precache.includes(item), `PRECACHE missing ${item}`);
  }
});

test('service worker uses cache-first for images/ and network-first for HTML', () => {
  const sw = read('sw.js');
  const fetchIdx = sw.indexOf('self.addEventListener("fetch"');
  assert.ok(fetchIdx > 0);
  const fetchBody = sw.slice(fetchIdx);

  const htmlIdx = fetchBody.search(/isHtmlRequest|mode === ["']navigate["']/);
  const lessonsIdx = fetchBody.indexOf('isLessonsRequest');
  const imagesIdx = fetchBody.search(/isImageRequest|\/images\//);
  assert.ok(htmlIdx >= 0, 'HTML fetch branch exists');
  assert.ok(imagesIdx >= 0, 'images/ fetch branch exists');
  assert.ok(lessonsIdx >= 0, 'lessons.json fetch branch exists');
  assert.ok(htmlIdx < imagesIdx, 'HTML branch is evaluated before images');

  const htmlBranch = fetchBody.slice(htmlIdx, imagesIdx > htmlIdx ? imagesIdx : undefined);
  assert.match(htmlBranch, /fetch\s*\(\s*req\s*\)/);
  assert.match(htmlBranch, /\.catch\s*\(/);
  assert.match(htmlBranch, /caches\.match/);

  const imagesBranch = fetchBody.slice(imagesIdx);
  const matchIdx = imagesBranch.search(/caches\.match\s*\(\s*req\s*\)/);
  const netIdx = imagesBranch.search(/fetch\s*\(\s*req\s*\)/);
  assert.ok(matchIdx >= 0, 'images branch cache-matches');
  assert.ok(netIdx >= 0, 'images branch can still fetch');
  assert.ok(matchIdx < netIdx, 'images/ is cache-first');
});

test('service worker keeps PR #3 lessons.json network-first dual cache', () => {
  const sw = read('sw.js');
  assert.match(sw, /c\.put\s*\(\s*req\s*,\s*copy\s*\)/);
  assert.match(sw, /c\.put\s*\(\s*new Request\s*\(\s*["']\.\/lessons\.json["']\s*\)\s*,\s*stable\s*\)/);
  assert.match(sw, /caches\.match\s*\(\s*["']\.\/lessons\.json["']\s*\)/);
});
