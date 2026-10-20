/* Daily Warrior account client: magic-link sign-in, bearer + rotating
 * refresh tokens, entitlement cache, and sync of forged_path + read dates.
 * Wording is Web Copy's draft (2026-10-13) where it exists. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.DWAccount = api;
})(typeof self !== 'undefined' ? self : this, function () {
  var AUTH_KEY = 'dw_auth';
  var ENT_KEY = 'dw_entitlement';
  var READS_KEY = 'dw_reads';
  var ENT_MAX_AGE = 3 * 864e5; // trust a cached "active" for 3 days offline

  var T = {
    en: {
      signinTitle: 'Save your path',
      signinHelper: "Your Forge answers are on this phone right now. Sign up and they'll follow you to any device.",
      email: 'Email', emailPh: 'you@example.com',
      sendLink: 'Send my sign-in link',
      sendLinkHelper: "We'll email you a link. No password to remember.",
      sentTitle: 'Check your email.',
      sent: 'We sent a link to {email}. It works once and expires soon.',
      sendAgain: 'Send it again', otherEmail: 'Use a different email',
      badEmail: "That email doesn't look right. Check it and try again.",
      expired: 'That link has expired. We can send a new one.', sendNew: 'Send new link',
      network: "We couldn't connect. Check your signal and try again. Your answers are still saved on this phone.",
      tooMany: 'Too many tries. Wait a few minutes and try again.',
      plansTitle: 'Pick your plan',
      monthly: 'Monthly: $4.99 a month.', monthlySub: 'Cancel any time.',
      yearly: 'Yearly: $39.99 a year.', yearlySub: 'About a third less than paying monthly.',
      start: 'Start The Forge',
      underButton: 'Renews automatically until you cancel. Cancel in two taps from Manage plan.',
      freeStays: 'Free stays free. Every reader still gets the daily lesson (painting, quote, lesson, and one act for today) in English and Spanish, plus the archive. The Forge adds the aimed feed and your saved answers on every device.',
      paymentCancelled: "Payment cancelled. You weren't charged. Your free daily lesson is still here.", backToPlans: 'Back to plans',
      testMode: 'Test mode: checkout is not live yet, so no card will be charged.',
      confirmTitle: 'Your path is forged.',
      confirmBody: "You're on The Forge, {plan}. Starting tomorrow morning, your lesson is aimed at your two lanes: {primary} and {secondary}. A receipt is on its way to {email}.",
      seeToday: "See today's lesson",
      confirmSmall: 'Manage or cancel any time in Manage plan.',
      account: 'Account', signedInAs: 'Signed in as {email}',
      planRow: 'The Forge, {plan}. Renews {date}.',
      planEnds: 'Cancelled. You have The Forge until {date}. No more charges.',
      noPlan: 'Free plan: the daily lesson and the archive.',
      testerBadge: 'Tester',
      freeAccess: 'Full access, no payment needed.',
      manage: 'Manage plan', cancelPlan: 'Cancel plan', choosePlan: 'Pick your plan',
      deleteLine: 'Want your answers gone?', deleteBtn: 'Delete my account and answers',
      deleteConfirm: 'Delete your account and answers for good?',
      signOut: 'Sign out', synced: 'Your path and reading history are saved to your account.',
      syncNeedsPlan: 'Your Forge answers stay on this phone until you pick a plan.',
      signIn: 'Sign in', monthlyName: 'Monthly', yearlyName: 'Yearly',
      createTitle: 'Create an account',
      createHelper: 'Create an account to read the lesson. We email you a link. No password.',
      included: 'The daily lesson, the questions, and your path are included with your account.',
      loading: 'Loading…',
    },
    es: {
      signinTitle: 'Guarda tu camino',
      signinHelper: 'Por ahora tus respuestas de La Forja están en este teléfono. Regístrate y te seguirán a cualquier dispositivo.',
      email: 'Correo electrónico', emailPh: 'tu@correo.com',
      sendLink: 'Enviarme el enlace',
      sendLinkHelper: 'Te mandamos un enlace por correo. Sin contraseñas.',
      sentTitle: 'Revisa tu correo.',
      sent: 'Mandamos un enlace a {email}. Sirve una sola vez y vence pronto.',
      sendAgain: 'Reenviar', otherEmail: 'Usar otro correo',
      badEmail: 'Ese correo no parece correcto. Revísalo e inténtalo de nuevo.',
      expired: 'Ese enlace ya venció. Te mandamos uno nuevo.', sendNew: 'Enviar enlace nuevo',
      network: 'No pudimos conectarnos. Revisa tu señal e inténtalo de nuevo. Tus respuestas siguen guardadas en este teléfono.',
      tooMany: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.',
      plansTitle: 'Elige tu plan',
      monthly: 'Mensual: US$4.99 al mes.', monthlySub: 'Cancela cuando quieras.',
      yearly: 'Anual: US$39.99 al año.', yearlySub: 'Cerca de un tercio menos que pagar mes a mes.',
      start: 'Empezar La Forja',
      underButton: 'Se renueva solo hasta que canceles. Cancela en dos toques desde Administrar plan.',
      freeStays: 'Lo gratis sigue gratis. Todos siguen recibiendo la lección diaria (pintura, cita, lección y una acción para hoy) en español e inglés, y el archivo. La Forja suma la lección dirigida y tus respuestas guardadas en todos tus dispositivos.',
      paymentCancelled: 'Cancelaste el pago. No se te cobró nada. Tu lección diaria gratis sigue aquí.', backToPlans: 'Volver a los planes',
      testMode: 'Modo de prueba: el pago todavía no está activo, así que no se cobrará ninguna tarjeta.',
      confirmTitle: 'Tu camino está forjado.',
      confirmBody: 'Ya tienes La Forja, plan {plan}. Desde mañana, tu lección apunta a tus dos caminos: {primary} y {secondary}. Te enviamos el recibo a {email}.',
      seeToday: 'Ver la lección de hoy',
      confirmSmall: 'Administra o cancela cuando quieras desde Administrar plan.',
      account: 'Cuenta', signedInAs: 'Sesión iniciada como {email}',
      planRow: 'La Forja, {plan}. Se renueva el {date}.',
      planEnds: 'Listo, cancelado. Tienes La Forja hasta el {date}. No habrá más cobros.',
      noPlan: 'Plan gratis: la lección diaria y el archivo.',
      testerBadge: 'Probador',
      freeAccess: 'Acceso completo, sin pago.',
      manage: 'Administrar plan', cancelPlan: 'Cancelar plan', choosePlan: 'Elige tu plan',
      deleteLine: '¿Quieres borrar tus respuestas?', deleteBtn: 'Eliminar mi cuenta y mis respuestas',
      deleteConfirm: '¿Eliminar tu cuenta y tus respuestas para siempre?',
      signOut: 'Cerrar sesión', synced: 'Tu camino y tu historial de lectura están guardados en tu cuenta.',
      syncNeedsPlan: 'Tus respuestas de La Forja se quedan en este teléfono hasta que elijas un plan.',
      signIn: 'Iniciar sesión', monthlyName: 'Mensual', yearlyName: 'Anual',
      createTitle: 'Crea una cuenta',
      createHelper: 'Crea una cuenta para leer la lección. Te enviamos un enlace. Sin contraseña.',
      included: 'La lección diaria, las preguntas y tu camino van incluidos con tu cuenta.',
      loading: 'Cargando…',
    },
  };
  var LANE_ES = { warrior: 'Guerrero', thinker: 'Pensador', builder: 'Constructor', odyssey: 'Odisea', power: 'Poder', faith: 'Fe' };
  var LANE_EN = { warrior: 'Warrior', thinker: 'Thinker', builder: 'Builder', odyssey: 'Odyssey', power: 'Power', faith: 'Faith' };

  function t(lang, key, vars) {
    var s = (T[lang] || T.en)[key] || T.en[key] || '';
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? String(vars[k]) : ''; });
  }
  function laneName(lang, lane) { return (lang === 'es' ? LANE_ES : LANE_EN)[lane] || lane || ''; }

  function read(storage, key) { try { return JSON.parse(storage.getItem(key)); } catch (e) { return null; } }
  function write(storage, key, v) { try { if (v == null) storage.removeItem(key); else storage.setItem(key, JSON.stringify(v)); } catch (e) {} }

  // Phone copies of account data. dw-lang stays: it is the screen language, not an account.
  var USER_KEYS = ['dw_auth', 'dw_entitlement', 'dw_reads', 'dw_profile', 'dw_answers', 'dw_history', 'forged_path', 'last_rendered_lesson'];
  var USER_KEY_RE = /^(dw_auth|dw_entitlement|dw_reads|dw_profile|dw_answers|dw_history|forged_path|last_rendered_lesson)$/;
  function storageKeys(storage) {
    var keys = [];
    try {
      if (storage && typeof storage.key === 'function' && typeof storage.length === 'number') {
        for (var i = 0; i < storage.length; i++) keys.push(storage.key(i));
        return keys;
      }
    } catch (e) {}
    if (storage && storage._m) return Object.keys(storage._m);
    return keys;
  }
  function clearUserLocal(storage, session) {
    USER_KEYS.forEach(function (k) { write(storage, k, null); });
    storageKeys(storage).forEach(function (k) { if (USER_KEY_RE.test(k)) write(storage, k, null); });
    if (!session) return;
    try { if (typeof session.clear === 'function') { session.clear(); return; } } catch (e) {}
    storageKeys(session).forEach(function (k) { try { session.removeItem(k); } catch (e) {} });
  }
  function isPerUserCacheUrl(url) {
    return /\/(me|questionnaire|sync|auth|billing)(\/|\?|$)/.test(String(url || ''));
  }
  function clearUserCaches(cachesApi) {
    if (!cachesApi || typeof cachesApi.keys !== 'function') return Promise.resolve();
    return cachesApi.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        return cachesApi.open(name).then(function (cache) {
          return cache.keys().then(function (reqs) {
            return Promise.all(reqs.filter(function (req) { return isPerUserCacheUrl(req && req.url); }).map(function (req) { return cache.delete(req); }));
          });
        });
      }));
    }).catch(function () {});
  }
  function pageLang(storage) {
    try { return storage && storage.getItem('dw-lang') === 'es' ? 'es' : 'en'; } catch (e) { return 'en'; }
  }

  /** Union of read dates, newest-path-wins for forged_path (same rule as the API). */
  function mergeLocal(storage, me) {
    if (!me || !me.entitled) return;
    var local = read(storage, 'forged_path');
    if (me.forgedPath && (!local || Number(me.forgedPath.at) >= Number(local.at || 0))) write(storage, 'forged_path', me.forgedPath);
    var reads = read(storage, READS_KEY) || [];
    var set = {}; reads.concat(me.reads || []).forEach(function (d) { set[d] = 1; });
    write(storage, READS_KEY, Object.keys(set).sort());
  }

  function recordRead(storage, date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return;
    var reads = read(storage, READS_KEY) || [];
    if (reads.indexOf(date) === -1) { reads.push(date); reads.sort(); write(storage, READS_KEY, reads.slice(-3650)); }
  }

  /** Personalized 70/30 picks need an active plan (cached from /me). */
  function isEntitledCached(storage, now) {
    var e = read(storage, ENT_KEY);
    return Boolean(e && e.entitled && (now || Date.now()) - Number(e.at || 0) < ENT_MAX_AGE);
  }

  // Refund policy + seller/support lines: Web Copy gap file 2026-10-13,
  // sections 1 and 5 (verbatim). Seller, support address and refund policy
  // choice are pending Zachary; the API's /legal returns {pending:true} until
  // all three are configured, and then nothing here is shown (no placeholders).
  var REFUND = {
    'webcopy-2026-10-13': {
      en: { title: 'Refunds and cancelling', items: [
        'You can cancel anytime from your Account page. It takes a few taps.',
        "When you cancel, you keep The Forge until the end of the month or year you already paid for. After that, you won't be charged again.",
        "We don't give partial refunds for time you didn't use.",
        'If you delete your account, your plan stops right away, and so does your access to The Forge.',
        "If we charged you by mistake, for example twice, write to us at {support} and we'll fix it."],
        prices: "Prices: $4.99 a month or $39.99 a year. There's no free trial." },
      es: { title: 'Reembolsos y cancelación', items: [
        'Puedes cancelar cuando quieras desde la página de tu Cuenta. Solo toma unos toques.',
        'Si cancelas, sigues teniendo La Forja hasta que termine el mes o el año que ya pagaste. Después de eso, no se te cobra de nuevo.',
        'No damos reembolsos parciales por el tiempo que no usaste.',
        'Si borras tu cuenta, tu plan termina en ese momento, y también tu acceso a La Forja.',
        'Si te cobramos por error, por ejemplo dos veces, escríbenos a {support} y lo arreglamos.'],
        prices: 'Precios: US$4.99 al mes o US$39.99 al año. No hay prueba gratis.' },
    },
  };
  var SELLER = {
    en: 'Daily Warrior is a product of {seller}.',
    es: 'Daily Warrior es un producto de {seller}.',
  };
  /** Test-mode notice shows only when the API says Stripe is in test mode. */
  function showTestNotice(health) { return Boolean(health && health.stripeMode === 'test'); }

  /** Returns the refund + seller block for a complete /legal answer, else null. */
  function legalBlock(lang, legal) {
    if (!legal || legal.pending || !legal.sellerName || !legal.supportEmail || !legal.refundPolicy) return null;
    var pol = REFUND[legal.refundPolicy]; if (!pol) return null;
    var L = lang === 'es' ? 'es' : 'en', r = pol[L];
    function f(x) { return x.replace(/\{support\}/g, legal.supportEmail).replace(/\{seller\}/g, legal.sellerName); }
    return { title: r.title, items: r.items.map(f), prices: r.prices, seller: f(SELLER[L]) };
  }

  function create(opts) {
    // Site launch flag OFF: no network calls at all from account pages.
    var closed = typeof window !== 'undefined' && window.DW_ACCOUNTS_OPEN !== true && opts.ignoreLaunchFlag !== true;
    if (closed) opts = Object.assign({}, opts, { fetch: function () { return Promise.reject(new Error('accounts_not_open')); } });
    var storage = opts.storage, fetchFn = opts.fetch, base = String(opts.apiBase || '').replace(/\/$/, '');
    var session = opts.sessionStorage || null;
    var cachesApi = opts.caches || null;
    function auth() { return read(storage, AUTH_KEY); }
    function setAuth(a) { write(storage, AUTH_KEY, a ? { accessToken: a.accessToken, refreshToken: a.refreshToken, exp: Date.now() + (a.expiresIn || 900) * 1000 } : null); }

    function raw(method, path, body, token) {
      var headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = 'Bearer ' + token;
      return fetchFn(base + path, { method: method, headers: headers, credentials: 'include', body: body == null ? undefined : JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, data: d }; }); });
    }
    function refresh() {
      var a = auth();
      if (!a || !a.refreshToken) return Promise.resolve(false);
      return raw('POST', '/auth/refresh', { refreshToken: a.refreshToken }).then(function (r) {
        if (r.status === 200) { setAuth(r.data); return true; }
        setAuth(null); return false;
      });
    }
    function call(method, path, body) {
      var a = auth();
      var go = function () { var cur = auth(); return raw(method, path, body, cur && cur.accessToken); };
      var pre = a && a.exp && a.exp - Date.now() < 30e3 ? refresh() : Promise.resolve(true);
      return pre.then(go).then(function (r) {
        if (r.status !== 401 || !auth()) return r;
        return refresh().then(function (ok) { return ok ? go() : r; });
      });
    }
    function cacheMe(me) { write(storage, ENT_KEY, { entitled: Boolean(me && me.entitled), at: Date.now() }); return me; }

    return {
      t: t, laneName: laneName,
      signedIn: function () { return Boolean(auth()); },
      requestLink: function (email, lang) { return raw('POST', '/auth/magic', { email: email, lang: lang }); },
      verify: function (token) {
        return raw('POST', '/auth/verify', { token: token }).then(function (r) {
          if (r.status !== 200) return r;
          clearUserLocal(storage, session);
          setAuth(r.data);
          cacheMe(r.data.me);
          return clearUserCaches(cachesApi).then(function () { return r; });
        });
      },
      me: function () { return call('GET', '/me').then(function (r) { if (r.status === 200) cacheMe(r.data); return r; }); },
      /** Upload this phone's forged_path + read dates (first sign-in or any time), then merge back. */
      sync: function () {
        var body = { forgedPath: read(storage, 'forged_path'), reads: read(storage, READS_KEY) || [] };
        if (body.forgedPath && !body.forgedPath.at) body.forgedPath.at = 1;
        return call('PUT', '/sync', body).then(function (r) { if (r.status === 200) { mergeLocal(storage, r.data); cacheMe(r.data); } return r; });
      },
      legal: function () { return raw('GET', '/legal'); },
      health: function () { return raw('GET', '/health'); },
      checkout: function (plan) { return call('POST', '/billing/checkout', { plan: plan }); },
      portal: function () { return call('POST', '/billing/portal'); },
      setLang: function (lang) { return call('PUT', '/me/lang', { lang: lang }); },
      profile: function () { return call('GET', '/me/profile'); },
      saveProfile: function (p) { return call('PUT', '/me/profile', p); },
      questionnaire: function () { return call('GET', '/questionnaire'); },
      saveAnswers: function (answers) { return call('PUT', '/me/answers', { answers: answers }); },
      savePath: function (forgedPath) { return call('PUT', '/sync', { forgedPath: forgedPath }); },
      history: function () { return call('GET', '/me/history'); },
      recordHistory: function (date) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return Promise.resolve({ status: 400, data: { error: 'bad_date' } });
        return call('POST', '/me/history', { date: date });
      },
      lesson: function (date) { return call('GET', '/me/lesson' + (date ? '?date=' + encodeURIComponent(date) : '')); },
      remove: function () {
        return call('DELETE', '/me').then(function (r) {
          if (r.status !== 200) return r;
          clearUserLocal(storage, session);
          return clearUserCaches(cachesApi).then(function () { return r; });
        });
      },
      signOut: function () {
        var a = auth();
        // Drop the phone session before any network wait so the account
        // screen can clear the signed-in UI in the same turn.
        clearUserLocal(storage, session);
        return raw('POST', '/auth/logout', { refreshToken: a && a.refreshToken }, a && a.accessToken).catch(function () {}).then(function () {
          return clearUserCaches(cachesApi);
        });
      },
    };
  }

  // Profile form (account.html): themes, language, delivery time and zone.
  var LANES = ['warrior', 'thinker', 'builder', 'odyssey', 'power', 'faith'];
  var PROFILE_T = {
    en: { title: 'Your lessons', themes: 'Themes (pick up to 3)', lang: 'Language', time: 'Delivery time', zone: 'Time zone', save: 'Save', saved: 'Saved.', tooMany: 'Pick up to 3 themes.', badTime: 'Pick a delivery time.', badZone: 'Pick a time zone.', failed: 'Could not save. Try again.', needsPlan: 'Lesson emails go to subscribers. Your settings are saved for when you subscribe.', email: 'Your lesson email comes once a day at this time.' },
    es: { title: 'Tus lecciones', themes: 'Temas (elige hasta 3)', lang: 'Idioma', time: 'Hora de entrega', zone: 'Zona horaria', save: 'Guardar', saved: 'Guardado.', tooMany: 'Elige hasta 3 temas.', badTime: 'Elige una hora de entrega.', badZone: 'Elige una zona horaria.', failed: 'No se pudo guardar. Inténtalo de nuevo.', needsPlan: 'Los correos con la lección son para suscriptores. Tus ajustes quedan guardados para cuando te suscribas.', email: 'Tu correo con la lección llega una vez al día a esta hora.' },
  };
  function validateProfile(p) {
    if (!p || !Array.isArray(p.themes) || p.themes.length > 3 || p.themes.some(function (x) { return LANES.indexOf(x) < 0; })) return 'tooMany';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(p.deliveryTime || ''))) return 'badTime';
    if (!p.timezone || typeof p.timezone !== 'string') return 'badZone';
    try { new Intl.DateTimeFormat('en-US', { timeZone: p.timezone }); } catch (e) { return 'badZone'; }
    return null;
  }
  function timezones() {
    try { if (Intl.supportedValuesOf) return Intl.supportedValuesOf('timeZone'); } catch (e) {}
    return ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Mexico_City', 'Europe/London', 'Europe/Madrid', 'UTC'];
  }

  function mountCreateAccount(host, client, opts) {
    var doc = opts.document;
    var storage = opts.storage;
    if (!host || !doc || !client) return;
    try { host.textContent = ''; } catch (e) {}
    if (Array.isArray(host.children)) host.children.length = 0;
    function make(tag) {
      var n = doc.createElement(tag);
      if (typeof n.appendChild === 'function') return n;
      n.children = [];
      n.appendChild = function (c) { n.children.push(c); return c; };
      n.setAttribute = n.setAttribute || function (k, v) { n.attrs = n.attrs || {}; n.attrs[k] = v; };
      n.addEventListener = n.addEventListener || function (type, fn) { n._ev = n._ev || {}; (n._ev[type] = n._ev[type] || []).push(fn); };
      return n;
    }
    var lang = pageLang(storage);
    var title = make('h1');
    title.id = 'dw-create-title';
    var helper = make('p');
    var form = make('form');
    var label = make('label');
    label.setAttribute('for', 'dw-email');
    var input = make('input');
    input.id = 'dw-email';
    input.type = 'email';
    if (input.setAttribute) { input.setAttribute('type', 'email'); input.setAttribute('autocomplete', 'email'); }
    var button = make('button');
    button.type = 'submit';
    if (button.setAttribute) button.setAttribute('type', 'submit');
    var status = make('p');
    status.id = 'dw-create-status';
    if (status.setAttribute) status.setAttribute('role', 'status');
    var langRow = make('div');
    if (langRow.setAttribute) langRow.setAttribute('class', 'lang-chips');
    ['en', 'es'].forEach(function (code) {
      var b = make('button');
      b.type = 'button';
      b._gateLang = code;
      if (b.setAttribute) { b.setAttribute('type', 'button'); b.setAttribute('data-gate-lang', code); }
      b.textContent = code === 'es' ? 'Español' : 'English';
      b.addEventListener('click', function () {
        try { storage.setItem('dw-lang', code); } catch (e) {}
        lang = code;
        paint();
      });
      langRow.appendChild(b);
    });
    function paint() {
      title.textContent = client.t(lang, 'createTitle');
      helper.textContent = client.t(lang, 'createHelper');
      label.textContent = client.t(lang, 'email');
      if (input.setAttribute) input.setAttribute('placeholder', client.t(lang, 'emailPh'));
      button.textContent = client.t(lang, 'sendLink');
      var chips = langRow.children || [];
      for (var i = 0; i < chips.length; i++) {
        var on = chips[i]._gateLang === lang;
        if (chips[i].setAttribute) {
          chips[i].setAttribute('class', on ? 'lang-chip active' : 'lang-chip');
          chips[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
      }
    }
    form.addEventListener('submit', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      var email = String(input.value || '').trim();
      status.textContent = '';
      if (status.setAttribute) status.setAttribute('class', '');
      client.requestLink(email, lang).then(function (r) {
        var bad = r.status !== 202;
        if (r.status === 202) status.textContent = client.t(lang, 'sent', { email: email });
        else if (r.status === 400) status.textContent = client.t(lang, 'badEmail');
        else if (r.status === 429) status.textContent = client.t(lang, 'tooMany');
        else status.textContent = client.t(lang, 'network');
        if (status.setAttribute) status.setAttribute('class', bad ? 'err' : 'muted');
      }).catch(function () {
        status.textContent = client.t(lang, 'network');
        if (status.setAttribute) status.setAttribute('class', 'err');
      });
    });
    form.appendChild(label);
    form.appendChild(input);
    form.appendChild(button);
    host.appendChild(title);
    host.appendChild(helper);
    host.appendChild(form);
    host.appendChild(status);
    host.appendChild(langRow);
    paint();
  }

  function paintGateStatus(gate, doc, text) {
    if (!gate || !doc) return;
    try { gate.textContent = ''; } catch (e) {}
    if (Array.isArray(gate.children)) gate.children.length = 0;
    var p = doc.createElement('p');
    if (!p) return;
    p.textContent = text || 'Loading…';
    if (p.setAttribute) { p.setAttribute('role', 'status'); p.setAttribute('class', 'muted'); }
    if (typeof gate.appendChild === 'function') gate.appendChild(p);
  }

  /** Hide every signed-in account block in this turn, before logout or redirect. */
  function clearSignedInUi(doc) {
    if (!doc || typeof doc.getElementById !== 'function') return;
    ['signed-in', 'confirm', 'tester-badge'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (!el) return;
      if (el.classList && typeof el.classList.add === 'function') el.classList.add('hidden');
      if (el.className != null && String(el.className).indexOf('hidden') < 0) el.className = (String(el.className) + ' hidden').trim();
    });
    ['who', 'plan-line', 'sync-line', 'confirm-body', 'pf-msg'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (el) el.textContent = '';
    });
  }

  /** Show the create-account form only when there is no session, or /me says signed out.
   *  A token keeps a neutral loading line until /me returns. Clone #dw-app only after 200. */
  function openWhenSignedIn(opts) {
    opts = opts || {};
    var doc = opts.document;
    var client = opts.client;
    var gate = doc && doc.getElementById('dw-gate');
    var opened = false;
    var formShown = false;
    var lang = pageLang(opts.storage);
    function say(key) { return (client && client.t(lang, key)) || (key === 'loading' ? 'Loading…' : ''); }
    function reveal(me) {
      if (opened) return;
      opened = true;
      if (gate && typeof gate.remove === 'function') gate.remove();
      else if (gate && gate.parentNode) gate.parentNode.removeChild(gate);
      var tpl = doc.getElementById('dw-app');
      if (tpl && tpl.content && typeof tpl.content.cloneNode === 'function' && doc.body) doc.body.appendChild(tpl.content.cloneNode(true));
      if (typeof opts.onReady === 'function') opts.onReady(me);
      var g = typeof window !== 'undefined' ? window : null;
      if (g && typeof g.DW_applyChrome === 'function') g.DW_applyChrome();
    }
    function showGateForm() {
      if (formShown || opened) return;
      formShown = true;
      if (gate) mountCreateAccount(gate, client, opts);
    }
    var hasToken = Boolean(client && typeof client.signedIn === 'function' && client.signedIn());
    if (hasToken) paintGateStatus(gate, doc, say('loading'));
    else showGateForm();
    if (!client || typeof client.me !== 'function') return Promise.resolve(null);
    return client.me().then(function (r) {
      if (r && r.status === 200 && r.data && r.data.email) { reveal(r.data); return r; }
      var signedOut = !hasToken || (r && r.status === 401);
      if (r && r.status === 401) clearUserLocal(opts.storage, opts.sessionStorage);
      if (signedOut) { if (!opened) showGateForm(); return r; }
      if (!opened) paintGateStatus(gate, doc, say('network'));
      return r;
    }).catch(function () {
      if (!opened && !hasToken) showGateForm();
      else if (!opened) paintGateStatus(gate, doc, say('network'));
      return null;
    });
  }

  return { LANES: LANES, PROFILE_T: PROFILE_T, validateProfile: validateProfile, timezones: timezones, create: create, legalBlock: legalBlock, showTestNotice: showTestNotice, REFUND: REFUND, t: t, laneName: laneName, mergeLocal: mergeLocal, recordRead: recordRead, isEntitledCached: isEntitledCached, clearUserLocal: clearUserLocal, clearUserCaches: clearUserCaches, clearSignedInUi: clearSignedInUi, isPerUserCacheUrl: isPerUserCacheUrl, mountCreateAccount: mountCreateAccount, openWhenSignedIn: openWhenSignedIn, USER_KEYS: USER_KEYS, AUTH_KEY: AUTH_KEY, ENT_KEY: ENT_KEY, READS_KEY: READS_KEY, STRINGS: T };
});
