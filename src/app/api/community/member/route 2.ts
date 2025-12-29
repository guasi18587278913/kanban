import { NextResponse } from 'next/server';
import { desc, eq, inArray, sql, count } from 'drizzle-orm';

import { db } from '@/core/db';
import { member, memberStats, memberTag } from '@/config/db/schema-community-v2';

type RoleParam = 'student' | 'coach' | 'volunteer' | 'all' | 'coach-volunteer';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const roleParam = (searchParams.get('role') as RoleParam) || 'student';
  const orderParam = searchParams.get('order') || 'messages';
  const pageParam = Number(searchParams.get('page') || '1');
  const sizeParam = searchParams.get('pageSize') || searchParams.get('limit') || '5000';
  const pageSizeRaw = Number(sizeParam);
  const pageSize = Number.isFinite(pageSizeRaw) ? Math.min(Math.max(pageSizeRaw, 1), 10000) : 5000;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
  const offset = (page - 1) * pageSize;

  const allowedRoles = new Set<RoleParam>(['student', 'coach', 'volunteer', 'all', 'coach-volunteer']);
  const role: RoleParam = allowedRoles.has(roleParam) ? roleParam : 'student';

  const roleFilters =
    role === 'all'
      ? null
      : role === 'coach-volunteer'
        ? ['coach', 'volunteer']
        : [role];

  const whereClause =
    roleFilters && roleFilters.length === 1
      ? eq(member.role, roleFilters[0])
      : roleFilters && roleFilters.length > 1
        ? inArray(member.role, roleFilters)
        : undefined;

  try {
    const [totalRow] = await db()
      .select({ count: count() })
      .from(member)
      .where(whereClause || undefined);
    const total = Number(totalRow?.count || 0);

    const rows = await db()
      .select({
        id: member.id,
        nickname: member.nickname,
        nicknameNormalized: member.nicknameNormalized,
        role: member.role,
        productLine: member.productLine,
        period: member.period,
        totalMessages: sql<number>`coalesce(${memberStats.totalMessages}, 0)`,
        questionCount: sql<number>`coalesce(${memberStats.questionCount}, 0)`,
        answerCount: sql<number>`coalesce(${memberStats.answerCount}, 0)`,
        goodNewsCount: sql<number>`coalesce(${memberStats.goodNewsCount}, 0)`,
        activeDays: sql<number>`coalesce(${memberStats.activeDays}, 0)`,
        kocContributions: sql<number>`coalesce(${memberStats.kocContributions}, 0)`,
        avgResponseMinutes: sql<number>`coalesce(${memberStats.avgResponseMinutes}, 0)`,
        resolvedCount: sql<number>`coalesce(${memberStats.resolvedCount}, 0)`,
        helpedStudents: sql<number>`coalesce(${memberStats.helpedStudents}, 0)`,
        totalHelpedCount: sql<number>`coalesce(${memberStats.totalHelpedCount}, 0)`,
        lastActiveDate: memberStats.lastActiveDate,
      })
      .from(member)
      .leftJoin(memberStats, eq(member.id, memberStats.memberId))
      .where(whereClause || undefined)
      .orderBy(
        orderParam === 'answers'
          ? desc(sql`coalesce(${memberStats.answerCount}, 0)`)
          : desc(sql`coalesce(${memberStats.totalMessages}, 0)`),
      )
      .limit(pageSize)
      .offset(offset);

    const ids = rows.map((r: { id: string }) => r.id);
    const tagsMap = new Map<string, { category: string; name: string }[]>();
    if (ids.length > 0) {
      const tagRows = await db()
        .select({
          memberId: memberTag.memberId,
          category: memberTag.tagCategory,
          name: memberTag.tagName,
        })
        .from(memberTag)
        .where(inArray(memberTag.memberId, ids));

      tagRows.forEach((t) => {
        const list = tagsMap.get(t.memberId) || [];
        list.push({ category: t.category, name: t.name });
        tagsMap.set(t.memberId, list);
      });
    }

    return NextResponse.json({
      total,
      page,
      pageSize,
      items: rows.map((r: any) => ({
        ...r,
        tags: tagsMap.get(r.id) || [],
      })),
    });
  } catch (e: any) {
    console.error('[member list api] error', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
