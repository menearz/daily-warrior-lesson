#!/usr/bin/env node
// Append one lesson to lessons.json without replacing the file.
// Usage: node scripts/add-lesson.js new-lesson.json
//        node scripts/add-lesson.js --update fields.json
// The entry must pass scripts/lesson-schema.js (English fields, valid lanes;
// _es fields optional). Skips if the date already exists; keeps newest-first order.
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
const entry = JSON.parse(fs.readFileSync(file, 'utf8'));
const cat = JSON.parse(fs.readFileSync('lessons.json', 'utf8'));
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
  if (cat.lessons.some((l) => l.date === entry.date)) { console.log(`skip: ${entry.date} already present`); process.exit(0); }
  cat.lessons.push(entry);
  result = `added ${entry.date}`;
}
cat.lessons.sort((a, b) => b.date.localeCompare(a.date));
if (cat.lessons.length < before) { console.error('count dropped; not writing'); process.exit(1); }
fs.writeFileSync('lessons.json', JSON.stringify(cat, null, 2) + '\n');
console.log(`${result}: ${before} -> ${cat.lessons.length}`);
