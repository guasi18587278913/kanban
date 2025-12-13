import fs from 'fs';
import path from 'path';
import { importRawChatLogWithLLM } from '@/actions/community-actions';

const LOG_FILE = path.join(process.cwd(), 'reprocess-output.log');
const TARGET_DIRS = [
  path.join(process.cwd(), 'private/import/AI产品出海/第1期群聊记录'),
  path.join(process.cwd(), 'private/import/AI产品出海/第2期群聊记录'),
];

const PARALLEL = Number(process.env.PARALLEL || 3); // increase workers to speed up
const INTERVAL_SUCCESS = Number(process.env.INTERVAL_SUCCESS || 200); // ms
const INTERVAL_FAIL = Number(process.env.INTERVAL_FAIL || 400); // ms

function logLine(line: string) {
  const ts = new Date().toISOString();
  const text = `[${ts}] ${line}\n`;
  fs.appendFileSync(LOG_FILE, text);
  console.log(line);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectFiles(): string[] {
  const files: string[] = [];
  for (const dir of TARGET_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.txt')) continue;
      files.push(path.join(dir, entry));
    }
  }
  return files.sort();
}

async function runBatch(files: string[]) {
  const failures: { file: string; error: string }[] = [];
  let idx = 0;

  async function worker(id: number) {
    while (true) {
      const file = files[idx++];
      if (!file) break;
      const filename = path.basename(file);
      const content = fs.readFileSync(file, 'utf-8');
      try {
        const res = await importRawChatLogWithLLM(filename, content);
        logLine(`[worker ${id}] ${filename} ${JSON.stringify(res)}`);
        await sleep(INTERVAL_SUCCESS);
      } catch (e: any) {
        const msg = e?.message || String(e);
        logLine(`[worker ${id}] Failed ${filename} ${msg}`);
        failures.push({ file: filename, error: msg });
        await sleep(INTERVAL_FAIL);
      }
    }
  }

  const workers = Array.from({ length: PARALLEL }, (_, i) => worker(i + 1));
  await Promise.all(workers);

  if (failures.length) {
    logLine('\n=== Failures ===');
    failures.forEach((f) => logLine(`${f.file} ${f.error}`));
  } else {
    logLine('\nAll files processed successfully.');
  }
}

async function main() {
  const files = collectFiles();
  fs.writeFileSync(LOG_FILE, '');
  logLine(`Total files available: ${files.length}`);

  const args = process.argv.slice(2);
  if (args.includes('--by-month')) {
    // group by YYYY-MM
    const grouped: Record<string, string[]> = {};
    files.forEach((file) => {
      const m = file.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return;
      const key = `${m[1]}-${m[2]}`;
      grouped[key] = grouped[key] || [];
      grouped[key].push(file);
    });
    const months = Object.keys(grouped).sort().reverse();
    for (const m of months) {
      const batch = grouped[m];
      logLine(`\n=== Processing month ${m}, files: ${batch.length} ===`);
      await runBatch(batch);
    }
  } else if (args.includes('--by-period')) {
    const period1 = files.filter((f) => f.includes('1期'));
    const period2 = files.filter((f) => f.includes('2期'));
    for (const [label, batch] of [ ['1期', period1], ['2期', period2] ] as const) {
      logLine(`\n=== Processing ${label}, files: ${batch.length} ===`);
      await runBatch(batch);
    }
  } else {
    // default: all files
    await runBatch(files);
  }
}

main().catch((e) => {
  logLine(`Fatal: ${e?.message || e}`);
  process.exit(1);
});
