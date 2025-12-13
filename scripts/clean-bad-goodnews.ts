
import { db } from '@/core/db';
import { communityDailyReport } from '@/config/db/schema';
import { like } from 'drizzle-orm';

async function main() {
  console.log('🧹 Cleaning up invalid Good News...');

  // Search for reports containing the specific keywords in activityFeature
  // We'll iterate through all recent reports to be safe, or search by content
  const reports = await db()
    .select()
    .from(communityDailyReport);

  let updates = 0;

  for (const report of reports) {
      if (!report.activityFeature) continue;

      try {
          let features: any[] = JSON.parse(report.activityFeature as string);
          if (!Array.isArray(features)) continue;

          const initialLength = features.length;
          
          // Filter out the specific bad items
          features = features.filter(item => {
              const content = (item.content || '').toLowerCase();
              const author = (item.author || '').toLowerCase();
              
              // 1. Bigdon: Gemini Pro
              if (author.includes('bigdon') && content.includes('gemini')) return false;
              
              // 2. Yuan Liang: Antigravity Config
              if ((author.includes('袁亮') || author.includes('袁壳')) && content.includes('antigravity')) return false;

              return true;
          });

          if (features.length < initialLength) {
              console.log(`Found bad data in Report ${report.reportDate.toISOString().split('T')[0]}. Removed ${initialLength - features.length} items.`);
              
              // Recalculate goodNewsCount
              await db().update(communityDailyReport).set({
                  activityFeature: JSON.stringify(features),
                  goodNewsCount: features.length,
                  updatedAt: new Date()
              }).where(like(communityDailyReport.id, report.id));
              
              updates++;
          }
      } catch (e) {
          console.error(`Error parsing report ${report.id}`, e);
      }
  }

  console.log(`✅ Cleaned ${updates} reports.`);
  process.exit(0);
}

main();
