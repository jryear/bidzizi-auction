// Minimal QR Code encoder: byte mode, error correction M, versions 1-6 (up to 106 bytes).
// Written for this prototype so the event-link QR is a real, scannable code with no dependency.
// Verified against the `qrcode` npm package module-for-module (evidence/qr-check.mjs).
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsGen(n) { let p = [1]; for (let i = 0; i < n; i++) { const q = new Array(p.length + 1).fill(0); for (let j = 0; j < p.length; j++) { q[j] ^= p[j]; q[j + 1] ^= mul(p[j], EXP[i]); } p = q; } return p; }
function rsRem(data, n) { const g = rsGen(n), r = new Array(n).fill(0); for (const b of data) { const f = b ^ r.shift(); r.push(0); for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f); } return r; }

// Level M: [EC codewords per block, [blocks, data codewords per block] groups]
const M = { 1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]], 4: [18, [[2, 32]]], 5: [24, [[2, 43]]], 6: [16, [[4, 27]]] };
const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };
const dataCap = (v) => M[v][1].reduce((s, [n, k]) => s + n * k, 0);
const MASKS = [(i, j) => (i + j) % 2 === 0, (i) => i % 2 === 0, (i, j) => j % 3 === 0, (i, j) => (i + j) % 3 === 0, (i, j) => (((i / 2) | 0) + ((j / 3) | 0)) % 2 === 0, (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0, (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0, (i, j) => ((((i + j) % 2) + ((i * j) % 3)) % 2) === 0];

function codewords(bytes, v) {
  const cap = dataCap(v), bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4); put(bytes.length, 8); bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, cap * 8 - bits.length)); while (bits.length % 8) bits.push(0);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);
  const [ecLen, groups] = M[v], blocks = []; let at = 0;
  for (const [n, k] of groups) for (let i = 0; i < n; i++) { const d = data.slice(at, at + k); at += k; blocks.push({ d, e: rsRem(d, ecLen) }); }
  const out = [], maxD = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < maxD; i++) blocks.forEach((b) => { if (i < b.d.length) out.push(b.d[i]); });
  for (let i = 0; i < ecLen; i++) blocks.forEach((b) => out.push(b.e[i]));
  return out;
}

function penalty(m) {
  const n = m.length; let p = 0;
  const runs = (line) => { let s = 0, run = 1; for (let i = 1; i < n; i++) { if (line[i] === line[i - 1]) { run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1; } return s; };
  for (let i = 0; i < n; i++) { p += runs(m[i]); p += runs(m.map((r) => r[i])); }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) { const c = m[i][j]; if (c === m[i][j + 1] && c === m[i + 1][j] && c === m[i + 1][j + 1]) p += 3; }
  const pat = [1, 0, 1, 1, 1, 0, 1], isPat = (get, k) => pat.every((b, t) => get(k + t) === !!b);
  for (let i = 0; i < n; i++) for (let k = 0; k + 7 <= n; k++) {
    for (const get of [(t) => m[i][t], (t) => m[t][i]]) {
      if (!isPat(get, k)) continue;
      const before = k >= 4 && [1, 2, 3, 4].every((d) => !get(k - d)), after = k + 11 <= n && [7, 8, 9, 10].every((d) => !get(k + d));
      if (before || after) p += 40;
    }
  }
  let dark = 0; for (const r of m) for (const c of r) if (c) dark++;
  p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return p;
}

function build(cw, v, mask) {
  const n = 17 + 4 * v, m = Array.from({ length: n }, () => new Array(n).fill(false)), fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (x, y, dark) => { if (x >= 0 && y >= 0 && x < n && y < n) { m[y][x] = dark; fn[y][x] = true; } };
  for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); }
  const ap = ALIGN[v];
  for (const cy of ap) for (const cx of ap) { if ((cx === 6 && cy === 6) || (cx === 6 && cy === n - 7) || (cx === n - 7 && cy === 6)) continue; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }
  const format = () => {
    const data = (0 << 3) | mask; let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412, bit = (i) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i)); set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i)); for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i)); set(8, n - 8, true);
  };
  format();
  const bits = []; cw.forEach((b) => { for (let i = 7; i >= 0; i--) bits.push((b >>> i) & 1); });
  let k = 0;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? n - 1 - vert : vert;
      if (!fn[y][x]) { const bit = k < bits.length ? bits[k++] === 1 : false; m[y][x] = bit !== MASKS[mask](y, x); }
    }
  }
  return m;
}

/** @returns {boolean[][]} true = dark module. `mask` (0-7) forces a mask for testing; otherwise the lowest penalty wins. */
export function qrMatrix(text, { mask } = {}) {
  const bytes = [...new TextEncoder().encode(text)];
  let v = 1; while (v <= 6 && Math.floor((dataCap(v) * 8 - 12) / 8) < bytes.length) v++;
  if (v > 6) throw new Error('QR text too long for this encoder (max 106 bytes)');
  const cw = codewords(bytes, v);
  if (mask !== undefined) return build(cw, v, mask);
  let best = null, bestP = Infinity;
  for (let q = 0; q < 8; q++) { const m = build(cw, v, q), p = penalty(m); if (p < bestP) { bestP = p; best = m; } }
  return best;
}

/** One-path SVG with a 4-module quiet zone, drawn in `fg` on `bg`. */
export function qrSvg(text, { fg = '#1A1814', bg = '#FFFFFF', label = 'QR code' } = {}) {
  const m = qrMatrix(text), n = m.length, q = 4; let d = '';
  m.forEach((row, y) => { let x = 0; while (x < n) { if (!row[x]) { x++; continue; } let w = 1; while (x + w < n && row[x + w]) w++; d += `M${x + q} ${y + q}h${w}v1h-${w}z`; x += w; } });
  return `<svg class="qr" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
}
