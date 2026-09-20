// 软件 canvas 模拟器：忠实回放页面脚本的绘制调用，低分辨率光栅化，输出 ASCII
const fs = require('fs');

const html = fs.readFileSync('F:/硝酸铜/novel/hexo-blog/盛夏竹海.html', 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// ---------- 画布模拟 ----------
const RECT_W = 120, RECT_H = 68;          // 低分辨率渲染
const SRC_W = 1600, SRC_H = 900;          // 页面逻辑尺寸
const SX = RECT_W / SRC_W, SY = RECT_H / SRC_H;
const canvas = new Float32Array(RECT_W * RECT_H * 4); // RGBA 0..1

let curFill = '#000', curAlpha = 1, curComp = 'source-over', curLW = 1, curFilter = 'none';
let curPath = [], pathClosed = false;
let matrix = [1, 0, 0, 1, 0, 0]; // a,b,c,d,e,f
const stack = [];
function applyMat(x, y) { return [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]]; }

function parseColor(s) {
  if (!s) return [0, 0, 0, 1];
  const m = String(s).match(/rgba?\(([\d.]+),([\d.]+),([\d.]+)(?:,([\d.]+))?\)/);
  if (m) return [m[1] / 255, m[2] / 255, m[3] / 255, m[4] === undefined ? 1 : +m[4]];
  const h = String(s).match(/^#([0-9a-fA-F]{6})$/);
  if (h) { const v = parseInt(h[1], 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, 1]; }
  return [0, 0, 0, 1];
}
function gradColor(grad, x, y) {
  // grad: {type:'linear',x0,y0,x1,y1,stops:[[off,[r,g,b,a]],...]} 或 radial
  let t;
  if (grad.type === 'linear') {
    const dx = grad.x1 - grad.x0, dy = grad.y1 - grad.y0;
    const len2 = dx * dx + dy * dy || 1;
    t = ((x - grad.x0) * dx + (y - grad.y0) * dy) / len2;
  } else {
    const dx = x - grad.x0, dy = y - grad.y0;
    const r = Math.sqrt(dx * dx + dy * dy);
    t = (r - grad.r0) / (grad.r1 - grad.r0 || 1);
  }
  t = Math.max(0, Math.min(1, t));
  const stops = grad.stops;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [o0, c0] = stops[i - 1], [o1, c1] = stops[i];
      const f = (t - o0) / (o1 - o0 || 1);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f, c0[3] + (c1[3] - c0[3]) * f];
    }
  }
  const last = stops[stops.length - 1][1];
  return last;
}
function fillColor(fs, x, y) { return typeof fs === 'object' && fs.type ? gradColor(fs, x, y) : parseColor(fs); }

function blend(px, c, a, comp) {
  const sa = a * c[3];
  if (sa <= 0) return;
  for (let k = 0; k < 3; k++) {
    const dst = px[k], src = c[k];
    let v;
    if (comp === 'screen') v = 1 - (1 - src) * (1 - dst);
    else if (comp === 'lighter') v = src + dst;
    else v = src * sa + dst * (1 - sa);
    px[k] = v > 1 ? 1 : v;
  }
  if (comp === 'source-over') px[3] = sa + px[3] * (1 - sa);
}

function fillRect(x, y, w, h) {
  const p0 = applyMat(x, y), p1 = applyMat(x + w, y + h);
  const x0 = Math.max(0, Math.floor(Math.min(p0[0], p1[0]) * SX)), x1 = Math.min(RECT_W - 1, Math.ceil(Math.max(p0[0], p1[0]) * SX));
  const y0 = Math.max(0, Math.floor(Math.min(p0[1], p1[1]) * SY)), y1 = Math.min(RECT_H - 1, Math.ceil(Math.max(p0[1], p1[1]) * SY));
  for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
    const cx = (xx + 0.5) / SX, cy = (yy + 0.5) / SY;
    blend(canvas.subarray((yy * RECT_W + xx) * 4, (yy * RECT_W + xx) * 4 + 4), fillColor(curFill, cx, cy), curAlpha, curComp);
  }
}
function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function fillPath() {
  const poly = curPath.map(([x, y]) => applyMat(x, y));
  if (poly.length < 3) return;
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const [x, y] of poly) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const bx0 = Math.max(0, Math.floor(minX * SX)), bx1 = Math.min(RECT_W - 1, Math.ceil(maxX * SX));
  const by0 = Math.max(0, Math.floor(minY * SY)), by1 = Math.min(RECT_H - 1, Math.ceil(maxY * SY));
  for (let yy = by0; yy <= by1; yy++) for (let xx = bx0; xx <= bx1; xx++) {
    const cx = (xx + 0.5) / SX, cy = (yy + 0.5) / SY;
    if (inPoly(cx, cy, poly)) blend(canvas.subarray((yy * RECT_W + xx) * 4, (yy * RECT_W + xx) * 4 + 4), fillColor(curFill, cx, cy), curAlpha, curComp);
  }
}
function strokePath() {
  const pts = curPath.map(([x, y]) => applyMat(x, y));
  const r = curLW * 0.5 * Math.max(SX, SY);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const steps = Math.max(1, Math.ceil(Math.hypot((bx - ax) * SX, (by - ay) * SY) * 2));
    for (let s = 0; s <= steps; s++) {
      const cx = ax + (bx - ax) * s / steps, cy = ay + (by - ay) * s / steps;
      const xx = Math.round(cx * SX), yy = Math.round(cy * SY);
      if (xx < 0 || xx >= RECT_W || yy < 0 || yy >= RECT_H) continue;
      blend(canvas.subarray((yy * RECT_W + xx) * 4, (yy * RECT_W + xx) * 4 + 4), parseColor(curStroke), curAlpha, curComp);
    }
  }
}
let curStroke = '#000';

const ctx = {
  setTransform(a, b, c, d, e, f) { matrix = [a, b, c, d, e, f]; },
  translate(tx, ty) { matrix = [matrix[0], matrix[1], matrix[2], matrix[3], matrix[0] * tx + matrix[2] * ty + matrix[4], matrix[1] * tx + matrix[3] * ty + matrix[5]]; },
  rotate(a) { const c = Math.cos(a), s = Math.sin(a); const [m0, m1, m2, m3, m4, m5] = matrix; matrix = [m0 * c + m2 * s, m1 * c + m3 * s, -m0 * s + m2 * c, -m1 * s + m3 * c, m4, m5]; },
  save() { stack.push({ fill: curFill, stroke: curStroke, alpha: curAlpha, comp: curComp, lw: curLW, filter: curFilter, matrix: matrix.slice(), path: curPath, closed: pathClosed }); },
  restore() { const s = stack.pop(); curFill = s.fill; curStroke = s.stroke; curAlpha = s.alpha; curComp = s.comp; curLW = s.lw; curFilter = s.filter; matrix = s.matrix; curPath = s.path; pathClosed = s.closed; },
  clearRect(x, y, w, h) { curFill = 'rgba(0,0,0,1)'; curAlpha = 1; curComp = 'source-over'; fillRect(x, y, w, h); },
  fillRect, fill: fillPath,
  beginPath() { curPath = []; pathClosed = false; },
  moveTo(x, y) { curPath = [[x, y]]; },
  lineTo(x, y) { curPath.push([x, y]); },
  quadraticCurveTo(cx, cy, x, y) {
    const [x0, y0] = curPath[curPath.length - 1];
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, u = 1 - t;
      curPath.push([u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y]);
    }
  },
  closePath() { pathClosed = true; if (curPath.length) curPath.push(curPath[0]); },
  stroke() { strokePath(); },
  arc(x, y, r, a0, a1) {
    for (let i = 0; i <= 16; i++) {
      const a = a0 + (a1 - a0) * i / 16;
      curPath.push([x + r * Math.cos(a), y + r * Math.sin(a)]);
    }
  },
  createLinearGradient(x0, y0, x1, y1) { return { type: 'linear', x0, y0, x1, y1, stops: [] }; },
  createRadialGradient(x0, y0, r0, x1, y1, r1) { return { type: 'radial', x0, y0, r0, x1, y1, r1, stops: [] }; },
};
const gradProto = {
  addColorStop(off, color) { this.stops.push([off, parseColor(color)]); this.stops.sort((a, b) => a[0] - b[0]); },
};
ctx.createLinearGradient.bind && null;

// 让 gradient 对象有 addColorStop
const makeGrad = (type) => { const g = { type, stops: [] }; g.addColorStop = gradProto.addColorStop; return g; };
const origLG = ctx.createLinearGradient, origRG = ctx.createRadialGradient;
ctx.createLinearGradient = function (x0, y0, x1, y1) { const g = makeGrad('linear'); g.x0 = x0; g.y0 = y0; g.x1 = x1; g.y1 = y1; return g; };
ctx.createRadialGradient = function (x0, y0, r0, x1, y1, r1) { const g = makeGrad('radial'); g.x0 = x0; g.y0 = y0; g.r0 = r0; g.x1 = x1; g.y1 = y1; g.r1 = r1; return g; };

// 属性 setter
Object.defineProperties(ctx, {
  fillStyle: { get() { return curFill; }, set(v) { curFill = v; } },
  strokeStyle: { get() { return curStroke; }, set(v) { curStroke = v; } },
  globalAlpha: { get() { return curAlpha; }, set(v) { curAlpha = v; } },
  globalCompositeOperation: { get() { return curComp; }, set(v) { curComp = v; } },
  lineWidth: { get() { return curLW; }, set(v) { curLW = v; } },
  filter: { get() { return curFilter; }, set(v) { curFilter = v; } },
});

// ---------- 页面环境 ----------
const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
const canvasEl = { width: 0, height: 0, getContext() { return ctx; } };
const els = { scene: canvasEl, colophon: { classList }, toggle: { addEventListener() {}, classList } };
let frames = 0;
global.window = {
  innerWidth: SRC_W, innerHeight: SRC_H, devicePixelRatio: 1,
  addEventListener() {},
  matchMedia() { return { matches: false }; },
};
global.document = { getElementById(id) { return els[id] || { classList }; } };
global.performance = { now() { return Date.now(); } };
global.requestAnimationFrame = function (cb) { if (frames++ < 2) cb(frames * 16); };

try { (0, eval)(code); console.log('executed', frames, 'frames'); }
catch (e) { console.log('RUNTIME ERROR:', e.message); console.log(e.stack.split('\n').slice(0, 5).join('\n')); process.exit(1); }

// ---------- 输出 ASCII ----------
const ramp = ' .:-=+*#%@';
for (let gy = 0; gy < RECT_H; gy++) {
  let line = '';
  for (let gx = 0; gx < RECT_W; gx++) {
    const i = (gy * RECT_W + gx) * 4;
    const r = canvas[i], g = canvas[i + 1], b = canvas[i + 2], a = canvas[i + 3];
    if (a < 0.05) { line += '?'; continue; }
    const bright = (r + g + b) / 3;
    const gr = g - (r + b) / 2;
    if (gr > 0.12) line += bright < 0.35 ? 'B' : 'G';
    else if (gr > 0.05) line += 'g';
    else {
      const idx = Math.min(ramp.length - 1, Math.max(0, Math.floor((1 - bright) * (ramp.length - 1))));
      line += ramp[idx];
    }
  }
  console.log(line);
}
// 统计
let total = 0, green = 0, brightPx = 0, darkPx = 0;
for (let i = 0; i < canvas.length; i += 4) {
  total++;
  const r = canvas[i], g = canvas[i + 1], b = canvas[i + 2], a = canvas[i + 3];
  if (a < 0.05) continue;
  if (g - (r + b) / 2 > 0.05) green++;
  if ((r + g + b) / 3 > 0.6) brightPx++;
  if ((r + g + b) / 3 < 0.2) darkPx++;
}
console.log(`统计: 绿色 ${(green / total * 100).toFixed(1)}% 亮色 ${(brightPx / total * 100).toFixed(1)}% 暗色 ${(darkPx / total * 100).toFixed(1)}%`);
