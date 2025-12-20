import { NextResponse } from 'next/server';
import { and, eq, gt, inArray, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import {
  dailyStats,
  member,
  memberMessage,
  memberStats,
  memberTag,
  qaRecord,
} from '@/config/db/schema-community-v2';

const WINDOW_DAYS = 7;
const SIGNAL_TYPES = ['question', 'answer', 'good_news', 'share'];
const NOISE_PATTERNS = /(红包|拼手气|晚安|早安|哈哈|哈哈哈|表情|口令|签到|冒泡)/;
const TAG_CATEGORIES = ['niche', 'stage', 'intent', 'activity', 'sentiment', 'risk'];

function normalizePeriod(period?: string | null) {
  if (!period) return undefined;
  return period.replace(/期$/g, '').trim();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productLine = searchParams.get('productLine') || 'AI产品出海';
  const periodParam = normalizePeriod(searchParams.get('period'));

  const now = new Date();
  const start = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  try {
    const database = db();

    // 近7天消息
    let msgQuery = database
      .select({
        memberId: memberMessage.memberId,
        messageType: memberMessage.messageType,
        content: memberMessage.messageContent,
      })
      .from(memberMessage)
      .where(
        and(
          eq(memberMessage.productLine, productLine),
          gt(memberMessage.messageTime, start)
        )
      );
    if (periodParam) {
      msgQuery = msgQuery.where(eq(memberMessage.period, periodParam));
    }
    const messages = await msgQuery;

    const totalMessages = messages.length;
    let signalCount = 0;
    let noiseCount = 0;
    messages.forEach((m) => {
      const type = m.messageType || 'normal';
      const text = (m.content || '').slice(0, 200);
      const isSignal = SIGNAL_TYPES.includes(type as any);
      const isNoise = !isSignal || NOISE_PATTERNS.test(text);
      if (isSignal) signalCount += 1;
      if (isNoise) noiseCount += 1;
    });
    const noiseRatio = totalMessages ? Math.round((noiseCount / totalMessages) * 100) : 0;
    const signalRatio = totalMessages ? Math.round((signalCount / totalMessages) * 100) : 0;

    // 近7天未解决/等待
    let qaQuery = database
      .select({
        id: qaRecord.id,
        content: qaRecord.questionContent,
        asker: qaRecord.askerName,
        questionTime: qaRecord.questionTime,
        responseMinutes: qaRecord.responseMinutes,
        isResolved: qaRecord.isResolved,
      })
      .from(qaRecord)
      .where(
        and(
          eq(qaRecord.productLine, productLine),
          gt(qaRecord.questionTime, start)
        )
      );
    if (periodParam) {
      qaQuery = qaQuery.where(eq(qaRecord.period, periodParam));
    }
    const qaRows = await qaQuery;
    const unresolved = qaRows.filter((q) => !q.isResolved);
    const longWait = qaRows.filter((q) => (q.responseMinutes || 0) > 60);

    // 近7天节奏/响应
    let dsQuery = database
      .select({
        statsDate: dailyStats.statsDate,
        avgResponseMinutes: dailyStats.avgResponseMinutes,
        questionCount: dailyStats.questionCount,
        resolutionRate: dailyStats.resolutionRate,
      })
      .from(dailyStats)
      .where(
        and(
          eq(dailyStats.productLine, productLine),
          gt(dailyStats.statsDate, start)
        )
      );
    if (periodParam) {
      dsQuery = dsQuery.where(eq(dailyStats.period, periodParam));
    }
    const dsRows = await dsQuery;
    const dsWithResponse = dsRows.filter((d) => d.avgResponseMinutes != null);
    const avgResponse =
      dsWithResponse.length > 0
        ? Math.round(
            dsWithResponse.reduce((acc, cur) => acc + (cur.avgResponseMinutes || 0), 0) /
              dsWithResponse.length
          )
        : null;

    // 关键用户：按贡献度排序
    let statQuery = database
      .select({
        memberId: memberStats.memberId,
        messageCount: memberStats.totalMessages,
        questionCount: memberStats.questionCount,
        answerCount: memberStats.answerCount,
        goodNewsCount: memberStats.goodNewsCount,
      })
      .from(memberStats)
      .where(eq(memberStats.productLine, productLine));
    if (periodParam) {
      statQuery = statQuery.where(eq(memberStats.period, periodParam));
    }
    const statRows = await statQuery;
    const score = (s: any) =>
      (s.answerCount || 0) * 5 + (s.goodNewsCount || 0) * 20 + (s.messageCount || 0);
    const top = statRows
      .slice()
      .sort((a, b) => score(b) - score(a))
      .slice(0, 12);
    const memberIds = top.map((t) => t.memberId);

    // 成员基础信息
    const memberRows = memberIds.length
      ? await database
          .select({
            id: member.id,
            nickname: member.nickname,
            role: member.role,
            productLine: member.productLine,
            period: member.period,
          })
          .from(member)
          .where(inArray(member.id, memberIds))
      : [];
    const memberMap = new Map(memberRows.map((m) => [m.id, m]));

    // 标签
    const tagRows = memberIds.length
      ? await database
          .select()
          .from(memberTag)
          .where(
            and(
              inArray(memberTag.memberId, memberIds),
              inArray(memberTag.tagCategory, TAG_CATEGORIES as any)
            )
          )
      : [];
    const tagMap = new Map<string, Array<{ category: string; name: string; confidence?: string }>>();
    tagRows.forEach((t) => {
      const list = tagMap.get(t.memberId) || [];
      list.push({ category: t.tagCategory, name: t.tagName, confidence: t.confidence || undefined });
      tagMap.set(t.memberId, list);
    });

    const keyUsers = top.map((s) => {
      const meta = memberMap.get(s.memberId);
      return {
        memberId: s.memberId,
        nickname: meta?.nickname || s.memberId,
        role: meta?.role || 'student',
        period: meta?.period,
        productLine: meta?.productLine,
        stats: {
          messageCount: s.messageCount || 0,
          answerCount: s.answerCount || 0,
          goodNewsCount: s.goodNewsCount || 0,
          score: score(s),
        },
        tags: (tagMap.get(s.memberId) || []).slice(0, 4),
        suggestion: s.answerCount > 0 ? '重点感谢/邀请分享案例' : '鼓励持续输出/互动',
      };
    });

    const valueAnchors = [];
    if (noiseRatio >= 35) {
      valueAnchors.push({
        title: '噪音偏高',
        detail: `近7天噪音占比 ${noiseRatio}% ，价值输出被稀释`,
        suggestion: '清理红包/闲聊，补充高价值内容',
      });
    }
    if (signalRatio <= 50) {
      valueAnchors.push({
        title: '高价值占比不足',
        detail: `近7天有效讨论占比仅 ${signalRatio}%`,
        suggestion: '增加出海实战/变现相关话题，组织讨论',
      });
    }
    if (unresolved.length > 0) {
      valueAnchors.push({
        title: '未解决问题待跟进',
        detail: `未解决 ${unresolved.length} 条，长等待 ${longWait.length} 条`,
        suggestion: '指派教练答疑或群内@推动',
      });
    }

    const rhythms = [
      {
        title: '答疑时效',
        status: avgResponse ? `${avgResponse} 分钟平均响应` : '暂无数据',
        suggestion: avgResponse && avgResponse > 60 ? '缩短响应到 <30 分钟' : '保持当前节奏',
      },
      {
        title: '未解决池',
        status: `未解决 ${unresolved.length} 条`,
        suggestion: unresolved.length > 0 ? '每日清零或指派跟进' : '已清空',
      },
    ];

    return NextResponse.json({
      windowDays: WINDOW_DAYS,
      productLine,
      period: periodParam,
      valueAnchors,
      keyUsers,
      rhythms,
    });
  } catch (e: any) {
    console.error('ops-insights api error:', e);
    return NextResponse.json({ error: e?.message || 'internal error' }, { status: 500 });
  }
}
