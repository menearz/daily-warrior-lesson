// Shared rules for one lessons.json entry. Used by add-lesson.js,
// check-lessons.js, restore-lessons.js and the tests.
'use strict';
const LANES = ['warrior', 'thinker', 'builder', 'odyssey', 'power', 'faith'];
const REQUIRED = ['date', 'title', 'image', 'imageAlt', 'fallback', 'source', 'quote', 'lesson', 'today', 'lanes'];
const REQUIRED_ES = ['title_es', 'quote_es', 'lesson_es', 'today_es'];
const BAD = /SEE_FILE|PLACEHOLDER|FULL_CONTENT|[A-Z]+_HERE\b|\bTODO\b|lorem ipsum|\$\(cat /;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function lessonErrors(e) {
  const errs = [];
  if (!e || typeof e !== 'object') return ['not an object'];
  const label = e.date || e.title || '?';
  for (const k of REQUIRED.concat(REQUIRED_ES)) {
    if (k === 'lanes') continue;
    if (typeof e[k] !== 'string' || !e[k].trim()) errs.push(`${label}: missing ${k}`);
  }
  if (typeof e.date === 'string' && (!DATE_RE.test(e.date) || new Date(e.date + 'T00:00:00Z').toISOString().slice(0, 10) !== e.date)) {
    errs.push(`${label}: bad date`);
  }
  if (!Array.isArray(e.lanes) || e.lanes.length < 1 || e.lanes.length > 3) errs.push(`${label}: lanes must be 1-3 tags`);
  else {
    const bad = e.lanes.filter((l) => !LANES.includes(l));
    if (bad.length) errs.push(`${label}: unknown lane ${bad.join(', ')}`);
    if (new Set(e.lanes).size !== e.lanes.length) errs.push(`${label}: duplicate lane`);
  }
  if (e.source_es != null && (typeof e.source_es !== 'string' || !e.source_es.trim())) errs.push(`${label}: empty source_es`);
  if (BAD.test(JSON.stringify(e))) errs.push(`${label}: placeholder marker`);
  return errs;
}

module.exports = { LANES, REQUIRED, REQUIRED_ES, BAD, lessonErrors };
