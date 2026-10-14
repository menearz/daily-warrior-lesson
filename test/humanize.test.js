'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const h = require('../scripts/humanize.js');

const root = path.join(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'lessons.json'), 'utf8'));

// One lint case per habit: [code, text with the tell, expected auto-fix or null if it must be rewritten by hand]
const HABITS = [
  ['dash', 'Hold the line\u2014every day.', 'Hold the line, every day.'],
  ['curly-quote', 'Don\u2019t quit.', "Don't quit."],
  ['stock-word', 'Discipline is crucial in battle.', 'Discipline is important in battle.'],
  ['long-verb', 'The drill serves as a test.', 'The drill is a test.'],
  ['stacked-qualifier', 'Fear could potentially win.', 'Fear could win.'],
  ['staged-opener', "Let's dive in. March at dawn.", 'March at dawn.'],
  ['chatbot-residue', 'March at dawn. I hope this helps.', 'March at dawn.'],
  ['not-x-but-y', 'Courage is not just strength but will.', null],
  ['deep-saying', 'At its core, war is waiting.', null],
  ['arguing-with-no-one', "Don't get me wrong, rest matters.", null],
  ['inflated-significance', 'Valley Forge plays a key role here.', null],
  ['sales-language', 'A stunning victory at Trenton.', null],
];
for (const [code, text, fixed] of HABITS) {
  test(`lint habit: ${code}`, () => {
    assert.ok(h.aiTells(text).includes(code), `${code} detected`);
    const out = h.humanizeText(text);
    if (fixed) { assert.equal(out, fixed); assert.ok(!h.aiTells(out).includes(code), `${code} gone after pass`); }
    else assert.ok(h.aiTells(out).includes(code), `${code} is left for a human rewrite`);
  });
}

test('quoted text and URLs inside a field are never touched', () => {
  const t = 'He wrote "Discipline is the soul \u2014 of an army" and see https://founders.archives.gov/a\u2014b today.';
  const out = h.humanizeText(t);
  assert.ok(out.includes('"Discipline is the soul \u2014 of an army"'));
  assert.ok(out.includes('https://founders.archives.gov/a\u2014b'));
});

test('fact guard: numbers, dates, names and links are compared', () => {
  assert.deepEqual(h.compareFacts('Washington wrote on 29 July 1757.', 'Washington wrote on 29 July 1757.'), []);
  assert.ok(h.compareFacts('In 1757 he wrote.', 'In 1759 he wrote.').length);
  assert.ok(h.compareFacts('He met Washington there.', 'He met Adams there.').length);
  assert.ok(h.compareFacts('on Jul 29', 'on Aug 29').length);
  assert.ok(h.compareFacts('see https://a.example/x', 'see https://a.example/y').length);
});

test('humanizeLesson never changes quote, quote_es, source, sourceUrl, date or _es fields', () => {
  for (const l of catalog.lessons) {
    const out = h.humanizeLesson(l);
    for (const k of h.PROTECTED_FIELDS) assert.deepEqual(out[k], l[k], `${l.date} ${k}`);
    for (const k of Object.keys(l).filter((k) => k.endsWith('_es'))) assert.equal(out[k], l[k], `${l.date} ${k}`);
    for (const k of h.HUMANIZED_FIELDS) assert.deepEqual(h.compareFacts(l[k], out[k]), [], `${l.date} ${k}`);
  }
});

test('add-lesson.js runs the pass before writing, refuses leftover tells, and leaves old lessons alone', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw-human-'));
  const original = JSON.stringify({ lessons: catalog.lessons.slice(0, 3) }, null, 2) + '\n';
  fs.writeFileSync(path.join(dir, 'lessons.json'), original);
  const run = (...a) => spawnSync(process.execPath, [path.join(root, 'scripts', 'add-lesson.js'), ...a], { cwd: dir, encoding: 'utf8' });
  const base = Object.assign(JSON.parse(JSON.stringify(catalog.lessons[0])), { date: '2030-09-01', title: 'Test', quote: 'Old \u2014 quote, kept.' });
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(Object.assign({}, base, { today: 'Rise early\u2014then march.' })));
  let r = run('--dry-run', 'a.json');
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /dry run/);
  assert.equal(fs.readFileSync(path.join(dir, 'lessons.json'), 'utf8'), original);
  r = run('a.json');
  assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(fs.readFileSync(path.join(dir, 'lessons.json'), 'utf8')).lessons;
  assert.equal(after[0].today, 'Rise early, then march.');
  assert.equal(after[0].quote, 'Old \u2014 quote, kept.', 'historical quote untouched');
  assert.deepEqual(after.slice(1), catalog.lessons.slice(0, 3), 'existing lessons not rewritten');
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify(Object.assign({}, base, { date: '2030-09-02', lesson: 'At its core, war is waiting.' })));
  r = run('b.json');
  assert.equal(r.status, 1); assert.match(r.stderr, /deep-saying/);
  fs.rmSync(dir, { recursive: true, force: true });
});
