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
  assert.notEqual(picked.lesson.title, WarriorLesson.DEFAULT_LESSON.title);
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
  assert.notEqual(offline.lesson.title, WarriorLesson.DEFAULT_LESSON.title);
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

test('DEFAULT_LESSON content is unchanged Endure fallback', () => {
  assert.equal(WarriorLesson.DEFAULT_LESSON.date, '2026-09-04');
  assert.equal(WarriorLesson.DEFAULT_LESSON.title, 'Endure, O Heart');
  assert.match(WarriorLesson.DEFAULT_LESSON.source, /Odyssey/);
  assert.equal(WarriorLesson.DEFAULT_LESSON.image, './images/default-endure.jpg');
  assert.equal(WarriorLesson.DEFAULT_LESSON.fallback, './images/default-endure.jpg');
  assert.match(WarriorLesson.DEFAULT_LESSON.imageAlt, /Odysseus/);
});

test('live catalog latest lesson is Obstacle; offline keeps it instead of Endure', async () => {
  const liveCatalog = require('../lessons.json');
  const storage = memoryStorage();
  const online = await WarriorLesson.resolveLesson({
    fetchJson: async () => liveCatalog,
    storage,
    opts: {},
  });
  assert.equal(online.lesson.title, 'The Obstacle Becomes the Way');
  assert.equal(online.lesson.date, '2026-08-29');
  const offline = await WarriorLesson.resolveLesson({
    fetchJson: async () => { throw new Error('offline'); },
    storage,
    opts: {},
  });
  assert.equal(offline.source, 'last-rendered');
  assert.equal(offline.lesson.title, 'The Obstacle Becomes the Way');
  assert.notEqual(offline.lesson.title, WarriorLesson.DEFAULT_LESSON.title);
});
