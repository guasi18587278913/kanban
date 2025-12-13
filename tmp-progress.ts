import fs from 'fs';
import path from 'path';
import { db } from '@/core/db';
import { communityImportLog } from '@/config/db/schema';

async function main() {
  const baseDir = path.join(process.cwd(), 'private/import/补充导入_split');
  const entries = fs.readdirSync(baseDir);
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(baseDir, entry);
    if (fs.statSync(full).isDirectory()) {
      for (const f of fs.readdirSync(full)) {
        if (f.endsWith('.txt')) files.push(f);
      }
    } else if (entry.endsWith('.txt')) {
      files.push(entry);
    }
  }

  const logs = await db().select().from(communityImportLog);
  const success = new Set(logs.filter((l) => l.status === 'SUCCESS').map((l) => l.fileName));
  const failed = new Set(logs.filter((l) => l.status === 'FAILED').map((l) => l.fileName));

  const done = files.filter((f) => success.has(f));
  const pending = files.filter((f) => !success.has(f));
  const pendingFailed = pending.filter((f) => failed.has(f));

  const byGroup: Record<string, { done: number; pending: number }> = {};
  const pendingList: Record<string, string[]> = {};
  function groupKey(name: string) {
    const m = name.match(/AI产品出海(\d)期(\d)群/);
    return m ? `${m[1]}期${m[2]}群` : 'unknown';
  }
  for (const f of done) {
    const k = groupKey(f);
    byGroup[k] = byGroup[k] || { done: 0, pending: 0 };
    byGroup[k].done += 1;
  }
  for (const f of pending) {
    const k = groupKey(f);
    byGroup[k] = byGroup[k] || { done: 0, pending: 0 };
    byGroup[k].pending += 1;
    (pendingList[k] ||= []).push(f);
  }

  console.log({
    totalFiles: files.length,
    done: done.length,
    pending: pending.length,
    pendingFailed: pendingFailed.length,
    samplePending: pending.slice(0, 10),
    byGroup,
    pendingList,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
