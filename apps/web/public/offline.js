/* global document, location */
/* Offline page retry button. External file on purpose: the production CSP (script-src 'self') blocks inline handlers. */
(function () {
  'use strict';
  var btn = document.getElementById('retry');
  if (btn) btn.addEventListener('click', function () { location.reload(); });
})();
