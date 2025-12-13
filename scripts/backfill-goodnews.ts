import 'dotenv/config';
import { db } from '@/core/db';
import { communityDailyReport } from '@/config/db/schema';
import { eq } from 'drizzle-orm';
import { extractWithLLM } from '@/lib/community-llm-extractor';
import fs from 'fs';

/**
 * Backfill activityFeature (good news list) for existing daily reports
 * using the LLM extractor over the stored full_report.
 *
 * Safety notes:
 * - Only updates activity_feature; other fields untouched.
 * - Processes all records with full_report present.
 * - Requires OPENROUTER_API_KEY to be set; network needed.
 */

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error('OPENROUTER_API_KEY is not set; aborting.');
    process.exit(1);
  }

  // Fetch reports; we'll filter those with fullReport in code
  const reports = await db()
    .select({
      id: communityDailyReport.id,
      fullReport: communityDailyReport.fullReport,
      reportDate: communityDailyReport.reportDate,
    })
    .from(communityDailyReport);

  console.log(`Found ${reports.length} reports with fullReport.`);

  let success = 0;
  let failed = 0;

  for (const r of reports) {
    if (!r.fullReport) {
      continue;
    }

    try {
      const parsed = await extractWithLLM(`backfill_${r.id}.txt`, r.fullReport, r.reportDate.toISOString().slice(0,10));
      if (parsed.goodNews && parsed.goodNews.length > 0) {
        await db()
          .update(communityDailyReport)
          .set({ activityFeature: JSON.stringify(parsed.goodNews) })
          .where(eq(communityDailyReport.id, r.id));
        success++;
        console.log(`Updated ${r.id} with ${parsed.goodNews.length} good news.`);
      } else {
        console.log(`No good news for ${r.id}, skipped.`);
      }
    } catch (e) {
      failed++;
      console.error(`Failed on ${r.id}:`, e);
    }
  }

  console.log(`Backfill done. Success: ${success}, Failed: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
