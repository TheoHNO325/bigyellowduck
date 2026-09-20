// 临时工具：解码 PNG 并输出 ASCII 字符画 + 绿色像素统计，用于检查竹林是否渲染
const fs = require('fs');
const zlib = require('zlib');

function decodePNG(path) {
  const buf = fs.readFileSync(path);
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.slice(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * channels);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = out.slice(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? row[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v = (v + a) & 0xff; break;
        case 2: v = (v + b) & 0xff; break;
        case 3: v = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          v = (v + pr) & 0xff; break;
        }
      }
      row[x] = v;
    }
    prev = row;
  }
  return { width, height, channels, data: out };
}

const img = decodePNG(process.argv[2]);
const { width: W, height: H, channels: ch, data } = img;
console.log(`size: ${W}x${H} ch=${ch}`);

// 统计绿色像素
let greenPx = 0, totalPx = 0, darkGreen = 0;
const regionGreen = {}; // 按 y 分 6 段统计
for (let y = 0; y < H; y += 4) {
  for (let x = 0; x < W; x += 4) {
    const i = (y * W + x) * ch;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    totalPx++;
    const gr = g - (r + b) / 2;
    if (gr > 30) greenPx++;
    if (gr > 60 && g < 120) darkGreen++;
    const seg = Math.min(5, Math.floor((y / H) * 6));
    if (!regionGreen[seg]) regionGreen[seg] = [0, 0];
    regionGreen[seg][0] += gr > 30 ? 1 : 0;
    regionGreen[seg][1]++;
  }
}
console.log(`greenish px: ${(100 * greenPx / totalPx).toFixed(1)}%  darkGreen: ${(100 * darkGreen / totalPx).toFixed(1)}%`);
for (const k of Object.keys(regionGreen)) {
  const [a, t] = regionGreen[k];
  console.log(`  y段${k}: 绿色占比 ${(100 * a / t).toFixed(1)}%`);
}

// ASCII 字符画
const CW = 140, CH = 46;
const ramp = ' .:-=+*#%@';
for (let gy = 0; gy < CH; gy++) {
  let line = '';
  for (let gx = 0; gx < CW; gx++) {
    // 采样该格子内若干点取平均
    const x0 = Math.floor(gx / CW * W), x1 = Math.floor((gx + 1) / CW * W);
    const y0 = Math.floor(gy / CH * H), y1 = Math.floor((gy + 1) / CH * H);
    let sr = 0, sg = 0, sb = 0, n = 0;
    for (let y = y0; y < y1; y += Math.max(1, (y1 - y0) / 3)) {
      for (let x = x0; x < x1; x += Math.max(1, (x1 - x0) / 3)) {
        const i = (y * W + x) * ch;
        sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++;
      }
    }
    sr /= n; sg /= n; sb /= n;
    const greenish = sg - (sr + sb) / 2;
    const bright = (sr + sg + sb) / 3;
    if (greenish > 50) line += bright < 100 ? 'B' : 'G';
    else if (greenish > 22) line += 'g';
    else if (greenish > 8) line += '+';
    else {
      const idx = Math.min(ramp.length - 1, Math.floor((1 - bright / 255) * (ramp.length - 1)));
      line += ramp[idx];
    }
  }
  console.log(line);
}
