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

  var DEFAULT_LESSON = {
    date: "2026-09-05",
    title: "Difficulties Show What Men Are",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Manuel_Dom%C3%ADnguez_S%C3%A1nchez_-_El_suicidio_de_S%C3%A9neca.jpg/1280px-Manuel_Dom%C3%ADnguez_S%C3%A1nchez_-_El_suicidio_de_S%C3%A9neca.jpg",
    imageAlt: "Manuel Domínguez Sánchez — The Death of Seneca (1871), full landscape painting, Museo del Prado",
    fallback: "https://upload.wikimedia.org/wikipedia/commons/d/d5/Manuel_Dom%C3%ADnguez_S%C3%A1nchez_-_El_suicidio_de_S%C3%A9neca.jpg",
    source: "Epictetus, Discourses 1.24 (George Long translation)",
    quote: "It is difficulties that show what men are. For the future, in case of any difficulty, remember that God, like a gymnastic trainer, has pitted you against a rough antagonist.",
    lesson: "Trials do not merely test the warrior—they reveal him. Epictetus, once a slave under a brutal master, treated every hardship as the trainer’s match: not punishment, but the only route to real strength. The rough antagonist is the forge. Strategy over raw force means meeting the difficulty as the sparring partner that builds the capacity you will need next. Armor and appearance are not the thing; the character that holds under pressure is.",
    today: "The next friction is your rough antagonist. Meet it as the trainer intended—then move.",
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
    hashStamp: hashStamp,
    pickPersonalized: pickPersonalized,
    pickDailyLesson: pickDailyLesson,
    persistLastLessons: persistLastLessons,
    readLastLessons: readLastLessons,
    persistLastRendered: persistLastRendered,
    readLastRendered: readLastRendered,
    resolveLesson: resolveLesson
  };
});
