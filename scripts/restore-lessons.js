#!/usr/bin/env node
// Rebuild lessons.json after a bad push: start from the newest commit (before
// BEFORE_SHA inclusive) whose lessons.json is valid, then add any new lessons
// found in the commits of the bad push that pass scripts/lesson-schema.js
// (complete English + Spanish fields, valid lanes, no placeholders).
// Usage: node scripts/restore-lessons.js <beforeSha> <afterSha>
'use strict';
const fs = require('fs');
const { execSync } = require('child_process');
const { BAD, lessonErrors } = require('./lesson-schema');
const [before, after] = process.argv.slice(2);
const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
function load(sha) {
  try { const t = sh(`git show ${sha}:lessons.json`); if (BAD.test(t)) return null; const d = JSON.parse(t); return Array.isArray(d.lessons) ? d.lessons : null; } catch (_) { return null; }
}
let good = null, goodSha = null;
for (const sha of sh(`git rev-list -n 200 ${before} -- lessons.json`).split('\n').filter(Boolean)) {
  const l = load(sha);
  if (l && l.length && new Set(l.map((x) => x.date)).size === l.length && l.every((x) => !lessonErrors(x).length)) { good = l; goodSha = sha; break; }
}
if (!good) { console.error('no good lessons.json found'); process.exit(1); }
const have = new Set(good.map((l) => l.date));
for (const sha of sh(`git rev-list --reverse ${before}..${after} -- lessons.json`).split('\n').filter(Boolean)) {
  for (const e of load(sha) || []) {
    if (have.has(e.date)) continue;
    const errs = lessonErrors(e);
    if (errs.length) { console.log(`dropped new lesson ${e && e.date} from ${sha.slice(0, 7)}: ${errs.join('; ')}`); continue; }
    good.push(e); have.add(e.date); console.log(`kept new lesson ${e.date} from ${sha.slice(0, 7)}`);
  }
}
good.sort((a, b) => b.date.localeCompare(a.date));
fs.writeFileSync('lessons.json', JSON.stringify({ lessons: good }, null, 2) + '\n');
console.log(`restored from ${goodSha.slice(0, 7)}: ${good.length} lessons`);
