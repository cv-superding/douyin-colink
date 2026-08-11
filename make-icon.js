'use strict';
const fs = require('fs');
const zlib = require('zlib');
const S = 256;
// 像素：青绿底 + 白色播放三角
function px(x, y) {
  // 圆角矩形裁剪
  const r = 48;
  const inX = Math.min(x, S - 1 - x), inY = Math.min(y, S - 1 - y);
  if (inX < r && inY < r) {
    const dx = r - inX, dy = r - inY;
    if (dx * dx + dy * dy > r * r) return null;
  }
  // 播放三角（居中）
  const cx = S / 2, cy = S / 2, s = 70;
  const tri = (x >= cx - 18 && x <= cx + 46 && y >= cy - s && y <= cy + s);
  // 用重心法粗略判断三角形
  let inTri = false;
  if (x >= cx - 18 && x <= cx + 46) {
    const t = (x - (cx - 18)) / (46 + 18);
    const half = s * (1 - t * 0.0);
    if (y >= cy - half && y <= cy + half) inTri = true;
  }
  if (inTri) return [255, 255, 255, 255];
  return [15, 123, 108, 255];
}
const raw = Buffer.alloc(S * (S * 4 + 1));
let o = 0;
for (let y = 0; y < S; y++) {
  raw[o++] = 0;
  for (let x = 0; x < S; x++) {
    const p = px(x, y);
    if (!p) { raw[o++] = 0; raw[o++] = 0; raw[o++] = 0; raw[o++] = 0; }
    else { raw[o++] = p[0]; raw[o++] = p[1]; raw[o++] = p[2]; raw[o++] = p[3]; }
  }
}
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
]);
fs.writeFileSync('assets/icon.png', png);
// 包装为 ICO（PNG-in-ICO，现代 Windows 支持）
const dir = Buffer.alloc(6); dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; entry[1] = 0; entry[2] = 0; entry[3] = 0; entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8); entry.writeUInt32LE(22, 12);
const ico = Buffer.concat([dir, entry, png]);
fs.writeFileSync('assets/icon.ico', ico);
console.log('icon.png', png.length, 'bytes; icon.ico', ico.length, 'bytes');
