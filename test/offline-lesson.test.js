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

test('DEFAULT_LESSON is 2026-09-09 Musashi with same-origin images', () => {
  assert.equal(WarriorLesson.DEFAULT_LESSON.date, '2026-09-09');
  assert.equal(WarriorLesson.DEFAULT_LESSON.title, 'Do Nothing of No Use');
  assert.match(WarriorLesson.DEFAULT_LESSON.source, /Miyamoto Musashi/);
  assert.equal(WarriorLesson.DEFAULT_LESSON.image, './images/2026-09-09.jpg');
  assert.equal(WarriorLesson.DEFAULT_LESSON.fallback, './images/2026-09-09.jpg');
  assert.match(WarriorLesson.DEFAULT_LESSON.imageAlt, /Kuniyoshi/);
  assert.deepEqual(WarriorLesson.DEFAULT_LESSON.lanes, ['warrior', 'thinker']);
});

test('live catalog latest lesson is Musashi; offline keeps last-rendered', async () => {
  const liveCatalog = require('../lessons.json');
  const storage = memoryStorage();
  const online = await WarriorLesson.resolveLesson({
    fetchJson: async () => liveCatalog,
    storage,
    opts: {},
  });
  assert.equal(online.lesson.title, 'Do Nothing of No Use');
  assert.equal(online.lesson.date, '2026-09-09');
  assert.equal(online.lesson.image, './images/2026-09-09.jpg');
  const offline = await WarriorLesson.resolveLesson({
    fetchJson: async () => { throw new Error('offline'); },
    storage,
    opts: {},
  });
  assert.equal(offline.source, 'last-rendered');
  assert.equal(offline.lesson.title, 'Do Nothing of No Use');
  assert.equal(offline.lesson.date, '2026-09-09');
  assert.equal(offline.lesson.image, './images/2026-09-09.jpg');
});

test('catalog adds Musashi and Sun Tzu with required fields and cited translations', () => {
  const liveCatalog = require('../lessons.json');
  const required = ['date', 'title', 'image', 'imageAlt', 'fallback', 'source', 'quote', 'lesson', 'today', 'lanes'];
  for (const lesson of liveCatalog.lessons) {
    for (const key of required) {
      assert.ok(lesson[key], `${lesson.date || lesson.title} missing ${key}`);
    }
    assert.ok(Array.isArray(lesson.lanes) && lesson.lanes.length > 0, `${lesson.date} missing lanes`);
  }
  const musashi = liveCatalog.lessons.filter((l) => /Musashi/i.test(l.source));
  const suntzu = liveCatalog.lessons.filter((l) => /Sun Tzu/i.test(l.source));
  assert.ok(musashi.length >= 2, 'at least two Musashi lessons');
  assert.ok(suntzu.length >= 2, 'at least two Sun Tzu lessons');
  for (const lesson of musashi.concat(suntzu)) {
    assert.ok(Array.isArray(lesson.lanes) && lesson.lanes.length > 0, `${lesson.date} missing lanes`);
    assert.ok(lesson.lanes.includes('warrior'));
  }
  const quotes = liveCatalog.lessons.map((l) => l.quote);
  assert.ok(quotes.includes('Do nothing which is of no use.'));
  assert.ok(quotes.includes('In strategy it is important to see distant things as if they were close and to take a distanced view of close things.'));
  assert.ok(quotes.includes('If you know the enemy and know yourself, you need not fear the result of a hundred battles.'));
  assert.ok(quotes.includes('Hence to fight and conquer in all your battles is not supreme excellence; supreme excellence consists in breaking the enemy\'s resistance without fighting.'));
  assert.ok(musashi.every((l) => /Victor Harris/i.test(l.source)));
  assert.ok(suntzu.every((l) => /Lionel Giles/i.test(l.source)));
});
