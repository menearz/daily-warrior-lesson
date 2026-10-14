// Humanizer final pass for a lesson's own wording (title, lesson, today).
// Port of offensive-bias-ancilla render/humanize.py (PR #25), ruleset
// humanizer-3.1.0 from /home/box/agent-data/workflows/humanizer/SKILL.md:
//   - dashes as connectors (§8) become commas, or "to" between two numbers;
//   - curly apostrophes and quote marks (§21) become straight ones;
//   - stock AI words (§12) and long verbs for is/has (§18) get plain words;
//   - stacked qualifiers (§9) lose the extra word;
//   - staged run-ups (§4) and chatbot leftovers (§22) are cut.
// It is a fixed, rule-based edit, so it cannot invent anything. Quoted text
// and URLs inside a field are left alone. The fields quote, quote_es, date,
// source, source_es, sourceUrl, image, imageAlt, fallback and lanes are
// never passed through it.
// Fact guard: every number, month, link and name (capitalised word not at
// the start of a sentence) must be the same before and after, and every
// protected field must be identical, or HumanizeError is thrown and nothing
// is written. Spanish _es fields are not rewritten: the word rules are
// English, and Spanish uses dashes and quote marks differently, so editing
// them is not safe. They are still linted for the language-neutral tells.
'use strict';

const RULESET = 'humanizer-3.1.0';
const HUMANIZED_FIELDS = ['title', 'lesson', 'today'];
const PROTECTED_FIELDS = ['date', 'quote', 'quote_es', 'source', 'source_es', 'sourceUrl', 'image', 'imageAlt', 'fallback', 'lanes'];

class HumanizeError extends Error {}

const PROTECT_RE = /https?:\/\/[^\s)>\]]+|"[^"\n]*"|\u201c[^\u201d\n]*\u201d/g;
function splitProtected(s) {
  const out = []; let pos = 0;
  for (const m of s.matchAll(PROTECT_RE)) {
    if (m.index > pos) out.push([false, s.slice(pos, m.index)]);
    out.push([true, m[0]]); pos = m.index + m[0].length;
  }
  if (pos < s.length) out.push([false, s.slice(pos)]);
  return out;
}

const WORDS = [
  [/\bAdditionally,\s+(\w)/g, 'Also, $1'], [/\badditionally\b/g, 'also'],
  [/\bdelves into\b/g, 'looks at'], [/\bdelve into\b/g, 'look at'], [/\bdelving into\b/g, 'looking at'],
  [/\bcrucial\b/g, 'important'], [/\bpivotal\b/g, 'important'],
  [/\bmeticulously\b/g, 'carefully'], [/\bmeticulous\b/g, 'careful'],
  [/\bshowcases\b/g, 'shows'], [/\bshowcased\b/g, 'showed'], [/\bshowcasing\b/g, 'showing'], [/\bshowcase\b/g, 'show'],
  [/\bunderscores\b/g, 'shows'], [/\bunderscored\b/g, 'showed'], [/\bunderscoring\b/g, 'showing'],
  [/\bbolstered\b/g, 'strengthened'], [/\bgarnered\b/g, 'drew'],
  [/\bserves as\b/g, 'is'], [/\bserved as\b/g, 'was'], [/\bstands as\b/g, 'is'], [/\bboasts\b/g, 'has'],
  [/\bcould potentially\b/g, 'could'], [/\bmight potentially\b/g, 'might'], [/\bmay potentially\b/g, 'may'], [/\bmight arguably\b/g, 'might'],
  [/\bIt is worth noting that\s+(\w)/g, (_, c) => c.toUpperCase()], [/\bIt's worth noting that\s+(\w)/g, (_, c) => c.toUpperCase()],
];
const CUT = /(^|(?<=[.!?]\s))(?:let's dive in|let's break this down|here's what you need to know|without further ado|i hope this helps|let me know if [^.!?]*|great question)[.!?:]\s*/gi;

function fixDashes(s) {
  s = s.replace(/(?<=\d)\s?[\u2013\u2014]\s?(?=[$\d])/g, ' to ');
  s = s.replace(/(?<![\w%)])\u2013(?=\$?\d)/g, '-');
  // A single dash that opens a list running to the end of the sentence
  // becomes a colon ("drill: cold, short rations, a hard bed").
  s = s.replace(/\s*[\u2014\u2013]\s*(?=[^\u2014\u2013.!?]*,[^\u2014\u2013.!?]*[.!?]?(?:\s|$))/g, (m, i, all) => (/[\u2014\u2013]/.test(all.slice(0, i).split(/[.!?]\s/).pop()) ? m : ': '));
  s = s.replace(/\s*[\u2014\u2013]\s*|\s+--\s+/g, ', ');
  s = s.replace(/,\s*,/g, ',').replace(/,\s*([.;:!?)])/g, '$1');
  return s;
}
function fixSegment(s) {
  s = fixDashes(s).replace(/[\u2018\u2019]/g, "'");
  for (const [rx, rep] of WORDS) s = s.replace(rx, rep);
  return s.replace(CUT, '$1');
}
function humanizeText(text) {
  if (typeof text !== 'string' || !text) return text;
  const out = splitProtected(text).map(([p, part]) => (p ? part : fixSegment(part))).join('')
    .replace(/[\u201c\u201d](?![^\u201c]*\u201d)/g, '"').replace(/ {2,}/g, ' ').trim();
  const diff = compareFacts(text, out);
  if (diff.length) throw new HumanizeError('Humanizer pass changed facts: ' + diff.slice(0, 10).join('; '));
  return out;
}

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?';
const FACT_RE = new RegExp(String.raw`(?<![\w.])([-\u2212\u2013])?(\$)?(\d[\d,]*(?:\.\d+)?)\s?([KMBT%x]|bn|million|billion|trillion)?(?![\w])|\b(${MONTH})(?=\s+\d)|(https?:\/\/[^\s)>\]]+)`, 'g');
const NAME_RE = /(?<![.!?:]\s|^|["\u201c(]\s?)\b\p{Lu}[\p{L}'-]+/gu;
function factsSignature(text) {
  const sig = new Map(); const add = (k) => sig.set(k, (sig.get(k) || 0) + 1);
  for (const m of String(text || '').matchAll(FACT_RE)) {
    const [, sign, dollar, digits, unit, month, url] = m;
    if (digits != null) add(`${sign ? '-' : ''}${dollar || ''}${digits.replace(/,/g, '')}${unit || ''}`);
    else if (month != null) add('month:' + month.slice(0, 3).toLowerCase());
    else add('link:' + url);
  }
  for (const m of String(text || '').matchAll(NAME_RE)) add('name:' + m[0]);
  return sig;
}
function compareFacts(before, after) {
  const a = factsSignature(before), b = factsSignature(after); const out = [];
  for (const k of [...new Set([...a.keys(), ...b.keys()])].sort()) if ((a.get(k) || 0) !== (b.get(k) || 0)) out.push(`${k}: ${a.get(k) || 0} before, ${b.get(k) || 0} after`);
  return out;
}

// Returns a new lesson object; throws HumanizeError if a fact or protected field changed.
function humanizeLesson(entry) {
  const out = Object.assign({}, entry);
  for (const k of HUMANIZED_FIELDS) if (typeof out[k] === 'string') out[k] = humanizeText(out[k]);
  for (const k of PROTECTED_FIELDS) {
    if (JSON.stringify(out[k]) !== JSON.stringify(entry[k])) throw new HumanizeError(`protected field ${k} changed`);
  }
  for (const k of Object.keys(entry)) if (!HUMANIZED_FIELDS.includes(k) && out[k] !== entry[k]) throw new HumanizeError(`field ${k} changed`);
  return out;
}

const TELLS = [
  ['not-x-but-y', /\bnot (?:just|only|merely)\b[^.!?\n]{0,120}?\bbut\b|\bit'?s not\b[^.!?\n]{0,80}?[,;]\s*it'?s\b|\bthis (?:does not|doesn't) mean\b[^.!?\n]*[.!?]\s*it means\b/i],
  ['deep-saying', /\b(?:the real question is|at its core|what really matters|the heart of the matter|the deeper issue)\b/i],
  ['staged-opener', /\b(?:let's dive in|let's explore|let's break this down|here's what you need to know|without further ado|here's the thing|real talk|let's be honest)\b/i],
  ['arguing-with-no-one', /\b(?:don't get me wrong|i'm not saying|one might be tempted to|a tempting approach would be)\b/i],
  ['dash', /[\u2014\u2013]|\s--\s/],
  ['stock-word', /\b(?:additionally|delve|delves|delving|crucial|pivotal|meticulous(?:ly)?|showcas(?:e|es|ed|ing)|underscor(?:e|es|ed|ing)|tapestry|testament|bolstered|garnered?|vibrant|intricacies|interplay)\b/i],
  ['inflated-significance', /\b(?:stands as a testament|a pivotal moment|plays a key role|setting the stage for|evolving landscape|the future looks bright|exciting times ahead|indelible mark)\b/i],
  ['sales-language', /\b(?:nestled|breathtaking|must-visit|stunning|groundbreaking|renowned)\b/i],
  ['long-verb', /\b(?:serves as|stands as|boasts)\b/i],
  ['stacked-qualifier', /\b(?:could potentially|might potentially|might arguably|may potentially)\b/i],
  ['chatbot-residue', /\b(?:i hope this helps|great question|certainly!|of course!|let me know if|would you like me to)\b/i],
  ['curly-quote', /[\u201c\u201d\u2018\u2019]/],
];
const NEUTRAL = new Set(['dash', 'curly-quote']);
// Tells in the lesson's own wording (quoted text and URLs blanked out).
function aiTells(text, { neutralOnly = false } = {}) {
  const prose = splitProtected(String(text || '')).map(([p, s]) => (p ? ' '.repeat(s.length) : s)).join('');
  return TELLS.filter(([code, rx]) => (!neutralOnly || NEUTRAL.has(code)) && rx.test(prose)).map(([code]) => code);
}

module.exports = { RULESET, HUMANIZED_FIELDS, PROTECTED_FIELDS, HumanizeError, humanizeText, humanizeLesson, aiTells, factsSignature, compareFacts };
