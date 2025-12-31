import { NextResponse } from 'next/server';
import { desc, eq, or, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { member, memberStats, memberTag, qaRecord, tagCatalog } from '@/config/db/schema-community-v2';
import { buildBaseMemberTags, mergeTags } from '@/lib/community-tag-utils';

const DETAIL_CACHE_HEADERS = {
  'Cache-Control': 's-maxage=30, stale-while-revalidate=60',
};

function normalizeName(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·｜|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function normalizeTagValue(value: string) {
  return value.replace(/\s+/g, '').trim().toLowerCase();
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } | Promise<{ slug: string }> }
) {
  const resolved = await Promise.resolve(params);
  if (!resolved?.slug) {
    return NextResponse.json({ error: 'missing slug' }, { status: 400 });
  }

  const slug = safeDecode(resolved.slug);
  const normalized = normalizeName(slug);

  const [targetMember] = await db()
    .select()
    .from(member)
    .where(
      or(
        eq(member.id, slug),
        eq(member.planetId, slug),
        eq(member.nicknameNormalized, normalized)
      )
    )
    .limit(1);

  if (!targetMember) {
    return NextResponse.json({ error: 'coach not found' }, { status: 404 });
  }

  const [stats] = await db()
    .select()
    .from(memberStats)
    .where(eq(memberStats.memberId, targetMember.id))
    .limit(1);

  const inactiveTags = await db()
    .select({
      category: tagCatalog.category,
      name: tagCatalog.name,
    })
    .from(tagCatalog)
    .where(eq(tagCatalog.status, 'inactive'));
  type InactiveTagRow = (typeof inactiveTags)[number];
  const inactiveSet = new Set(
    inactiveTags.map((t: InactiveTagRow) => `${t.category}:${normalizeTagValue(t.name || '')}`)
  );

  const rawTags = await db()
    .select()
    .from(memberTag)
    .where(eq(memberTag.memberId, targetMember.id))
    .orderBy(memberTag.tagCategory, memberTag.tagName);
  type RawTagRow = (typeof rawTags)[number];
  const tags = rawTags.filter((tag: RawTagRow) => {
    const key = `${tag.tagCategory}:${normalizeTagValue(tag.tagName || '')}`;
    return !inactiveSet.has(key);
  });

  const qaList = await db()
    .select({
      id: qaRecord.id,
      question: qaRecord.questionContent,
      answer: qaRecord.answerContent,
      questionTime: qaRecord.questionTime,
      answerTime: qaRecord.answerTime,
      isResolved: qaRecord.isResolved,
      responseMinutes: qaRecord.responseMinutes,
      askerName: qaRecord.askerName,
      productLine: qaRecord.productLine,
      period: qaRecord.period,
      groupNumber: qaRecord.groupNumber,
    })
    .from(qaRecord)
    .where(
      or(
        eq(qaRecord.answererId, targetMember.id),
        eq(sql<string>`lower(${qaRecord.answererName})`, normalized)
      )
    )
    .orderBy(desc(qaRecord.questionTime))
    .limit(200);

  type QaRow = (typeof qaList)[number];
  const answeredCount = qaList.length;
  const resolvedCount = qaList.filter((q: QaRow) => q.isResolved).length;
  const unresolvedCount = answeredCount - resolvedCount;
  const waitValues = qaList
    .map((q: QaRow) => (typeof q.responseMinutes === 'number' ? q.responseMinutes : null))
    .filter((value: number | null): value is number => value !== null);
  const avgWait =
    waitValues.reduce((acc: number, value: number) => acc + value, 0) / (waitValues.length || 1);

  return NextResponse.json({
    member: targetMember,
    stats: stats || null,
    tags,
    derivedTags: mergeTags(
      buildBaseMemberTags({
        productLine: targetMember.productLine,
        role: targetMember.role,
        activityLevel: targetMember.activityLevel,
        progressAiProduct: targetMember.progressAiProduct,
        progressYoutube: targetMember.progressYoutube,
        progressBilibili: targetMember.progressBilibili,
        revenueLevel: targetMember.revenueLevel,
        milestones: targetMember.milestones,
        expireDate: targetMember.expireDate,
        status: targetMember.status,
        wechatId: targetMember.wechatId,
        lastActiveDate: stats?.lastActiveDate,
        avgResponseMinutes: stats?.avgResponseMinutes,
      }),
    ),
    qa: qaList,
    summary: {
      answeredCount,
      resolvedCount,
      unresolvedCount,
      avgWait: Math.round(avgWait || 0),
    },
  }, { headers: DETAIL_CACHE_HEADERS });
}
