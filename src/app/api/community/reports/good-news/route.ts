import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { goodNews } from '@/config/db/schema-community-v2';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productLine = searchParams.get('productLine') || undefined;
  const verified = searchParams.get('verified');
  const limit = parseInt(searchParams.get('limit') || '50', 10);

  try {
    const database = db();
    let query = database.select().from(goodNews).where(eq(goodNews.status, 'active'));
    if (productLine) {
      query = query.where(eq(goodNews.productLine as any, productLine));
    }
    if (verified === 'true') {
      query = query.where(eq(goodNews.isVerified, true));
    } else if (verified === 'false') {
      query = query.where(eq(goodNews.isVerified, false));
    }
    const rows = await query;
    rows.sort((a, b) => {
      const ad = a.eventDate ? new Date(a.eventDate).getTime() : 0;
      const bd = b.eventDate ? new Date(b.eventDate).getTime() : 0;
      return bd - ad;
    });
    return NextResponse.json({
      total: rows.length,
      items: rows.slice(0, limit).map((r) => ({
        id: r.id,
        content: r.content,
        author: r.authorName,
        date: r.eventDate,
        productLine: r.productLine,
        period: r.period,
        confidence: r.confidence,
        isVerified: r.isVerified,
      })),
    });
  } catch (e: any) {
    console.error('good-news api error:', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
