#!/usr/bin/env node
// The one supported way to add a lesson (see WRITER.md). One-way: it adds
// exactly one lesson and never rewrites, reorders or removes existing ones.
// Usage: node scripts/add-lesson.js new-lesson.json
//        node scripts/add-lesson.js --update fields.json
// The entry must be a single lesson object that passes scripts/lesson-schema.js
// (English fields, valid lanes; _es fields optional). Refuses (exit 1) if the
// date already exists. The new lesson is inserted at its newest-first slot;
// every existing lesson stays byte-identical.
// --update merges translation fields, sourceUrl and lanes into the lesson
// with the same date. It never removes a lesson and never changes the
// English text, quote, source or image.
'use strict';
const fs = require('fs');
const { lessonErrors } = require('./lesson-schema');
const UPDATABLE = ['lanes', 'title_es', 'quote_es', 'lesson_es', 'today_es', 'source_es', 'sourceUrl'];
const args = process.argv.slice(2);
const update = args[0] === '--update';
const file = update ? args[1] : args[0];
if (!file) { console.error('usage: add-lesson.js [--update] entry.json'); process.exit(1); }
let entry;
try { entry = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error(`${file} is not valid JSON: ${e.message}`); process.exit(1); }
if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Array.isArray(entry.lessons)) {
  console.error('entry must be ONE lesson object, not a list or a whole lessons.json'); process.exit(1);
}
const original = fs.readFileSync('lessons.json', 'utf8');
const cat = JSON.parse(original);
const canon = (c) => JSON.stringify(c, null, 2) + '\n';
if (canon(cat) !== original) { console.error('lessons.json is not in canonical format; refusing to rewrite it (run the guard first)'); process.exit(1); }
const before = cat.lessons.length;
let result;
if (update) {
  const idx = cat.lessons.findIndex((l) => l.date === entry.date);
  if (idx < 0) { console.error(`no lesson dated ${entry.date}`); process.exit(1); }
  const extra = Object.keys(entry).filter((k) => k !== 'date' && !UPDATABLE.includes(k));
  if (extra.length) { console.error(`--update may not change: ${extra.join(', ')}`); process.exit(1); }
  const merged = Object.assign({}, cat.lessons[idx]);
  for (const k of UPDATABLE) if (entry[k] !== undefined) merged[k] = entry[k];
  const errs = lessonErrors(merged);
  if (errs.length) { console.error('invalid lesson: ' + errs.join('; ')); process.exit(1); }
  cat.lessons[idx] = merged;
  result = `updated ${entry.date}`;
} else {
  const errs = lessonErrors(entry);
  if (errs.length) { console.error('invalid lesson: ' + errs.join('; ')); process.exit(1); }
  if (cat.lessons.some((l) => l.date === entry.date)) { console.error(`refused: a lesson dated ${entry.date} already exists`); process.exit(1); }
  let at = cat.lessons.findIndex((l) => l.date < entry.date);
  if (at < 0) at = cat.lessons.length;
  cat.lessons.splice(at, 0, entry);
  result = `added ${entry.date}`;
}
if (cat.lessons.length < before) { console.error('count dropped; not writing'); process.exit(1); }
if (!update && cat.lessons.length !== before + 1) { console.error('append must add exactly one lesson; not writing'); process.exit(1); }
fs.writeFileSync('lessons.json', canon(cat));
console.log(`${result}: ${before} -> ${cat.lessons.length}`);
