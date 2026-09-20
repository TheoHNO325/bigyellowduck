// PNG 编码→解码回环测试：验证 _pngview2.js 的解码逻辑是否可靠
const zlib = require('zlib');
const fs = require('fs');

// 构造一个已知图像: 4 个颜色块 + 渐变
const W = 8, H = 8, ch = 3;
const raw = Buffer.alloc(H * (1 + W * ch)); // filter 0
// 左上红 (255,0,0)，右上绿 (0,170,68)，左下蓝 (0,0,255)，右下白 (255,255,255)
for (let y = 0; y < H; y++) {
  const rowOff = y * (1 + W * ch) + 1;
  for (let x = 0; x < W; x++) {
    const i = rowOff + x * ch;
    if (x < 4 && y < 4) { raw[i] = 255; raw[i + 1] = 0; raw[i + 2] = 0; }
    else if (x >= 4 && y < 4) { raw[i] = 0; raw[i + 1] = 170; raw[i + 2] = 68; }
    else if (x < 4) { raw[i] = 0; raw[i + 1] = 0; raw[i + 2] = 255; }
    else { raw[i] = 255; raw[i + 1] = 255; raw[i + 2] = 255; }
  }
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  // CRC32
  let c = 0xffffffff;
  for (const byte of td) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  crc.writeUInt32BE((c ^ 0xffffffff) >>> 0);
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 2; // 8bit RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync('F:/硝酸铜/novel/hexo-blog/_roundtrip.png', png);

// ---- 用 _pngview2.js 相同的解码逻辑解码 ----
const buf = fs.readFileSync('F:/硝酸铜/novel/hexo-blog/_roundtrip.png');
let pos = 8, width = 0, height = 0, colorType = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.slice(pos + 8, pos + 8 + len);
  if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9]; }
  else if (type === 'IDAT') idat.push(data);
  else if (type === 'IEND') break;
  pos += 12 + len;
}
const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
const raw2 = zlib.inflateSync(Buffer.concat(idat));
const stride = width * channels;
const out = Buffer.alloc(width * height * channels);
let prev = Buffer.alloc(stride);
for (let y = 0; y < height; y++) {
  const filter = raw2[y * (stride + 1)];
  const line = raw2.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
  const row = out.slice(y * stride, (y + 1) * stride);
  for (let x = 0; x < stride; x++) {
    const a = x >= channels ? row[x - channels] : 0;
    const b = prev[x];
    const c = x >= channels ? prev[x - channels] : 0;
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
const px = (x, y) => { const i = (y * width + x) * channels; return [out[i], out[i + 1], out[i + 2]]; };
console.log('期望 红(255,0,0) 实得', px(1, 1));
console.log('期望 绿(0,170,68) 实得', px(6, 1));
console.log('期望 蓝(0,0,255) 实得', px(1, 6));
console.log('期望 白(255,255,255) 实得', px(6, 6));
const ok = px(1,1)[0]===255&&px(1,1)[1]===0&&px(6,1)[1]===170&&px(6,1)[2]===68&&px(1,6)[2]===255&&px(6,6)[0]===255;
console.log(ok ? '>>> 解码器正确 <<<' : '>>> 解码器有 bug <<<');
