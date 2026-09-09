'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

test('every catalog lesson has required keys, valid date, and non-empty lanes', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'lessons.json'), 'utf8'));
  assert.ok(Array.isArray(catalog.lessons) && catalog.lessons.length > 0);
  for (const lesson of catalog.lessons) {
    for (const key of REQUIRED) {
      assert.ok(lesson[key] != null && lesson[key] !== '', `${lesson.date || '?'} missing ${key}`);
    }
    assert.match(lesson.date, DATE_RE, `bad date ${lesson.date}`);
    assert.ok(Array.isArray(lesson.lanes) && lesson.lanes.length > 0, `${lesson.date} lanes empty`);
    assert.ok(lesson.lanes.every((l) => typeof l === 'string' && l.length > 0));
  }
});

test('catalog dates are unique', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'lessons.json'), 'utf8'));
  const dates = catalog.lessons.map((l) => l.date);
  assert.equal(new Set(dates).size, dates.length, 'duplicate dates in lessons.json');
});

test('every catalog image and fallback file exists on disk', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'lessons.json'), 'utf8'));
  for (const lesson of catalog.lessons) {
    for (const key of ['image', 'fallback']) {
      const rel = String(lesson[key]).replace(/^\.\//, '');
      assert.ok(fs.existsSync(path.join(root, rel)), `${lesson.date} ${key} missing file ${rel}`);
    }
  }
});

test('archive.html loads catalog from lessons.json (no hard-coded lesson list)', () => {
  const html = fs.readFileSync(path.join(root, 'archive.html'), 'utf8');
  assert.match(html, /fetch\(\s*['"]lessons\.json['"]\s*\)/);
  assert.doesNotMatch(html, /const\s+HARDCODED|hardCodedLessons|staticLessons\s*=/);
  assert.match(html, /data\.lessons/);
});
