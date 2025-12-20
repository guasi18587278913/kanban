import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { retryQueue } from '@/config/db/schema-retry';
import { rawChatLog } from '@/config/db/schema-community-v2';
import { extractWithLLM } from '@/lib/community-llm-extractor';
import { writeV2FromParsedReport } from '@/actions/community-actions';

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;

function clampLimit(value: number) {
  if (Number.isNaN(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(value, MAX_LIMIT));
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const limit = clampLimit(parseInt(body?.limit ?? DEFAULT_LIMIT, 10));

    const database = db();
    const pending = await database
      .select()
      .from(retryQueue)
      .where(eq(retryQueue.status, 'pending'))
      .limit(limit);

    const results: any[] = [];

    for (const item of pending) {
      await database
        .update(retryQueue)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(eq(retryQueue.id, item.id));

      try {
        const raws = await database.select().from(rawChatLog).where(eq(rawChatLog.id, item.rawLogId));
        if (raws.length === 0 || !raws[0].rawContent) {
          throw new Error('raw_chat_log not found or missing content');
        }

        const raw = raws[0];
        const dateOverride = raw.chatDate ? raw.chatDate.toISOString().slice(0, 10) : undefined;
        const parsed = await extractWithLLM(raw.fileName || raw.id, raw.rawContent, dateOverride);
        await writeV2FromParsedReport(parsed, raw.rawContent, raw.fileName || raw.id);

        await database
          .update(retryQueue)
          .set({ status: 'done', updatedAt: new Date(), error: null })
          .where(eq(retryQueue.id, item.id));

        results.push({ id: item.id, rawLogId: item.rawLogId, ok: true });
      } catch (e: any) {
        await database
          .update(retryQueue)
          .set({ status: 'failed', updatedAt: new Date(), error: e instanceof Error ? e.message : String(e) })
          .where(eq(retryQueue.id, item.id));
        results.push({ id: item.id, rawLogId: item.rawLogId, ok: false, error: e?.message || String(e) });
      }
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (e: any) {
    console.error('retry-analysis api error:', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}

