'use strict';
/**
 * The Forge's 12 questions, as the API validates them. Keys and allowed
 * values mirror forge.html QUESTIONS exactly (test/questionnaire.test.js
 * checks the two stay in step). Subscriber-only: free users get the shared
 * daily lesson and never reach these.
 */
const QUESTIONS = [
  { key: 'admire', type: 'multi', max: 3, values: ['warrior', 'thinker', 'builder', 'statesman', 'father', 'faith'] },
  { key: 'avoid', type: 'multi', max: 3, values: ['fear', 'conflict', 'hardconv', 'discomfort', 'weak', 'publicfail', 'responsibility'] },
  { key: 'fail', type: 'multi', max: 3, values: ['discipline', 'patience', 'courage', 'providing', 'leading', 'calm', 'promises'] },
  { key: 'alive', type: 'multi', max: 3, values: ['building', 'protecting', 'winning', 'creating', 'serving', 'mastery', 'tested'] },
  { key: 'hate', type: 'multi', max: 3, values: ['cowardice', 'dishonesty', 'laziness', 'entitlement', 'betrayal', 'weakkind'] },
  { key: 'season', type: 'single', values: ['untested', 'stuck', 'mentor', 'fallen', 'restart'] },
  { key: 'owe', type: 'text' },
  { key: 'values', type: 'rank', take: 5, values: ['Courage', 'Loyalty', 'Mastery', 'Freedom', 'Integrity', 'Strength', 'Wisdom', 'Service', 'Honor', 'Discipline', 'Faith', 'Family', 'Legacy', 'Justice', 'Patience'] },
  { key: 'miracle', type: 'text' },
  { key: 'exception', type: 'text' },
  { key: 'cost', type: 'text' },
  { key: 'emptychair', type: 'text' },
];
const TEXT_MAX = 600;

/** Returns { answers } cleaned, or { error } naming the first bad key. All 12 are required. */
function validateAnswers(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'bad_answers' };
  const out = {};
  for (const q of QUESTIONS) {
    const v = input[q.key];
    if (q.type === 'multi') {
      if (!Array.isArray(v) || v.length < 1 || v.length > q.max || new Set(v).size !== v.length || v.some((x) => !q.values.includes(x))) return { error: `bad_answer_${q.key}` };
      out[q.key] = v.slice();
    } else if (q.type === 'single') {
      if (!q.values.includes(v)) return { error: `bad_answer_${q.key}` };
      out[q.key] = v;
    } else if (q.type === 'rank') {
      if (!Array.isArray(v) || v.length !== q.take || new Set(v).size !== v.length || v.some((x) => !q.values.includes(x))) return { error: `bad_answer_${q.key}` };
      out[q.key] = v.slice();
    } else {
      const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
      if (!s || s.length > TEXT_MAX) return { error: `bad_answer_${q.key}` };
      out[q.key] = s;
    }
  }
  const extra = Object.keys(input).filter((k) => !QUESTIONS.some((q) => q.key === k));
  if (extra.length) return { error: `unknown_answer_${extra[0]}` };
  return { answers: out };
}

module.exports = { QUESTIONS, validateAnswers, TEXT_MAX };
