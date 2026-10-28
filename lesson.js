(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.WarriorLesson = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var LAST_LESSONS_KEY = 'last_lessons_payload';
  var LAST_RENDERED_KEY = 'last_rendered_lesson';
  var LANG_KEY = 'dw-lang';

  var STRINGS = {
    en: {
      appName: "Daily Warrior's Lesson",
      appNameShort: "Warrior's Lesson",
      language: 'Language',
      pickerTitle: 'Language · Idioma',
      english: 'English',
      espanol: 'Español',
      archive: 'Archive',
      archiveNav: 'Archive →',
      accountNav: 'Account →',
      ideaNav: 'Send an idea →',
      forge: 'The Forge',
      forgeBrand: 'The Forge',
      forgeNav: 'The Forge — personalize your path →',
      forgeShortNav: 'The Forge →',
      todayLesson: "Today's lesson",
      backToToday: "← Today's lesson",
      previousLessons: 'Previous Lessons',
      loading: 'Loading…',
      emptyArchive: 'No previous lessons yet.',
      archiveError: 'Could not load the archive.',
      retry: 'Retry',
      imageUnavailable: 'Image unavailable offline',
      sourceLabel: 'Source',
      quoteLabel: 'Quote',
      lessonLabel: 'Lesson',
      todayLabel: 'Today:',
      aimedAt: 'Aimed at {name} — your Forged path',
      untitled: 'Untitled lesson'
    },
    es: {
      appName: 'Lección del Guerrero Diario',
      appNameShort: 'Lección del Guerrero',
      language: 'Idioma',
      pickerTitle: 'Language · Idioma',
      english: 'English',
      espanol: 'Español',
      archive: 'Archivo',
      archiveNav: 'Archivo →',
      accountNav: 'Cuenta →',
      ideaNav: 'Envía una idea →',
      forge: 'La Forja',
      forgeBrand: 'La Forja',
      forgeNav: 'La Forja — personaliza tu camino →',
      forgeShortNav: 'La Forja →',
      todayLesson: 'Lección de hoy',
      backToToday: '← Lección de hoy',
      previousLessons: 'Lecciones anteriores',
      loading: 'Cargando…',
      emptyArchive: 'Aún no hay lecciones anteriores.',
      archiveError: 'No se pudo cargar el archivo.',
      retry: 'Reintentar',
      imageUnavailable: 'Imagen no disponible sin conexión',
      sourceLabel: 'Fuente',
      quoteLabel: 'Cita',
      lessonLabel: 'Lección',
      todayLabel: 'Hoy:',
      aimedAt: 'Dirigido a {name} — tu camino forjado',
      untitled: 'Lección sin título'
    }
  };

  var DEFAULT_LESSON = {
    "date": "2026-10-28",
    "title": "Found His Work",
    "image": "https://upload.wikimedia.org/wikipedia/commons/2/2b/Thomas_Carlyle_by_James_McNeill_Whistler.jpg",
    "imageAlt": "Portrait of Thomas Carlyle by James McNeill Whistler, oil painting",
    "fallback": "./images/2026-09-04.jpg",
    "source": "Thomas Carlyle, Past and Present, Book III, Chapter XI, \"Labour,\" 1843 (Project Gutenberg)",
    "sourceUrl": "https://www.gutenberg.org/ebooks/26159",
    "quote": "Blessed is he who has found his work; let him ask no other blessedness.",
    "lesson": "Thomas Carlyle was the son of a Scottish stonemason who walked to university and became one of the best known writers of his time. In Past and Present he looked at a country full of idle men and unhappy workers. He said there is always hope in a man who actually and earnestly works, and only despair in idleness. A person who has found real work to do does not need to go looking for happiness somewhere else. The work drains off the worry, the way a stream turns a swamp into a green meadow. You don't need to find yourself first. Find the work in front of you and do it well.",
    "today": "Pick the one task today that matters most to your future. Give it a full hour of honest effort before you check your phone or messages.",
    "lanes": [
      "builder",
      "thinker"
    ],
    "title_es": "Encontró su obra",
    "source_es": "Thomas Carlyle, Pasado y presente (Past and Present), Libro III, Capítulo XI, \"El trabajo\" (Labour), 1843 (traducción fiel al español del original inglés en Project Gutenberg)",
    "quote_es": "Bienaventurado aquel que ha encontrado su obra; que no pida otra bienaventuranza.",
    "lesson_es": "Thomas Carlyle era hijo de un cantero escocés, fue caminando a la universidad y llegó a ser uno de los escritores más conocidos de su tiempo. En Pasado y presente miró un país lleno de hombres ociosos y trabajadores infelices. Dijo que siempre hay esperanza en un hombre que trabaja de verdad y con empeño, y solo desesperación en la ociosidad. Una persona que ha encontrado un trabajo real que hacer no necesita salir a buscar la felicidad en otra parte. El trabajo drena la preocupación, como un arroyo que convierte un pantano en un prado verde. No necesitas encontrarte a ti mismo primero. Encuentra el trabajo que tienes delante y hazlo bien.",
    "today_es": "Elige la tarea de hoy que más importa para tu futuro. Dale una hora completa de esfuerzo honesto antes de revisar tu teléfono o tus mensajes."
  };

  var LANE_LABEL = {warrior:'Warrior',thinker:'Thinker',builder:'Builder',power:'Power',faith:'Faith',odyssey:'Odyssey'};
  // Spanish lane labels: Web Copy gap file 2026-10-13, section 4 (verbatim).
  var LANE_LABEL_ES = {warrior:'Guerrero',thinker:'Pensador',builder:'Constructor',power:'Poder',faith:'Fe',odyssey:'Odisea'};

  function hashStamp(stamp) {
    var n = 0;
    for (var i = 0; i < stamp.length; i++) n = (n * 31 + stamp.charCodeAt(i)) >>> 0;
    return n;
  }

  // Calendar day in America/Chicago. UTC midnight is still the previous evening there.
  function chicagoDate(now) {
    var d = now instanceof Date ? now : new Date(now == null ? Date.now() : now);
    try {
      var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
      function g(t) {
        for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return parts[i].value;
        return '';
      }
      var y = g('year'), m = g('month'), day = g('day');
      if (/^\d{4}$/.test(y) && /^\d{2}$/.test(m) && /^\d{2}$/.test(day)) return y + '-' + m + '-' + day;
    } catch (e) {}
    return d.toISOString().slice(0, 10);
  }

  function lessonForDisplay(lesson, date) {
    if (!lesson) return lesson;
    var out = {};
    for (var k in lesson) if (Object.prototype.hasOwnProperty.call(lesson, k)) out[k] = lesson[k];
    if (out.date && out.date !== date) out.lessonDate = out.date;
    out.date = date;
    return out;
  }

  var LANES = ['warrior', 'thinker', 'builder', 'odyssey', 'power', 'faith'];
  var LOCALIZED_FIELDS = ['title', 'quote', 'lesson', 'today', 'source'];

  // Return a copy of the lesson with Spanish text when lang is 'es'.
  // Any missing _es field falls back to the English one.
  function localizeLesson(lesson, lang) {
    if (!lesson) return lesson;
    var out = {};
    for (var k in lesson) if (Object.prototype.hasOwnProperty.call(lesson, k)) out[k] = lesson[k];
    if (lang === 'es') {
      for (var i = 0; i < LOCALIZED_FIELDS.length; i++) {
        var f = LOCALIZED_FIELDS[i];
        var v = lesson[f + '_es'];
        if (typeof v === 'string' && v.trim()) out[f] = v;
      }
    }
    return out;
  }

  function hasAnyLane(lesson, lanes) {
    if (!lesson || !lesson.lanes) return false;
    for (var i = 0; i < lanes.length; i++) if (lesson.lanes.indexOf(lanes[i]) !== -1) return true;
    return false;
  }

  // 70 / 30: seven days in ten draw from the lessons tagged with one of the
  // user's Forge lanes (primary or secondary); three in ten draw from the
  // other lanes so the feed is not one note. Same day + same path = same pick.
  function pickPersonalized(lessons, forged, stamp) {
    if (!forged || !forged.primary) return null;
    var mine = [forged.primary];
    if (forged.secondary && forged.secondary !== forged.primary) mine.push(forged.secondary);
    var inLanes = lessons.filter(function (l) { return hasAnyLane(l, mine); });
    var others = lessons.filter(function (l) { return l.lanes && l.lanes.length && !hasAnyLane(l, mine); });
    var pool = (hashStamp(stamp) % 10 < 7 ? inLanes : others);
    if (!pool.length) pool = inLanes.length ? inLanes : others;
    if (!pool.length) return null;
    return pool[hashStamp(stamp + mine.join('/')) % pool.length];
  }

  function pickDailyLesson(lessons, opts) {
    opts = opts || {};
    var aimed = null;
    if (opts.dateParam) {
      var found = (lessons || []).find(function (l) { return l.date === opts.dateParam; });
      if (found) return { lesson: found, aimed: null };
    }
    if (opts.forged && opts.forged.primary) {
      aimed = LANE_LABEL[opts.forged.primary] + (opts.forged.secondary ? ' / ' + LANE_LABEL[opts.forged.secondary] : '');
      var seed = opts.stamp || '';
      // The page shows today's Chicago date. The catalog date stays on lessonDate
      // so a lane pick from an older day is not labeled as that older day.
      var day = /^\d{4}-\d{2}-\d{2}$/.test(String(seed)) ? seed : chicagoDate(opts.now);
      var picked = pickPersonalized(lessons || [], opts.forged, seed || day);
      var lesson = picked || (lessons && lessons[0]) || DEFAULT_LESSON;
      return { lesson: lessonForDisplay(lesson, day), aimed: aimed };
    }
    if (lessons && lessons.length) {
      var latest = lessons.slice().sort(function (a, b) {
        return (b.date || '').localeCompare(a.date || '');
      })[0];
      return { lesson: latest, aimed: null };
    }
    return { lesson: DEFAULT_LESSON, aimed: null };
  }

  function persistLastLessons(storage, data) {
    if (!storage) return;
    try { storage.setItem(LAST_LESSONS_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function readLastLessons(storage) {
    if (!storage) return null;
    try {
      var raw = storage.getItem(LAST_LESSONS_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data && data.lessons && data.lessons.length) return data;
    } catch (e) {}
    return null;
  }

  function persistLastRendered(storage, picked) {
    if (!storage || !picked || !picked.lesson) return;
    try { storage.setItem(LAST_RENDERED_KEY, JSON.stringify(picked)); } catch (e) {}
  }

  function readLastRendered(storage) {
    if (!storage) return null;
    try {
      var raw = storage.getItem(LAST_RENDERED_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (data && data.lesson) return data;
    } catch (e) {}
    return null;
  }

  function normalizeLang(value) {
    return value === 'en' || value === 'es' ? value : null;
  }

  function readLang(storage) {
    if (!storage) return null;
    try {
      return normalizeLang(storage.getItem(LANG_KEY));
    } catch (e) {}
    return null;
  }

  function writeLang(storage, lang) {
    var normalized = normalizeLang(lang);
    if (!normalized) return null;
    if (storage) {
      try { storage.setItem(LANG_KEY, normalized); } catch (e) {}
    }
    return normalized;
  }

  function t(lang, key, vars) {
    var pack = lang === 'es' ? STRINGS.es : STRINGS.en;
    var value = pack && pack[key];
    if (value == null || value === '') {
      value = STRINGS.en[key];
    }
    if (value == null) return '';
    if (vars) {
      value = String(value).replace(/\{(\w+)\}/g, function (_, name) {
        return vars[name] == null ? '' : String(vars[name]);
      });
    }
    return value;
  }

  function formatAimed(lang, aimed) {
    if (!aimed) return '';
    if (lang === 'es') {
      aimed = String(aimed).split(' / ').map(function (n) {
        for (var k in LANE_LABEL) if (LANE_LABEL[k] === n) return LANE_LABEL_ES[k];
        return n;
      }).join(' / ');
    }
    return t(lang, 'aimedAt', { name: aimed });
  }

  function syncLangChips(doc, lang) {
    if (!doc || !doc.querySelectorAll) return;
    var chips = doc.querySelectorAll('[data-set-lang]');
    for (var i = 0; i < chips.length; i++) {
      var on = chips[i].getAttribute('data-set-lang') === lang;
      if (chips[i].classList) chips[i].classList.toggle('active', on);
      chips[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function applyChrome(doc, lang) {
    if (!doc) return 'en';
    lang = normalizeLang(lang) || 'en';
    var root = doc.documentElement;
    if (root && root.setAttribute) {
      root.setAttribute('lang', lang);
      root.setAttribute('dir', 'ltr');
      root.setAttribute('data-lang-ready', lang);
    }
    var nodes = doc.querySelectorAll ? doc.querySelectorAll('[data-i18n]') : [];
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(lang, nodes[i].getAttribute('data-i18n'));
    }
    if (root && root.getAttribute && doc.title !== undefined) {
      var titleKey = root.getAttribute('data-i18n-title');
      if (titleKey) {
        doc.title = titleKey === 'appName'
          ? t(lang, 'appName')
          : t(lang, titleKey) + ' — ' + t(lang, 'appName');
      }
    }
    var apple = doc.querySelector ? doc.querySelector('meta[name=\"apple-mobile-web-app-title\"]') : null;
    if (apple) apple.setAttribute('content', t(lang, 'appNameShort'));
    syncLangChips(doc, lang);
    return lang;
  }

  function bindLangPicker(doc, storage, onPick) {
    if (!doc || !doc.getElementById) return;
    var picker = doc.getElementById('lang-picker');
    if (!picker || picker.getAttribute('data-bound') === '1') return;
    picker.setAttribute('data-bound', '1');
    picker.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-lang]') : null;
      if (!btn) return;
      var lang = writeLang(storage, btn.getAttribute('data-lang'));
      if (!lang) return;
      applyChrome(doc, lang);
      if (onPick) onPick(lang);
    });
  }

  function bindLangSettings(doc, storage, onChange) {
    if (!doc || (doc.documentElement && doc.documentElement.getAttribute('data-lang-settings-bound') === '1')) return;
    if (doc.documentElement && doc.documentElement.setAttribute) {
      doc.documentElement.setAttribute('data-lang-settings-bound', '1');
    }
    doc.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-set-lang]') : null;
      if (!btn) return;
      var lang = writeLang(storage, btn.getAttribute('data-set-lang'));
      if (!lang) return;
      applyChrome(doc, lang);
      if (onChange) onChange(lang);
    });
  }

  function startLang(doc, storage, onReady) {
    if (doc) bindLangSettings(doc, storage, onReady);
    var lang = readLang(storage);
    if (lang) {
      if (doc) applyChrome(doc, lang);
      if (onReady) onReady(lang);
      return lang;
    }
    if (doc) bindLangPicker(doc, storage, onReady);
    return null;
  }

  function resolveLesson(deps) {
    deps = deps || {};
    var storage = deps.storage;
    var opts = deps.opts || {};
    return Promise.resolve()
      .then(function () { return deps.fetchJson('lessons.json'); })
      .then(function (data) {
        persistLastLessons(storage, data);
        var picked = pickDailyLesson((data && data.lessons) || [], opts);
        persistLastRendered(storage, picked);
        return { lesson: picked.lesson, aimed: picked.aimed, source: 'network' };
      })
      .catch(function () {
        var last = readLastRendered(storage);
        if (last && last.lesson) {
          return { lesson: last.lesson, aimed: last.aimed || null, source: 'last-rendered' };
        }
        var catalog = readLastLessons(storage);
        if (catalog) {
          var picked = pickDailyLesson(catalog.lessons, opts);
          return { lesson: picked.lesson, aimed: picked.aimed, source: 'last-catalog' };
        }
        return { lesson: DEFAULT_LESSON, aimed: null, source: 'default' };
      });
  }

  return {
    DEFAULT_LESSON: DEFAULT_LESSON,
    LANE_LABEL: LANE_LABEL,
    LANE_LABEL_ES: LANE_LABEL_ES,
    LANES: LANES,
    localizeLesson: localizeLesson,
    LAST_LESSONS_KEY: LAST_LESSONS_KEY,
    LAST_RENDERED_KEY: LAST_RENDERED_KEY,
    LANG_KEY: LANG_KEY,
    STRINGS: STRINGS,
    hashStamp: hashStamp,
    pickPersonalized: pickPersonalized,
    pickDailyLesson: pickDailyLesson,
    chicagoDate: chicagoDate,
    persistLastLessons: persistLastLessons,
    readLastLessons: readLastLessons,
    persistLastRendered: persistLastRendered,
    readLastRendered: readLastRendered,
    resolveLesson: resolveLesson,
    normalizeLang: normalizeLang,
    readLang: readLang,
    writeLang: writeLang,
    t: t,
    formatAimed: formatAimed,
    applyChrome: applyChrome,
    startLang: startLang
  };
});
