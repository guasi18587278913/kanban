
import { db } from '@/core/db';
import { communityImportLog } from '@/config/db/schema';
import { and, eq, gt } from 'drizzle-orm';

async function main() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const successCount = await db()
    .select()
    .from(communityImportLog)
    .where(
      and(
        eq(communityImportLog.status, 'SUCCESS'),
        gt(communityImportLog.importDate, oneHourAgo)
      )
    );

  const failCount = await db()
    .select()
    .from(communityImportLog)
    .where(
      and(
        eq(communityImportLog.status, 'FAILED'),
        gt(communityImportLog.importDate, oneHourAgo)
      )
    );

  console.log(`Success: ${successCount.length}`);
  console.log(`Failed: ${failCount.length}`);
  process.exit(0);
}

main();
