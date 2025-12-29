import { NextResponse } from 'next/server';
import { desc, eq, or, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import { member, memberStats, qaRecord } from '@/config/db/schema-community-v2';

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

  const answeredCount = qaList.length;
  const resolvedCount = qaList.filter((q) => q.isResolved).length;
  const unresolvedCount = answeredCount - resolvedCount;
  const waitValues = qaList
    .map((q) => (typeof q.responseMinutes === 'number' ? q.responseMinutes : null))
    .filter((value): value is number => value !== null);
  const avgWait =
    waitValues.reduce((acc, value) => acc + value, 0) / (waitValues.length || 1);

  return NextResponse.json({
    member: targetMember,
    stats: stats || null,
    qa: qaList,
    summary: {
      answeredCount,
      resolvedCount,
      unresolvedCount,
      avgWait: Math.round(avgWait || 0),
    },
  }, { headers: DETAIL_CACHE_HEADERS });
}
