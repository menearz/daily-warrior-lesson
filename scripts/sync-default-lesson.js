#!/usr/bin/env node
// Rewrite the DEFAULT_LESSON literal in lesson.js from the newest
// lessons.json entry (by date). add-lesson.js calls this after it writes
// the catalog. Guard-test repos have no lesson.js; then this is a no-op.
'use strict';
const fs = require('fs');
const path = require('path');

function newestLesson(catalog) {
  const lessons = catalog && catalog.lessons;
  if (!Array.isArray(lessons) || !lessons.length) throw new Error('lessons.json has no lessons');
  return lessons.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
}

// Replace `var DEFAULT_LESSON = { ... };` with a JSON object literal.
// Strings are scanned so a `}` inside a quote cannot end the object early.
function rewriteDefaultLesson(source, lesson) {
  const marker = 'var DEFAULT_LESSON = ';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('DEFAULT_LESSON not found in lesson.js');
  let i = start + marker.length;
  if (source[i] !== '{') throw new Error('DEFAULT_LESSON is not an object literal');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (; i < source.length; i++) {
    const c = source[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) { i++; break; }
    }
  }
  if (depth !== 0) throw new Error('DEFAULT_LESSON object is not closed');
  if (source[i] === ';') i++;
  const body = JSON.stringify(lesson, null, 2)
    .split('\n')
    .map((line, idx) => (idx === 0 ? line : '  ' + line))
    .join('\n');
  return source.slice(0, start) + marker + body + ';' + source.slice(i);
}

function syncDefaultLesson(opts) {
  opts = opts || {};
  const cwd = opts.cwd || process.cwd();
  const lessonPath = path.join(cwd, 'lesson.js');
  if (!fs.existsSync(lessonPath)) return { skipped: true, changed: false };
  const lessonsPath = path.join(cwd, 'lessons.json');
  const lesson = newestLesson(JSON.parse(fs.readFileSync(lessonsPath, 'utf8')));
  const source = fs.readFileSync(lessonPath, 'utf8');
  const next = rewriteDefaultLesson(source, lesson);
  const changed = next !== source;
  if (changed) fs.writeFileSync(lessonPath, next);
  return { skipped: false, changed, date: lesson.date };
}

if (require.main === module) {
  try {
    const r = syncDefaultLesson();
    if (r.skipped) console.log('sync-default-lesson: no lesson.js; skipped');
    else console.log(`sync-default-lesson: DEFAULT_LESSON ${r.changed ? 'updated to' : 'already'} ${r.date}`);
  } catch (e) {
    console.error('sync-default-lesson: ' + e.message);
    process.exit(1);
  }
}

module.exports = { syncDefaultLesson, rewriteDefaultLesson, newestLesson };
