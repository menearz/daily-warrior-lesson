'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const WarriorLesson = require('../lesson.js');

const root = path.join(__dirname, '..');

function memoryStorage(initial) {
  const data = Object.assign({}, initial);
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
    _data: data,
  };
}

function mockDoc() {
  const htmlAttrs = {};
  const pickerFns = [];
  const docFns = [];
  const picker = {
    _attrs: {},
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null;
    },
    setAttribute(name, value) {
      this._attrs[name] = String(value);
    },
    addEventListener(type, fn) {
      if (type === 'click') pickerFns.push(fn);
    },
  };
  const i18nNodes = [
    { textContent: '', getAttribute: () => 'appName' },
    { textContent: '', getAttribute: () => 'language' },
    { textContent: '', getAttribute: () => 'archiveNav' },
    { textContent: '', getAttribute: () => 'forgeNav' },
  ];
  const chips = ['en', 'es'].map(function (code) {
    return {
      classList: { toggle: function () {} },
      attrs: {},
      getAttribute: function (name) {
        if (name === 'data-set-lang') return code;
        return this.attrs[name] || null;
      },
      setAttribute: function (name, value) {
        this.attrs[name] = String(value);
      },
    };
  });
  return {
    title: "Daily Warrior's Lesson",
    documentElement: {
      getAttribute: function (name) {
        return Object.prototype.hasOwnProperty.call(htmlAttrs, name) ? htmlAttrs[name] : null;
      },
      setAttribute: function (name, value) {
        htmlAttrs[name] = String(value);
      },
      attrs: htmlAttrs,
    },
    getElementById: function (id) {
      return id === 'lang-picker' ? picker : null;
    },
    querySelector: function () {
      return null;
    },
    querySelectorAll: function (sel) {
      if (sel === '[data-i18n]') return i18nNodes;
      if (sel === '[data-set-lang]') return chips;
      return [];
    },
    addEventListener: function (type, fn) {
      if (type === 'click') docFns.push(fn);
    },
    pick: function (lang) {
      const btn = {
        getAttribute: function (name) {
          return name === 'data-lang' ? lang : null;
        },
        closest: function (sel) {
          return sel === '[data-lang]' ? btn : null;
        },
      };
      pickerFns.forEach(function (fn) {
        fn({ target: btn });
      });
    },
    setLang: function (lang) {
      const btn = {
        getAttribute: function (name) {
          return name === 'data-set-lang' ? lang : null;
        },
        closest: function (sel) {
          return sel === '[data-set-lang]' ? btn : null;
        },
      };
      docFns.forEach(function (fn) {
        fn({ target: btn });
      });
    },
    i18nNodes: i18nNodes,
    htmlAttrs: htmlAttrs,
  };
}

test('storage key is dw-lang and unset reads as null', () => {
  assert.equal(WarriorLesson.LANG_KEY, 'dw-lang');
  const storage = memoryStorage();
  assert.equal(WarriorLesson.readLang(storage), null);
  assert.equal(storage.getItem('dw-lang'), null);
});

test('picker write persists en and es across a simulated reload', () => {
  const firstOpen = memoryStorage();
  assert.equal(WarriorLesson.readLang(firstOpen), null);

  WarriorLesson.writeLang(firstOpen, 'es');
  assert.equal(firstOpen.getItem('dw-lang'), 'es');

  const reopened = memoryStorage({ 'dw-lang': firstOpen.getItem('dw-lang') });
  assert.equal(WarriorLesson.readLang(reopened), 'es');

  WarriorLesson.writeLang(reopened, 'en');
  const again = memoryStorage({ 'dw-lang': reopened.getItem('dw-lang') });
  assert.equal(WarriorLesson.readLang(again), 'en');
});

test('invalid dw-lang values are ignored and not written', () => {
  const storage = memoryStorage();
  assert.equal(WarriorLesson.writeLang(storage, 'fr'), null);
  assert.equal(WarriorLesson.writeLang(storage, 'ES'), null);
  assert.equal(WarriorLesson.writeLang(storage, ''), null);
  assert.equal(storage.getItem('dw-lang'), null);
  const polluted = memoryStorage({ 'dw-lang': 'fr' });
  assert.equal(WarriorLesson.readLang(polluted), null);
});

test('startLang does not write dw-lang until the picker is tapped', () => {
  const storage = memoryStorage();
  const doc = mockDoc();
  const seen = [];
  const result = WarriorLesson.startLang(doc, storage, function (lang) {
    seen.push(lang);
  });
  assert.equal(result, null);
  assert.equal(storage.getItem('dw-lang'), null);
  assert.deepEqual(seen, []);
  assert.equal(doc.htmlAttrs['data-lang-ready'], undefined);

  doc.pick('es');
  assert.equal(storage.getItem('dw-lang'), 'es');
  assert.equal(WarriorLesson.readLang(storage), 'es');
  assert.deepEqual(seen, ['es']);
  assert.equal(doc.htmlAttrs.lang, 'es');
  assert.equal(doc.htmlAttrs.dir, 'ltr');
  assert.equal(doc.htmlAttrs['data-lang-ready'], 'es');
});

test('startLang restores saved language without showing a new pick', () => {
  const storage = memoryStorage({ 'dw-lang': 'en' });
  const doc = mockDoc();
  const seen = [];
  const result = WarriorLesson.startLang(doc, storage, function (lang) {
    seen.push(lang);
  });
  assert.equal(result, 'en');
  assert.deepEqual(seen, ['en']);
  doc.pick('es');
  assert.equal(storage.getItem('dw-lang'), 'en');
  assert.deepEqual(seen, ['en']);
});

test('settings chips switch language immediately and persist', () => {
  const storage = memoryStorage({ 'dw-lang': 'en' });
  const doc = mockDoc();
  const seen = [];
  WarriorLesson.startLang(doc, storage, function (lang) {
    seen.push(lang);
  });
  doc.setLang('es');
  assert.equal(storage.getItem('dw-lang'), 'es');
  assert.equal(doc.htmlAttrs.lang, 'es');
  assert.equal(doc.i18nNodes[1].textContent, 'Idioma');
  assert.ok(seen.indexOf('es') !== -1);
});

test('English chrome strings match the spec', () => {
  assert.equal(WarriorLesson.t('en', 'appName'), "Daily Warrior's Lesson");
  assert.equal(WarriorLesson.t('en', 'language'), 'Language');
  assert.equal(WarriorLesson.t('en', 'archive'), 'Archive');
  assert.equal(WarriorLesson.t('en', 'forge'), 'The Forge');
  assert.equal(WarriorLesson.t('en', 'imageUnavailable'), 'Image unavailable offline');
  assert.equal(WarriorLesson.t('en', 'emptyArchive'), 'No previous lessons yet.');
  assert.equal(WarriorLesson.t('en', 'retry'), 'Retry');
  assert.equal(WarriorLesson.t('en', 'pickerTitle'), 'Language · Idioma');
});

test('Spanish chrome strings match the spec', () => {
  assert.equal(WarriorLesson.t('es', 'appName'), 'Lección del Guerrero Diario');
  assert.equal(WarriorLesson.t('es', 'appNameShort'), 'Lección del Guerrero');
  assert.equal(WarriorLesson.t('es', 'language'), 'Idioma');
  assert.equal(WarriorLesson.t('es', 'archive'), 'Archivo');
  assert.equal(WarriorLesson.t('es', 'forge'), 'La Forja');
  assert.equal(WarriorLesson.t('es', 'imageUnavailable'), 'Imagen no disponible sin conexión');
  assert.equal(WarriorLesson.t('es', 'emptyArchive'), 'Aún no hay lecciones anteriores.');
  assert.equal(WarriorLesson.t('es', 'retry'), 'Reintentar');
  assert.equal(WarriorLesson.t('es', 'loading'), 'Cargando…');
  assert.equal(WarriorLesson.t('es', 'archiveError'), 'No se pudo cargar el archivo.');
});

test('missing key and unknown locale fall back to English, never blank chrome', () => {
  assert.equal(WarriorLesson.t('fr', 'appName'), WarriorLesson.STRINGS.en.appName);
  const saved = WarriorLesson.STRINGS.es.retry;
  delete WarriorLesson.STRINGS.es.retry;
  try {
    assert.equal(WarriorLesson.t('es', 'retry'), 'Retry');
    assert.notEqual(WarriorLesson.t('es', 'retry'), '');
  } finally {
    WarriorLesson.STRINGS.es.retry = saved;
  }
  assert.equal(WarriorLesson.t('es', 'notARealKey'), '');
  assert.equal(WarriorLesson.t('en', 'notARealKey'), '');
});

test('applyChrome LTR and Spanish chrome, leaving no RTL', () => {
  const doc = mockDoc();
  doc.documentElement.setAttribute('data-i18n-title', 'appName');
  WarriorLesson.applyChrome(doc, 'es');
  assert.equal(doc.htmlAttrs.lang, 'es');
  assert.equal(doc.htmlAttrs.dir, 'ltr');
  assert.notEqual(doc.htmlAttrs.dir, 'rtl');
  assert.equal(doc.title, 'Lección del Guerrero Diario');
  assert.equal(doc.i18nNodes[0].textContent, 'Lección del Guerrero Diario');
  assert.equal(doc.i18nNodes[1].textContent, 'Idioma');
  assert.equal(doc.i18nNodes[2].textContent, 'Archivo →');
  assert.match(doc.i18nNodes[3].textContent, /La Forja/);
});

test('aimed chrome localizes wrapper but keeps the lane name as given', () => {
  assert.equal(
    WarriorLesson.formatAimed('en', 'Warrior / Thinker'),
    'Aimed at Warrior / Thinker — your Forged path'
  );
  assert.equal(
    WarriorLesson.formatAimed('es', 'Warrior / Thinker'),
    'Dirigido a Warrior / Thinker — tu camino forjado'
  );
});

test('i18n tables do not contain lesson quotes, sources, or teaching bodies', () => {
  const blob = JSON.stringify(WarriorLesson.STRINGS);
  assert.equal(blob.includes('The impediment to action'), false);
  assert.equal(blob.includes('Marcus Aurelius'), false);
  assert.equal(blob.includes('Meditations'), false);
  assert.equal(blob.includes(WarriorLesson.DEFAULT_LESSON.quote), false);
  assert.equal(blob.includes(WarriorLesson.DEFAULT_LESSON.lesson), false);
  assert.equal(blob.includes(WarriorLesson.DEFAULT_LESSON.source), false);
});

test('index.html first-open picker is Language · Idioma with English and Español', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="lang-picker"/);
  assert.match(html, /Language · Idioma/);
  assert.match(html, /data-lang="en">English</);
  assert.match(html, /data-lang="es">Español</);
  assert.match(html, /background:#0B0D10/);
  assert.match(html, /localStorage\.getItem\(['"]dw-lang['"]\)/);
  assert.match(html, /dir="ltr"/);
  assert.doesNotMatch(html, /dir="rtl"/);
});

test('index.html briefing has Language/Idioma settings chips', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /data-i18n="language"/);
  assert.match(html, /data-set-lang="en"/);
  assert.match(html, /data-set-lang="es"/);
  assert.match(html, /WarriorLesson\.startLang/);
});

test('index.html assigns quote, source, title, and lesson body from LESSON, not i18n', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /getElementById\('title'\)\.textContent = LESSON\.title/);
  assert.match(html, /getElementById\('source'\)\.textContent = LESSON\.source/);
  assert.match(html, /getElementById\('quote'\)\.textContent = LESSON\.quote/);
  assert.match(html, /getElementById\('lesson'\)\.textContent = LESSON\.lesson/);
  assert.match(html, /LESSON\.today/);
  assert.doesNotMatch(html, /t\([^)]*['"]quote['"]/);
  assert.doesNotMatch(html, /data-i18n="quote"/);
});

test('forge.html has picker plus Language/Idioma chrome control', () => {
  const html = fs.readFileSync(path.join(root, 'forge.html'), 'utf8');
  assert.match(html, /id="lang-picker"/);
  assert.match(html, /Language · Idioma/);
  assert.match(html, /data-set-lang="en"/);
  assert.match(html, /data-i18n="language"/);
  assert.match(html, /dir="ltr"/);
  assert.match(html, /WarriorLesson\.startLang/);
});

test('archive.html localizes empty, retry, and broken-image chrome', () => {
  const html = fs.readFileSync(path.join(root, 'archive.html'), 'utf8');
  assert.match(html, /emptyArchive/);
  assert.match(html, /archiveError/);
  assert.match(html, /retry/);
  assert.match(html, /imageUnavailable/);
  assert.match(html, /id="lang-picker"/);
  assert.match(html, /l\.title/);
  assert.match(html, /l\.source/);
});
