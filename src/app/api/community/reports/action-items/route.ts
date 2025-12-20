import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { dailyStats } from '@/config/db/schema-community-v2';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productLine = searchParams.get('productLine') || undefined;
  const periodParam = searchParams.get('period') || undefined;

  try {
    const database = db();
    let query = database.select().from(dailyStats);
    if (productLine) {
      query = query.where(eq(dailyStats.productLine, productLine));
    }
    if (periodParam) {
      query = query.where(eq(dailyStats.period, periodParam.replace(/期$/, '')));
    }
    const rows = await query;
    const items: any[] = [];
    rows.forEach((r) => {
      if (!r.actionList && !r.actionListVerified) return;
      const use = r.actionListVerified || r.actionList;
      try {
        const parsed = JSON.parse(use as any);
        if (parsed.actionItems && Array.isArray(parsed.actionItems)) {
          parsed.actionItems.forEach((it: any) => {
            items.push({
              ...it,
              date: r.statsDate,
              productLine: r.productLine,
              period: r.period,
            });
          });
        }
      } catch (e) {
        // ignore parse errors
      }
    });

    return NextResponse.json({
      total: items.length,
      items,
    });
  } catch (e: any) {
    console.error('action-items api error:', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
