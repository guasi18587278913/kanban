import { NextResponse } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { member, memberMessage } from '@/config/db/schema-community-v2';

const MAX_LIMIT = 50;

function clampLimit(value: number) {
  if (Number.isNaN(value)) return 20;
  return Math.max(1, Math.min(value, MAX_LIMIT));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  const scope = (searchParams.get('scope') || 'members').toLowerCase();
  const productLine = searchParams.get('productLine') || undefined;
  const period = searchParams.get('period') || undefined;
  const limit = clampLimit(parseInt(searchParams.get('limit') || '20', 10));

  if (!q) {
    return NextResponse.json({ total: 0, items: [] });
  }

  try {
    const database = db();
    const tsQuery = sql`plainto_tsquery('simple', ${q})`;
    const likePattern = `%${q}%`;

    if (scope === 'messages') {
      const conditions: any[] = [
        sql`(
          to_tsvector('simple', coalesce(${memberMessage.messageContent}, '')) @@ ${tsQuery}
          OR ${memberMessage.messageContent} ILIKE ${likePattern}
        )`,
      ];

      if (productLine) conditions.push(eq(memberMessage.productLine, productLine));
      if (period) conditions.push(eq(memberMessage.period, period.replace(/期$/, '')));

      const rows = await database
        .select({
          id: memberMessage.id,
          authorName: memberMessage.authorName,
          content: memberMessage.messageContent,
          messageTime: memberMessage.messageTime,
          productLine: memberMessage.productLine,
          period: memberMessage.period,
          groupNumber: memberMessage.groupNumber,
        })
        .from(memberMessage)
        .where(and(...conditions))
        .orderBy(sql`${memberMessage.messageTime} desc`)
        .limit(limit);

      return NextResponse.json({ total: rows.length, items: rows });
    }

    const conditions: any[] = [
      sql`(
        to_tsvector('simple', coalesce(${member.nickname}, '') || ' ' || coalesce(${member.nicknameNormalized}, '')) @@ ${tsQuery}
        OR ${member.nickname} ILIKE ${likePattern}
        OR ${member.nicknameNormalized} ILIKE ${likePattern}
      )`,
    ];
    if (productLine) conditions.push(eq(member.productLine, productLine));
    if (period) conditions.push(eq(member.period, period.replace(/期$/, '')));

    const rows = await database
      .select({
        id: member.id,
        nickname: member.nickname,
        role: member.role,
        productLine: member.productLine,
        period: member.period,
        activityLevel: member.activityLevel,
      })
      .from(member)
      .where(and(...conditions))
      .limit(limit);

    return NextResponse.json({ total: rows.length, items: rows });
  } catch (e: any) {
    console.error('search api error:', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
