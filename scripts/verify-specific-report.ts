
import { db } from '@/core/db';
import { communityDailyReport, communityGroup } from '@/config/db/schema';
import { eq, and } from 'drizzle-orm';

async function main() {
  // User said: 1期1群：2025-05-24 is missing/failed
  // Let's check if it exists in daily report
  
  const targetDate = new Date('2025-05-24');
  
  const report = await db()
    .select({
      id: communityDailyReport.id,
      date: communityDailyReport.reportDate,
      msgCount: communityDailyReport.messageCount,
      fullText: communityDailyReport.fullReport
    })
    .from(communityDailyReport)
    .leftJoin(communityGroup, eq(communityDailyReport.groupId, communityGroup.id))
    .where(
        and(
            eq(communityGroup.groupName, '深海圈丨AI产品出海1期1群'),
            // We need to match date carefully, usually range or string cast. 
            // But let's just grab all reports for this group and filter in JS to be safe with timezones
            eq(communityGroup.groupName, '深海圈丨AI产品出海1期1群')
        )
    );

  console.log(`Reports found for 1期1群: ${report.length}`);
  const match = report.find(r => r.date.toISOString().startsWith('2025-05-24'));
  
  if (match) {
      console.log('✅ Report for 2025-05-24 FOUND!');
      console.log(`ID: ${match.id}, Msgs: ${match.msgCount}`);
      console.log(`Content Preview: ${match.fullText.slice(0, 50)}...`);
  } else {
      console.log('❌ Report for 2025-05-24 NOT FOUND.');
  }
  
  process.exit(0);
}

main();
