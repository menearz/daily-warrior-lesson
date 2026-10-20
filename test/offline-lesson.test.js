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

test('a forged lesson displays the Chicago day, not the source catalog date', () => {
  const lessons = [
    { date: '2026-10-06', title: 'I Neither Know Nor Think I Know', lanes: ['thinker'], quote: 'q' },
    { date: '2026-10-06', title: 'Also Older', lanes: ['warrior'], quote: 'r' },
  ];
  const picked = WarriorLesson.pickDailyLesson(lessons, {
    forged: { primary: 'thinker', secondary: 'builder' },
    stamp: '2026-10-19',
  });
  assert.equal(picked.lesson.date, '2026-10-19');
  assert.equal(picked.lesson.lessonDate, '2026-10-06');
  assert.ok(['I Neither Know Nor Think I Know', 'Also Older'].includes(picked.lesson.title));
  assert.match(picked.aimed, /Thinker/);
  assert.equal(lessons[0].date, '2026-10-06');
  assert.equal(lessons[1].date, '2026-10-06');
  const daily = WarriorLesson.pickDailyLesson(lessons, { stamp: '2026-10-19' });
  assert.equal(daily.lesson.date, '2026-10-06', 'an unforged lesson keeps its catalog date');
});

test('forged display date follows America/Chicago across UTC midnight when no stamp is passed', () => {
  const lessons = [
    { date: '2026-10-06', title: 'Older', lanes: ['faith'], quote: 'q' },
  ];
  // 04:30 UTC on Oct 20 is still Oct 19 in Chicago (CDT, UTC-5).
  const early = WarriorLesson.pickDailyLesson(lessons, {
    forged: { primary: 'faith' },
    now: new Date('2026-10-20T04:30:00Z'),
  });
  assert.equal(WarriorLesson.chicagoDate(new Date('2026-10-20T04:30:00Z')), '2026-10-19');
  assert.equal(early.lesson.date, '2026-10-19');
  assert.equal(early.lesson.lessonDate, '2026-10-06');
  const later = WarriorLesson.pickDailyLesson(lessons, {
    forged: { primary: 'faith' },
    now: new Date('2026-10-20T05:30:00Z'),
  });
  assert.equal(later.lesson.date, '2026-10-20');
  assert.equal(lessons[0].date, '2026-10-06');
});

test('index stamps a forged lesson with the Chicago day', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(index, /stamp:\s*WarriorLesson\.chicagoDate\(new Date\(\)\)/);
  assert.doesNotMatch(index, /toISOString\(\)\.slice\(0,\s*10\)/);
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
