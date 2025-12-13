
import { db } from '@/core/db';
import { communityImportLog } from '@/config/db/schema';
import { and, gt, eq } from 'drizzle-orm';

async function main() {
  const startTime = new Date('2025-12-09T13:40:00Z'); // Run started approx here (UTC string to match DB local time value)
  
  // 1. Get all SUCCESS logs since start
  const successes = await db()
    .select({ fileName: communityImportLog.fileName })
    .from(communityImportLog)
    .where(
      and(
        eq(communityImportLog.status, 'SUCCESS'),
        gt(communityImportLog.importDate, startTime)
      )
    );
  
  const successFiles = new Set(successes.map(s => s.fileName));

  console.log(`Successfully imported since start: ${successFiles.size}`);

  // 2. We assumed 218 files. 
  // Let's print the count.
  const TOTAL_EXPECTED = 218;
  const remaining = TOTAL_EXPECTED - successFiles.size;

  console.log(`Estimated remaining: ${Math.max(0, remaining)}`);
  
  // 3. Check what's currently running/latest
  // (Latest already verified by other tool, this script focuses on count)
  
  process.exit(0);
}

main();
