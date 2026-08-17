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
    schedulePoemBookChunk();
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

  /* 诗歌翻页书册：正文切成书页，左右双页并排，翻页阅读 */
  var poemBook = null; // { spread, total }
  var poemBookResize = null;
  var poemBookTimer = 0;

  function schedulePoemBookChunk() {
    if (!poemBookResize) return;
    clearTimeout(poemBookTimer);
    poemBookTimer = setTimeout(poemBookResize, 150);
  }

  function initPoemBook() {
    var content = document.querySelector('.novel-post--poetry .novel-post__content');
    if (!content || !content.children.length) return;
    body.classList.add('novel-body--poetry');
    // 若此前被 paged 模式分页过，先拆回原容器
    if (isPaged()) exitPaged();

    var book = document.createElement('div');
    book.className = 'novel-book';
    book.id = 'novel-book';

    var stage = document.createElement('div');
    stage.className = 'novel-book__stage';
    var spread = document.createElement('div');
    spread.className = 'novel-book__spread';
    var left = document.createElement('div');
    left.className = 'novel-book__slot novel-book__slot--left';
    var right = document.createElement('div');
    right.className = 'novel-book__slot novel-book__slot--right';
    spread.appendChild(left);
    spread.appendChild(right);
    var measure = document.createElement('div');
    measure.className = 'novel-book__measure';
    stage.appendChild(spread);
    stage.appendChild(measure);
    book.appendChild(stage);

    var controls = document.createElement('div');
    controls.className = 'novel-book__controls';
    var btnPrev = document.createElement('button');
    btnPrev.type = 'button';
    btnPrev.className = 'novel-book__nav novel-book__nav--prev';
    btnPrev.textContent = '‹ 上一页';
    btnPrev.setAttribute('aria-label', '上一页');
    var count = document.createElement('span');
    count.className = 'novel-book__count';
    count.setAttribute('aria-live', 'polite');
    var btnNext = document.createElement('button');
    btnNext.type = 'button';
    btnNext.className = 'novel-book__nav novel-book__nav--next';
    btnNext.textContent = '下一页 ›';
    btnNext.setAttribute('aria-label', '下一页');
    controls.appendChild(btnPrev);
    controls.appendChild(count);
    controls.appendChild(btnNext);
    book.appendChild(controls);

    var state = {
      pages: [],
      spread: 0,
      per: window.innerWidth < 640 ? 1 : 2,
      pw: 0,
      ph: 0
    };

    function pageWidth() {
      if (window.innerWidth < 640) {
        return clamp(Math.min(28 * 16, window.innerWidth - 48), 240, 28 * 16);
      }
      return clamp((Math.min(56 * 16, window.innerWidth - 32) - 26) / 2, 320, 26 * 16);
    }

    function pageHeight() {
      return clamp(Math.min(window.innerHeight * 0.72, 40 * 16), 300, 40 * 16);
    }

    function makePage() {
      var p = document.createElement('div');
      p.className = 'novel-book__page';
      p.style.width = state.pw + 'px';
      var f = document.createElement('span');
      f.className = 'novel-book__pageno';
      p.appendChild(f);
      return p;
    }

    function collectKids() {
      var kids = [];
      state.pages.forEach(function (p) {
        while (p.firstChild) {
          var k = p.firstChild;
          if (k.nodeType !== 1) {
            p.removeChild(k); // 丢弃空白文本节点
            continue;
          }
          if (k.classList && k.classList.contains('novel-book__pageno')) {
            p.removeChild(k);
            continue;
          }
          kids.push(p.removeChild(k));
        }
      });
      state.pages = [];
      while (content.firstChild) {
        var c = content.firstChild;
        if (c.nodeType !== 1) {
          content.removeChild(c); // 丢弃空白文本节点
          continue;
        }
        kids.push(content.removeChild(c));
      }
      return kids;
    }

    function chunk() {
      var kids = collectKids();
      state.pw = pageWidth();
      state.ph = pageHeight();
      var page = null;
      var acc = 0;
      kids.forEach(function (kid) {
        var isH2 = kid.tagName === 'H2'; // 每首新诗（H2 标题）另起一页
        if (!page) {
          page = makePage();
          state.pages.push(page);
          measure.appendChild(page);
        }
        // 追加前判断：页内除页码外是否已有内容（footer 是 children[0]）
        var hasContent = page.children.length > 1;
        page.appendChild(kid);
        var cs = window.getComputedStyle(kid);
        var h =
          kid.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
        if (hasContent && (acc + h > state.ph + 1 || isH2)) {
          page.removeChild(kid);
          page = makePage();
          state.pages.push(page);
          measure.appendChild(page);
          page.appendChild(kid);
          acc = h;
        } else {
          acc += h;
        }
      });
      state.pages.forEach(function (p, i) {
        var f = p.querySelector('.novel-book__pageno');
        if (f) f.textContent = String(i + 1);
      });
    }

    function render() {
      var per = state.per;
      var i0 = state.spread * per;
      left.innerHTML = '';
      right.innerHTML = '';
      right.style.display = per === 2 ? '' : 'none';
      if (state.pages[i0]) left.appendChild(state.pages[i0]);
      if (per === 2 && state.pages[i0 + 1]) right.appendChild(state.pages[i0 + 1]);
      var total = state.pages.length;
      var label;
      if (per === 2) {
        var a = i0 + 1;
        var b = Math.min(i0 + 2, total);
        label =
          a === b
            ? '第 ' + a + ' 页 / 共 ' + total + ' 页'
            : '第 ' + a + '–' + b + ' 页 / 共 ' + total + ' 页';
      } else {
        label = '第 ' + (i0 + 1) + ' 页 / 共 ' + total + ' 页';
      }
      count.textContent = label;
      btnPrev.disabled = state.spread <= 0;
      btnNext.disabled = state.spread >= Math.ceil(total / per) - 1;
      poemBook = { spread: state.spread, total: Math.max(1, Math.ceil(total / per)) };
      updateProgress();
    }

    var turning = false;

    function turn(dir) {
      var totalSpreads = Math.ceil(state.pages.length / state.per);
      var ns = clamp(state.spread + dir, 0, totalSpreads - 1);
      if (ns === state.spread || turning) return;
      if (prefersReduced || !state.pages.length) {
        state.spread = ns;
        render();
        return;
      }
      flipTo(dir, ns);
    }

    /* 真实翻页：右页绕书脊向左翻 / 左页绕书脊向右翻，背面/底下是新的一页 */
    function flipTo(dir, ns) {
      var i0 = state.spread * state.per;
      var per = state.per;
      var pages = state.pages;

      var fromIdx = dir > 0 ? (per === 2 ? i0 + 1 : i0) : i0;
      var backIdx = dir > 0 ? (per === 2 ? i0 + 2 : i0 + 1) : i0 - 1;
      var coveredSlot = per === 1 ? left : dir > 0 ? right : left;
      var revealedSlot = per === 1 ? left : dir > 0 ? left : right;
      var origin = per === 1 ? (dir > 0 ? 'left center' : 'right center') : dir > 0 ? 'left center' : 'right center';
      var targetAngle = dir > 0 ? -180 : 180;

      // 先测量目标槽尺寸（翻页元素按当前页大小定位）
      var sr = stage.getBoundingClientRect();
      var tr = coveredSlot.getBoundingClientRect();

      // 底下先铺好新页（被翻页盖住，翻到一半时露出）
      if (dir > 0) {
        if (per === 2 && pages[i0 + 3]) {
          right.innerHTML = '';
          right.appendChild(pages[i0 + 3]);
        }
      } else {
        if (per === 2 && pages[i0 - 2]) {
          left.innerHTML = '';
          left.appendChild(pages[i0 - 2]);
        }
      }

      var flip = document.createElement('div');
      flip.className = 'novel-book__flip';
      var front = document.createElement('div');
      front.className = 'novel-book__flip-face novel-book__flip-face--front';
      var back = document.createElement('div');
      back.className = 'novel-book__flip-face novel-book__flip-face--back';
      flip.appendChild(front);
      flip.appendChild(back);
      stage.appendChild(flip);

      flip.style.left = tr.left - sr.left + 'px';
      flip.style.top = tr.top - sr.top + 'px';
      flip.style.width = tr.width + 'px';
      flip.style.height = tr.height + 'px';
      flip.style.transformOrigin = origin;
      flip.style.transform = 'rotateY(0deg)';

      var fromPage = pages[fromIdx];
      var backPage = pages[backIdx];
      if (fromPage) front.appendChild(fromPage);
      if (backPage) back.appendChild(backPage);

      turning = true;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          flip.style.transition = 'transform 0.7s cubic-bezier(0.25, 0.65, 0.35, 1)';
          flip.style.transform = 'rotateY(' + targetAngle + 'deg)';
        });
      });

      var done = false;
      function finish() {
        if (done) return;
        done = true;
        var target = revealedSlot;
        target.innerHTML = '';
        if (backPage && backPage.parentNode) target.appendChild(backPage);
        flip.remove();
        turning = false;
        state.spread = ns;
        render();
      }
      flip.addEventListener('transitionend', function (e) {
        if (e.propertyName === 'transform') finish();
      });
      setTimeout(finish, 950);
    }

    function resizeBook() {
      var per = window.innerWidth < 640 ? 1 : 2;
      var pw = pageWidth();
      var ph = pageHeight();
      if (per === state.per && Math.abs(pw - state.pw) <= 2 && Math.abs(ph - state.ph) <= 2) {
        return;
      }
      state.per = per;
      chunk();
      state.spread = clamp(state.spread, 0, Math.max(0, Math.ceil(state.pages.length / per) - 1));
      render();
    }
    poemBookResize = resizeBook;

    // 先把书插入文档（保证分页测量有布局），再分页
    content.insertAdjacentElement('afterend', book);
    try {
      chunk();
      render();
    } catch (e) {
      collectKids().forEach(function (k) {
        content.appendChild(k);
      });
      book.remove();
      poemBookResize = null;
      return;
    }
    // 移除原正文容器，语义属性转移到书册
    book.setAttribute('itemprop', 'articleBody');
    content.remove();

    btnPrev.addEventListener('click', function () {
      turn(-1);
    });
    btnNext.addEventListener('click', function () {
      turn(1);
    });

    document.addEventListener('keydown', function (e) {
      if (!poemBook) return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var active = document.activeElement;
      if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
      e.preventDefault();
      turn(e.key === 'ArrowRight' ? 1 : -1);
    });

    // 滑动翻页
    var downX = null;
    var downY = null;
    stage.addEventListener('pointerdown', function (e) {
      downX = e.clientX;
      downY = e.clientY;
    });
    stage.addEventListener('pointerup', function (e) {
      if (downX == null) return;
      var dx = e.clientX - downX;
      var dy = e.clientY - downY;
      downX = null;
      downY = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      turn(dx < 0 ? 1 : -1);
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
    if (poemBook && poemBook.total > 1) {
      var hpBook = poemBook.spread / (poemBook.total - 1);
      bar.style.transform = 'scaleX(' + clamp(hpBook, 0, 1) + ')';
      return;
    }
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
  window.addEventListener('resize', schedulePoemBookChunk);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      scheduleRepaginate();
      schedulePoemBookChunk();
    });
  }
  updateProgress();
  updateReadNextDock();

  initHeroParallax();
  initMagneticCards();
  initChapterRail();
  initPoemLayout();
  initPoemBook();
  initPagedReading();
  initWaizhuanCollapse();
  initFinale();
})();
