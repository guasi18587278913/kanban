import { NextResponse } from 'next/server';
import { desc, eq, inArray, sql, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { db } from '@/core/db';
import { member, memberStats, memberTag } from '@/config/db/schema-community-v2';
import { buildBaseMemberTags, mergeTags } from '@/lib/community-tag-utils';

type RoleParam = 'student' | 'coach' | 'volunteer' | 'all' | 'coach-volunteer';

const LIST_CACHE_HEADERS = {
  'Cache-Control': 's-maxage=60, stale-while-revalidate=120',
};

function normalizeName(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·｜|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

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
        planetId: member.planetId,
        nickname: member.nickname,
        nicknameNormalized: member.nicknameNormalized,
        wechatId: member.wechatId,
        role: member.role,
        productLine: member.productLine,
        period: member.period,
        status: member.status,
        activityLevel: member.activityLevel,
        progressAiProduct: member.progressAiProduct,
        progressYoutube: member.progressYoutube,
        progressBilibili: member.progressBilibili,
        revenueLevel: member.revenueLevel,
        milestones: member.milestones,
        joinDate: member.joinDate,
        expireDate: member.expireDate,
        updatedAt: member.updatedAt,
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
        tags: mergeTags(
          buildBaseMemberTags({
            productLine: r.productLine,
            role: r.role,
            activityLevel: r.activityLevel,
            progressAiProduct: r.progressAiProduct,
            progressYoutube: r.progressYoutube,
            progressBilibili: r.progressBilibili,
            revenueLevel: r.revenueLevel,
            milestones: r.milestones,
            expireDate: r.expireDate,
            status: r.status,
            wechatId: r.wechatId,
            lastActiveDate: r.lastActiveDate,
            avgResponseMinutes: r.avgResponseMinutes,
          }),
          tagsMap.get(r.id) || []
        ),
      })),
    }, { headers: LIST_CACHE_HEADERS });
  } catch (e: any) {
    console.error('[member list api] error', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const planetId = (body.planetId || '').trim();
    const nickname = (body.nickname || planetId || '').trim();
    if (!nickname) {
      return NextResponse.json({ error: '昵称或星球编号不能为空' }, { status: 400 });
    }

    let nicknameNormalized = normalizeName(nickname);
    if (!nicknameNormalized && planetId) {
      nicknameNormalized = normalizeName(planetId) || planetId;
    }
    if (!nicknameNormalized) {
      return NextResponse.json({ error: '昵称标准化失败' }, { status: 400 });
    }

    const role: RoleParam = ['student', 'coach', 'volunteer'].includes(body.role)
      ? body.role
      : 'student';
    const productLine = (body.productLine || 'AI产品出海').trim();
    const period = body.period ? String(body.period).trim() : null;
    const joinDate = parseDate(body.joinDate);
    const expireDate = parseDate(body.expireDate);
    const wechatId = body.wechatId ? String(body.wechatId).trim() : null;
    const status =
      body.status ||
      (expireDate && expireDate < new Date() ? 'expired' : 'active');

    const values = {
      planetId: planetId || null,
      nickname,
      nicknameNormalized,
      wechatId,
      role,
      productLine,
      period,
      status,
      joinDate,
      expireDate,
      updatedAt: new Date(),
    };

    const existing = planetId
      ? await db()
        .select({ id: member.id })
        .from(member)
        .where(eq(member.planetId, planetId))
        .limit(1)
      : await db()
        .select({ id: member.id })
        .from(member)
        .where(eq(member.nicknameNormalized, nicknameNormalized))
        .limit(1);

    if (existing[0]?.id) {
      await db()
        .update(member)
        .set(values)
        .where(eq(member.id, existing[0].id));
      return NextResponse.json({ id: existing[0].id, updated: true });
    }

    const id = nanoid();
    await db()
      .insert(member)
      .values({
        id,
        ...values,
        createdAt: new Date(),
      });
    return NextResponse.json({ id, created: true });
  } catch (e: any) {
    console.error('[member create api] error', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const id = String(body.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: '缺少 member id' }, { status: 400 });
    }

    const [existing] = await db()
      .select()
      .from(member)
      .where(eq(member.id, id))
      .limit(1);

    if (!existing) {
      return NextResponse.json({ error: 'member not found' }, { status: 404 });
    }

    const planetId = body.planetId !== undefined ? String(body.planetId).trim() : existing.planetId;
    const nickname = body.nickname !== undefined ? String(body.nickname).trim() : existing.nickname;
    let nicknameNormalized = normalizeName(nickname);
    if (!nicknameNormalized && planetId) {
      nicknameNormalized = normalizeName(planetId) || planetId;
    }
    if (!nicknameNormalized) {
      nicknameNormalized = existing.nicknameNormalized || '';
    }

    const role = ['student', 'coach', 'volunteer'].includes(body.role)
      ? body.role
      : existing.role;
    const productLine = body.productLine !== undefined ? String(body.productLine).trim() : existing.productLine;
    const period = body.period !== undefined ? String(body.period).trim() : existing.period;
    const joinDate = body.joinDate !== undefined ? parseDate(body.joinDate) : existing.joinDate;
    const expireDate = body.expireDate !== undefined ? parseDate(body.expireDate) : existing.expireDate;
    const wechatId = body.wechatId !== undefined ? String(body.wechatId).trim() : existing.wechatId;
    const status = body.status !== undefined
      ? String(body.status).trim()
      : (expireDate && expireDate < new Date() ? 'expired' : existing.status);

    await db()
      .update(member)
      .set({
        planetId: planetId || null,
        nickname,
        nicknameNormalized,
        wechatId: wechatId || null,
        role,
        productLine,
        period: period || null,
        status,
        joinDate: joinDate || null,
        expireDate: expireDate || null,
        updatedAt: new Date(),
      })
      .where(eq(member.id, id));

    return NextResponse.json({ id, updated: true });
  } catch (e: any) {
    console.error('[member update api] error', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '').trim();
    if (!id) {
      return NextResponse.json({ error: '缺少 member id' }, { status: 400 });
    }

    await db().delete(member).where(eq(member.id, id));
    return NextResponse.json({ id, deleted: true });
  } catch (e: any) {
    console.error('[member delete api] error', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
