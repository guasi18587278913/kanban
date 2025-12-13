
import { db } from '@/core/db';
import { communityDailyReport } from '@/config/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('🔍 Inspecting Report Content...');
  
  const report = await db()
    .select()
    .from(communityDailyReport)
    .limit(1);

  if (report.length > 0) {
    console.log('--- Full Report Content ---');
    console.log(report[0].fullReport);
    console.log('---------------------------');
  } else {
    console.log('No reports found.');
  }

  process.exit(0);
}

main();
