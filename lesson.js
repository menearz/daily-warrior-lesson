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
    "date": "2026-10-13",
    "title": "Doers of the Word",
    "image": "https://upload.wikimedia.org/wikipedia/commons/b/bf/Martin_Schongauer%2C_The_Battle_of_Saint_James_at_Clavijo%2C_c._1470-1475%2C_NGA_33864.jpg",
    "imageAlt": "Martin Schongauer — The Battle of Saint James at Clavijo (c. 1470–75), full landscape engraving, National Gallery of Art, public domain",
    "fallback": "./images/2026-09-04.jpg",
    "source": "James 1:22 (King James Version)",
    "quote": "But be ye doers of the word, and not hearers only, deceiving your own selves.",
    "lesson": "James is not collecting listeners. Hearing the word and stopping there is self-deception. The man who looks at his face in a mirror and walks away, forgetting what he saw, is the hearer who nods and does nothing. The deed is the test. Faith that stays in the head does not move the hands. The work proves what the words only claimed.",
    "today": "Before noon, take one clear instruction you already know and do it. Do not explain why it counts.",
    "lanes": [
      "faith",
      "builder"
    ],
    "title_es": "Hacedores de la palabra",
    "quote_es": "Mas sed hacedores de la palabra, y no tan solamente oidores, engañándoos á vosotros mismos.",
    "lesson_es": "Santiago no está juntando oyentes. Oír la palabra y quedarse ahí es engañarse. El hombre que se mira la cara en un espejo y se va, olvidando lo que vio, es el oyente que asiente y no hace nada. La obra es la prueba. La fe que se queda en la cabeza no mueve las manos. El trabajo demuestra lo que las palabras solo afirmaban.",
    "today_es": "Antes del mediodía, toma una instrucción clara que ya conoces y cúmplela. No expliques por qué cuenta.",
    "source_es": "Santiago 1:22 (Reina-Valera 1909)",
    "sourceUrl": "https://www.gutenberg.org/ebooks/10"
  };

  var LANE_LABEL = {warrior:'Warrior',thinker:'Thinker',builder:'Builder',power:'Power',faith:'Faith',odyssey:'Odyssey'};

  function hashStamp(stamp) {
    var n = 0;
    for (var i = 0; i < stamp.length; i++) n = (n * 31 + stamp.charCodeAt(i)) >>> 0;
    return n;
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
      var picked = pickPersonalized(lessons || [], opts.forged, opts.stamp || '');
      return { lesson: picked || (lessons && lessons[0]) || DEFAULT_LESSON, aimed: aimed };
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
    LANES: LANES,
    localizeLesson: localizeLesson,
    LAST_LESSONS_KEY: LAST_LESSONS_KEY,
    LAST_RENDERED_KEY: LAST_RENDERED_KEY,
    LANG_KEY: LANG_KEY,
    STRINGS: STRINGS,
    hashStamp: hashStamp,
    pickPersonalized: pickPersonalized,
    pickDailyLesson: pickDailyLesson,
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
