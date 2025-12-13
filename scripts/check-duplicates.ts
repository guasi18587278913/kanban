
import { db } from '@/core/db';
import { communityImportLog } from '@/config/db/schema';
import { and, gt, eq, sql } from 'drizzle-orm';

async function main() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  
  const duplicates = await db()
    .select({
      fileName: communityImportLog.fileName,
      count: sql<number>`count(*)`
    })
    .from(communityImportLog)
    .where(
      and(
        eq(communityImportLog.status, 'SUCCESS'),
        gt(communityImportLog.importDate, oneHourAgo)
      )
    )
    .groupBy(communityImportLog.fileName)
    .having(sql`count(*) > 1`);

  console.log('--- Duplicate Files in Logs (Last Hour) ---');
  if (duplicates.length === 0) {
      console.log("No duplicates found. The counts should match.");
  } else {
      console.log(`Found ${duplicates.length} files with multiple success logs.`);
      duplicates.forEach(d => console.log(`${d.fileName}: ${d.count}`));
  }
  process.exit(0);
}

main();
