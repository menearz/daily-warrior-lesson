'use strict';
// Guard and writer-path tests for the Oct 12-14 lessons.json wipes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', 'guard', n), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'lessons.json'), 'utf8'));
const canon = (lessons) => JSON.stringify({ lessons }, null, 2) + '\n';
const newLesson = (date) => Object.assign(JSON.parse(JSON.stringify(catalog.lessons[0])), { date, title: 'Test ' + date });
const run = (dir, file, ...args) => spawnSync(process.execPath, [path.join(root, 'scripts', file), ...args], { cwd: dir, encoding: 'utf8' });

function repo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-guard2-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.invalid'); git('config', 'user.name', 't');
  fs.writeFileSync(path.join(dir, 'lessons.json'), canon(catalog.lessons));
  git('add', 'lessons.json'); git('commit', '-q', '-m', 'good');
  const push = (text, msg) => { fs.writeFileSync(path.join(dir, 'lessons.json'), text); git('commit', '-qam', msg); return git('rev-parse', 'HEAD'); };
  return { dir, git, before: git('rev-parse', 'HEAD'), push, read: () => fs.readFileSync(path.join(dir, 'lessons.json'), 'utf8') };
}

function badPushIsRestored(text, extraCheck) {
  const r = repo();
  const after = r.push(text, 'bad push');
  const c = run(r.dir, 'guard-lessons.js', 'check', r.before);
  assert.equal(c.status, 1, 'guard rejects the push');
  const res = run(r.dir, 'guard-lessons.js', 'restore', r.before, after);
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /restore verified/);
  if (extraCheck) extraCheck(r, c);
  else assert.equal(r.read(), canon(catalog.lessons), 'last good list restored byte-for-byte');
  fs.rmSync(r.dir, { recursive: true, force: true });
}

test('guard: literal $(cat /tmp/lessons_updated.json) push is rejected and restored', () => {
  badPushIsRestored(fx('literal-cat.txt'));
});

test('guard: truncated JSON push is rejected and restored', () => {
  badPushIsRestored(fx('truncated.json'), (r, c) => {
    assert.match(c.stderr, /not valid JSON/);
    assert.equal(r.read(), canon(catalog.lessons));
  });
});

test('guard: a push that drops a lesson is rejected and the lesson comes back', () => {
  const dropped = catalog.lessons.slice(0, 5).concat(catalog.lessons.slice(6));
  badPushIsRestored(canon(dropped), (r, c) => {
    assert.match(c.stderr, /count dropped|fewer lessons/);
    assert.equal(r.read(), canon(catalog.lessons));
  });
});

test('guard: a drop plus a valid new lesson restores the full list and keeps the new one', () => {
  const fresh = newLesson('2030-05-01');
  badPushIsRestored(canon([fresh].concat(catalog.lessons.slice(1))), (r) => {
    const out = JSON.parse(r.read()).lessons;
    assert.equal(out.length, catalog.lessons.length + 1);
    assert.equal(out[0].date, '2030-05-01');
  });
});

test('guard: compares with the last good version even when the base itself is broken', () => {
  const r = repo();
  const brokenBase = r.push(fx('literal-cat.txt'), 'broken base');
  r.push(canon(catalog.lessons.slice(0, 3)), 'short list on top of broken base');
  const c = run(r.dir, 'guard-lessons.js', 'check', brokenBase);
  assert.equal(c.status, 1);
  assert.match(c.stderr, /fewer lessons \(3\) than last good version/);
  fs.rmSync(r.dir, { recursive: true, force: true });
});

test('guard: a valid one-lesson append (via add-lesson.js) passes untouched', () => {
  const r = repo();
  const p = path.join(r.dir, 'new.json');
  fs.writeFileSync(p, JSON.stringify(newLesson('2030-06-01')));
  assert.equal(run(r.dir, 'add-lesson.js', p).status, 0);
  fs.unlinkSync(p);
  r.git('commit', '-qam', 'append');
  const c = run(r.dir, 'guard-lessons.js', 'check', r.before);
  assert.equal(c.status, 0, c.stderr);
  assert.match(c.stdout, /guard OK/);
  fs.rmSync(r.dir, { recursive: true, force: true });
});

test('add-lesson.js: existing lessons are byte-identical after an append', () => {
  const r = repo();
  const original = r.read();
  const p = path.join(r.dir, 'new.json');
  fs.writeFileSync(p, JSON.stringify(newLesson('2030-07-01')));
  const res = run(r.dir, 'add-lesson.js', p);
  assert.equal(res.status, 0, res.stderr);
  const after = r.read();
  const head = '{\n  "lessons": [\n';
  const added = JSON.stringify(newLesson('2030-07-01'), null, 2).replace(/^/gm, '    ') + ',\n';
  assert.equal(after, head + added + original.slice(head.length), 'only the new lesson was inserted');
  assert.equal(JSON.parse(after).lessons.length, catalog.lessons.length + 1);
  fs.rmSync(r.dir, { recursive: true, force: true });
});

test('add-lesson.js: refuses duplicates, whole-file payloads and never reorders', () => {
  const r = repo();
  const original = r.read();
  const w = (n, o) => { const p = path.join(r.dir, n); fs.writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o)); return p; };
  let res = run(r.dir, 'add-lesson.js', w('dup.json', newLesson(catalog.lessons[3].date)));
  assert.equal(res.status, 1); assert.match(res.stderr, /already exists/);
  res = run(r.dir, 'add-lesson.js', w('whole.json', { lessons: [newLesson('2030-08-01')] }));
  assert.equal(res.status, 1); assert.match(res.stderr, /ONE lesson object/);
  res = run(r.dir, 'add-lesson.js', w('lit.json', fx('literal-cat.txt')));
  assert.equal(res.status, 1); assert.match(res.stderr, /not valid JSON/);
  assert.equal(r.read(), original, 'nothing written on refusal');
  // An older (backfill) date goes into its slot; neighbours keep their order.
  const mid = catalog.lessons[10].date;
  const prev = new Date(Date.parse(mid + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  if (!catalog.lessons.some((l) => l.date === prev)) {
    res = run(r.dir, 'add-lesson.js', w('old.json', newLesson(prev)));
    assert.equal(res.status, 0, res.stderr);
    const dates = JSON.parse(r.read()).lessons.map((l) => l.date).filter((d) => d !== prev);
    assert.deepEqual(dates, catalog.lessons.map((l) => l.date));
  }
  fs.rmSync(r.dir, { recursive: true, force: true });
});
