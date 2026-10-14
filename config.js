// Where the Daily Warrior API lives. Harbor deploys it to this subdomain.
window.DW_API_BASE = window.DW_API_BASE || 'https://dw-api.arbiterresearch.net';

// SITE LAUNCH FLAG (one switch, default OFF). While OFF the live Pages site
// hides every sign-in / subscribe / account / plans entry point (elements
// marked data-account-entry, hidden in markup by default so it fails closed),
// and a direct visit to signin/plans/account shows a plain not-open-yet notice
// and makes no API calls. The site twin of the API's DW_LAUNCH: flip both
// together, API first (DW_LAUNCH=1 needs seller/support/refund set).
window.DW_ACCOUNTS_OPEN = false;

// "Send an idea" Google Form link. Shown whether or not accounts are open.
// Empty = no link shown anywhere. Label EN/ES is ours (Web Copy had none).
window.DW_IDEA_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSehRZ6PBTylJ9W8Df3mB_wS1d0FKaV75jPN9qfPAJFyz1kfkw/viewform';

(function (w) {
  var NOTICE = {
    en: 'Accounts and Forge plans are not open yet. The daily lesson is still free, every day.',
    es: 'Las cuentas y los planes de La Forja todavía no están abiertos. La lección diaria sigue gratis, todos los días.',
    back: { en: "Today's lesson", es: 'Lección de hoy' },
  };
  w.DW_NOT_OPEN_NOTICE = NOTICE;
  if (typeof document === 'undefined') return;
  var root = document.documentElement;
  var open = w.DW_ACCOUNTS_OPEN === true;
  root.classList.toggle('dw-accounts-open', open);
  function apply() {
    var idea = String(w.DW_IDEA_FORM_URL || '').trim();
    var ideaOk = /^https:\/\/[^\s"<>]+$/.test(idea);
    var ideas = document.querySelectorAll('[data-idea-link]');
    for (var j = 0; j < ideas.length; j++) {
      ideas[j].hidden = !ideaOk;
      if (ideaOk) { ideas[j].setAttribute('href', idea); ideas[j].setAttribute('target', '_blank'); ideas[j].setAttribute('rel', 'noopener'); }
    }
    var entries = document.querySelectorAll('[data-account-entry]');
    for (var i = 0; i < entries.length; i++) entries[i].hidden = !open;
    if (open || !document.body || !document.body.hasAttribute('data-account-page')) return;
    var lang = 'en';
    try { if (localStorage.getItem('dw-lang') === 'es') lang = 'es'; } catch (e) {}
    var box = document.createElement('main');
    box.id = 'not-open';
    box.setAttribute('role', 'status');
    box.style.cssText = 'max-width:560px;margin:48px auto;padding:0 20px;font:16px/1.5 Georgia,serif;color:#ece6da';
    var p = document.createElement('p'); p.textContent = NOTICE[lang];
    var a = document.createElement('a'); a.href = './index.html'; a.textContent = NOTICE.back[lang]; a.style.color = '#FF6A1A';
    box.appendChild(p); box.appendChild(a);
    document.body.textContent = '';
    document.body.appendChild(box);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})(window);
