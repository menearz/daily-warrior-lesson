#!/usr/bin/env node
// Guard for lessons.json: valid JSON, no placeholders, unique dates, every
// lesson passes scripts/lesson-schema.js (English + Spanish _es fields and
// lane tags from the fixed set), and the lesson count never drops versus a
// base file (default: previous commit).
// Usage: node scripts/check-lessons.js [baseFile]
'use strict';
const fs = require('fs');
const { execSync } = require('child_process');
const { BAD, lessonErrors } = require('./lesson-schema');
function parse(text, label) {
  let d;
  try { d = JSON.parse(text); } catch (e) { fail(`${label} is not valid JSON: ${e.message}`); }
  if (!d || !Array.isArray(d.lessons)) fail(`${label} has no "lessons" array`);
  return d.lessons;
}
function fail(msg) { console.error('lessons.json guard FAILED: ' + msg); process.exit(1); }
const text = fs.readFileSync('lessons.json', 'utf8');
const now = parse(text, 'lessons.json');
if (BAD.test(text)) fail('placeholder marker found');
const dates = now.map((l) => l.date);
if (new Set(dates).size !== dates.length) fail('duplicate lesson dates');
const errs = now.flatMap(lessonErrors);
if (errs.length) fail(errs.slice(0, 10).join('; ') + (errs.length > 10 ? ` (+${errs.length - 10} more)` : ''));
let baseText = null;
if (process.argv[2]) baseText = fs.readFileSync(process.argv[2], 'utf8');
else { try { baseText = execSync('git show HEAD~1:lessons.json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (_) {} }
if (baseText) {
  const before = parse(baseText, 'base lessons.json');
  if (now.length < before.length) fail(`lesson count dropped from ${before.length} to ${now.length}`);
  const lost = before.map((l) => l.date).filter((d) => !dates.includes(d));
  if (lost.length) fail('lessons removed: ' + lost.join(', '));
}
console.log(`lessons.json OK: ${now.length} lessons`);
