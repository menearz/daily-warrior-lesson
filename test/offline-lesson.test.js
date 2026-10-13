'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const WarriorLesson = require('../lesson.js');

function memoryStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    _data: data,
  };
}

const catalog = {
  lessons: [
    {
      date: '2026-08-28',
      title: 'The Battle Is the Lord\'s',
    },
    {
      date: '2026-08-29',
      title: 'The Obstacle Becomes the Way',
    },
  ],
};

test('pickDailyLesson uses latest catalog date, not DEFAULT_LESSON', () => {
  const picked = WarriorLesson.pickDailyLesson(catalog.lessons, {});
  assert.equal(picked.lesson.title, 'The Obstacle Becomes the Way');
  assert.equal(picked.lesson.date, '2026-08-29');
  assert.notEqual(picked.lesson.date, WarriorLesson.DEFAULT_LESSON.date);
});

test('pickDailyLesson uses DEFAULT_LESSON only when catalog is empty', () => {
  const picked = WarriorLesson.pickDailyLesson([], {});
  assert.equal(picked.lesson.title, WarriorLesson.DEFAULT_LESSON.title);
  assert.equal(picked.lesson.date, WarriorLesson.DEFAULT_LESSON.date);
});

test('resolveLesson persists last rendered payload after a successful fetch', async () => {
  const storage = memoryStorage();
  const result = await WarriorLesson.resolveLesson({
    fetchJson: async () => catalog,
    storage,
    opts: {},
  });
  assert.equal(result.source, 'network');
  assert.equal(result.lesson.title, 'The Obstacle Becomes the Way');
  const last = WarriorLesson.readLastRendered(storage);
  assert.ok(last);
  assert.equal(last.lesson.title, 'The Obstacle Becomes the Way');
  const savedCatalog = WarriorLesson.readLastLessons(storage);
  assert.equal(savedCatalog.lessons.length, 2);
});

test('resolveLesson serves last rendered lesson when fetch fails', async () => {
  const storage = memoryStorage();
  await WarriorLesson.resolveLesson({
    fetchJson: async () => catalog,
    storage,
    opts: {},
  });
  const offline = await WarriorLesson.resolveLesson({
    fetchJson: async () => {
      throw new Error('offline');
    },
    storage,
    opts: {},
  });
  assert.equal(offline.source, 'last-rendered');
  assert.equal(offline.lesson.title, 'The Obstacle Becomes the Way');
  assert.equal(offline.lesson.date, '2026-08-29');
  assert.notEqual(offline.lesson.date, WarriorLesson.DEFAULT_LESSON.date);
});

test('resolveLesson uses DEFAULT_LESSON only on first-visit empty cache', async () => {
  const storage = memoryStorage();
  const result = await WarriorLesson.resolveLesson({
    fetchJson: async () => {
      throw new Error('offline');
    },
    storage,
    opts: {},
  });
  assert.equal(result.source, 'default');
  assert.equal(result.lesson.title, WarriorLesson.DEFAULT_LESSON.title);
});

test('DEFAULT_LESSON is the newest catalog lesson, with Spanish fields', () => {
  const liveCatalog = require('../lessons.json');
  const latest = liveCatalog.lessons.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  assert.equal(WarriorLesson.DEFAULT_LESSON.date, latest.date);
  assert.equal(WarriorLesson.DEFAULT_LESSON.title, latest.title);
  for (const k of ['title_es', 'quote_es', 'lesson_es', 'today_es']) assert.ok(WarriorLesson.DEFAULT_LESSON[k]);
  assert.match(WarriorLesson.DEFAULT_LESSON.fallback, /^\.\/images\/.+\.jpg$/);
});

test('live catalog latest lesson renders online; offline keeps last-rendered', async () => {
  const liveCatalog = require('../lessons.json');
  const latest = liveCatalog.lessons.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  const storage = memoryStorage();
  const online = await WarriorLesson.resolveLesson({ fetchJson: async () => liveCatalog, storage, opts: {} });
  assert.equal(online.lesson.date, latest.date);
  assert.equal(online.lesson.title, latest.title);
  const offline = await WarriorLesson.resolveLesson({
    fetchJson: async () => { throw new Error('offline'); },
    storage,
    opts: {},
  });
  assert.equal(offline.source, 'last-rendered');
  assert.equal(offline.lesson.date, latest.date);
  assert.equal(offline.lesson.quote_es, latest.quote_es);
});

test('catalog keeps Sun Tzu lessons with required fields and the cited Giles translation', () => {
  const liveCatalog = require('../lessons.json');
  const suntzu = liveCatalog.lessons.filter((l) => /Sun Tzu/i.test(l.source));
  assert.ok(suntzu.length >= 2, 'at least two Sun Tzu lessons');
  assert.ok(suntzu.every((l) => /Lionel Giles/i.test(l.source)));
  const quotes = liveCatalog.lessons.map((l) => l.quote);
  assert.ok(quotes.includes('All warfare is based on deception.'));
  assert.ok(quotes.includes('Hence to fight and conquer in all your battles is not supreme excellence; supreme excellence consists in breaking the enemy\'s resistance without fighting.'));
});
