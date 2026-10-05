// Compares our encoder with the `qrcode` npm package (reference, MIT) module-for-module.
// Usage: REF=/path/to/node_modules/qrcode node evidence/qr-check.mjs
import { createRequire } from 'node:module';
import { qrMatrix } from '../src/qr.js';
const require = createRequire(import.meta.url);
const QR = require(process.env.REF || '/Users/jryear/dev/saturn/launch-saturn-v2/node_modules/qrcode');
const texts = ['https://bidzizi.example/e/holiday-trade-show-auction-k4f9', 'a', 'https://bidzizi.example/e/spring-harvest-gala-7h2m', 'x'.repeat(40), 'é—ü '.repeat(10) + 'tail', 'y'.repeat(100)];
let fail = 0, n = 0;
for (const t of texts) for (let mask = 0; mask < 8; mask++) {
  const ref = QR.create(t, { errorCorrectionLevel: 'M', maskPattern: mask });
  const size = ref.modules.size, mine = qrMatrix(t, { mask });
  n++;
  let ok = mine.length === size;
  for (let y = 0; ok && y < size; y++) for (let x = 0; x < size; x++) if (mine[y][x] !== !!ref.modules.get(y, x)) { ok = false; break; }
  if (!ok) { fail++; console.log('MISMATCH', JSON.stringify(t.slice(0, 24)), 'mask', mask, 'ref version', ref.version, 'size', size, 'mine', mine.length); }
}
// Auto-selected mask must equal what the reference picks.
for (const t of texts) { const ref = QR.create(t, { errorCorrectionLevel: 'M' }), mine = qrMatrix(t); n++; let ok = mine.length === ref.modules.size; for (let y = 0; ok && y < mine.length; y++) for (let x = 0; x < mine.length; x++) if (mine[y][x] !== !!ref.modules.get(y, x)) { ok = false; break; } if (!ok) { fail++; console.log('AUTO-MASK DIFFERS', t.slice(0, 24)); } }
console.log(`${n - fail}/${n} matrices identical to the reference`); process.exit(fail ? 1 : 0);
