// 临时工具 v2：纯亮度 ASCII 字符画 + 按列统计暗像素（检测垂直竹竿带）
const fs = require('fs');
const zlib = require('zlib');

function decodePNG(path) {
  const buf = fs.readFileSync(path);
  let pos = 8, width = 0, height = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const ch = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const out = Buffer.alloc(width * height * ch);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.slice(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? row[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      let v = line[x] === undefined ? 0 : line[x];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff; break; }
      }
      row[x] = v;
    }
    prev = row;
  }
  return { width, height, ch, data: out };
}

const img = decodePNG(process.argv[2]);
const { width: W, height: H, ch, data } = img;
console.log(`size: ${W}x${H} ch=${ch}`);

// 亮度字符画（整数采样）
const ramp = ' .:-=+*#%@';
const CW = 150, CH = 50;
for (let gy = 0; gy < CH; gy++) {
  let line = '';
  for (let gx = 0; gx < CW; gx++) {
    const x = Math.floor(gx / CW * W) + Math.floor(W / CW / 2);
    const y = Math.floor(gy / CH * H);
    const i = (y * W + x) * ch;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const bright = (r + g + b) / 3;
    const idx = Math.min(ramp.length - 1, Math.max(0, Math.floor((1 - bright / 255) * (ramp.length - 1))));
    line += ramp[idx];
  }
  console.log(line);
}

// 按列统计：每列在中段(25%~60%高度)的"暗于背景"像素数，检测垂直竹竿
console.log('\n--- 每 10 列一组的暗像素计数（25%-60% 高度带），* 表示柱状暗带 ---');
const colDark = new Array(W).fill(0);
for (let y = Math.floor(H * 0.25); y < Math.floor(H * 0.6); y += 2) {
  for (let x = 0; x < W; x += 2) {
    const i = (y * W + x) * ch;
    const bright = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (bright < 130) colDark[x]++;
  }
}
let out = '';
for (let x = 0; x < W; x += 10) {
  let s = 0;
  for (let k = 0; k < 10; k++) s += colDark[x + k] || 0;
  out += s > 40 ? '*' : s > 20 ? '|' : s > 8 ? '.' : ' ';
}
console.log(out);
