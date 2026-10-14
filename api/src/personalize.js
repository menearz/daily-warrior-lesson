'use strict';
/**
 * Subscriber lesson: one REAL lesson from the published catalog (lessons.json:
 * real quote, real source, real link), picked by the subscriber's themes and
 * answers, never one they were already sent, in their language. The quote,
 * source and link are never touched. The "today" step gets one extra line
 * aimed at what they said they keep failing at or avoid, and their own
 * "empty chair" words come back as a reminder. The English wording then
 * goes through the same humanizer and fact guard as add-lesson.js
 * (scripts/humanize.js); Spanish is linted for the language-neutral tells.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { humanizeLesson, aiTells, HUMANIZED_FIELDS, HumanizeError } = require('../../scripts/humanize');

const ADMIRE_LANE = { warrior: 'warrior', thinker: 'thinker', builder: 'builder', statesman: 'power', father: 'odyssey', faith: 'faith' };

// One concrete step per weak spot (Forge questions 3 and 2). Plain words, no dashes.
const FOCUS = {
  fail: {
    discipline: { en: 'You said discipline is where you slip. Pick the one thing in this step you would most like to skip, and do that part first.', es: 'Dijiste que la disciplina es donde fallas. Elige la parte de este paso que más quieres saltarte y hazla primero.' },
    patience: { en: 'You said patience is where you slip. The next time you feel rushed today, wait ten full breaths before you answer or act.', es: 'Dijiste que la paciencia es donde fallas. La próxima vez que sientas prisa hoy, espera diez respiraciones completas antes de responder o actuar.' },
    courage: { en: 'You said courage is where you slip. Name the one thing you have been putting off out of fear, and take the first step on it before noon.', es: 'Dijiste que el valor es donde fallas. Nombra lo que has dejado para después por miedo y da el primer paso antes del mediodía.' },
    providing: { en: 'You said providing is where you slip. Do one thing today that puts money, food or time in the hands of the people who count on you.', es: 'Dijiste que proveer es donde fallas. Haz hoy una cosa que ponga dinero, comida o tiempo en manos de quienes cuentan contigo.' },
    leading: { en: 'You said leading is where you slip. Make one decision today that you have been waiting for someone else to make.', es: 'Dijiste que dirigir es donde fallas. Toma hoy una decisión que has estado esperando que otro tome.' },
    calm: { en: 'You said staying calm under pressure is where you slip. When the pressure comes today, lower your voice and slow your hands.', es: 'Dijiste que mantener la calma bajo presión es donde fallas. Cuando llegue la presión hoy, baja la voz y mueve las manos más despacio.' },
    promises: { en: 'You said keeping promises to yourself is where you slip. Make one small promise for today, write it down, and keep it before bed.', es: 'Dijiste que cumplirte las promesas es donde fallas. Hazte hoy una promesa pequeña, escríbela y cúmplela antes de dormir.' },
  },
  avoid: {
    fear: { en: 'You said you avoid fear. Do one thing today that makes your heart beat faster, on purpose.', es: 'Dijiste que evitas el miedo. Haz hoy, a propósito, una cosa que te acelere el corazón.' },
    conflict: { en: 'You said you avoid conflict. Say one true thing today that you would normally swallow.', es: 'Dijiste que evitas el conflicto. Di hoy una verdad que normalmente te callarías.' },
    hardconv: { en: 'You said you avoid hard conversations. Start the one you have been putting off, even if you only open it.', es: 'Dijiste que evitas las conversaciones difíciles. Empieza la que has estado aplazando, aunque solo sea abrirla.' },
    discomfort: { en: 'You said you avoid physical discomfort. Take a cold shower or a hard walk today and finish it.', es: 'Dijiste que evitas la incomodidad física. Date hoy una ducha fría o una caminata dura y termínala.' },
    weak: { en: 'You said you avoid being seen as weak. Ask one person for help today with something real.', es: 'Dijiste que evitas que te vean débil. Pídele hoy ayuda a una persona con algo real.' },
    publicfail: { en: 'You said you avoid failing in public. Try one thing today where others can see you get it wrong.', es: 'Dijiste que evitas fallar en público. Intenta hoy algo donde otros puedan verte equivocarte.' },
    responsibility: { en: 'You said you avoid responsibility for others. Take charge of one task today that someone else is waiting on.', es: 'Dijiste que evitas la responsabilidad por otros. Hazte cargo hoy de una tarea que otra persona está esperando.' },
  },
};
const REMINDER = { en: 'In your own words, the man you want to become would say:', es: 'En tus propias palabras, el hombre que quieres ser diría:' };

function loadCatalog(file) {
  const cat = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!cat || !Array.isArray(cat.lessons) || !cat.lessons.length) throw new Error('lessons catalog is empty');
  return cat.lessons;
}
const defaultCatalogPath = () => path.join(__dirname, '..', '..', 'lessons.json');

function seeded(email, date, key) { return parseInt(crypto.createHash('sha256').update(`${email}|${date}|${key}`).digest('hex').slice(0, 8), 16); }

/** Picks the catalog lesson: theme lanes weigh 3, admired lanes 1; never one already sent; never one dated after `date`. */
function pickLesson(catalog, { email, themes = [], answers = {}, sentLessonDates = [], date }) {
  const admired = (answers.admire || []).map((a) => ADMIRE_LANE[a]).filter(Boolean);
  const sent = new Set(sentLessonDates);
  const pool = catalog.filter((l) => l.date <= date);
  let open = pool.filter((l) => !sent.has(l.date));
  if (!open.length) open = pool; // every lesson already sent once: start over
  const score = (l) => (l.lanes || []).reduce((s, x) => s + (themes.includes(x) ? 3 : 0) + (admired.includes(x) ? 1 : 0), 0);
  const best = Math.max(...open.map(score));
  const top = open.filter((l) => score(l) === best).sort((a, b) => (a.date < b.date ? 1 : -1));
  return { lesson: top[seeded(email, date, 'pick') % top.length], score: best };
}

function focusLine(answers, lang, email, date) {
  const opts = [];
  for (const k of answers.fail || []) if (FOCUS.fail[k]) opts.push(FOCUS.fail[k]);
  for (const k of answers.avoid || []) if (FOCUS.avoid[k]) opts.push(FOCUS.avoid[k]);
  if (!opts.length) return null;
  return opts[seeded(email, date, 'focus') % opts.length][lang];
}

/**
 * Builds the subscriber's lesson for `date`. Throws HumanizeError if the
 * humanizer would change a fact, or if any AI writing habit is left.
 */
function buildPersonalLesson(catalog, user, date) {
  const answers = user.answers || {};
  const lang = user.lang === 'es' ? 'es' : 'en';
  const { lesson: base, score } = pickLesson(catalog, { email: user.email, themes: user.themes || [], answers, sentLessonDates: (user.sentLessons || []).map((s) => s.lessonDate), date });
  const focus = { en: focusLine(answers, 'en', user.email, date), es: focusLine(answers, 'es', user.email, date) };
  const en = { date: base.date, title: base.title, quote: base.quote, source: base.source, sourceUrl: base.sourceUrl, lanes: base.lanes, lesson: base.lesson, today: [base.today, focus.en].filter(Boolean).join(' ') };
  const human = humanizeLesson(en); // fact guard: throws if a number, name, link or protected field moves
  const left = HUMANIZED_FIELDS.flatMap((k) => aiTells(human[k]).map((t) => `${k}: ${t}`));
  if (left.length) throw new HumanizeError(`AI writing habits left: ${left.join(', ')}`);
  let out;
  if (lang === 'es') {
    out = { title: base.title_es || human.title, quote: base.quote_es || base.quote, lesson: base.lesson_es || human.lesson, today: [base.today_es || base.today, focus.es].filter(Boolean).join(' '), source: base.source_es || base.source };
    const esLeft = ['title', 'lesson', 'today'].flatMap((k) => aiTells(out[k], { neutralOnly: true }).map((t) => `${k}_es: ${t}`));
    if (esLeft.length) throw new HumanizeError(`Spanish tells left: ${esLeft.join(', ')}`);
  } else {
    out = { title: human.title, quote: human.quote, lesson: human.lesson, today: human.today, source: human.source };
  }
  const chair = answers.emptychair ? { label: REMINDER[lang], words: answers.emptychair } : null;
  return Object.assign(out, {
    date, lang, lessonDate: base.date, sourceUrl: base.sourceUrl || null, image: base.image, imageAlt: base.imageAlt, lanes: base.lanes,
    personalized: { themes: user.themes || [], matchScore: score, focus: focus[lang], reminder: chair },
  });
}

module.exports = { loadCatalog, defaultCatalogPath, pickLesson, buildPersonalLesson, FOCUS, ADMIRE_LANE };
