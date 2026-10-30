/* global window, navigator, document */
/* Sets <html lang> from the stored language preference before React mounts, so the first paint and
 * assistive technology see the right language. Plain classic script: no inline code, so it works under
 * a CSP of script-src 'self' (S1-12). Mirrors src/i18n/locale-storage.ts (key, supported locales,
 * navigator fallback); src/i18n/early-lang.test.ts keeps the two in step. Tolerant to storage errors:
 * any failure leaves the static lang="en" from index.html. */
(function () {
  try {
    var lang = null;
    try {
      var stored = window.localStorage.getItem('kalinga.locale');
      if (stored === 'en' || stored === 'fil') lang = stored;
    } catch {
      /* storage blocked or unavailable: fall through to the navigator preference */
    }
    if (!lang) {
      var list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language];
      for (var i = 0; i < list.length; i++) {
        var base = String(list[i] || '').toLowerCase().split('-')[0];
        if (base === 'fil' || base === 'tl') { lang = 'fil'; break; }
        if (base === 'en') { lang = 'en'; break; }
      }
    }
    if (lang) document.documentElement.setAttribute('lang', lang);
  } catch {
    /* never block page load */
  }
})();
