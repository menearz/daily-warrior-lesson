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

test('every catalog image and fallback file exists on disk', () => {
  const catalog = loadCatalog();
  for (const lesson of catalog.lessons) {
    for (const key of ['image', 'fallback']) {
      const rel = String(lesson[key]).replace(/^\.\//, '');
      assert.ok(fs.existsSync(path.join(root, rel)), `${lesson.date} ${key} missing file ${rel}`);
    }
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

test('oldest archive entries keep Forge lanes so aimed feed can select them', () => {
  const catalog = loadCatalog();
  const byDate = Object.fromEntries(catalog.lessons.map((lesson) => [lesson.date, lesson]));
  assert.deepEqual(byDate['2026-08-29'].lanes, ['thinker', 'warrior']);
  assert.deepEqual(byDate['2026-08-28'].lanes, ['faith', 'warrior']);
});
