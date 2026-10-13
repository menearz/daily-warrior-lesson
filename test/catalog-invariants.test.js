'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const WarriorLesson = require('../lesson.js');

const root = path.join(__dirname, '..');
const REQUIRED = [
  'date',
  'title',
  'image',
  'imageAlt',
  'fallback',
  'source',
  'quote',
  'lesson',
  'today',
  'lanes',
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KNOWN_LANES = new Set(['warrior', 'thinker', 'builder', 'power', 'faith', 'odyssey']);

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function loadCatalog() {
  return JSON.parse(read('lessons.json'));
}

function isIsoDate(value) {
  if (!DATE_RE.test(value)) return false;
  const stamp = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(stamp.getTime()) && stamp.toISOString().slice(0, 10) === value;
}

function markupBeforeScripts(html) {
  return html.split(/<script\b/i)[0];
}

test('every catalog lesson has required keys, valid ISO date, and known lanes', () => {
  const catalog = loadCatalog();
  assert.ok(Array.isArray(catalog.lessons) && catalog.lessons.length > 0);
  for (const lesson of catalog.lessons) {
    const label = lesson.date || lesson.title || '?';
    for (const key of REQUIRED) {
      assert.ok(lesson[key] != null && lesson[key] !== '', `${label} missing ${key}`);
    }
    assert.ok(isIsoDate(lesson.date), `bad date ${lesson.date}`);
    assert.ok(Array.isArray(lesson.lanes) && lesson.lanes.length > 0, `${label} lanes empty`);
    assert.ok(
      lesson.lanes.every((lane) => typeof lane === 'string' && KNOWN_LANES.has(lane)),
      `${label} has unknown lane`
    );
  }
});

test('catalog dates are unique', () => {
  const catalog = loadCatalog();
  const dates = catalog.lessons.map((l) => l.date);
  assert.equal(new Set(dates).size, dates.length, 'duplicate dates in lessons.json');
});

test('every catalog image is same-origin on disk or https Wikimedia, and every fallback is a local file', () => {
  const catalog = loadCatalog();
  for (const lesson of catalog.lessons) {
    const img = String(lesson.image);
    if (/^https:\/\//.test(img)) {
      assert.match(img, /^https:\/\/(upload\.wikimedia\.org|commons\.wikimedia\.org|menearz\.github\.io\/daily-warrior-lesson\/images\/)/, `${lesson.date} image host`);
    } else {
      assert.ok(fs.existsSync(path.join(root, img.replace(/^\.\//, ''))), `${lesson.date} image missing file ${img}`);
    }
    assert.match(lesson.fallback, /^\.\/images\/[\w-]+\.jpg$/, `${lesson.date} fallback is local`);
    assert.ok(fs.existsSync(path.join(root, lesson.fallback.replace(/^\.\//, ''))), `${lesson.date} fallback missing`);
  }
});

test('archive.html loads catalog from lessons.json (no hard-coded lesson list)', () => {
  const html = read('archive.html');
  const markup = markupBeforeScripts(html);
  const catalog = loadCatalog();

  assert.match(html, /fetch\(\s*['"]lessons\.json['"]\s*\)/);
  assert.doesNotMatch(html, /const\s+HARDCODED|hardCodedLessons|staticLessons\s*=/);
  assert.match(html, /data\.lessons/);
  assert.match(html, /id="list"/);
  assert.match(html, /serviceWorker\.register\s*\(\s*['"]\.\/sw\.js['"]\s*\)/);

  for (const lesson of catalog.lessons) {
    assert.equal(markup.includes(lesson.title), false, `archive markup hard-codes title ${lesson.title}`);
    assert.equal(markup.includes(lesson.date), false, `archive markup hard-codes date ${lesson.date}`);
  }
});

test('index.html injects catalog fields into the expected briefing nodes', () => {
  const html = read('index.html');
  for (const id of ['date', 'title', 'art', 'source', 'quote', 'lesson', 'today', 'aimed']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /getElementById\('title'\)\.textContent = LESSON\.title/);
  assert.match(html, /getElementById\('source'\)\.textContent = LESSON\.source/);
  assert.match(html, /getElementById\('quote'\)\.textContent = LESSON\.quote/);
  assert.match(html, /getElementById\('lesson'\)\.textContent = LESSON\.lesson/);
  assert.match(html, /LESSON\.today/);
  assert.match(html, /WarriorLesson\.resolveLesson/);
});

test('DEFAULT_LESSON matches the latest catalog entry for offline hydrate', () => {
  const catalog = loadCatalog();
  const latest = catalog.lessons.slice().sort(function (a, b) {
    return (b.date || '').localeCompare(a.date || '');
  })[0];
  assert.deepEqual(WarriorLesson.DEFAULT_LESSON, latest);
});

test('lanes reflect content: every lane has at least 6 lessons and warrior is not on everything', () => {
  const catalog = loadCatalog();
  const counts = Object.fromEntries([...KNOWN_LANES].map((l) => [l, 0]));
  for (const lesson of catalog.lessons) for (const lane of lesson.lanes) counts[lane] += 1;
  for (const lane of KNOWN_LANES) assert.ok(counts[lane] >= 6, `${lane} has only ${counts[lane]} lessons`);
  assert.ok(counts.warrior < catalog.lessons.length * 0.6, 'warrior is tagged on too many lessons');
  assert.ok(catalog.lessons.length >= 60, 'library has at least 60 lessons');
});
