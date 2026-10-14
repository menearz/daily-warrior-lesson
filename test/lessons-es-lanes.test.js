'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const WarriorLesson = require('../lesson.js');
const { LANES, lessonErrors, lessonWarnings } = require('../scripts/lesson-schema.js');

const root = path.join(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'lessons.json'), 'utf8'));
const script = (name) => path.join(root, 'scripts', name);

function tmpRepo(lessons) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-guard-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'lessons.json'), JSON.stringify({ lessons }, null, 2) + '\n');
  git('add', 'lessons.json');
  git('commit', '-q', '-m', 'good');
  return { dir, git };
}
const run = (dir, file, ...args) => spawnSync(process.execPath, [script(file), ...args], { cwd: dir, encoding: 'utf8' });
const sample = () => JSON.parse(JSON.stringify(catalog.lessons[0]));
function newLesson(date) {
  return Object.assign(sample(), { date, title: 'Test ' + date });
}

test('every lesson passes the shared schema and the 62 current lessons all carry Spanish', () => {
  for (const l of catalog.lessons) assert.deepEqual(lessonErrors(l), [], l.date);
  assert.ok(catalog.lessons.length >= 62);
  for (const l of catalog.lessons) assert.deepEqual(lessonWarnings(l), [], `${l.date} lost its Spanish`);
  assert.deepEqual(LANES.slice().sort(), ['builder', 'faith', 'odyssey', 'power', 'thinker', 'warrior']);
  assert.deepEqual(WarriorLesson.LANES.slice().sort(), LANES.slice().sort());
});

test('Spanish text differs from English and every new lesson cites a link', () => {
  for (const l of catalog.lessons) {
    assert.notEqual(l.title_es, l.title, `${l.date} title_es copied from English`);
    assert.notEqual(l.lesson_es, l.lesson, `${l.date} lesson_es copied from English`);
    if (l.sourceUrl) assert.match(l.sourceUrl, /^https:\/\/(www\.gutenberg\.org\/ebooks\/\d+|en\.wikisource\.org\/wiki\/|founders\.archives\.gov\/documents\/)/);
  }
  assert.ok(catalog.lessons.filter((l) => l.sourceUrl).length >= 35);
  const kjv = catalog.lessons.filter((l) => /King James/.test(l.source));
  assert.ok(kjv.length > 0 && kjv.every((l) => /Reina-Valera 1909/.test(l.source_es)), 'Bible quotes use Reina-Valera 1909 in Spanish');
});

test('localizeLesson swaps in _es fields for es and leaves en alone', () => {
  const l = catalog.lessons[0];
  const es = WarriorLesson.localizeLesson(l, 'es');
  assert.equal(es.title, l.title_es);
  assert.equal(es.quote, l.quote_es);
  assert.equal(es.lesson, l.lesson_es);
  assert.equal(es.today, l.today_es);
  assert.equal(es.source, l.source_es);
  assert.equal(es.image, l.image);
  const en = WarriorLesson.localizeLesson(l, 'en');
  assert.equal(en.title, l.title);
  const partial = WarriorLesson.localizeLesson({ title: 'Only English', quote: 'q' }, 'es');
  assert.equal(partial.title, 'Only English');
});

test('70/30: about 70% of days come from the Forge lanes, 30% from the others', () => {
  for (const [primary, secondary] of [['builder', 'odyssey'], ['power', 'faith'], ['thinker', 'warrior']]) {
    let inLanes = 0;
    const seen = new Set();
    const days = 365;
    for (let i = 0; i < days; i++) {
      const stamp = new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10);
      const pick = WarriorLesson.pickPersonalized(catalog.lessons, { primary, secondary }, stamp);
      assert.ok(pick, 'always picks a lesson');
      seen.add(pick.date);
      if (pick.lanes.includes(primary) || pick.lanes.includes(secondary)) inLanes += 1;
    }
    const share = inLanes / days;
    assert.ok(share > 0.6 && share < 0.8, `${primary}/${secondary} share ${share}`);
    assert.ok(seen.size >= 15, `${primary}/${secondary} only saw ${seen.size} lessons`);
  }
  const a = WarriorLesson.pickPersonalized(catalog.lessons, { primary: 'faith', secondary: 'builder' }, '2027-03-03');
  const b = WarriorLesson.pickPersonalized(catalog.lessons, { primary: 'faith', secondary: 'builder' }, '2027-03-03');
  assert.equal(a.date, b.date, 'same day and path give the same lesson');
});

test('index and archive render through localizeLesson', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const archive = fs.readFileSync(path.join(root, 'archive.html'), 'utf8');
  assert.match(index, /WarriorLesson\.localizeLesson\(RAW, lang\)/);
  assert.match(archive, /WarriorLesson\.localizeLesson\(raw, lang\)/);
});

test('add-lesson.js rejects missing _es fields and bad lanes; --update cannot touch English', () => {
  const { dir } = tmpRepo(catalog.lessons.slice(0, 3));
  const write = (name, obj) => { const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(obj)); return p; };
  const noEs = newLesson('2030-01-01'); for (const k of ['title_es', 'quote_es', 'lesson_es', 'today_es', 'source_es']) delete noEs[k];
  let r = run(dir, 'add-lesson.js', write('a.json', noEs));
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /3 -> 4/);
  const noQuote = newLesson('2030-01-04'); delete noQuote.quote;
  r = run(dir, 'add-lesson.js', write('a2.json', noQuote));
  assert.equal(r.status, 1); assert.match(r.stderr, /missing quote/);
  r = run(dir, 'add-lesson.js', write('b.json', Object.assign(newLesson('2030-01-02'), { lanes: ['wizard'] })));
  assert.equal(r.status, 1); assert.match(r.stderr, /unknown lane/);
  r = run(dir, 'add-lesson.js', write('c.json', newLesson('2030-01-03')));
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /4 -> 5/);
  r = run(dir, 'add-lesson.js', '--update', write('d.json', { date: '2030-01-03', quote: 'changed' }));
  assert.equal(r.status, 1); assert.match(r.stderr, /may not change: quote/);
  r = run(dir, 'add-lesson.js', '--update', write('e.json', { date: '2030-01-03', lanes: ['odyssey'], title_es: 'Prueba' }));
  assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'lessons.json'), 'utf8')).lessons;
  const e = after.find((l) => l.date === '2030-01-03');
  assert.deepEqual(e.lanes, ['odyssey']); assert.equal(e.title_es, 'Prueba'); assert.equal(e.quote, catalog.lessons[0].quote);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('check-lessons.js warns (not fails) on missing Spanish and fails on an unknown lane', () => {
  const { dir } = tmpRepo(catalog.lessons.slice(0, 3));
  const base = path.join(dir, 'base.json');
  fs.copyFileSync(path.join(dir, 'lessons.json'), base);
  assert.equal(run(dir, 'check-lessons.js', base).status, 0);
  const bad = catalog.lessons.slice(0, 3).map((l) => Object.assign({}, l));
  delete bad[1].lesson_es;
  fs.writeFileSync(path.join(dir, 'lessons.json'), JSON.stringify({ lessons: bad }));
  let r = run(dir, 'check-lessons.js', base);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /::warning::.*no Spanish lesson_es/);
  bad[2].lanes = ['wizard'];
  fs.writeFileSync(path.join(dir, 'lessons.json'), JSON.stringify({ lessons: bad }));
  r = run(dir, 'check-lessons.js', base);
  assert.equal(r.status, 1); assert.match(r.stderr, /unknown lane/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('guard: an outside overwrite is restored to the full list plus the valid new lesson', () => {
  const { dir, git } = tmpRepo(catalog.lessons);
  const before = git('rev-parse', 'HEAD');
  // The outside writer replaces the whole file with only its new lesson.
  const fresh = newLesson('2030-02-01');
  fs.writeFileSync(path.join(dir, 'lessons.json'), JSON.stringify({ lessons: [fresh] }, null, 2));
  git('commit', '-qam', 'outside writer overwrite');
  const after = git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(dir, 'base.json'), git('show', `${before}:lessons.json`));
  const check = run(dir, 'check-lessons.js', 'base.json');
  assert.equal(check.status, 1, 'guard flags the overwrite');
  assert.match(check.stderr, /count dropped/);
  const restore = run(dir, 'restore-lessons.js', before, after);
  assert.equal(restore.status, 0, restore.stderr);
  assert.match(restore.stdout, /kept new lesson 2030-02-01/);
  const restored = JSON.parse(fs.readFileSync(path.join(dir, 'lessons.json'), 'utf8')).lessons;
  assert.equal(restored.length, catalog.lessons.length + 1);
  assert.equal(restored[0].date, '2030-02-01');
  assert.equal(run(dir, 'check-lessons.js', 'base.json').status, 0, 'restored file passes the guard');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('guard: English-only new lesson is kept; placeholder overwrite is ignored', () => {
  const { dir, git } = tmpRepo(catalog.lessons);
  const before = git('rev-parse', 'HEAD');
  const enOnly = newLesson('2030-03-01');
  for (const k of ['title_es', 'quote_es', 'lesson_es', 'today_es']) delete enOnly[k];
  fs.writeFileSync(path.join(dir, 'lessons.json'), JSON.stringify({ lessons: [enOnly] }));
  git('commit', '-qam', 'english-only overwrite');
  fs.writeFileSync(path.join(dir, 'lessons.json'), 'SEE_FILE');
  git('commit', '-qam', 'placeholder overwrite');
  const after = git('rev-parse', 'HEAD');
  const restore = run(dir, 'restore-lessons.js', before, after);
  assert.equal(restore.status, 0, restore.stderr);
  assert.match(restore.stdout, /kept new lesson 2030-03-01/);
  const restored = JSON.parse(fs.readFileSync(path.join(dir, 'lessons.json'), 'utf8')).lessons;
  assert.equal(restored.length, catalog.lessons.length + 1);
  const kept = restored.find((l) => l.date === '2030-03-01');
  assert.equal(WarriorLesson.localizeLesson(kept, 'es').title, kept.title, 'Spanish mode falls back to English');
  fs.rmSync(dir, { recursive: true, force: true });
});
