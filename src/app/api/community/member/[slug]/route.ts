import { NextResponse } from 'next/server';
import { and, desc, eq, gte, or, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import {
  member,
  memberStats,
  memberTag,
  memberMessage,
  qaRecord,
  goodNews,
} from '@/config/db/schema-community-v2';
import {
  buildActionTagsFromRecords,
  buildBaseMemberTags,
  mergeTags,
} from '@/lib/community-tag-utils';

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
  const slug = resolved?.slug ? safeDecode(resolved.slug) : undefined;
  if (!slug) {
    return NextResponse.json({ error: 'missing slug' }, { status: 400 });
  }

  const normalized = normalizeName(slug);

  // 找到成员
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
    return NextResponse.json({ error: 'member not found' }, { status: 404 });
  }

  const toDate = (value: unknown) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  };

  const formatDate = (value: Date) => value.toISOString().slice(0, 10);

  // stats
  const [stats] = await db()
    .select()
    .from(memberStats)
    .where(eq(memberStats.memberId, targetMember.id))
    .limit(1);

  // tags
  const tags = await db()
    .select()
    .from(memberTag)
    .where(eq(memberTag.memberId, targetMember.id))
    .orderBy(memberTag.tagCategory, memberTag.tagName);

  // QA：以 asker 为主
  const qaList = await db()
    .select({
      id: qaRecord.id,
      question: qaRecord.questionContent,
      answer: qaRecord.answerContent,
      questionTime: qaRecord.questionTime,
      answerTime: qaRecord.answerTime,
      isResolved: qaRecord.isResolved,
      responseMinutes: qaRecord.responseMinutes,
      productLine: qaRecord.productLine,
      period: qaRecord.period,
      groupNumber: qaRecord.groupNumber,
    })
    .from(qaRecord)
    .where(
      or(
        eq(qaRecord.askerId, targetMember.id),
        eq(sql<string>`lower(${qaRecord.askerName})`, normalized)
      )
    )
    .orderBy(desc(qaRecord.questionTime))
    .limit(50);

  // 好事
  const goodNewsList = await db()
    .select({
      id: goodNews.id,
      content: goodNews.content,
      date: goodNews.eventDate,
      productLine: goodNews.productLine,
      period: goodNews.period,
      groupNumber: goodNews.groupNumber,
      category: goodNews.category,
      revenueLevel: goodNews.revenueLevel,
      milestones: goodNews.milestones,
    })
    .from(goodNews)
    .where(
      or(
        eq(goodNews.memberId, targetMember.id),
        eq(sql<string>`lower(${goodNews.authorName})`, normalized)
      )
    )
    .orderBy(desc(goodNews.eventDate))
    .limit(50);

  // 消息时间线
  const messages = await db()
    .select({
      id: memberMessage.id,
      content: memberMessage.messageContent,
      time: memberMessage.messageTime,
      type: memberMessage.messageType,
      productLine: memberMessage.productLine,
      period: memberMessage.period,
      groupNumber: memberMessage.groupNumber,
    })
    .from(memberMessage)
    .where(
      or(
        eq(memberMessage.memberId, targetMember.id),
        eq(sql<string>`lower(${memberMessage.authorNormalized})`, normalized)
      )
    )
    .orderBy(desc(memberMessage.messageTime))
    .limit(100);

  // 互动时间规律统计（近 60 天）
  const summaryDays = 60;
  const summaryStart = new Date();
  summaryStart.setDate(summaryStart.getDate() - (summaryDays - 1));
  summaryStart.setHours(0, 0, 0, 0);

  const summaryRows = await db()
    .select({
      time: memberMessage.messageTime,
    })
    .from(memberMessage)
    .where(
      and(
        gte(memberMessage.messageTime, summaryStart),
        or(
          eq(memberMessage.memberId, targetMember.id),
          eq(sql<string>`lower(${memberMessage.authorNormalized})`, normalized)
        )
      )
    )
    ;

  const dailyCounts = new Map<string, number>();
  const hourlyCounts = Array.from({ length: 24 }, () => 0);

  summaryRows.forEach((row) => {
    const dateObj = toDate(row.time);
    if (!dateObj) return;
    const key = formatDate(dateObj);
    dailyCounts.set(key, (dailyCounts.get(key) || 0) + 1);
    const hour = dateObj.getHours();
    if (hour >= 0 && hour < 24) {
      hourlyCounts[hour] += 1;
    }
  });

  const daily: { date: string; count: number }[] = [];
  const cursor = new Date(summaryStart);
  for (let i = 0; i < summaryDays; i += 1) {
    const key = formatDate(cursor);
    daily.push({ date: key, count: dailyCounts.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const hourly = hourlyCounts.map((count, hour) => ({
    hour: String(hour).padStart(2, '0'),
    count,
  }));

  const activitySummary = {
    rangeDays: summaryDays,
    rangeStart: formatDate(summaryStart),
    rangeEnd: formatDate(new Date()),
    totalMessages: summaryRows.length,
    daily,
    hourly,
  };

  const baseTags = buildBaseMemberTags({
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
  });

  const actionTags = buildActionTagsFromRecords({
    qaList: qaList.map((q) => ({
      question: q.question,
      questionTime: q.questionTime,
      isResolved: q.isResolved,
      waitMinutes: q.responseMinutes ?? null,
      askerName: targetMember.nickname,
    })),
    goodNewsList: goodNewsList.map((g) => ({
      content: g.content,
      date: g.date,
    })),
  });

  return NextResponse.json({
    member: targetMember,
    stats: stats || null,
    tags,
    derivedTags: mergeTags(baseTags, actionTags),
    qa: qaList,
    goodNews: goodNewsList,
    messages,
    activitySummary,
  }, { headers: DETAIL_CACHE_HEADERS });
}
