(function () {
  var root = document.documentElement;
  var body = document.body;
  var bar = document.getElementById('read-progress');
  var KEY_MODE = 'novel-read-mode';
  var KEY_FONT = 'novel-font-step';
  var KEY_DUCK = 'novel-duck-bg';
  var MODES = ['light', 'sepia', 'dark'];

  function setMode(m) {
    if (MODES.indexOf(m) === -1) m = 'sepia';
    root.setAttribute('data-read-mode', m);
    try {
      localStorage.setItem(KEY_MODE, m);
    } catch (e) {}
  }

  var fontStep = parseInt(localStorage.getItem(KEY_FONT) || '0', 10);
  if (isNaN(fontStep)) fontStep = 0;

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function applyFont() {
    fontStep = clamp(fontStep, -2, 4);
    root.style.setProperty('--novel-font-step', String(fontStep));
    try {
      localStorage.setItem(KEY_FONT, String(fontStep));
    } catch (e) {}
  }

  function setDuck(on) {
    var isHome = body.classList.contains('novel-body--home');
    if (isHome) return;
    if (on) {
      root.setAttribute('data-duck-bg', '1');
    } else {
      root.removeAttribute('data-duck-bg');
    }
    try {
      localStorage.setItem(KEY_DUCK, on ? '1' : '0');
    } catch (e) {}
    syncDuckButton();
  }

  function syncDuckButton() {
    var btn = document.querySelector('[data-duck-toggle]');
    if (!btn) return;
    var on = root.hasAttribute('data-duck-bg');
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  try {
    setMode(localStorage.getItem(KEY_MODE) || 'sepia');
  } catch (e) {
    setMode('sepia');
  }
  applyFont();

  if (!body.classList.contains('novel-body--home')) {
    try {
      if (localStorage.getItem(KEY_DUCK) === '1') {
        root.setAttribute('data-duck-bg', '1');
      }
    } catch (e) {}
  }

  document.querySelectorAll('[data-read-mode]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setMode(btn.getAttribute('data-read-mode'));
    });
  });
  document.querySelectorAll('[data-font]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      fontStep += parseInt(btn.getAttribute('data-font'), 10) || 0;
      applyFont();
    });
  });

  var duckBtn = document.querySelector('[data-duck-toggle]');
  if (duckBtn) {
    duckBtn.addEventListener('click', function () {
      setDuck(!root.hasAttribute('data-duck-bg'));
    });
  }
  syncDuckButton();

  function updateProgress() {
    if (!bar) return;
    var doc = document.documentElement;
    var scrollTop = window.scrollY || doc.scrollTop;
    var max = doc.scrollHeight - window.innerHeight;
    var p = max > 0 ? scrollTop / max : 1;
    bar.style.transform = 'scaleX(' + clamp(p, 0, 1) + ')';
  }

  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();
})();
