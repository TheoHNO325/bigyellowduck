(function () {
  var root = document.documentElement;
  var bar = document.getElementById('read-progress');
  var KEY_MODE = 'novel-read-mode';
  var KEY_FONT = 'novel-font-step';
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

  try {
    setMode(localStorage.getItem(KEY_MODE) || 'sepia');
  } catch (e) {
    setMode('sepia');
  }
  applyFont();

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
