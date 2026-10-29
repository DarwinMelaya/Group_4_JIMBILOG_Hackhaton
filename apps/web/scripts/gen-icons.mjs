// Generates PLACEHOLDER PWA icons (plain shapes, no letter, not the KALINGA logo).
// Run: node apps/web/scripts/gen-icons.mjs
import { Buffer } from 'node:buffer';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

function crc(b) {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  let r = ~0;
  for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8);
  return (~r) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(s) {
  const ind = [0x34, 0x49, 0x6d], peri = [0x58, 0x6a, 0xa7], rose = [0xd7, 0x8f, 0xa3];
  const raw = Buffer.alloc((s * 4 + 1) * s);
  for (let y = 0; y < s; y++) {
    raw[y * (s * 4 + 1)] = 0;
    for (let x = 0; x < s; x++) {
      const dx = x / s - 0.5, dy = y / s - 0.5;
      let col = ind;
      if (Math.hypot(dx, dy) < 0.28) col = peri;
      if (Math.hypot(dx - 0.12, dy + 0.12) < 0.07) col = rose;
      const r = 0.18, ax = Math.abs(dx) - (0.5 - r), ay = Math.abs(dy) - (0.5 - r);
      const a = ax > 0 && ay > 0 && Math.hypot(ax, ay) > r ? 0 : 255;
      const o = y * (s * 4 + 1) + 1 + x * 4;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2]; raw[o + 3] = a;
    }
  }
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(s, 0); ih.writeUInt32BE(s, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const out = path.resolve(import.meta.dirname, '../public/icons');
fs.writeFileSync(path.join(out, 'icon-192.png'), png(192));
fs.writeFileSync(path.join(out, 'icon-512.png'), png(512));
