
import { db } from '@/core/db';
import { communityDailyReport } from '@/config/db/schema';
import { desc, isNotNull } from 'drizzle-orm';

async function main() {
  // Get latest 5 reports that have an actionList
  const reports = await db()
    .select({
      id: communityDailyReport.id,
      date: communityDailyReport.reportDate,
      actionList: communityDailyReport.actionList
    })
    .from(communityDailyReport)
    .where(isNotNull(communityDailyReport.actionList))
    .orderBy(desc(communityDailyReport.reportDate))
    .limit(5);

  console.log(`Checking ${reports.length} reports...`);

  reports.forEach(r => {
    console.log(`\nReport: ${r.date.toISOString().split('T')[0]} (ID: ${r.id})`);
    try {
      const parsed = JSON.parse(r.actionList as string);
      const questions = parsed.questions || [];
      console.log(`- Total Questions: ${questions.length}`);
      
      if (questions.length > 0) {
        // Check first question structure
        const q1 = questions[0];
        console.log(`  Q1: ${q1.content || q1.text || 'No content'}`);
        console.log(`  A1: ${q1.reply || q1.a || 'MISSING'}`); // Check for reply field
        console.log(`  Status: ${q1.status || 'MISSING'}`);
      }
    } catch (e) {
      console.log('- Invalid JSON in actionList');
    }
  });

  process.exit(0);
}

main();
