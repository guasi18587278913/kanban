
import { db } from '@/core/db';
import { communityGroup, communityDailyReport } from '@/config/db/schema';
import { desc, count, eq } from 'drizzle-orm';

async function main() {
  const groups = await db().select().from(communityGroup);
  console.log('--- All Groups ---');
  for (const g of groups) {
      const reportCount = await db()
        .select({ count: count() })
        .from(communityDailyReport)
        .where(eq(communityDailyReport.groupId, g.id));
      
      console.log(`[${g.groupName}] (Line:${g.productLine}, Period:${g.period}, No:${g.groupNumber}) - Reports: ${reportCount[0].count}`);
  }
  process.exit(0);
}
main();
