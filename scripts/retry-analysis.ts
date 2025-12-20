import { eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { retryQueue } from '@/config/db/schema-retry';
import { rawChatLog } from '@/config/db/schema-community-v2';
import { extractWithLLM } from '@/lib/community-llm-extractor';
import { writeFileSync } from 'fs';
import { writeV2FromParsedReport } from '@/actions/community-actions';

async function run() {
  const database = db();
  const pending = await database.select().from(retryQueue).where(eq(retryQueue.status, 'pending'));
  console.log(`Found ${pending.length} pending retries`);

  for (const item of pending) {
    console.log(`Retrying rawLogId=${item.rawLogId}`);
    try {
      const raws = await database.select().from(rawChatLog).where(eq(rawChatLog.id, item.rawLogId));
      if (raws.length === 0) {
        console.error(`raw_log not found: ${item.rawLogId}`);
        continue;
      }
      const raw = raws[0];
      if (!raw.rawContent) {
        console.error(`raw_log missing content: ${item.rawLogId}`);
        continue;
      }

      // optional: persist raw to tmp for inspection
      writeFileSync(`/tmp/raw_${item.rawLogId}.txt`, raw.rawContent, { encoding: 'utf-8' });

      const parsed = await extractWithLLM(raw.fileName || item.rawLogId, raw.rawContent, raw.chatDate?.toISOString().slice(0, 10));
      await writeV2FromParsedReport(parsed, raw.rawContent, raw.fileName || item.rawLogId);
      await database.update(retryQueue).set({ status: 'done', updatedAt: new Date() }).where(eq(retryQueue.id, item.id));
      console.log(`Retry success: ${item.rawLogId}`);
    } catch (e: any) {
      console.error(`Retry failed for ${item.rawLogId}:`, e);
      await database
        .update(retryQueue)
        .set({ status: 'failed', error: e instanceof Error ? e.message : String(e), updatedAt: new Date() })
        .where(eq(retryQueue.id, item.id));
    }
  }
}

run().catch((e) => {
  console.error('Retry script error:', e);
  process.exit(1);
});
