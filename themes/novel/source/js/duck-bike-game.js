/*!
 * 大黄鸭 · 单车大作战 —— 博客主页小游戏
 * 玩家骑着自行车在横向道路上行驶，用 W/S 上下换道，
 * 躲避同向与相向行驶的车手；撞车扣 1 血，撞人时按 Z 可把对方撞飞（自损 0.5 血）。
 * 血量为 0 时停在路上，一辆写着 GameOver 的车从左侧开过来把小人碾过。
 */
(function () {
  'use strict';

  if (window.__duckBikeGame) return;
  window.__duckBikeGame = true;

  var ROOT = document.getElementById('duck-game');
  if (!ROOT) return;

  var canvas = document.getElementById('duck-game-canvas');
  var ctx = canvas && canvas.getContext('2d');
  if (!ctx) return;

  var startEl = document.getElementById('duck-game-start');
  var overEl = document.getElementById('duck-game-over');
  var pauseEl = document.getElementById('duck-game-pause');
  var statsEl = document.getElementById('duck-game-stats');
  var pauseBtn = document.getElementById('duck-game-pause-btn');
  var touchEl = document.getElementById('duck-game-touch');
  var startBtn = document.getElementById('duck-game-start-btn');
  var restartBtn = document.getElementById('duck-game-restart-btn');
  var resumeBtn = document.getElementById('duck-game-resume-btn');

  var isTouch =
    ('ontouchstart' in window) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  var reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------- 参数 ----------------
  var BASE_SPEED = 250; // 玩家固定骑行速度 px/s
  var SLOW_SPEED = 170; // 血量降到 3 之后的速度
  var SLOW_AT = 3; // 触发减速的血量阈值
  var MOVE_SPEED = 340; // 上下换道速度
  var MAX_HP = 5;
  var INVULN = 1.0; // 被撞后的无敌时间
  var Z_COOLDOWN = 0.3;
  var CAR_SPEED = 340; // GameOver 车的车速
  var CAR_W = 170;
  var CAR_H = 74;
  var PX_FRAC = 0.22; // 玩家屏幕横向位置比例
  var BOX_W = 38; // 碰撞箱
  var BOX_H = 44;
  var MAX_NPC = 16;

  var FONT = '"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

  // ---------------- 状态 ----------------
  var mode = 'idle'; // idle | playing | dying | over
  var paused = false;
  var W = 0;
  var H = 0;
  var DPR = 1;
  var cameraX = 0;
  var time = 0;
  var spawnT = 0.6;
  var npcs = [];
  var parts = [];
  var texts = [];
  var shake = { t: 0, max: 1, mag: 0 };
  var keys = {};
  var zPressedAt = -99;
  var zCooldown = 0;
  var frameZUsed = false;
  var dist = 0; // 米
  var knockCount = 0;
  var patches = [];

  var player = {
    x: 0,
    y: 0,
    hp: MAX_HP,
    speed: BASE_SPEED,
    slow: false,
    invulnT: 0,
    bob: 0,
    squished: false
  };

  var car = null; // GameOver 车 { cx, targetX, state, t }

  // 车手皮肤：肤色 / 上衣 / 头盔 / 车架
  var SKINS = [
    { skin: '#f2c9a0', shirt: '#3d7bfd', helmet: '#ff8c42', bike: '#8d99a6' },
    { skin: '#e8b48c', shirt: '#e74c3c', helmet: '#2ecc71', bike: '#a3a3a3' },
    { skin: '#c98d5f', shirt: '#9b59b6', helmet: '#f1c40f', bike: '#7f8c8d' },
    { skin: '#f6d5b8', shirt: '#1abc9c', helmet: '#e67e22', bike: '#95a5a6' },
    { skin: '#b5714a', shirt: '#f39c12', helmet: '#3498db', bike: '#6c7a89' },
    { skin: '#f0c8a8', shirt: '#2c3e50', helmet: '#e84393', bike: '#bdc3c7' }
  ];
  var PLAYER_PAL = { skin: '#f6d5b8', shirt: '#ffd23f', helmet: '#ffd23f', bike: '#e8b43a' };

  var ANGRY = [
    '喂！！',
    '看路啊！！',
    '你撞到我了！',
    '会不会骑车！',
    '小心点啊！',
    '哎哟！',
    '气死我了！！',
    '我的新车！！'
  ];

  // ---------------- 工具 ----------------
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function rand(a, b) {
    return a + Math.random() * (b - a);
  }
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function now() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  }
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = clamp(((n >> 16) & 255) + amt, 0, 255);
    var g = clamp(((n >> 8) & 255) + amt, 0, 255);
    var b = clamp((n & 255) + amt, 0, 255);
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function circle(c, x, y, r) {
    c.beginPath();
    c.arc(x, y, r, 0, 6.2832);
    c.fill();
  }
  function ellipse(c, x, y, rx, ry) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, 6.2832);
    c.fill();
  }
  function strokeLine(c, x1, y1, x2, y2) {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }
  function tri(c, x1, y1, x2, y2, x3, y3) {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.lineTo(x3, y3);
    c.closePath();
    c.fill();
  }
  function roundRectPath(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function heartPath(c, s) {
    c.moveTo(0, 0.32 * s);
    c.bezierCurveTo(-0.52 * s, 0.08 * s, -0.42 * s, -0.5 * s, 0, -0.18 * s);
    c.bezierCurveTo(0.42 * s, -0.5 * s, 0.52 * s, 0.08 * s, 0, 0.32 * s);
  }

  // ---------------- 画布尺寸 ----------------
  function resize() {
    var stage = canvas.parentElement;
    var rect = stage.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(220, Math.floor(rect.width));
    H = Math.max(220, Math.floor(rect.height));
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    player.x = W * PX_FRAC;
    player.y = clamp(player.y || H / 2, 30, H - 30);
  }
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') {
    var ro = new ResizeObserver(function () {
      resize();
    });
    ro.observe(canvas.parentElement);
  }

  // ---------------- 生成车手 ----------------
  function spawnNPC() {
    var diff = clamp(time / 100, 0, 1);
    var spdMul = 1 + diff * 0.3;
    var n = {
      x: 0,
      y: rand(30, Math.max(31, H - 30)),
      ws: 0,
      dir: 1,
      skin: Math.floor(rand(0, SKINS.length)),
      bob: rand(0, 6.28),
      state: 'ride', // ride | angry | fly | landed
      hitFlash: 0,
      bubble: null,
      alpha: 1,
      fly: null,
      landT: 0
    };
    var roll = Math.random();
    if (roll < 0.5) {
      // 相向行驶：从右侧进入，迎面而来
      n.dir = -1;
      n.ws = -(140 + rand(0, 95)) * spdMul;
      n.x = cameraX + W + 70;
    } else if (roll < 0.78) {
      // 同向但比玩家慢：从右侧（前方）被超越
      n.dir = 1;
      n.ws = player.speed * (0.45 + rand(0, 0.35)) * spdMul;
      n.x = cameraX + W + 70;
    } else {
      // 同向且比玩家快：从左侧（后方）超车
      n.dir = 1;
      n.ws = player.speed * (1.18 + rand(0, 0.35)) * spdMul;
      n.x = cameraX - 70;
    }
    // 避免在极短时间内直接撞到玩家
    if (mode === 'playing') {
      var sx0 = n.x - cameraX;
      var rel = n.ws - player.speed;
      var tt = rel !== 0 ? (sx0 - player.x) / -rel : 9;
      if (tt > 0 && tt < 0.7 && Math.abs(n.y - player.y) < 52) {
        n.y = clamp(player.y + (player.y < H / 2 ? 1 : -1) * 95, 30, H - 30);
      }
    }
    npcs.push(n);
  }

  // ---------------- 车手更新 ----------------
  function updateNPCs(dt) {
    var i;
    for (i = npcs.length - 1; i >= 0; i--) {
      var n = npcs[i];
      n.bob += dt * (n.state === 'angry' ? 26 : 10);
      if (n.hitFlash > 0) n.hitFlash -= dt;
      if (n.bubble) {
        n.bubble.t -= dt;
        if (n.bubble.t <= 0) n.bubble = null;
      }
      if (n.state === 'fly') {
        var f = n.fly;
        f.t += dt;
        n.x += (n.ws * 0.15 + f.vx) * dt;
        n.y += f.vy * dt;
        f.h += f.vh * dt;
        f.vh -= 430 * dt; // 模拟抛物线
        f.rot += f.vr * dt;
        if (f.h <= 0 && f.vh < 0) {
          f.h = 0;
          n.state = 'landed';
          n.landT = 0;
        }
      } else if (n.state === 'landed') {
        n.landT += dt;
        n.alpha = 1 - clamp(n.landT / 0.5, 0, 1);
        if (n.landT > 0.5) {
          npcs.splice(i, 1);
          continue;
        }
      } else {
        n.x += n.ws * dt;
      }
      var sx = n.x - cameraX;
      if (sx < -170 || sx > W + 170) {
        npcs.splice(i, 1);
      }
    }
  }

  // ---------------- 碰撞 ----------------
  function aabb(x1, y1, w1, h1, x2, y2, w2, h2) {
    var pad = 6;
    return (
      Math.abs(x1 - x2) < (w1 + w2) / 2 - pad &&
      Math.abs(y1 - y2) < (h1 + h2) / 2 - pad
    );
  }

  function applyDamage() {
    if (player.hp <= 0) {
      player.hp = 0;
      startDeath();
      return;
    }
    if (!player.slow && player.hp <= SLOW_AT) {
      player.slow = true;
      player.speed = SLOW_SPEED;
      addText(player.x, player.y - 44, '骑行变慢了…', 1.4, '#ffd23f', 16);
    }
  }

  function knock(n) {
    n.state = 'fly';
    n.fly = {
      vx: -(210 + rand(0, 90)),
      vy: rand(-70, 70),
      vh: rand(120, 200),
      h: 0,
      rot: 0,
      vr: rand(-9, 9) || 6,
      t: 0
    };
    player.hp -= 0.5;
    knockCount++;
    shakeIt(4.5, 0.22);
    burst(n.x - cameraX, n.y, 12, '#ffe066');
    addText(n.x - cameraX, n.y - 50, '💥', 0.7, '#ffffff', 18);
    applyDamage();
  }

  function checkCollisions() {
    if (player.invulnT > 0) return;
    frameZUsed = false;
    var canZ = (keys['z'] || now() - zPressedAt < 0.35) && zCooldown <= 0;
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (n.state !== 'ride' && n.state !== 'angry') continue;
      var sx = n.x - cameraX;
      if (Math.abs(sx - player.x) > 50 || Math.abs(n.y - player.y) > 54) continue;
      if (!aabb(sx, n.y, BOX_W, BOX_H, player.x, player.y, BOX_W, BOX_H)) continue;
      if (canZ && !frameZUsed) {
        frameZUsed = true;
        zCooldown = Z_COOLDOWN;
        knock(n);
        continue;
      }
      // 普通相撞：扣 1 血，对方在右上角弹出愤怒对话框
      player.hp -= 1;
      player.invulnT = INVULN;
      n.state = 'angry';
      n.bubble = { text: pick(ANGRY), t: 1.7, dur: 1.7 };
      n.hitFlash = 0.22;
      shakeIt(3.5, 0.22);
      addText(player.x, player.y - 42, '-1', 0.8, '#ff5a5f', 20);
      applyDamage();
      return;
    }
  }

  // ---------------- 状态切换 ----------------
  function start() {
    if (mode === 'playing') return;
    mode = 'playing';
    paused = false;
    player.hp = MAX_HP;
    player.slow = false;
    player.speed = BASE_SPEED;
    player.invulnT = 0;
    player.squished = false;
    player.bob = 0;
    player.y = H / 2;
    npcs.length = 0;
    parts.length = 0;
    texts.length = 0;
    dist = 0;
    knockCount = 0;
    time = 0;
    spawnT = 0.9;
    zCooldown = 0;
    car = null;
    startEl.hidden = true;
    overEl.hidden = true;
    pauseEl.hidden = true;
    pauseBtn.hidden = false;
    pauseBtn.textContent = '⏸';
    ROOT.classList.add('is-running');
  }

  function setPaused(p) {
    if (mode !== 'playing') return;
    paused = p;
    pauseEl.hidden = !p;
    pauseBtn.textContent = p ? '▶' : '⏸';
    pauseBtn.setAttribute('aria-label', p ? '继续游戏' : '暂停');
  }

  function startDeath() {
    mode = 'dying';
    player.speed = 0;
    player.invulnT = 0;
    car = {
      cx: -CAR_W / 2,
      targetX: player.x,
      state: 'wait',
      t: 0
    };
    pauseBtn.hidden = true;
    addText(player.x, player.y - 46, '！', 1, '#ffd23f', 24);
  }

  function showGameOver() {
    mode = 'over';
    statsEl.textContent = '骑行 ' + Math.floor(dist) + ' m · 撞飞 ' + knockCount + ' 辆';
    overEl.hidden = false;
  }

  // ---------------- 主更新 ----------------
  function update(dt) {
    var i;
    if (mode === 'idle') {
      cameraX += BASE_SPEED * dt;
      spawnT -= dt;
      if (spawnT <= 0 && npcs.length < 12) {
        spawnNPC();
        spawnT = rand(0.9, 1.7);
      }
      updateNPCs(dt);
    } else if (mode === 'playing') {
      time += dt;
      cameraX += player.speed * dt;
      player.bob += dt * (player.slow ? 7 : 10);
      if (player.invulnT > 0) player.invulnT -= dt;
      var dy = 0;
      if (keys['w'] || keys['arrowup']) dy -= 1;
      if (keys['s'] || keys['arrowdown']) dy += 1;
      if (dy) {
        player.y = clamp(player.y + dy * MOVE_SPEED * dt, 30, H - 30);
      }
      dist += (player.speed * dt) / 40;
      if (zCooldown > 0) zCooldown -= dt;
      spawnT -= dt;
      if (spawnT <= 0 && npcs.length < MAX_NPC) {
        spawnNPC();
        var diff = clamp(time / 100, 0, 1);
        spawnT = lerp(1.35, 0.55, diff) * rand(0.75, 1.25);
      }
      updateNPCs(dt);
      checkCollisions();
    } else if (mode === 'dying') {
      car.t += dt;
      if (car.state === 'wait') {
        if (car.t > 0.5) {
          car.state = 'approach';
          car.t = 0;
        }
      } else if (car.state === 'approach') {
        car.cx += CAR_SPEED * dt;
        if (car.cx + CAR_W / 2 >= player.x) {
          car.state = 'squish';
          car.t = 0;
          player.squished = true;
          shakeIt(7, 0.35);
          burst(player.x, player.y, 14, '#ffd23f');
          addText(player.x, player.y - 42, '噗！', 1.2, '#ffffff', 20);
        }
      } else if (car.state === 'squish') {
        var remain = 1 - clamp(car.t / 0.5, 0, 1);
        car.cx += CAR_SPEED * remain * dt;
        if (car.cx >= car.targetX || remain <= 0) {
          car.cx = car.targetX;
          car.state = 'parked';
          car.t = 0;
        }
      } else if (car.state === 'parked') {
        if (car.t > 1.1) showGameOver();
      }
      player.bob += dt * (player.squished ? 6 : 14);
      updateNPCs(dt);
    }
    // 路面纹理回收
    for (i = 0; i < patches.length; i++) {
      if (patches[i].x - cameraX < -50) patches[i].x += W + 320;
    }
    updateFx(dt);
  }

  // ---------------- 特效 ----------------
  function addText(x, y, text, dur, color, size) {
    texts.push({ x: x, y: y, text: text, t: 0, dur: dur, color: color, size: size });
  }
  function burst(x, y, n, color) {
    for (var i = 0; i < n; i++) {
      parts.push({
        x: x,
        y: y,
        vx: rand(-170, 170),
        vy: rand(-190, 40),
        t: 0,
        dur: rand(0.35, 0.7),
        color: color,
        size: rand(2, 5)
      });
    }
  }
  function shakeIt(mag, t) {
    shake = { t: t, max: t, mag: mag };
  }
  function updateFx(dt) {
    var i;
    for (i = texts.length - 1; i >= 0; i--) {
      texts[i].t += dt;
      if (texts[i].t > texts[i].dur) texts.splice(i, 1);
    }
    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 170 * dt;
      if (p.t > p.dur) parts.splice(i, 1);
    }
    if (shake.t > 0) shake.t -= dt;
  }

  // ---------------- 绘制 ----------------
  function drawRoad() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#26292f');
    g.addColorStop(0.5, '#23262b');
    g.addColorStop(1, '#26292f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // 沥青纹理斑点
    for (var i = 0; i < patches.length; i++) {
      var p = patches[i];
      ctx.fillStyle = 'rgba(0,0,0,' + p.a + ')';
      circle(ctx, p.x - cameraX, p.y, p.r);
    }

    // 路边线
    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = 4;
    strokeLine(ctx, 0, 10, W, 10);
    strokeLine(ctx, 0, H - 10, W, H - 10);

    // 中央黄虚线（对向分隔）
    ctx.strokeStyle = 'rgba(240,196,60,0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([30, 26]);
    ctx.lineDashOffset = -(cameraX % 56);
    strokeLine(ctx, 0, H / 2, W, H / 2);
    ctx.setLineDash([]);

    // 车道白虚线
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 30]);
    ctx.lineDashOffset = -(cameraX % 46);
    strokeLine(ctx, 0, H * 0.25, W, H * 0.25);
    strokeLine(ctx, 0, H * 0.75, W, H * 0.75);
    ctx.setLineDash([]);
  }

  function drawBike(x, y, dir, pal, bob, o) {
    o = o || {};
    var bobOff = Math.sin(bob) * 1.5;

    // 影子
    if (!o.noShadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ellipse(ctx, x, y + 4, 27, 12);
    }

    // 车架
    ctx.strokeStyle = pal.bike;
    ctx.lineWidth = 2.4;
    strokeLine(ctx, x - dir * 20, y, x + dir * 15, y);
    ctx.lineWidth = 2.8;
    strokeLine(ctx, x + dir * 18, y - 7, x + dir * 18, y + 7);
    ctx.fillStyle = '#3c4048';
    ellipse(ctx, x - dir * 12, y, 4.4, 2.6);

    // 车轮
    ctx.fillStyle = '#14161a';
    ellipse(ctx, x - dir * 20, y, 7.6, 4.6);
    ellipse(ctx, x + dir * 20, y, 7.6, 4.6);
    ctx.fillStyle = '#8b95a3';
    circle(ctx, x - dir * 20, y, 1.6);
    circle(ctx, x + dir * 20, y, 1.6);

    // 骑手
    var shx = x - dir * 4;
    var shy = y + 1 + bobOff * 0.4;
    if (o.fly) {
      // 被撞飞：双手乱舞
      ctx.strokeStyle = shade(pal.shirt, -25);
      ctx.lineWidth = 3;
      strokeLine(ctx, shx - 8, shy - 2, shx - 13, shy - 15 + bobOff);
      strokeLine(ctx, shx + 8, shy - 2, shx + 13, shy - 15 - bobOff);
    } else {
      ctx.strokeStyle = shade(pal.shirt, -25);
      ctx.lineWidth = 3;
      strokeLine(ctx, shx - 7, shy - 1, x + dir * 17, y - 4);
      strokeLine(ctx, shx + 7, shy - 1, x + dir * 17, y + 4);
    }
    ctx.fillStyle = pal.shirt;
    roundRectPath(ctx, shx - 11, shy - 6, 22, 13, 6);
    ctx.fill();

    // 头
    var hx = shx;
    var hy = shy - 8 + bobOff;
    ctx.fillStyle = pal.helmet;
    circle(ctx, hx, hy, 9);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    circle(ctx, hx - 2.6, hy - 2.6, 3.2);

    // 玩家：小黄鸭嘴
    if (o.isPlayer) {
      ctx.fillStyle = '#ff8c42';
      tri(ctx, hx + dir * 5, hy - 2.5, hx + dir * 9.5, hy, hx + dir * 5, hy + 2.5);
    }

    // 表情
    if (o.squish) {
      ctx.strokeStyle = '#222222';
      ctx.lineWidth = 1.8;
      xMark(hx - 3.5, hy - 0.5);
      xMark(hx + 3.5, hy - 0.5);
    } else {
      ctx.fillStyle = '#222222';
      circle(ctx, hx - 3.4, hy - 0.6, 1.5);
      circle(ctx, hx + 3.4, hy - 0.6, 1.5);
      if (o.angry) {
        ctx.strokeStyle = '#c92a2a';
        ctx.lineWidth = 2.2;
        strokeLine(ctx, hx - 5.6, hy - 3.6, hx - 1.8, hy - 2.2);
        strokeLine(ctx, hx + 5.6, hy - 3.6, hx + 1.8, hy - 2.2);
        ctx.fillStyle = 'rgba(255,80,80,0.55)';
        circle(ctx, hx - 5.8, hy + 1.8, 1.6);
        circle(ctx, hx + 5.8, hy + 1.8, 1.6);
      } else if (o.fly) {
        ctx.fillStyle = '#7a2d2d';
        circle(ctx, hx + dir * 2, hy + 2.6, 1.8);
      }
    }

    // 被撞白闪
    if (o.flash) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      circle(ctx, hx, hy - 2, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      roundRectPath(ctx, shx - 12, shy - 8, 24, 16, 8);
      ctx.fill();
    }
  }

  function xMark(x, y) {
    ctx.beginPath();
    ctx.moveTo(x - 2, y - 2);
    ctx.lineTo(x + 2, y + 2);
    ctx.moveTo(x + 2, y - 2);
    ctx.lineTo(x - 2, y + 2);
    ctx.stroke();
  }

  function drawBubble(sx, sy, text, t, dur) {
    var alpha = 1;
    if (t < 0.35) alpha = t / 0.35;
    if (dur - t < 0.3) alpha = (dur - t) / 0.3;
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.font = 'bold 13px ' + FONT;
    var tw = ctx.measureText(text).width;
    var bw = Math.max(56, tw + 22);
    var bh = 27;
    var bx = clamp(sx + 18, 6, W - bw - 6);
    var by = sy - bh - 46;

    // 气泡尾巴
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(bx + 12, by + bh - 1);
    ctx.lineTo(sx + 12, sy - 28);
    ctx.lineTo(bx + 32, by + bh - 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#e03131';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 气泡主体
    ctx.fillStyle = '#ffffff';
    roundRectPath(ctx, bx, by, bw, bh, 9);
    ctx.fill();
    ctx.strokeStyle = '#e03131';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.fillStyle = '#c92a2a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + bw / 2, by + bh / 2 + 0.5);
    ctx.globalAlpha = 1;
  }

  function drawNPC(n) {
    var sx = n.x - cameraX;
    if (sx < -150 || sx > W + 150) return;
    if (n.state === 'fly') {
      var f = n.fly;
      var gr = 1 - clamp(f.h / 150, 0, 0.75);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ellipse(ctx, sx, n.y + 3, 25 * gr, 11 * gr);
      ctx.save();
      ctx.translate(sx, n.y - f.h);
      ctx.rotate(f.rot);
      drawBike(0, 0, n.dir, SKINS[n.skin], n.bob, { fly: true, noShadow: true });
      ctx.restore();
    } else if (n.state === 'landed') {
      ctx.save();
      ctx.globalAlpha = n.alpha;
      ctx.translate(sx, n.y);
      ctx.rotate(1.25);
      drawBike(0, 0, n.dir, SKINS[n.skin], n.bob, { squish: true, noShadow: true });
      ctx.restore();
      ctx.globalAlpha = 1;
    } else {
      drawBike(sx, n.y, n.dir, SKINS[n.skin], n.bob, {
        angry: n.state === 'angry',
        flash: n.hitFlash > 0
      });
      if (n.bubble && n.bubble.t > 0) {
        drawBubble(sx, n.y, n.bubble.text, n.bubble.t, n.bubble.dur);
      }
    }
  }

  function drawSquishedPlayer(x, y) {
    // 被压扁的小黄鸭骑手（从车底下露出）
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ellipse(ctx, x, y + 6, 16, 7);
    ctx.fillStyle = '#ffd23f';
    roundRectPath(ctx, x - 15, y - 6, 30, 13, 6);
    ctx.fill();
    ctx.fillStyle = '#f6d5b8';
    roundRectPath(ctx, x - 10, y - 9, 20, 8, 4);
    ctx.fill();
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1.8;
    xMark(x - 4.5, y - 5.5);
    xMark(x + 4.5, y - 5.5);
    ctx.fillStyle = '#ffe066';
    circle(ctx, x + 18, y - 12, 2.6);
    circle(ctx, x - 17, y - 14, 2.2);
  }

  function drawPlayer(carY) {
    var blink = player.invulnT > 0 && Math.sin(time * 22) > 0;
    ctx.globalAlpha = blink ? 0.4 : 1;
    if (player.squished) {
      var sy = carY != null ? clamp(carY + CAR_H / 2 + 10, 12, H - 12) : clamp(player.y + 46, 12, H - 12);
      drawSquishedPlayer(player.x, sy);
    } else {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.scale(1.08, 1.08);
      ctx.translate(-player.x, -player.y);
      drawBike(player.x, player.y, 1, PLAYER_PAL, player.bob, { isPlayer: true });
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawCar(cx, cy) {
    var w = CAR_W;
    var h = CAR_H;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ellipse(ctx, cx, cy + 4, w / 2 + 4, h / 2 + 6);
    // 车轮
    ctx.fillStyle = '#0b0c0f';
    roundRectPath(ctx, cx - w / 2 + 6, cy - h / 2 - 6, 18, 9, 3);
    ctx.fill();
    roundRectPath(ctx, cx + w / 2 - 24, cy - h / 2 - 6, 18, 9, 3);
    ctx.fill();
    roundRectPath(ctx, cx - w / 2 + 6, cy + h / 2 - 3, 18, 9, 3);
    ctx.fill();
    roundRectPath(ctx, cx + w / 2 - 24, cy + h / 2 - 3, 18, 9, 3);
    ctx.fill();
    // 车身
    ctx.fillStyle = '#23252d';
    roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = '#4a4f5c';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 红色条纹
    ctx.fillStyle = '#c62828';
    roundRectPath(ctx, cx - w / 2 + 7, cy + 8, w - 14, 10, 4);
    ctx.fill();
    // 前挡风（右侧 = 车头）
    ctx.fillStyle = '#39414d';
    roundRectPath(ctx, cx + w / 2 - 40, cy - h / 2 + 9, 16, h - 18, 5);
    ctx.fill();
    // 车灯
    ctx.fillStyle = '#ffe082';
    roundRectPath(ctx, cx + w / 2 - 7, cy - h / 2 + 5, 6, 9, 2);
    ctx.fill();
    roundRectPath(ctx, cx + w / 2 - 7, cy + h / 2 - 14, 6, 9, 2);
    ctx.fill();
    // GAMEOVER 车牌
    ctx.fillStyle = 'rgba(10,10,14,0.88)';
    roundRectPath(ctx, cx - 48, cy - 13, 96, 26, 6);
    ctx.fill();
    ctx.font = '900 17px "Arial Black","Segoe UI",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('GAMEOVER', cx, cy + 1);
  }

  function drawHeart(cx, cy, s, v) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    heartPath(ctx, s);
    ctx.closePath();
    if (v >= 1) {
      ctx.fillStyle = '#ff4d5e';
      ctx.fill();
    } else if (v <= 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-s, -s, s * 0.55, s * 2);
      ctx.clip();
      ctx.fillStyle = '#ff4d5e';
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHUD() {
    // 血条
    ctx.fillStyle = 'rgba(8,10,14,0.55)';
    roundRectPath(ctx, 10, 10, 132, 36, 10);
    ctx.fill();
    for (var i = 0; i < MAX_HP; i++) {
      drawHeart(30 + i * 22, 28, 14, clamp(player.hp - i, 0, 1));
    }
    if (player.slow && mode === 'playing') {
      ctx.fillStyle = 'rgba(8,10,14,0.55)';
      roundRectPath(ctx, 10, 52, 108, 24, 9);
      ctx.fill();
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd23f';
      ctx.fillText('🐢 低速模式', 20, 64);
    }
    // 分数
    ctx.font = 'bold 14px ' + FONT;
    ctx.textAlign = 'right';
    var l1 = '🚴 ' + Math.floor(dist) + ' m';
    var l2 = '💥 撞飞 ' + knockCount;
    var w1 = ctx.measureText(l1).width;
    var w2 = ctx.measureText(l2).width;
    var bw = Math.max(w1, w2) + 26;
    ctx.fillStyle = 'rgba(8,10,14,0.55)';
    roundRectPath(ctx, W - 10 - bw, 10, bw, 44, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(l1, W - 24, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(l2, W - 24, 42);
    // 操作提示
    if (!isTouch) {
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('W/S 移动 · Z 撞飞 · P 暂停', 14, H - 14);
    }
  }

  function drawFX() {
    var i;
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      ctx.globalAlpha = clamp(1 - p.t / p.dur, 0, 1);
      ctx.fillStyle = p.color;
      circle(ctx, p.x, p.y, p.size);
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < texts.length; i++) {
      var t = texts[i];
      ctx.globalAlpha = clamp(1 - t.t / t.dur, 0, 1);
      ctx.font = 'bold ' + t.size + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (!reduced && shake.t > 0) {
      var s = shake.mag * (shake.t / shake.max);
      ctx.translate(rand(-1, 1) * s, rand(-1, 1) * s);
    }
    drawRoad();
    for (var i = 0; i < npcs.length; i++) drawNPC(npcs[i]);
    if (mode === 'playing' || mode === 'dying') {
      var carY = null;
      if (mode === 'dying' && car) {
        carY = clamp(player.y, CAR_H / 2 + 8, H - CAR_H / 2 - 8);
        drawCar(car.cx, carY);
      }
      drawPlayer(carY);
    }
    drawFX();
    if (mode === 'playing' || mode === 'dying') drawHUD();
    ctx.restore();
  }

  // ---------------- 输入 ----------------
  function preventKey(k) {
    return (
      k === 'w' ||
      k === 's' ||
      k === 'z' ||
      k === 'arrowup' ||
      k === 'arrowdown' ||
      k === 'arrowleft' ||
      k === 'arrowright' ||
      k === ' '
    );
  }

  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (preventKey(k)) e.preventDefault();
    if (e.repeat) return;
    keys[k] = true;
    if (k === 'z') zPressedAt = now();
    if (k === 'enter' || k === ' ') {
      if (mode === 'idle' || mode === 'over') {
        start();
      } else if (paused) {
        setPaused(false);
      }
    }
    if (k === 'p' || k === 'escape') {
      if (mode === 'playing') setPaused(!paused);
    }
  });
  window.addEventListener('keyup', function (e) {
    keys[e.key.toLowerCase()] = false;
  });

  if (startBtn) {
    startBtn.addEventListener('click', function () {
      start();
    });
  }
  if (restartBtn) {
    restartBtn.addEventListener('click', function () {
      start();
    });
  }
  if (resumeBtn) {
    resumeBtn.addEventListener('click', function () {
      setPaused(false);
    });
  }
  if (pauseBtn) {
    pauseBtn.addEventListener('click', function () {
      if (mode === 'playing') setPaused(!paused);
    });
  }

  // 触摸按钮
  if (isTouch && touchEl) {
    touchEl.hidden = false;
    var touchMap = { up: 'w', down: 's', z: 'z' };
    var btns = touchEl.querySelectorAll('button');
    for (var bi = 0; bi < btns.length; bi++) {
      (function (btn) {
        var key = touchMap[btn.getAttribute('data-touch')];
        if (!key) return;
        var press = function (e) {
          e.preventDefault();
          keys[key] = true;
          if (key === 'z') zPressedAt = now();
        };
        var release = function (e) {
          e.preventDefault();
          keys[key] = false;
        };
        btn.addEventListener('pointerdown', press);
        btn.addEventListener('pointerup', release);
        btn.addEventListener('pointercancel', release);
        btn.addEventListener('contextmenu', function (e) {
          e.preventDefault();
        });
      })(btns[bi]);
    }
  }

  // 切后台自动暂停
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && mode === 'playing' && !paused) setPaused(true);
  });
  window.addEventListener('blur', function () {
    if (mode === 'playing' && !paused) setPaused(true);
  });

  // ---------------- 启动 ----------------
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  resize();
  for (var pi = 0; pi < 44; pi++) {
    patches.push({
      x: rand(0, W + 320),
      y: rand(16, Math.max(40, H - 16)),
      r: rand(6, 22),
      a: rand(0.04, 0.13)
    });
  }

  var lastT = now();
  function frame() {
    requestAnimationFrame(frame);
    var t = now();
    var dt = Math.min(0.033, Math.max(0, t - lastT));
    lastT = t;
    if (!paused) update(dt);
    draw();
  }
  requestAnimationFrame(frame);

  // 仅供自动化冒烟测试：仅在 URL 带 ?game=debug 时暴露
  try {
    var qp = new URLSearchParams(location.search);
    if (qp.get('game') === 'debug') {
      window.__duckBikeDebug = {
        start: start,
        hurt: function (n) {
          for (var i = 0; i < n; i++) player.hp -= 1;
          applyDamage();
        },
        press: function (key) {
          keys[key] = true;
          if (key === 'z') zPressedAt = now();
        },
        release: function (key) {
          keys[key] = false;
        },
        forceOncoming: function () {
          // 在玩家正前方同车道生成一辆相向车手（仅测试用）
          var n = {
            x: cameraX + player.x + 160,
            y: player.y,
            ws: -230,
            dir: -1,
            skin: 1,
            bob: 0,
            state: 'ride',
            hitFlash: 0,
            bubble: null,
            alpha: 1,
            fly: null,
            landT: 0
          };
          npcs.push(n);
          return npcs.length;
        },
        state: function () {
          return {
            mode: mode,
            paused: paused,
            hp: player.hp,
            slow: player.slow,
            speed: player.speed,
            dist: Math.floor(dist),
            knock: knockCount,
            npcs: npcs.length,
            w: W,
            h: H,
            squished: player.squished,
            car: car ? car.state : null,
            invuln: player.invulnT
          };
        }
      };
    }
  } catch (e) {}
})();
