/*!
 * 大黄鸭 · 单车大作战 —— 博客主页小游戏
 * 玩家骑着自行车在横向道路上行驶，用 W/S 上下换道。
 * 目标：在时限内骑到终点教学楼（赶早八）。
 * - Z：撞到车手前的一小段时间内按下，可把对方撞飞且不扣血；
 * - X：贴到汽车边缘按下，汽车会丢出牛奶/香蕉，吃到后加速；
 * - 汽车：上侧车道向左、下侧车道向右，撞到扣 1.5 血，常规状态无法撞飞；
 * - 减速带：每隔一段距离出现，碾过时速度自动下降；
 * - 血量为 0 时停在路上，一辆写着 GameOver 的车从左侧开过来把小人碾过。
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
  var finishEl = document.getElementById('duck-game-finish');
  var pauseEl = document.getElementById('duck-game-pause');
  var statsEl = document.getElementById('duck-game-stats');
  var finishTitleEl = document.getElementById('duck-game-finish-title');
  var finishSubEl = document.getElementById('duck-game-finish-sub');
  var finishStatsEl = document.getElementById('duck-game-finish-stats');
  var pauseBtn = document.getElementById('duck-game-pause-btn');
  var touchEl = document.getElementById('duck-game-touch');
  var startBtn = document.getElementById('duck-game-start-btn');
  var restartBtn = document.getElementById('duck-game-restart-btn');
  var finishBtn = document.getElementById('duck-game-finish-btn');
  var resumeBtn = document.getElementById('duck-game-resume-btn');

  var isTouch =
    ('ontouchstart' in window) || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  var reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------- 参数 ----------------
  var BASE_SPEED = 250; // 起始骑行速度 px/s
  var RAMP_RATE = 1.6; // 每秒提速（随游戏进行越来越快）
  var MAX_SPEED = 420; // 速度上限
  var SLOW_MUL = 0.68; // 血量 <= 3 时的速度倍率
  var SLOW_AT = 3;
  var BOOST_T = 5; // 牛奶/香蕉加速时长
  var BOOST_MUL = 1.35; // 加速倍率
  var BUMP_SPEED = 110; // 减速带时速
  var BUMP_T = 1.3; // 减速带作用时长
  var BUMP_GAP = 3600; // 减速带间隔（px，约 90 米）
  var BUMP_FIRST = 5200; // 第一条减速带距离（px，约 130 米）
  var MOVE_SPEED = 340; // 上下换道速度
  var MAX_HP = 5;
  var INVULN = 1.0; // 被撞后的无敌时间
  var KNOCK_INVULN = 0.3; // 撞飞后的短暂无敌
  var Z_WINDOW = 0.45; // Z 键有效提前量（秒）
  var X_WINDOW = 0.3; // X 键有效按下窗口（秒）
  var X_COOLDOWN = 0.5; // X 键冷却
  var CAR_DMG = 1.5; // 撞汽车扣血
  var CAR_W = 104; // 汽车碰撞箱
  var CAR_H = 48;
  var CAR_NEAR = 122; // 贴到汽车边缘（X 键）的判定距离
  var FINISH_DIST = 500; // 终点距离（米）
  var TIME_LIMIT = 65; // 赶早八时限（秒）
  var CAR_SPEED = 340; // GameOver 车的车速
  var GO_CAR_W = 170; // GameOver 车尺寸
  var GO_CAR_H = 74;
  var PX_FRAC = 0.22; // 玩家屏幕横向位置比例
  var BOX_W = 38; // 玩家碰撞箱
  var BOX_H = 44;
  var MAX_NPC = 18; // 同时存在的车手+汽车上限
  var MAX_CAR = 4; // 同时存在的汽车上限

  var FONT = '"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif';

  // ---------------- 状态 ----------------
  var mode = 'idle'; // idle | playing | dying | finish | over
  var paused = false;
  var W = 0;
  var H = 0;
  var DPR = 1;
  var cameraX = 0;
  var time = 0; // 本次骑行已用时间（秒）
  var spawnT = 0.6;
  var npcs = [];
  var pickups = []; // 牛奶/香蕉 { wx, y, kind, t, ttl }
  var bumps = []; // 减速带 { wx }
  var parts = [];
  var texts = [];
  var shake = { t: 0, max: 1, mag: 0 };
  var keys = {};
  var zPressedAt = -999;
  var xPressedAt = -999;
  var xCooldown = 0;
  var trafficEnabled = true; // 供自动化测试关闭随机刷车
  var frameZUsed = false;
  var dist = 0; // 已行驶距离（米）
  var knockCount = 0;
  var patches = [];
  var finishTime = 0; // 到达终点用时
  var verdict = ''; // win | lose
  var building = null; // { wx, arrived, t, doorY }

  var player = {
    x: 0,
    y: 0,
    hp: MAX_HP,
    speed: BASE_SPEED,
    slow: false,
    invulnT: 0,
    bob: 0,
    squished: false,
    boostT: 0,
    bumpT: 0,
    zFlashT: 0
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

  // 汽车配色
  var CAR_COLORS = ['#4a7bd6', '#3fae7d', '#c9a13c', '#b9564f', '#7d8794', '#5b6bde'];

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

  // ---------------- 生成车辆 ----------------
  function carCount() {
    var n = 0;
    for (var i = 0; i < npcs.length; i++) if (npcs[i].kind === 'car') n++;
    return n;
  }

  function spawnNPC() {
    var diff = clamp(time / 75, 0, 1);
    var spdMul = 1 + diff * 0.3;
    var n = {
      x: 0,
      y: rand(30, Math.max(31, H - 30)),
      ws: 0,
      dir: 1,
      skin: Math.floor(rand(0, SKINS.length)),
      bob: rand(0, 6.28),
      state: 'ride', // ride | angry | fly | landed
      kind: 'bike', // bike | car
      color: '#888888',
      hitFlash: 0,
      bubble: null,
      alpha: 1,
      fly: null,
      landT: 0
    };
    var roll = Math.random();
    var carChance = time > 6 ? 0.1 + diff * 0.12 : 0;

    if (roll < carChance && carCount() < MAX_CAR) {
      // 汽车：上侧车道向左，下侧车道向右
      n.kind = 'car';
      n.color = pick(CAR_COLORS);
      n.y = Math.random() < 0.5 ? rand(34, Math.max(36, H / 2 - 28)) : rand(H / 2 + 28, H - 34);
      var bottom = n.y > H / 2;
      n.dir = bottom ? 1 : -1;
      n.ws = n.dir * player.speed * (bottom ? 0.38 : 0.5);
      n.x = n.dir === 1 ? cameraX - 90 : cameraX + W + 90;
      npcs.push(n);
      return;
    }
    var r2 = carChance > 0 ? (roll - carChance) / (1 - carChance) : roll;
    if (r2 < 0.52) {
      // 相向行驶：从右侧进入，迎面而来
      n.dir = -1;
      n.ws = -player.speed * (0.55 + rand(0, 0.35)) * spdMul;
      n.x = cameraX + W + 70;
    } else if (r2 < 0.8) {
      // 同向但比玩家慢：从右侧（前方）被超越
      n.dir = 1;
      n.ws = player.speed * (0.4 + rand(0, 0.35)) * spdMul;
      n.x = cameraX + W + 70;
    } else {
      // 同向且比玩家快：从左侧（后方）超车
      n.dir = 1;
      n.ws = player.speed * (1.15 + rand(0, 0.35)) * spdMul;
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

  // ---------------- 车辆更新 ----------------
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
        f.vh -= (n.kind === 'car' ? 560 : 430) * dt;
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
      if (sx < -180 || sx > W + 180) {
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
      addText(player.x, player.y - 44, '骑行变慢了…', 1.4, '#ffd23f', 16);
    }
  }

  // 撞飞（车手：免费；汽车：仅加速状态下）
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
    if (n.kind === 'car') {
      n.fly.vx = -(320 + rand(0, 80));
      n.fly.vh = rand(160, 240);
      n.fly.vr = rand(-14, 14) || 9;
      burst(n.x - cameraX, n.y, 16, '#ffb0a0');
      addText(n.x - cameraX, n.y - 60, '哔——！！', 0.9, '#ffffff', 18);
    } else {
      burst(n.x - cameraX, n.y, 12, '#ffe066');
      addText(n.x - cameraX, n.y - 50, '💥', 0.7, '#ffffff', 18);
    }
    knockCount++;
    player.invulnT = KNOCK_INVULN;
    shakeIt(4.5, 0.22);
  }

  // 普通撞击
  function hitPlayer(amount, text) {
    player.hp -= amount;
    player.invulnT = INVULN;
    shakeIt(3.5, 0.22);
    addText(player.x, player.y - 42, text, 0.8, '#ff5a5f', 20);
    applyDamage();
  }

  function checkCollisions() {
    if (player.invulnT > 0) return;
    frameZUsed = false;
    var canZ = time - zPressedAt < Z_WINDOW;
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (n.state !== 'ride' && n.state !== 'angry') continue;
      var sx = n.x - cameraX;
      var boxW = n.kind === 'car' ? CAR_W : BOX_W;
      var boxH = n.kind === 'car' ? CAR_H : BOX_H;
      if (Math.abs(sx - player.x) > 80 || Math.abs(n.y - player.y) > 60) continue;
      if (!aabb(sx, n.y, boxW, boxH, player.x, player.y, BOX_W, BOX_H)) continue;

      if (n.kind === 'car') {
        // 常规状态汽车无法撞飞；加速状态下按 Z 可撞飞汽车
        if (canZ && !frameZUsed && player.boostT > 0) {
          frameZUsed = true;
          zPressedAt = -999;
          knock(n);
          return;
        }
        hitPlayer(CAR_DMG, '-1.5');
        n.hitFlash = 0.22;
        return;
      }
      // 车手：Z 提前按下 → 撞飞且不扣血
      if (canZ && !frameZUsed) {
        frameZUsed = true;
        zPressedAt = -999;
        knock(n);
        return;
      }
      // 普通相撞：扣 1 血，对方在右上角弹出愤怒对话框
      n.state = 'angry';
      n.bubble = { text: pick(ANGRY), t: 1.7, dur: 1.7 };
      n.hitFlash = 0.22;
      hitPlayer(1, '-1');
      return;
    }
  }

  // ---------------- X 键：向汽车讨要食物 ----------------
  function checkCarNear() {
    if (xCooldown > 0) return null;
    if (time - xPressedAt > X_WINDOW) return null;
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (n.kind !== 'car' || (n.state !== 'ride' && n.state !== 'angry')) continue;
      var sx = n.x - cameraX;
      var dx = Math.abs(sx - player.x);
      var dy = Math.abs(n.y - player.y);
      // 贴到车身边缘：未碰撞但在附近
      if (dx < CAR_NEAR && dy < CAR_H / 2 + 30 && dx >= (CAR_W + BOX_W) / 2 - 6) {
        return n;
      }
    }
    return null;
  }

  function throwPickup(carN) {
    var kind = Math.random() < 0.5 ? 'milk' : 'banana';
    var dropX = carN.x - carN.dir * 34;
    pickups.push({
      wx: dropX,
      y: clamp(carN.y + rand(-16, 16), 30, H - 30),
      kind: kind,
      t: 0,
      ttl: 6
    });
    xPressedAt = -999;
    xCooldown = X_COOLDOWN;
    burst(dropX - cameraX, carN.y, 8, '#ffffff');
    addText(dropX - cameraX, carN.y - 46, kind === 'milk' ? '牛奶！' : '香蕉！', 1, '#ffffff', 15);
  }

  function collectPickups() {
    for (var i = pickups.length - 1; i >= 0; i--) {
      var p = pickups[i];
      var sx = p.wx - cameraX;
      if (Math.abs(sx - player.x) < 26 && Math.abs(p.y - player.y) < 26) {
        player.boostT = BOOST_T;
        addText(player.x, player.y - 46, '⚡ 加速！', 1.2, '#7CFC00', 18);
        burst(player.x, player.y, 14, '#ffe066');
        pickups.splice(i, 1);
      }
    }
  }

  // ---------------- 减速带 ----------------
  function initBumps() {
    bumps.length = 0;
    bumps.push({ wx: cameraX + BUMP_FIRST });
  }

  function updateBumps(dt) {
    var i;
    for (i = bumps.length - 1; i >= 0; i--) {
      var b = bumps[i];
      if (b.wx - cameraX <= player.x + 10) {
        if (player.bumpT <= 0) {
          player.bumpT = BUMP_T;
          shakeIt(3, 0.25);
          addText(player.x, player.y - 44, '减速带！', 1, '#ffd23f', 17);
        }
        bumps.splice(i, 1);
        bumps.push({ wx: b.wx + BUMP_GAP });
      }
    }
  }

  // ---------------- 状态切换 ----------------
  function resetPlayer() {
    player.hp = MAX_HP;
    player.slow = false;
    player.invulnT = 0;
    player.squished = false;
    player.bob = 0;
    player.boostT = 0;
    player.bumpT = 0;
    player.zFlashT = 0;
    player.y = H / 2;
  }

  function start() {
    if (mode === 'playing') return;
    mode = 'playing';
    paused = false;
    resetPlayer();
    npcs.length = 0;
    pickups.length = 0;
    parts.length = 0;
    texts.length = 0;
    dist = 0;
    knockCount = 0;
    time = 0;
    spawnT = 0.9;
    finishTime = 0;
    verdict = '';
    building = null;
    car = null;
    xCooldown = 0;
    zPressedAt = -99;
    xPressedAt = -99;
    initBumps();
    startEl.hidden = true;
    overEl.hidden = true;
    finishEl.hidden = true;
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
    player.invulnT = 0;
    car = {
      cx: -GO_CAR_W / 2,
      targetX: player.x,
      state: 'wait',
      t: 0
    };
    pauseBtn.hidden = true;
    addText(player.x, player.y - 46, '！', 1, '#ffd23f', 24);
  }

  function startFinish() {
    mode = 'finish';
    finishTime = time;
    building = {
      wx: cameraX + W * 0.58,
      arrived: false,
      t: 0,
      doorY: player.y
    };
    pauseBtn.hidden = true;
    addText(player.x, player.y - 44, '终点！', 1.2, '#7CFC00', 20);
  }

  function showFinishVerdict() {
    verdict = finishTime < TIME_LIMIT ? 'win' : 'lose';
    mode = 'over';
    var win = verdict === 'win';
    finishTitleEl.textContent = win ? '🎓 赶早八成功！' : '⏰ 早八迟到';
    finishSubEl.textContent = win
      ? '你骑进了教学楼，赶在早八前落座。'
      : '教学楼近在眼前，但铃声已经响了…';
    finishStatsEl.textContent =
      '用时 ' + finishTime.toFixed(1) + ' s · 骑行 ' + Math.floor(dist) + ' m · 撞飞 ' + knockCount + ' 辆';
    finishEl.classList.toggle('duck-game__overlay--win', win);
    finishEl.classList.toggle('duck-game__overlay--lose', !win);
    finishEl.hidden = false;
    if (win) {
      burst(player.x, player.y - 60, 26, '#7CFC00');
      burst(player.x, player.y - 60, 18, '#ffd23f');
    }
  }

  function showGameOver() {
    mode = 'over';
    statsEl.textContent = '骑行 ' + Math.floor(dist) + ' m · 撞飞 ' + knockCount + ' 辆';
    overEl.hidden = false;
  }

  // ---------------- 速度模型 ----------------
  function computeSpeed() {
    var s = Math.min(MAX_SPEED, BASE_SPEED + time * RAMP_RATE);
    if (player.slow) s *= SLOW_MUL;
    if (player.bumpT > 0) s = BUMP_SPEED;
    if (player.boostT > 0) s *= BOOST_MUL;
    player.speed = s;
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
      computeSpeed();
      cameraX += player.speed * dt;
      player.bob += dt * (player.boostT > 0 ? 13 : player.slow ? 7 : 10);
      if (player.invulnT > 0) player.invulnT -= dt;
      if (player.boostT > 0) player.boostT -= dt;
      if (player.bumpT > 0) player.bumpT -= dt;
      if (player.zFlashT > 0) player.zFlashT -= dt;
      if (xCooldown > 0) xCooldown -= dt;
      var dy = 0;
      if (keys['w'] || keys['arrowup']) dy -= 1;
      if (keys['s'] || keys['arrowdown']) dy += 1;
      if (dy) {
        player.y = clamp(player.y + dy * MOVE_SPEED * dt, 30, H - 30);
      }
      dist += (player.speed * dt) / 40;

      // X 键：向贴身的汽车讨要食物
      if (time - xPressedAt < X_WINDOW) {
        var near = checkCarNear();
        if (near) throwPickup(near);
      }

      // 减速带
      updateBumps(dt);
      // 食物
      for (i = pickups.length - 1; i >= 0; i--) {
        pickups[i].t += dt;
        if (pickups[i].t > pickups[i].ttl) pickups.splice(i, 1);
      }
      collectPickups();

      // 刷车
      if (trafficEnabled) {
        spawnT -= dt;
        if (spawnT <= 0 && npcs.length < MAX_NPC) {
          spawnNPC();
          var diff = clamp(time / 75, 0, 1);
          spawnT = lerp(1.3, 0.45, diff) * rand(0.75, 1.25);
        }
      }
      updateNPCs(dt);
      checkCollisions();

      // 到达终点（若同帧死亡，优先死亡）
      if (mode === 'playing' && dist >= FINISH_DIST) startFinish();
    } else if (mode === 'dying') {
      car.t += dt;
      if (car.state === 'wait') {
        if (car.t > 0.5) {
          car.state = 'approach';
          car.t = 0;
        }
      } else if (car.state === 'approach') {
        car.cx += CAR_SPEED * dt;
        if (car.cx + GO_CAR_W / 2 >= player.x) {
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
    } else if (mode === 'finish') {
      // 到达动画：继续骑向教学楼，然后停下
      player.speed = Math.max(0, player.speed * (1 - (building.arrived ? 3.4 * dt : 0)));
      cameraX += player.speed * dt;
      player.bob += dt * 10;
      updateNPCs(dt);
      for (i = pickups.length - 1; i >= 0; i--) {
        pickups[i].t += dt;
        if (pickups[i].t > pickups[i].ttl) pickups.splice(i, 1);
      }
      collectPickups();
      building.t += dt;
      var bx = building.wx - cameraX;
      if (!building.arrived && bx <= player.x + 36) {
        building.arrived = true;
        building.t = 0;
      }
      if (building.arrived && building.t > 1.0) {
        showFinishVerdict();
      }
    }
    // 路面纹理回收
    for (i = 0; i < patches.length; i++) {
      if (patches[i].x - cameraX < -50) patches[i].x += W + 320;
    }
    updateFx(dt);
  }

  // ---------------- 特效 ----------------
  function addText(x, y, text, dur, color, size) {
    if (!text) return;
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

  // ---------------- 绘制：路面 ----------------
  function drawRoad() {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#26292f');
    g.addColorStop(0.5, '#23262b');
    g.addColorStop(1, '#26292f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

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

    // 中央黄虚线：正偏移 → 向左滑动（对应角色向右行驶）
    ctx.strokeStyle = 'rgba(240,196,60,0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([30, 26]);
    ctx.lineDashOffset = cameraX % 56;
    strokeLine(ctx, 0, H / 2, W, H / 2);
    ctx.setLineDash([]);

    // 车道白虚线（同样向左滑动）
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 30]);
    ctx.lineDashOffset = cameraX % 46;
    strokeLine(ctx, 0, H * 0.25, W, H * 0.25);
    strokeLine(ctx, 0, H * 0.75, W, H * 0.75);
    ctx.setLineDash([]);
  }

  // ---------------- 绘制：单车与骑手 ----------------
  function drawBike(x, y, dir, pal, bob, o) {
    o = o || {};
    var bobOff = Math.sin(bob) * 1.5;

    if (!o.noShadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ellipse(ctx, x, y + 4, 27, 12);
    }

    ctx.strokeStyle = pal.bike;
    ctx.lineWidth = 2.4;
    strokeLine(ctx, x - dir * 20, y, x + dir * 15, y);
    ctx.lineWidth = 2.8;
    strokeLine(ctx, x + dir * 18, y - 7, x + dir * 18, y + 7);
    ctx.fillStyle = '#3c4048';
    ellipse(ctx, x - dir * 12, y, 4.4, 2.6);

    ctx.fillStyle = '#14161a';
    ellipse(ctx, x - dir * 20, y, 7.6, 4.6);
    ellipse(ctx, x + dir * 20, y, 7.6, 4.6);
    ctx.fillStyle = '#8b95a3';
    circle(ctx, x - dir * 20, y, 1.6);
    circle(ctx, x + dir * 20, y, 1.6);

    var shx = x - dir * 4;
    var shy = y + 1 + bobOff * 0.4;
    if (o.fly) {
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

    var hx = shx;
    var hy = shy - 8 + bobOff;
    ctx.fillStyle = pal.helmet;
    circle(ctx, hx, hy, 9);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    circle(ctx, hx - 2.6, hy - 2.6, 3.2);

    if (o.isPlayer) {
      ctx.fillStyle = '#ff8c42';
      tri(ctx, hx + dir * 5, hy - 2.5, hx + dir * 9.5, hy, hx + dir * 5, hy + 2.5);
    }

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

  // ---------------- 绘制：汽车 ----------------
  function drawTrafficCar(cx, cy, dir, color) {
    var w = 108;
    var h = 52;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ellipse(ctx, cx, cy + 4, w / 2 + 3, h / 2 + 5);
    // 车轮
    ctx.fillStyle = '#0b0c0f';
    roundRectPath(ctx, cx - w / 2 + 5, cy - h / 2 - 5, 17, 8, 3);
    ctx.fill();
    roundRectPath(ctx, cx + w / 2 - 22, cy - h / 2 - 5, 17, 8, 3);
    ctx.fill();
    roundRectPath(ctx, cx - w / 2 + 5, cy + h / 2 - 3, 17, 8, 3);
    ctx.fill();
    roundRectPath(ctx, cx + w / 2 - 22, cy + h / 2 - 3, 17, 8, 3);
    ctx.fill();
    // 车身
    ctx.fillStyle = color;
    roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = shade(color, -50);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // 挡风玻璃（车头方向）
    ctx.fillStyle = 'rgba(60,80,105,0.85)';
    roundRectPath(ctx, cx + dir * (w / 2 - 27), cy - h / 2 + 8, 12, h - 16, 4);
    ctx.fill();
    // 车顶
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    roundRectPath(ctx, cx - dir * 10 - 24, cy - h / 2 + 12, 34, h - 24, 5);
    ctx.fill();
    // 车灯
    ctx.fillStyle = '#ffe082';
    roundRectPath(ctx, cx + dir * (w / 2 - 6), cy - h / 2 + 4, 5, 8, 2);
    ctx.fill();
    roundRectPath(ctx, cx + dir * (w / 2 - 6), cy + h / 2 - 12, 5, 8, 2);
    ctx.fill();
    // 尾灯
    ctx.fillStyle = '#ff5252';
    roundRectPath(ctx, cx - dir * (w / 2 - 2), cy - h / 2 + 4, 5, 8, 2);
    ctx.fill();
    roundRectPath(ctx, cx - dir * (w / 2 - 2), cy + h / 2 - 12, 5, 8, 2);
    ctx.fill();
  }

  // ---------------- 绘制：食物 ----------------
  function drawPickup(p) {
    var sx = p.wx - cameraX;
    if (sx < -40 || sx > W + 40) return;
    var bob = Math.sin(p.t * 8) * 3 - Math.max(0, Math.sin(p.t * 10)) * 6;
    var alpha = clamp(p.ttl - p.t, 0, 1);
    ctx.globalAlpha = alpha;
    var x = sx;
    var y = p.y + bob;
    // 光晕
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    circle(ctx, x, y, 13);
    if (p.kind === 'milk') {
      // 牛奶盒
      ctx.fillStyle = '#ffffff';
      roundRectPath(ctx, x - 7, y - 10, 14, 20, 3);
      ctx.fill();
      ctx.strokeStyle = '#9db8d9';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#3d7bd6';
      ctx.fillRect(x - 7, y - 3, 14, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 7, y - 1, 14, 2);
      // 吸管
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = 2;
      strokeLine(ctx, x + 3, y - 10, x + 6, y - 16);
    } else {
      // 香蕉
      ctx.strokeStyle = '#f6c244';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y + 2, 8, Math.PI * 0.15, Math.PI * 0.95);
      ctx.stroke();
      ctx.strokeStyle = '#8a6d1f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y + 2, 8, Math.PI * 0.15, Math.PI * 0.95);
      ctx.stroke();
      ctx.lineCap = 'round';
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- 绘制：减速带 ----------------
  function drawBump(b) {
    var sx = b.wx - cameraX;
    if (sx < -60 || sx > W + 60) return;
    var bw = 26;
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx - bw / 2, 12, bw, H - 24);
    ctx.clip();
    var n = Math.ceil((H - 24) / 18);
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#f0c63c' : '#26262b';
      ctx.fillRect(sx - bw / 2, 12 + i * 18, bw, 18);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx - bw / 2 + 0.5, 12.5, bw - 1, H - 25);
  }

  // ---------------- 绘制：教学楼 ----------------
  function drawFinishBand(x) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 12, 13, 24, H - 26);
    ctx.clip();
    var cell = 12;
    for (var r = 0; r * cell < H; r++) {
      for (var c = 0; c < 2; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#f2f2f2' : '#1c1e24';
        ctx.fillRect(x - 12 + c * cell, r * cell, cell, cell);
      }
    }
    ctx.restore();
  }

  function drawBuilding(bx) {
    var top = 16;
    var bot = H - 16;
    var BW = 300;
    var BH = bot - top;
    drawFinishBand(bx - 40);

    // 楼体
    ctx.fillStyle = '#cfc7b0';
    roundRectPath(ctx, bx, top, BW, BH, 6);
    ctx.fill();
    ctx.strokeStyle = '#7d7464';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 楼层分隔线
    ctx.strokeStyle = 'rgba(90,80,60,0.5)';
    ctx.lineWidth = 1.5;
    var rows = 5;
    for (var r = 1; r < rows; r++) {
      var yy = top + 40 + ((BH - 60) / rows) * r;
      strokeLine(ctx, bx + 6, yy, bx + BW - 6, yy);
    }

    // 窗户
    var cols = 4;
    for (r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var wx = bx + 16 + ((BW - 32) / cols) * c + 9;
        var wy = top + 46 + ((BH - 60) / rows) * r;
        ctx.fillStyle = '#9ec3e0';
        ctx.fillRect(wx - 11, wy - 9, 22, 18);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(wx - 11, wy - 9, 22, 18);
        ctx.fillStyle = 'rgba(120,160,190,0.5)';
        ctx.fillRect(wx - 6, wy - 9, 12, 18);
      }
    }

    // 屋顶装饰
    ctx.fillStyle = '#8a8171';
    roundRectPath(ctx, bx - 6, top - 10, BW + 12, 14, 4);
    ctx.fill();
    // 校名牌
    ctx.fillStyle = 'rgba(40,38,34,0.85)';
    roundRectPath(ctx, bx + BW / 2 - 52, top - 4, 104, 22, 5);
    ctx.fill();
    ctx.font = 'bold 14px ' + FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('教学楼', bx + BW / 2, top + 7);

    // 大门（对准玩家的到达位置）
    var doorY = building ? building.doorY : H / 2;
    ctx.fillStyle = '#4c3b2a';
    roundRectPath(ctx, bx + BW / 2 - 34, doorY - 30, 68, 62, 12);
    ctx.fill();
    ctx.fillStyle = '#2f2418';
    ctx.fillRect(bx + BW / 2 - 34, doorY + 14, 68, 18);
    ctx.fillStyle = '#ffd23f';
    circle(ctx, bx + BW / 2 + 18, doorY, 2.5);
  }

  // ---------------- 绘制：气泡 ----------------
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

  // ---------------- 绘制：实体 ----------------
  function drawNPC(n) {
    var sx = n.x - cameraX;
    if (sx < -170 || sx > W + 170) return;
    if (n.state === 'fly') {
      var f = n.fly;
      var gr = 1 - clamp(f.h / 150, 0, 0.75);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ellipse(ctx, sx, n.y + 3, 25 * gr, 11 * gr);
      ctx.save();
      ctx.translate(sx, n.y - f.h);
      ctx.rotate(f.rot);
      if (n.kind === 'car') {
        drawTrafficCar(0, 0, n.dir, n.color);
      } else {
        drawBike(0, 0, n.dir, SKINS[n.skin], n.bob, { fly: true, noShadow: true });
      }
      ctx.restore();
    } else if (n.state === 'landed') {
      ctx.save();
      ctx.globalAlpha = n.alpha;
      ctx.translate(sx, n.y);
      ctx.rotate(1.25);
      if (n.kind === 'car') {
        drawTrafficCar(0, 0, n.dir, n.color);
      } else {
        drawBike(0, 0, n.dir, SKINS[n.skin], n.bob, { squish: true, noShadow: true });
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (n.kind === 'car') {
      drawTrafficCar(sx, n.y, n.dir, n.color);
      if (n.hitFlash > 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        roundRectPath(ctx, sx - CAR_W / 2, n.y - CAR_H / 2, CAR_W, CAR_H, 10);
        ctx.fill();
      }
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
    // 加速尾迹
    if (player.boostT > 0) {
      ctx.fillStyle = 'rgba(255,220,90,0.35)';
      for (var k = 0; k < 4; k++) {
        circle(ctx, player.x - 24 - k * 15, player.y + Math.sin(time * 18 + k * 1.7) * 5, 6 - k * 1.1);
      }
    }
    var blink = player.invulnT > 0 && Math.sin(time * 22) > 0;
    ctx.globalAlpha = blink ? 0.4 : 1;
    if (player.squished) {
      var sy = carY != null ? clamp(carY + GO_CAR_H / 2 + 10, 12, H - 12) : clamp(player.y + 46, 12, H - 12);
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
    // Z 键待机指示（按下后的有效窗口内）
    if (player.zFlashT > 0 && mode === 'playing') {
      ctx.globalAlpha = clamp(player.zFlashT / Z_WINDOW, 0, 1);
      ctx.fillStyle = '#ffd23f';
      circle(ctx, player.x + 26, player.y - 30, 10);
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Z', player.x + 26, player.y - 29);
      ctx.globalAlpha = 1;
    }
  }

  function drawCar(cx, cy) {
    var w = GO_CAR_W;
    var h = GO_CAR_H;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ellipse(ctx, cx, cy + 4, w / 2 + 4, h / 2 + 6);
    ctx.fillStyle = '#0b0c0f';
    roundRectPath(ctx, cx - w / 2 + 6, cy - h / 2 - 6, 18, 9, 3);
    ctx.fill();
    roundRectPath(ctx, cx + w / 2 - 24, cy - h / 2 - 6, 18, 9, 3);
    ctx.fill();
    roundRectPath(ctx, cx - w / 2 + 6, cy + h / 2 - 3, 18, 9, 3);
    ctx.fill();
    roundRectPath(ctx, cx + w / 2 - 24, cy + h / 2 - 3, 18, 9, 3);
    ctx.fill();
    ctx.fillStyle = '#23252d';
    roundRectPath(ctx, cx - w / 2, cy - h / 2, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = '#4a4f5c';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#c62828';
    roundRectPath(ctx, cx - w / 2 + 7, cy + 8, w - 14, 10, 4);
    ctx.fill();
    ctx.fillStyle = '#39414d';
    roundRectPath(ctx, cx + w / 2 - 40, cy - h / 2 + 9, 16, h - 18, 5);
    ctx.fill();
    ctx.fillStyle = '#ffe082';
    roundRectPath(ctx, cx + w / 2 - 7, cy - h / 2 + 5, 6, 9, 2);
    ctx.fill();
    roundRectPath(ctx, cx + w / 2 - 7, cy + h / 2 - 14, 6, 9, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(10,10,14,0.88)';
    roundRectPath(ctx, cx - 48, cy - 13, 96, 26, 6);
    ctx.fill();
    ctx.font = '900 17px "Arial Black","Segoe UI",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('GAMEOVER', cx, cy + 1);
  }

  // ---------------- 绘制：HUD ----------------
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
    var chipY = 52;
    if (player.slow && mode === 'playing') {
      ctx.fillStyle = 'rgba(8,10,14,0.55)';
      roundRectPath(ctx, 10, chipY, 108, 24, 9);
      ctx.fill();
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd23f';
      ctx.fillText('🐢 低速模式', 20, chipY + 12);
      chipY += 28;
    }
    if (player.boostT > 0) {
      ctx.fillStyle = 'rgba(8,10,14,0.55)';
      roundRectPath(ctx, 10, chipY, 108, 24, 9);
      ctx.fill();
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#7CFC00';
      ctx.fillText('⚡ 加速中', 20, chipY + 12);
      chipY += 28;
    }
    if (player.bumpT > 0 && mode === 'playing') {
      ctx.fillStyle = 'rgba(8,10,14,0.55)';
      roundRectPath(ctx, 10, chipY, 108, 24, 9);
      ctx.fill();
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffb347';
      ctx.fillText('减速带…', 20, chipY + 12);
    }
    // 右侧信息
    ctx.font = 'bold 14px ' + FONT;
    ctx.textAlign = 'right';
    var toFinish = Math.max(0, Math.round(FINISH_DIST - dist));
    var l1 = '🚴 距终点 ' + toFinish + ' m';
    var l2 = '⏱ ' + time.toFixed(1) + ' s';
    var l3 = '💥 撞飞 ' + knockCount;
    var w1 = ctx.measureText(l1).width;
    var w2 = ctx.measureText(l2).width;
    var w3 = ctx.measureText(l3).width;
    var bw = Math.max(w1, w2, w3) + 26;
    ctx.fillStyle = 'rgba(8,10,14,0.55)';
    roundRectPath(ctx, W - 10 - bw, 10, bw, 58, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(l1, W - 24, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(l2, W - 24, 42);
    ctx.fillText(l3, W - 24, 58);
    if (!isTouch) {
      ctx.font = '12px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('W/S 移动 · Z 撞飞 · X 讨食物 · P 暂停', 14, H - 14);
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

  // 靠近汽车时的 X 提示
  function drawXHint() {
    if (mode !== 'playing' || xCooldown > 0) return;
    for (var i = 0; i < npcs.length; i++) {
      var n = npcs[i];
      if (n.kind !== 'car' || (n.state !== 'ride' && n.state !== 'angry')) continue;
      var sx = n.x - cameraX;
      var dx = Math.abs(sx - player.x);
      var dy = Math.abs(n.y - player.y);
      if (dx < CAR_NEAR && dy < CAR_H / 2 + 34 && dx >= (CAR_W + BOX_W) / 2 - 6) {
        ctx.globalAlpha = 0.55 + 0.35 * Math.sin(time * 10);
        ctx.fillStyle = '#ffffff';
        roundRectPath(ctx, sx - 24, n.y - CAR_H / 2 - 34, 48, 22, 9);
        ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.font = 'bold 12px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('按 X', sx, n.y - CAR_H / 2 - 23);
        ctx.globalAlpha = 1;
        return;
      }
    }
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
    // 减速带
    for (var b = 0; b < bumps.length; b++) drawBump(bumps[b]);
    // 食物
    for (var p = 0; p < pickups.length; p++) drawPickup(pickups[p]);
    // 车辆
    for (var i = 0; i < npcs.length; i++) drawNPC(npcs[i]);
    if (mode === 'finish' && building) {
      drawBuilding(building.wx - cameraX);
    }
    if (mode === 'playing' || mode === 'dying' || mode === 'finish') {
      var carY = null;
      if (mode === 'dying' && car) {
        carY = clamp(player.y, GO_CAR_H / 2 + 8, H - GO_CAR_H / 2 - 8);
        drawCar(car.cx, carY);
      }
      drawPlayer(carY);
    }
    drawXHint();
    drawFX();
    if (mode === 'playing' || mode === 'dying' || mode === 'finish') drawHUD();
    ctx.restore();
  }

  // ---------------- 输入 ----------------
  function preventKey(k) {
    return (
      k === 'w' ||
      k === 's' ||
      k === 'z' ||
      k === 'x' ||
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
    if (k === 'z') {
      zPressedAt = time;
      player.zFlashT = Z_WINDOW;
    }
    if (k === 'x') xPressedAt = time;
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
  if (finishBtn) {
    finishBtn.addEventListener('click', function () {
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
    var touchMap = { up: 'w', down: 's', z: 'z', x: 'x' };
    var btns = touchEl.querySelectorAll('button');
    for (var bi = 0; bi < btns.length; bi++) {
      (function (btn) {
        var key = touchMap[btn.getAttribute('data-touch')];
        if (!key) return;
        var press = function (e) {
          e.preventDefault();
          keys[key] = true;
          if (key === 'z') {
            zPressedAt = time;
            player.zFlashT = Z_WINDOW;
          }
          if (key === 'x') xPressedAt = time;
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
  initBumps();

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
        restart: function () {
          // 强制重开一局（即使当前正处于 playing 中）
          mode = 'idle';
          start();
        },
        hurt: function (n) {
          for (var i = 0; i < n; i++) player.hp -= 1;
          applyDamage();
        },
        clear: function () {
          npcs.length = 0;
          pickups.length = 0;
          player.boostT = 0;
          player.bumpT = 0;
          player.invulnT = 0;
          zPressedAt = -999;
          xPressedAt = -999;
          xCooldown = 0;
        },
        setTraffic: function (on) {
          trafficEnabled = !!on;
        },
        teleport: function (y) {
          player.y = clamp(y, 30, H - 30);
        },
        press: function (key) {
          keys[key] = true;
          if (key === 'z') {
            zPressedAt = time;
            player.zFlashT = Z_WINDOW;
          }
          if (key === 'x') xPressedAt = time;
        },
        release: function (key) {
          keys[key] = false;
        },
        forceOncoming: function (ahead) {
          // 在玩家前方同车道生成一辆相向车手（仅测试用）
          ahead = ahead == null ? 160 : ahead;
          var n = {
            x: cameraX + player.x + ahead,
            y: player.y,
            ws: -230,
            dir: -1,
            skin: 1,
            bob: 0,
            state: 'ride',
            kind: 'bike',
            color: '#888888',
            hitFlash: 0,
            bubble: null,
            alpha: 1,
            fly: null,
            landT: 0
          };
          npcs.push(n);
          return npcs.length;
        },
        forceCar: function (ahead) {
          // 生成一辆汽车：与玩家同车道，方向按所在半边车道规则，贴近玩家以便快速撞上
          ahead = ahead == null ? 260 : ahead;
          var bottom = player.y > H / 2;
          var dir = bottom ? 1 : -1;
          var n = {
            x: cameraX + player.x + (dir === -1 ? 30 : -30),
            y: player.y,
            ws: dir * player.speed * (bottom ? 0.38 : 0.5),
            dir: dir,
            skin: 0,
            bob: 0,
            state: 'ride',
            kind: 'car',
            color: '#4a7bd6',
            hitFlash: 0,
            bubble: null,
            alpha: 1,
            fly: null,
            landT: 0
          };
          npcs.push(n);
          return npcs.length;
        },
        forceCarAdjacent: function () {
          // 把一辆汽车放到玩家右前方 95px（贴边未碰撞）
          var bottom = player.y > H / 2;
          var dir = bottom ? 1 : -1;
          var n = {
            x: cameraX + player.x + 95,
            y: player.y,
            ws: dir * player.speed * (bottom ? 0.38 : 0.5),
            dir: dir,
            skin: 0,
            bob: 0,
            state: 'ride',
            kind: 'car',
            color: '#3fae7d',
            hitFlash: 0,
            bubble: null,
            alpha: 1,
            fly: null,
            landT: 0
          };
          npcs.push(n);
          return npcs.length;
        },
        forcePickup: function () {
          pickups.push({
            wx: cameraX + player.x,
            y: player.y,
            kind: Math.random() < 0.5 ? 'milk' : 'banana',
            t: 0,
            ttl: 6
          });
          return pickups.length;
        },
        forceBump: function () {
          player.bumpT = BUMP_T;
          return player.bumpT;
        },
        jump: function (meters, secs) {
          dist = meters == null ? FINISH_DIST - 0.5 : meters;
          time = secs == null ? 40 : secs;
          return { dist: dist, time: time };
        },
        state: function () {
          var cars = 0;
          for (var i = 0; i < npcs.length; i++) if (npcs[i].kind === 'car') cars++;
          return {
            mode: mode,
            paused: paused,
            hp: player.hp,
            slow: player.slow,
            speed: Math.round(player.speed),
            dist: Math.floor(dist),
            time: Math.round(time * 10) / 10,
            knock: knockCount,
            npcs: npcs.length,
            cars: cars,
            pickups: pickups.length,
            bumps: bumps.length,
            w: W,
            h: H,
            squished: player.squished,
            car: car ? car.state : null,
            invuln: player.invulnT,
            boostT: player.boostT,
            bumpT: player.bumpT,
            finishTime: finishTime,
            verdict: verdict
          };
        }
      };
    }
  } catch (e) {}
})();
