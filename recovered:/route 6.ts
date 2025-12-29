import { NextResponse } from 'next/server';
import { and, eq, or, isNull, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { rawChatLog, memberMessage, qaRecord } from '@/config/db/schema-community-v2';

const SUMMARY_CACHE_HEADERS = {
  'Cache-Control': 's-maxage=30, stale-while-revalidate=60',
};

export async function GET() {
  try {
    const [rawRow] = await db()
      .select({ count: sql<number>`count(*)` })
      .from(rawChatLog)
      .where(or(eq(rawChatLog.status, 'pending'), eq(rawChatLog.status, 'failed')))
      .limit(1);

    const [unmatchedRow] = await db()
      .select({ count: sql<number>`count(*)` })
      .from(memberMessage)
      .where(and(isNull(memberMessage.memberId), eq(memberMessage.status, 'active')))
      .limit(1);

    const [qaRow] = await db()
      .select({ count: sql<number>`count(*)` })
      .from(qaRecord)
      .where(
        and(
          eq(qaRecord.status, 'active'),
          or(isNull(qaRecord.answererId), eq(qaRecord.isResolved, false))
        )
      )
      .limit(1);

    const rawCount = Number(rawRow?.count || 0);
    const unmatchedCount = Number(unmatchedRow?.count || 0);
    const qaCount = Number(qaRow?.count || 0);

    return NextResponse.json(
      {
        rawLogs: rawCount,
        unmatchedMembers: unmatchedCount,
        unansweredQA: qaCount,
        total: rawCount + unmatchedCount + qaCount,
      },
      { headers: SUMMARY_CACHE_HEADERS }
    );
  } catch (e: any) {
    console.error('import-issues summary error', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
