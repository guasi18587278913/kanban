
import { db } from '@/core/db';
import { communityGroup, communityDailyReport } from '@/config/db/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  console.log('🔍 Auditing Database Content...');

  const groups = await db()
    .select()
    .from(communityGroup)
    .orderBy(communityGroup.productLine, communityGroup.groupName);

  console.log(`Found ${groups.length} groups.`);

  for (const group of groups) {
    console.log(`\nGroup: [${group.productLine}] ${group.groupName} (ID: ${group.id})`);
    
    const reports = await db()
      .select({
        date: communityDailyReport.reportDate,
        msgCount: communityDailyReport.messageCount,
        id: communityDailyReport.id
      })
      .from(communityDailyReport)
      .where(eq(communityDailyReport.groupId, group.id))
      .orderBy(desc(communityDailyReport.reportDate));

    if (reports.length === 0) {
      console.log('  - No reports');
    } else {
      for (const report of reports) {
        console.log(`  - Report ${report.date.toISOString().split('T')[0]}: ${report.msgCount} msgs (ID: ${report.id})`);
      }
    }
  }
  
  process.exit(0);
}

main();
