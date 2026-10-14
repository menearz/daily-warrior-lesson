#!/usr/bin/env node
// One-shot guard for a push or PR that touches lessons.json.
//   node scripts/guard-lessons.js check   <baseSha|-> [headSha]
//   node scripts/guard-lessons.js restore <beforeSha> <afterSha>
// check:   lessons.json must be valid JSON, pass scripts/check-lessons.js
//          (schema, placeholders, unique dates) against the base commit, AND
//          keep at least as many lessons as the last good version in history
//          (the newest commit at or before base whose lessons.json is valid),
//          with none of its dates missing. Exit 1 on any failure.
// restore: rebuild lessons.json with scripts/restore-lessons.js (last good
//          list plus any valid new lesson from the push), then re-run check
//          against the last good version; exit 1 if the rebuilt file still
//          fails, so the workflow never commits a bad restore.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const { BAD, lessonErrors } = require('./lesson-schema');
const sh = (c) => execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 });
const here = (f) => path.join(__dirname, f);

function goodAt(sha) {
  let t;
  try { t = sh(`git show ${sha}:lessons.json`); } catch (_) { return null; }
  if (BAD.test(t)) return null;
  let d; try { d = JSON.parse(t); } catch (_) { return null; }
  const l = d && Array.isArray(d.lessons) ? d.lessons : null;
  if (!l || !l.length || new Set(l.map((x) => x.date)).size !== l.length || l.some((x) => lessonErrors(x).length)) return null;
  return { sha, text: t, lessons: l };
}
function lastGood(base) {
  if (!base || /^0+$/.test(base) || base === '-') return null;
  let shas = [];
  try { shas = sh(`git rev-list -n 200 ${base} -- lessons.json`).split('\n').filter(Boolean); } catch (_) { return null; }
  for (const s of shas) { const g = goodAt(s); if (g) return g; }
  return null;
}
function check(base) {
  const errs = [];
  const good = lastGood(base);
  const tmp = path.join(require('os').tmpdir(), `dw-guard-base-${process.pid}.json`);
  let args = [here('check-lessons.js')];
  if (base && base !== '-' && !/^0+$/.test(base)) {
    try { fs.writeFileSync(tmp, sh(`git show ${base}:lessons.json`)); args.push(tmp); } catch (_) {}
  }
  // If the base itself is bad, compare against the last good version instead.
  if (good && args.length === 2) {
    let baseOk = true; try { JSON.parse(fs.readFileSync(tmp, 'utf8')); } catch (_) { baseOk = false; }
    if (!baseOk) fs.writeFileSync(tmp, good.text);
  }
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  process.stdout.write(r.stdout || ''); if (r.status !== 0) errs.push((r.stderr || '').trim() || 'check-lessons failed');
  if (good) {
    let now = null;
    try { now = JSON.parse(fs.readFileSync('lessons.json', 'utf8')).lessons; } catch (_) {}
    if (Array.isArray(now)) {
      if (now.length < good.lessons.length) errs.push(`fewer lessons (${now.length}) than last good version ${good.sha.slice(0, 7)} (${good.lessons.length})`);
      const dates = new Set(now.map((l) => l && l.date));
      const lost = good.lessons.map((l) => l.date).filter((d) => !dates.has(d));
      if (lost.length) errs.push('lessons missing vs last good version: ' + lost.join(', '));
    }
  }
  try { fs.unlinkSync(tmp); } catch (_) {}
  return { errs, good };
}

const [mode, a, b] = process.argv.slice(2);
if (mode === 'check') {
  const { errs } = check(a);
  if (errs.length) { for (const e of errs) console.error(e); process.exit(1); }
  console.log('guard OK');
} else if (mode === 'restore') {
  if (!a || !b) { console.error('usage: guard-lessons.js restore <beforeSha> <afterSha>'); process.exit(2); }
  const r = spawnSync(process.execPath, [here('restore-lessons.js'), a, b], { encoding: 'utf8' });
  process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || '');
  if (r.status !== 0) process.exit(1);
  const { errs } = check(a);
  if (errs.length) { console.error('restored file still fails the guard:'); for (const e of errs) console.error(e); process.exit(1); }
  console.log('restore verified');
} else { console.error('usage: guard-lessons.js check|restore ...'); process.exit(2); }
