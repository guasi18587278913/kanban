import fs from 'fs';
import path from 'path';

/**
 * Split combined chat logs in private/import/补充导入 into daily files
 * Output to private/import/补充导入_split
 *
 * Supported filenames (examples):
 * - 深海圈丨AI产品出海1期1群_8月7日-12月10日.txt
 * - 深海圈丨AI产品出海1期2群_8月7日-12月10日.txt
 * - 深海圈丨AI产品出海2期1群_2025-12-09.txt (will just normalize and copy)
 */

const INPUT_DIR = path.join(process.cwd(), 'private/import/补充导入');
const OUTPUT_DIR = path.join(process.cwd(), 'private/import/补充导入_split');

const dateRegex = /(\d{2})-(\d{2})\s+\d{2}:\d{2}:\d{2}/;
const MIN_DATE = new Date('2025-08-07');
const MAX_DATE = new Date('2025-12-10');

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function normalizeName(base: string, date: string) {
  // base like "深海圈丨AI产品出海1期1群"
  return `${base}_${date}.txt`;
}

function splitFile(filePath: string) {
  const filename = path.basename(filePath);
  const m = filename.match(/(深海圈丨AI产品出海)(\d)期(\d)群/);
  if (!m) {
    return;
  }
  const baseName = `${m[1]}${m[2]}期${m[3]}群`;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const buckets: Record<string, string[]> = {};
  let currentDate = '';

  for (const line of lines) {
    const match = line.match(dateRegex);
    if (match) {
      const [mm, dd] = [match[1], match[2]];
      const dateStr = `2025-${mm}-${dd}`;
      const d = new Date(dateStr);
      if (d >= MIN_DATE && d <= MAX_DATE) {
        currentDate = dateStr;
        if (!buckets[currentDate]) buckets[currentDate] = [];
      } else {
        currentDate = '';
      }
    }
    if (!currentDate) continue; // skip leading lines before any date appears
    buckets[currentDate].push(line);
  }

  Object.entries(buckets).forEach(([date, arr]) => {
    const outName = normalizeName(baseName, date);
    const outPath = path.join(OUTPUT_DIR, outName);
    fs.writeFileSync(outPath, arr.join('\n'), 'utf-8');
    console.log(`Wrote ${outName} (${arr.length} lines)`);
  });
}

function copyNormalize(filePath: string) {
  const filename = path.basename(filePath);
  const m = filename.match(/(深海圈丨AI产品出海)\s*(\d)期\s*(\d)群\s*_(\d{4}-\d{2}-\d{2})/);
  if (!m) return false;
  const baseName = `${m[1]}${m[2]}期${m[3]}群`;
  const date = m[4];
  const outName = normalizeName(baseName, date);
  const outPath = path.join(OUTPUT_DIR, outName);
  fs.copyFileSync(filePath, outPath);
  console.log(`Copied ${outName}`);
  return true;
}

function main() {
  ensureDir(OUTPUT_DIR);
  const files = fs.readdirSync(INPUT_DIR).filter((f) => f.endsWith('.txt'));

  files.forEach((f) => {
    const full = path.join(INPUT_DIR, f);
    // If filename already has YYYY-MM-DD, just normalize copy
    if (f.includes('2025-')) {
      copyNormalize(full);
    } else {
      splitFile(full);
    }
  });
}

main();
