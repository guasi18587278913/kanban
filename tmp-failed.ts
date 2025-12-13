import { db } from '@/core/db';
import { communityImportLog } from '@/config/db/schema';

async function main() {
  const logs = await db().select().from(communityImportLog);
  const failed = logs.filter((l) => l.status === 'FAILED');
  const files = Array.from(new Set(failed.map((f) => f.fileName))).sort();
  const grouped = files.reduce((acc, f) => {
    const m = f.match(/AI产品出海(\d)期(\d)群_(\d{4}-\d{2}-\d{2})/);
    if (m) {
      const key = `${m[1]}期${m[2]}群`;
      const date = m[3];
      (acc[key] ||= []).push(date);
    }
    return acc;
  }, {} as Record<string, string[]>);
  Object.keys(grouped).forEach((k) => grouped[k].sort());
  console.log(JSON.stringify(grouped, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
