import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/core/db';
import { qaRecord } from '@/config/db/schema-community-v2';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productLine = searchParams.get('productLine') || undefined;
  const periodParam = searchParams.get('period') || undefined;

  try {
    const database = db();
    let query = database.select().from(qaRecord).where(eq(qaRecord.status, 'active'));
    if (productLine) {
      query = query.where(eq(qaRecord.productLine as any, productLine));
    }
    if (periodParam) {
      query = query.where(eq(qaRecord.period as any, periodParam.replace(/期$/, '')));
    }
    const qa = await query;
    const unresolved = qa.filter((q) => !q.isResolved && !q.answererName);
    return NextResponse.json({
      total: unresolved.length,
      items: unresolved.map((q) => ({
        id: q.id,
        content: q.questionContent,
        asker: q.askerName,
        questionTime: q.questionTime,
        productLine: q.productLine,
        period: q.period,
        sourceLogId: q.sourceLogId,
      })),
    });
  } catch (e: any) {
    console.error('unresolved api error:', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
