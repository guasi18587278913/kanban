
import { db } from '@/core/db';
import { communityDailyReport } from '@/config/db/schema';
import { eq, like } from 'drizzle-orm';

async function main() {
  console.log('🛠 Fixing good news author...');

  // 1. Find the report
  const reports = await db()
    .select()
    .from(communityDailyReport)
    .limit(1); // We know there is only 1 report based on previous audit

  if (reports.length === 0) {
    console.log('No report found.');
    return;
  }

  const report = reports[0];
  let activityFeature: any[] = [];
  try {
      if (report.activityFeature) {
          activityFeature = JSON.parse(report.activityFeature as string);
      }
  } catch(e) {}

  console.log('Old activityFeature:', JSON.stringify(activityFeature, null, 2));

  // 2. Fix the specific entry
  let changed = false;
  activityFeature = activityFeature.map(item => {
    if ((item.author === '桑桑@生财' || item.content.includes('陈江河')) && item.content.includes('首单')) {
        console.log('Found specific item, updating author...');
        changed = true;
        return { ...item, author: '陈江河' };
    }
    return item;
  });

  if (changed) {
      await db()
        .update(communityDailyReport)
        .set({ 
            activityFeature: JSON.stringify(activityFeature),
            updatedAt: new Date()
        })
        .where(eq(communityDailyReport.id, report.id));
      console.log('✅ Updated database record.');
  } else {
      console.log('⚠️ No matching good news item found to fix.');
  }
  
  process.exit(0);
}

main();
