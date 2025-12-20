import { NextResponse } from 'next/server';
import { and, desc, eq, or, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import {
  member,
  memberStats,
  memberTag,
  memberMessage,
  qaRecord,
  goodNews,
} from '@/config/db/schema-community-v2';

function normalizeName(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·｜|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug;
  if (!slug) {
    return NextResponse.json({ error: 'missing slug' }, { status: 400 });
  }

  const normalized = normalizeName(slug);

  // 找到成员
  const [targetMember] = await db()
    .select()
    .from(member)
    .where(eq(member.nicknameNormalized, normalized))
    .limit(1);

  if (!targetMember) {
    return NextResponse.json({ error: 'member not found' }, { status: 404 });
  }

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

  return NextResponse.json({
    member: targetMember,
    stats: stats || null,
    tags,
    qa: qaList,
    goodNews: goodNewsList,
    messages,
  });
}
