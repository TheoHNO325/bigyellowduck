(function () {
  var root = document.documentElement;
  var body = document.body;
  var bar = document.getElementById('read-progress');
  var KEY_MODE = 'novel-read-mode';
  var KEY_FONT = 'novel-font-step';
  var KEY_DUCK = 'novel-duck-bg';
  var MODES = ['light', 'sepia', 'dark'];
  var prefersReduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function applyMode(m) {
    if (MODES.indexOf(m) === -1) m = 'sepia';
    root.setAttribute('data-read-mode', m);
    try {
      localStorage.setItem(KEY_MODE, m);
    } catch (e) {}
  }

  function themeFlash() {
    var flash = document.getElementById('novel-theme-flash');
    if (!flash || prefersReduced) return;
    flash.classList.add('is-active');
    clearTimeout(flash._novelT);
    flash._novelT = setTimeout(function () {
      flash.classList.remove('is-active');
    }, 340);
  }

  function setMode(m) {
    if (MODES.indexOf(m) === -1) m = 'sepia';
    var run = function () {
      applyMode(m);
      themeFlash();
    };
    if (typeof document.startViewTransition === 'function' && !prefersReduced) {
      document.startViewTransition(run);
    } else {
      run();
    }
  }

  var fontStep = parseInt(localStorage.getItem(KEY_FONT) || '0', 10);
  if (isNaN(fontStep)) fontStep = 0;

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
    syncDuckMascot();
  }

  function syncDuckButton() {
    var btn = document.querySelector('[data-duck-toggle]');
    if (!btn) return;
    var on = root.hasAttribute('data-duck-bg');
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function syncDuckMascot() {
    var el = document.getElementById('novel-duck-mascot');
    if (!el) return;
    var on = root.hasAttribute('data-duck-bg') && !body.classList.contains('novel-body--home');
    el.classList.toggle('is-visible', on);
    el.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  function ensureDuckMascot() {
    if (body.classList.contains('novel-body--home')) return null;
    var el = document.getElementById('novel-duck-mascot');
    if (el) return el;
    el = document.createElement('button');
    el.type = 'button';
    el.id = 'novel-duck-mascot';
    el.className = 'novel-duck-mascot';
    el.setAttribute('aria-label', '大黄鸭');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<span class="novel-duck-mascot__ico" aria-hidden="true">\uD83E\uDD86</span>';
    el.addEventListener('click', function () {
      el.classList.remove('is-wiggle');
      void el.offsetWidth;
      el.classList.add('is-wiggle');
    });
    body.appendChild(el);
    return el;
  }

  try {
    applyMode(localStorage.getItem(KEY_MODE) || 'sepia');
  } catch (e) {
    applyMode('sepia');
  }
  applyFont();

  if (!body.classList.contains('novel-body--home')) {
    try {
      if (localStorage.getItem(KEY_DUCK) === '1') {
        root.setAttribute('data-duck-bg', '1');
      }
    } catch (e) {}
    ensureDuckMascot();
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
  syncDuckMascot();

  function updateProgress() {
    if (!bar) return;
    var doc = document.documentElement;
    var scrollTop = window.scrollY || doc.scrollTop;
    var max = doc.scrollHeight - window.innerHeight;
    var p = max > 0 ? scrollTop / max : 1;
    bar.style.transform = 'scaleX(' + clamp(p, 0, 1) + ')';
  }

  function updateReadNextDock() {
    var dock = document.getElementById('novel-read-dock');
    var content = document.querySelector('.novel-post__content');
    if (!dock || !content) return;
    var len = content.offsetHeight;
    if (len <= 0) return;
    var vh = window.innerHeight;
    var crect = content.getBoundingClientRect();
    var top = crect.top + window.scrollY;
    var rel = (window.scrollY + vh * 0.52 - top) / len;
    var show = rel > 0.46 && rel < 0.9;
    dock.classList.toggle('is-visible', show);
  }

  function onScroll() {
    updateProgress();
    updateReadNextDock();
    updateFinale();
  }

  function initHeroParallax() {
    if (prefersReduced) return;
    var hero = document.querySelector('.novel-hero');
    var bg = document.querySelector('.novel-hero__bg');
    if (!hero || !bg) return;
    var t;
    hero.addEventListener('mousemove', function (e) {
      clearTimeout(t);
      var r = hero.getBoundingClientRect();
      var px = ((e.clientX - r.left) / r.width - 0.5) * 2;
      var py = ((e.clientY - r.top) / r.height - 0.5) * 2;
      bg.classList.add('is-parallax');
      bg.style.setProperty('--hero-pan-x', px * -20 + 'px');
      bg.style.setProperty('--hero-pan-y', py * -16 + 'px');
    });
    hero.addEventListener('mouseleave', function () {
      t = setTimeout(function () {
        bg.classList.remove('is-parallax');
        bg.style.removeProperty('--hero-pan-x');
        bg.style.removeProperty('--hero-pan-y');
      }, 100);
    });
  }

  function initMagneticCards() {
    if (prefersReduced) return;
    document.querySelectorAll('.novel-index__list .novel-card').forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        var cx = r.left + r.width * 0.5;
        var cy = r.top + r.height * 0.5;
        var dx = (e.clientX - cx) / (r.width * 0.5);
        var dy = (e.clientY - cy) / (r.height * 0.5);
        var mx = clamp(dx * 8, -8, 8);
        var my = clamp(dy * 7, -7, 7) - 2;
        card.style.transform = 'translate(' + mx + 'px,' + my + 'px)';
      });
      card.addEventListener('mouseleave', function () {
        card.style.transform = '';
      });
    });
  }

  function initChapterRail() {
    var rail = document.getElementById('novel-chapter-rail');
    var head = document.getElementById('novel-post-head');
    if (!rail || !head || typeof IntersectionObserver === 'undefined') return;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          rail.classList.toggle('is-visible', !en.isIntersecting);
        });
      },
      { root: null, rootMargin: '-52px 0px 0px 0px', threshold: 0 }
    );
    io.observe(head);
  }

  function updateFinale() {
    var el = document.getElementById('novel-finale');
    if (!el || el.classList.contains('is-done')) return;
    var art = document.querySelector('article.novel-post');
    if (!art) return;
    var key = 'novel-finale-shown:' + location.pathname;
    try {
      if (sessionStorage.getItem(key)) {
        el.removeAttribute('hidden');
        requestAnimationFrame(function () {
          el.classList.add('is-visible');
        });
        el.classList.add('is-done');
        return;
      }
    } catch (e) {}
    var top = art.offsetTop;
    var h = art.offsetHeight;
    var vy = window.scrollY + window.innerHeight;
    var ratio = h > 0 ? (vy - top) / h : 0;
    if (ratio > 0.9) {
      el.removeAttribute('hidden');
      requestAnimationFrame(function () {
        el.classList.add('is-visible');
      });
      el.classList.add('is-done');
      try {
        sessionStorage.setItem(key, '1');
      } catch (e2) {}
    }
  }

  function initFinale() {
    var el = document.getElementById('novel-finale');
    if (!el) return;
    updateFinale();
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  updateProgress();
  updateReadNextDock();

  initHeroParallax();
  initMagneticCards();
  initChapterRail();
  initFinale();

  if (typeof document.startViewTransition === 'function') {
    root.classList.add('novel-supports-vt');
  }
})();
