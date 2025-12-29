import { NextResponse } from 'next/server';
import { and, desc, eq, gte, lte, ilike, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { goodNews } from '@/config/db/schema-community-v2';

const LIST_CACHE_HEADERS = {
  'Cache-Control': 's-maxage=60, stale-while-revalidate=120',
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(Number(searchParams.get('page') || '1'), 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get('pageSize') || '50'), 1), 200);
  const offset = (page - 1) * pageSize;

  const verifiedParam = searchParams.get('verified');
  const productLine = searchParams.get('productLine');
  const period = searchParams.get('period');
  const groupNumber = searchParams.get('groupNumber');
  const keyword = searchParams.get('keyword');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  const conditions: any[] = [];
  if (verifiedParam === 'true') conditions.push(eq(goodNews.isVerified, true));
  if (verifiedParam === 'false') conditions.push(eq(goodNews.isVerified, false));
  if (productLine) conditions.push(eq(goodNews.productLine, productLine));
  if (period) conditions.push(eq(goodNews.period, period));
  if (groupNumber) conditions.push(eq(goodNews.groupNumber, Number(groupNumber)));
  if (keyword) {
    const kw = `%${keyword}%`;
    conditions.push(ilike(goodNews.content, kw));
  }
  if (dateFrom) conditions.push(gte(goodNews.eventDate, new Date(dateFrom)));
  if (dateTo) conditions.push(lte(goodNews.eventDate, new Date(dateTo)));

  const where = conditions.length ? and(...conditions) : undefined;

  try {
    const totalRow = await db()
      .select({ count: sql<number>`count(*)` })
      .from(goodNews)
      .where(where)
      .limit(1);
    const total = Number(totalRow[0]?.count || 0);

    const items = await db()
      .select({
        id: goodNews.id,
        authorName: goodNews.authorName,
        content: goodNews.content,
        category: goodNews.category,
        revenueLevel: goodNews.revenueLevel,
        eventDate: goodNews.eventDate,
        isVerified: goodNews.isVerified,
        productLine: goodNews.productLine,
        period: goodNews.period,
        groupNumber: goodNews.groupNumber,
        confidence: goodNews.confidence,
        sourceLogId: goodNews.sourceLogId,
        memberId: goodNews.memberId,
      })
      .from(goodNews)
      .where(where)
      .orderBy(desc(goodNews.eventDate))
      .limit(pageSize)
      .offset(offset);

    return NextResponse.json({ total, page, pageSize, items }, { headers: LIST_CACHE_HEADERS });
  } catch (e: any) {
    console.error('[good-news GET] error', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
