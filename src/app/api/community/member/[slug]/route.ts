import { NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/core/db';
import { member, memberStats, qaRecord, goodNews, memberAlias, kocRecord, starStudent } from '@/config/db/schema-community-v2';

function normalizeName(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·｜|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  const slug = params.slug;
  const normFromSlug = normalizeName(slug);
  try {
    const database = db();

    let profile = null;
    let canonicalId: string | null = null;

    // 0) 优先按 member.id 命中（支持用 planet_id / id 作为 URL 参数）
    const byId = await database
      .select()
      .from(member)
      .where(and(eq(member.status, 'active'), eq(member.id, slug)));
    if (byId.length > 0) {
      profile = byId[0];
      canonicalId = profile.id;
    }

    const norm = profile?.nicknameNormalized
      ? normalizeName(profile.nicknameNormalized)
      : normFromSlug;

    if (!profile) {
      const members = await database
        .select()
        .from(member)
        .where(and(eq(member.status, 'active'), eq(member.nicknameNormalized, norm)));
      if (members.length > 0) {
        profile = members[0];
        canonicalId = profile.id;
      } else {
        // try alias
        const aliases = await database
          .select()
          .from(memberAlias)
          .where(eq(memberAlias.alias, norm));
        if (aliases.length > 0) {
          const targetId = aliases[0].memberId;
          const target = await database.select().from(member).where(eq(member.id, targetId));
          if (target.length > 0) {
            profile = target[0];
            canonicalId = target[0].id;
          }
        }
      }
    }

    // stats: 支持按 norm/id/alias 多键匹配
    const lookupKeys = Array.from(new Set([norm, canonicalId].filter(Boolean))) as string[];
    let stats: typeof memberStats.$inferSelect | null = null;
    if (lookupKeys.length) {
      try {
        const statsRows = await database
          .select()
          .from(memberStats)
          .where(inArray(memberStats.memberId, lookupKeys as string[]));
        stats = statsRows[0] || null;
      } catch (e) {
        console.error('member api stats query error:', e);
      }
    }

    // questions (作为提问者) + answers (作为回答者)
    const qaAll = await database.select().from(qaRecord).where(eq(qaRecord.status, 'active'));
    const qa = qaAll.filter(
      (q) => (canonicalId && q.askerId === canonicalId) || normalizeName(q.askerName || '') === norm
    );
    const answers = qaAll.filter(
      (q) =>
        (canonicalId && q.answererId === canonicalId) || normalizeName(q.answererName || '') === norm
    );

    // good news
    const gnsAll = await database
      .select()
      .from(goodNews)
      .where(eq(goodNews.status, 'active'));
    const gns = gnsAll.filter(
      (g) => (canonicalId && g.memberId === canonicalId) || normalizeName(g.authorName || '') === norm
    );

    // koc
    const kocsAll = await database.select().from(kocRecord).where(eq(kocRecord.status, 'active'));
    const kocs = kocsAll.filter(
      (k) => (canonicalId && k.memberId === canonicalId) || normalizeName(k.kocName || '') === norm
    );

    // star
    const starsAll = await database.select().from(starStudent).where(eq(starStudent.status, 'active'));
    const stars = starsAll.filter(
      (s) => (canonicalId && s.memberId === canonicalId) || normalizeName(s.studentName || '') === norm
    );

    return NextResponse.json({
      profile: profile
        ? {
            id: profile.id,
            nickname: profile.nickname,
            role: profile.role,
            productLine: profile.productLine,
            period: profile.period,
            activityLevel: profile.activityLevel,
          }
        : { id: norm, nickname: slug, role: 'unknown' },
      stats: stats || {
        memberId: norm,
        totalMessages: 0,
        questionCount: 0,
        answerCount: 0,
        goodNewsCount: 0,
      },
      questions: qa.map((q) => ({
        id: q.id,
        content: q.questionContent,
        resolved: q.isResolved,
        waitMins: q.responseMinutes,
        answeredBy: q.answererName,
        questionTime: q.questionTime,
        isVerified: q.isVerified, // Added for review
      })),
      answers: answers.map((q) => ({
        id: q.id,
        questionContent: q.questionContent,
        answerContent: q.answerContent,
        isResolved: q.isResolved,
        responseMinutes: q.responseMinutes,
        answerTime: q.answerTime,
        productLine: q.productLine,
        period: q.period,
        sourceLogId: q.sourceLogId,
      })),
      goodNews: gns.map((g) => ({
        id: g.id,
        content: g.content,
        date: g.eventDate,
        productLine: g.productLine,
        isVerified: g.isVerified,
      })),
      kocs: kocs.map((k) => ({
        id: k.id,
        content: k.contribution,
        date: k.recordDate,
        isVerified: k.isVerified,
      })),
      stars: stars.map((s) => ({
        id: s.id,
        content: s.achievement,
        date: s.recordDate,
        type: s.type, // e.g. milestone
        isVerified: s.isVerified,
      })),
    });
  } catch (e: any) {
    console.error('member api error:', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
