
import { db } from '@/core/db';
import { communityImportLog } from '@/config/db/schema';
import { desc } from 'drizzle-orm';

async function main() {
  const latest = await db()
    .select()
    .from(communityImportLog)
    .orderBy(desc(communityImportLog.importDate))
    .limit(5);

  console.log('--- Latest 5 Logs ---');
  latest.forEach(l => {
    console.log(`[${l.status}] ${l.importDate.toISOString()} - ${l.fileName}: ${l.message?.slice(0, 50)}`);
  });
  
  process.exit(0);
}

main();
