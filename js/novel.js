(function () {
  if (window.__novelThemeInit) return;
  window.__novelThemeInit = true;

  var root = document.documentElement;
  var body = document.body;
  var bar = document.getElementById('read-progress');
  var KEY_MODE = 'novel-read-mode';
  var KEY_FLOW = 'novel-read-flow';
  var KEY_FONT = 'novel-font-step';
  var KEY_DUCK = 'novel-duck-bg';
  var MODES = ['light', 'sepia', 'dark'];
  var FLOWS = ['scroll', 'paged'];
  var prefersReduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function applyMode(m) {
    m = String(m || '').trim();
    if (MODES.indexOf(m) === -1) m = 'sepia';
    root.setAttribute('data-read-mode', m);
    try {
      localStorage.setItem(KEY_MODE, m);
    } catch (e) {}
  }

  function applyFlow(f) {
    f = String(f || '').trim();
    if (FLOWS.indexOf(f) === -1) f = 'scroll';
    root.setAttribute('data-read-flow', f);
    try {
      localStorage.setItem(KEY_FLOW, f);
    } catch (e) {}
    syncFlowButtons();
    if (f === 'paged') {
      enterPaged();
    } else {
      exitPaged();
    }
    requestAnimationFrame(updateProgress);
  }

  function syncFlowButtons() {
    var current = root.getAttribute('data-read-flow') || 'scroll';
    document.querySelectorAll('[data-read-flow]').forEach(function (btn) {
      var on = btn.getAttribute('data-read-flow') === current;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
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
    /* 不靠 View Transition：其 updateCallback 在部分浏览器/并发点击时可能不执行，导致永远不 applyMode，一直卡在「护」 */
    setDuck(false);
    applyMode(m);
    themeFlash();
  }

  var fontStep = parseInt(localStorage.getItem(KEY_FONT) || '0', 10);
  if (isNaN(fontStep)) fontStep = 0;

  function applyFont() {
    fontStep = clamp(fontStep, -2, 4);
    root.style.setProperty('--novel-font-step', String(fontStep));
    try {
      localStorage.setItem(KEY_FONT, String(fontStep));
    } catch (e) {}
    scheduleRepaginate();
  }

  /* ---------- 左右翻页（paged）阅读：JS 分页，规避多列布局滚动缺陷 ---------- */
  var pagedContent = null;
  var repaginateTimer = 0;
  var repaginating = false;
  var suppressObserverUntil = 0; // 抑制由自身分页动作触发的 MutationObserver

  function isPaged() {
    return root.getAttribute('data-read-flow') === 'paged';
  }

  function makePage(pw) {
    var page = document.createElement('div');
    page.className = 'novel-page';
    page.style.width = pw + 'px';
    return page;
  }

  function repaginate() {
    if (!isPaged() || !pagedContent) return;
    repaginating = true;
    suppressObserverUntil = Date.now() + 400;
    try {
      // 先把旧分页里的内容拆回原容器
      var oldPages = pagedContent.querySelectorAll('.novel-page');
      for (var i = oldPages.length - 1; i >= 0; i--) {
        var pg = oldPages[i];
        while (pg.firstChild) pagedContent.insertBefore(pg.firstChild, pg);
        pg.remove();
      }
      var pw = pagedContent.clientWidth;
      var ph = pagedContent.clientHeight;
      if (pw <= 0 || ph <= 0) return;
      var kids = Array.prototype.slice.call(pagedContent.children);
      if (!kids.length) return;
      var page = null;
      var acc = 0;
      kids.forEach(function (kid) {
        var cs = window.getComputedStyle(kid);
        var h =
          kid.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
        if (page && acc + h > ph + 1) {
          page = null;
          acc = 0;
        }
        if (!page) {
          page = makePage(pw);
          pagedContent.appendChild(page);
        }
        page.appendChild(kid);
        acc += h;
      });
    } finally {
      repaginating = false;
    }
    requestAnimationFrame(updateProgress);
  }

  function scheduleRepaginate() {
    if (!isPaged() || !pagedContent || repaginating) return;
    clearTimeout(repaginateTimer);
    repaginateTimer = setTimeout(repaginate, 150);
  }

  function enterPaged() {
    pagedContent = document.querySelector('.novel-post__content');
    if (!pagedContent) return;
    repaginate();
    pagedContent.scrollLeft = 0;
    var r = pagedContent.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      try {
        pagedContent.scrollIntoView({ block: 'start' });
      } catch (e) {}
    }
  }

  function exitPaged() {
    if (!pagedContent) return;
    var pages = pagedContent.querySelectorAll('.novel-page');
    for (var i = pages.length - 1; i >= 0; i--) {
      var pg = pages[i];
      while (pg.firstChild) pagedContent.insertBefore(pg.firstChild, pg);
      pg.remove();
    }
    pagedContent.scrollLeft = 0;
    pagedContent = null;
  }

  /* 诗歌正文排版：标注「~」分隔与「（…）」注释 */
  function initPoemLayout() {
    var content = document.querySelector('.novel-post--poetry .novel-post__content');
    if (!content) return;
    content.querySelectorAll('p').forEach(function (p) {
      var t = (p.textContent || '').trim();
      if (t === '~' || t === '～') {
        p.classList.add('novel-poem__break');
      } else if (t.charAt(0) === '（' || t.charAt(0) === '(') {
        p.classList.add('novel-poem__note');
      }
    });
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
  try {
    applyFlow(localStorage.getItem(KEY_FLOW) || 'scroll');
  } catch (e) {
    applyFlow('scroll');
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

  function toolbarButtonFromEvent(e) {
    var t = e.target;
    var el = t && t.nodeType === 1 ? t : t && t.parentElement;
    return el ? el.closest('button') : null;
  }

  var tools = document.querySelector('.novel-tools');
  if (tools) {
    tools.addEventListener('click', function (e) {
      var btn = toolbarButtonFromEvent(e);
      if (!btn || !tools.contains(btn)) return;
      if (btn.hasAttribute('data-read-mode')) {
        e.preventDefault();
        setMode(btn.getAttribute('data-read-mode'));
        return;
      }
      if (btn.hasAttribute('data-duck-toggle')) {
        e.preventDefault();
        setDuck(!root.hasAttribute('data-duck-bg'));
        return;
      }
      if (btn.hasAttribute('data-read-flow')) {
        e.preventDefault();
        applyFlow(btn.getAttribute('data-read-flow'));
        return;
      }
      if (btn.hasAttribute('data-font')) {
        e.preventDefault();
        fontStep += parseInt(btn.getAttribute('data-font'), 10) || 0;
        applyFont();
      }
    });
  }
  syncDuckButton();
  syncDuckMascot();

  function updateProgress() {
    if (!bar) return;
    var pagedContent = document.querySelector('.novel-post__content');
    if (root.getAttribute('data-read-flow') === 'paged' && pagedContent) {
      var maxLeft = pagedContent.scrollWidth - pagedContent.clientWidth;
      var hp = maxLeft > 0 ? pagedContent.scrollLeft / maxLeft : 1;
      bar.style.transform = 'scaleX(' + clamp(hp, 0, 1) + ')';
      return;
    }
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

  function initPagedReading() {
    var content = document.querySelector('.novel-post__content');
    if (!content) return;
    content.addEventListener(
      'scroll',
      function () {
        if (isPaged()) updateProgress();
      },
      { passive: true }
    );
    // 内容动态变化（图片懒加载、插件注入等）后重新分页
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(function () {
        if (repaginating) return;
        if (Date.now() < suppressObserverUntil) return; // 自身分页动作引起的变化
        scheduleRepaginate();
      }).observe(content, { childList: true, subtree: true });
    }
    document.addEventListener('keydown', function (e) {
      if (!isPaged() || !pagedContent) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var active = document.activeElement;
      if (active && /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(active.tagName)) return;
      e.preventDefault();
      var dir = e.key === 'ArrowRight' ? 1 : -1;
      var gap = 0;
      var cs = window.getComputedStyle(pagedContent);
      if (cs.gap) gap = parseFloat(cs.gap) || 0;
      pagedContent.scrollBy({
        left: dir * (pagedContent.clientWidth + gap),
        behavior: 'smooth'
      });
    });
  }

  function initWaizhuanCollapse() {
    document.querySelectorAll('[data-waizhuan-toggle]').forEach(function (btn) {
      var panelId = btn.getAttribute('aria-controls');
      var panel = panelId ? document.getElementById(panelId) : null;
      if (!panel) return;
      var key = 'novel-waizhuan-collapsed:' + location.pathname + ':' + panelId;
      try {
        if (localStorage.getItem(key) === '1') {
          btn.setAttribute('aria-expanded', 'false');
          panel.hidden = true;
        }
      } catch (e) {}
      btn.addEventListener('click', function () {
        var expanded = btn.getAttribute('aria-expanded') !== 'false';
        btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
        panel.hidden = expanded;
        try {
          localStorage.setItem(key, expanded ? '1' : '0');
        } catch (e2) {}
      });
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  window.addEventListener('resize', scheduleRepaginate);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      scheduleRepaginate();
    });
  }
  updateProgress();
  updateReadNextDock();

  initHeroParallax();
  initMagneticCards();
  initChapterRail();
  initPoemLayout();
  initPagedReading();
  initWaizhuanCollapse();
  initFinale();
})();
