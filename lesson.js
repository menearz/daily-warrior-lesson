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
    date: "2026-09-10",
    title: "Those Who Have Learned How to Die",
    image: "https://upload.wikimedia.org/wikipedia/commons/5/50/Luca_giordano%2C_morte_di_seneca%2C_1684-85_ca..JPG",
    imageAlt: "Luca Giordano — The Death of Seneca (c. 1684–85), full landscape painting, Louvre Museum",
    fallback: "./images/2026-09-10.jpg",
    source: "Seneca, Moral Letters to Lucilius 26",
    quote: "Those who have learned how to die have unlearned how to be slaves.",
    lesson: "Fearlessness is not swagger. It is the quiet rehearsal that removes the only chain that binds a free man—the love of life as something that can be taken. Trials forge the warrior by teaching that the external can touch the body and the reputation, but never the citadel. Strategy over raw strength begins with the knowledge that the box waits for both king and pawn. Armor and appearance are not the thing.",
    today: "Rehearse one small ending today. Release one attachment that has been owning your attention. Then return to the work.",
    lanes: ["thinker","warrior"]
  };

  var LANE_LABEL = {warrior:'Warrior',thinker:'Thinker',builder:'Builder',power:'Power',faith:'Faith',odyssey:'Odyssey'};

  function hashStamp(stamp) {
    var n = 0;
    for (var i = 0; i < stamp.length; i++) n = (n * 31 + stamp.charCodeAt(i)) >>> 0;
    return n;
  }

  function pickPersonalized(lessons, forged, stamp) {
    if (!forged || !forged.primary) return null;
    var primary = lessons.filter(function(l){ return l.lanes && l.lanes.indexOf(forged.primary) !== -1; });
    var secondary = lessons.filter(function(l){ return l.lanes && forged.secondary && l.lanes.indexOf(forged.secondary) !== -1; });
    var pool = (hashStamp(stamp) % 10 < 7 ? primary : secondary);
    if (!pool.length) pool = primary.length ? primary : secondary;
    if (!pool.length) return null;
    return pool[hashStamp(stamp + (forged.primary || '')) % pool.length];
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
