/**
 * 输出层
 * 将分析结果写入派生表
 */

import { db } from '@/core/db';
import {
  rawChatLog,
  dailyStats,
  goodNews,
  kocRecord,
  qaRecord,
  starStudent,
  member,
  memberMessage,
  memberStats,
} from '@/config/db/schema-community-v2';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { RuleEngineResult, GoodNewsRecord, KocRecord as KocInput, QuestionRecord } from './rule-engine';
import { PreprocessResult } from './preprocessor';

// ============================================
// 类型定义
// ============================================

export interface WriteOptions {
  chatLogId: string;
  productLine: string;
  period: string;
  groupNumber: number;
  chatDate: Date;
}

export interface WriteResult {
  success: boolean;
  written: {
    dailyStats: boolean;
    goodNews: number;
    kocRecords: number;
    qaRecords: number;
    starStudents: number;
  };
  error?: string;
}

// ============================================
// 写入每日统计
// ============================================

async function writeDailyStats(
  options: WriteOptions,
  preprocessResult: PreprocessResult,
  ruleResult: RuleEngineResult
): Promise<boolean> {
  const { productLine, period, groupNumber, chatDate } = options;

  // 检查是否已存在
  const existing = await db()
    .select()
    .from(dailyStats)
    .where(
      and(
        eq(dailyStats.productLine, productLine),
        eq(dailyStats.period, period),
        eq(dailyStats.groupNumber, groupNumber),
        eq(dailyStats.statsDate, chatDate)
      )
    );

  const statsData = {
    productLine,
    period,
    groupNumber,
    statsDate: chatDate,
    messageCount: ruleResult.stats.messageCount,
    activeUsers: ruleResult.stats.uniqueAuthors,
    questionCount: ruleResult.stats.questionCount,
    resolvedCount: ruleResult.stats.resolvedCount,
    resolutionRate: ruleResult.stats.resolutionRate,
    avgResponseMinutes: ruleResult.stats.avgResponseMinutes,
    goodNewsCount: ruleResult.stats.goodNewsCount,
    kocCount: ruleResult.kocCandidates.length,
    hourlyDistribution: JSON.stringify(preprocessResult.stats.hourlyDistribution),
    updatedAt: new Date(),
  };

  if (existing.length > 0) {
    await db()
      .update(dailyStats)
      .set(statsData)
      .where(eq(dailyStats.id, existing[0].id));
  } else {
    await db().insert(dailyStats).values({
      id: nanoid(),
      ...statsData,
    });
  }

  return true;
}

// ============================================
// 写入好事记录
// ============================================

async function writeGoodNews(
  options: WriteOptions,
  goodNewsRecords: GoodNewsRecord[]
): Promise<number> {
  if (goodNewsRecords.length === 0) return 0;

  const { chatLogId, chatDate } = options;

  // 删除该日期的旧记录（重新处理时）
  await db()
    .delete(goodNews)
    .where(eq(goodNews.sourceLogId, chatLogId));

  // 插入新记录
  const values = goodNewsRecords.map(record => ({
    id: nanoid(),
    sourceLogId: chatLogId,
    memberId: record.authorId,
    productLine: options.productLine,
    period: options.period,
    groupNumber: options.groupNumber,
    authorName: record.author,
    content: record.content,
    category: record.category,
    revenueLevel: record.revenueLevel,
    milestones: record.milestones ? JSON.stringify(record.milestones) : null,
    eventDate: record.eventTime,
    confidence: record.confidence,
    isVerified: false, // 自动展示，可后续删除
  }));

  await db().insert(goodNews).values(values);
  return values.length;
}

// ============================================
// 写入 KOC 记录
// ============================================

async function writeKocRecords(
  options: WriteOptions,
  kocRecords: KocInput[]
): Promise<number> {
  if (kocRecords.length === 0) return 0;

  const { chatLogId, chatDate } = options;

  // 删除旧记录
  await db()
    .delete(kocRecord)
    .where(eq(kocRecord.sourceLogId, chatLogId));

  // 插入新记录
  const values = kocRecords.map(record => ({
    id: nanoid(),
    sourceLogId: chatLogId,
    memberId: record.authorId,
    productLine: options.productLine,
    period: options.period,
    groupNumber: options.groupNumber,
    kocName: record.author,
    contribution: record.contribution,
    contributionType: record.contributionType,
    helpedCount: record.helpedCount,
    recordDate: record.eventTime,
    isVerified: false,
  }));

  await db().insert(kocRecord).values(values);
  return values.length;
}

// ============================================
// 写入问答记录
// ============================================

async function writeQaRecords(
  options: WriteOptions,
  questions: QuestionRecord[]
): Promise<number> {
  if (questions.length === 0) return 0;

  const { chatLogId } = options;

  // 删除旧记录
  await db()
    .delete(qaRecord)
    .where(eq(qaRecord.sourceLogId, chatLogId));

  // 插入新记录
  const values = questions.map(q => ({
    id: nanoid(),
    sourceLogId: chatLogId,
    productLine: options.productLine,
    period: options.period,
    groupNumber: options.groupNumber,
    askerId: q.askerId,
    askerName: q.asker,
    questionContent: q.content,
    questionTime: q.askTime,
    answererId: q.answererId,
    answererName: q.answerer,
    answererRole: q.answererRole,
    answerContent: q.answerContent,
    answerTime: q.answerTime,
    responseMinutes: q.responseMinutes,
    isResolved: q.isResolved,
  }));

  await db().insert(qaRecord).values(values);
  return values.length;
}

// ============================================
// 写入标杆学员（从好事中提取）
// ============================================

async function writeStarStudents(
  options: WriteOptions,
  goodNewsRecords: GoodNewsRecord[]
): Promise<number> {
  // 只有高置信度的里程碑类好事才算标杆
  const starCandidates = goodNewsRecords.filter(
    n => n.confidence === 'high' && (n.category === 'milestone' || n.category === 'revenue')
  );

  if (starCandidates.length === 0) return 0;

  const { chatLogId } = options;

  // 删除旧记录
  await db()
    .delete(starStudent)
    .where(eq(starStudent.sourceLogId, chatLogId));

  // 去重：同一作者只取第一条
  const seen = new Set<string>();
  const unique = starCandidates.filter(c => {
    if (seen.has(c.authorNormalized)) return false;
    seen.add(c.authorNormalized);
    return true;
  });

  // 取前 5 名
  const top5 = unique.slice(0, 5);

  const values = top5.map(record => ({
    id: nanoid(),
    sourceLogId: chatLogId,
    memberId: record.authorId,
    productLine: options.productLine,
    period: options.period,
    groupNumber: options.groupNumber,
    studentName: record.author,
    type: record.category === 'milestone' ? '里程碑' : '变现',
    achievement: record.content.slice(0, 500),
    revenueLevel: record.revenueLevel,
    recordDate: record.eventTime,
    isVerified: false,
  }));

  await db().insert(starStudent).values(values);
  return values.length;
}

// ============================================
// 更新成员标签
// ============================================

async function updateMemberTags(
  goodNewsRecords: GoodNewsRecord[]
): Promise<void> {
  // 按成员分组
  const memberUpdates = new Map<string, {
    activityLevel?: string;
    revenueLevel?: string;
    milestones?: string[];
  }>();

  for (const record of goodNewsRecords) {
    if (!record.authorId) continue;

    const existing = memberUpdates.get(record.authorId) || {};

    // 更新变现量级（取最高）
    if (record.revenueLevel) {
      const levels = ['未变现', '小额(<100)', '百元级', '千元级', '万元级'];
      const currentIdx = levels.indexOf(existing.revenueLevel || '未变现');
      const newIdx = levels.indexOf(record.revenueLevel);
      if (newIdx > currentIdx) {
        existing.revenueLevel = record.revenueLevel;
      }
    }

    // 累积里程碑
    if (record.milestones) {
      existing.milestones = [
        ...(existing.milestones || []),
        ...record.milestones,
      ];
    }

    memberUpdates.set(record.authorId, existing);
  }

  // 批量更新
  for (const [memberId, updates] of memberUpdates) {
    const setData: any = { updatedAt: new Date() };

    if (updates.revenueLevel) {
      setData.revenueLevel = updates.revenueLevel;
    }

    if (updates.milestones && updates.milestones.length > 0) {
      // 获取现有里程碑，合并去重
      const existing = await db()
        .select({ milestones: member.milestones })
        .from(member)
        .where(eq(member.id, memberId));

      let existingMilestones: string[] = [];
      if (existing[0]?.milestones) {
        try {
          existingMilestones = JSON.parse(existing[0].milestones);
        } catch {}
      }

      const merged = [...new Set([...existingMilestones, ...updates.milestones])];
      setData.milestones = JSON.stringify(merged);
    }

    await db()
      .update(member)
      .set(setData)
      .where(eq(member.id, memberId));
  }
}

// ============================================
// 写入成员消息（规则引擎）
// ============================================

async function writeMemberMessages(
  options: WriteOptions,
  preprocessResult: PreprocessResult,
  ruleResult: RuleEngineResult
): Promise<number> {
  const { chatLogId, productLine, period, groupNumber } = options;

  await db()
    .delete(memberMessage)
    .where(eq(memberMessage.sourceLogId, chatLogId));

  const questionIndexes = new Set(ruleResult.questions.map((q) => q.index));
  const answerIndexes = new Set(
    ruleResult.questions
      .map((q) => q.answerIndex)
      .filter((idx): idx is number => typeof idx === 'number')
  );
  const goodNewsIndexes = new Set(
    ruleResult.goodNews
      .map((n) => n.messageIndex)
      .filter((idx): idx is number => typeof idx === 'number')
  );
  const kocIndexes = new Set(
    ruleResult.kocCandidates
      .map((k) => k.messageIndex)
      .filter((idx): idx is number => typeof idx === 'number')
  );

  const values = preprocessResult.messages
    .filter((msg) => msg.isValid && msg.text.trim().length > 0)
    .map((msg) => {
      let messageType: 'question' | 'answer' | 'good_news' | 'share' | 'encouragement' | 'normal' = 'normal';
      if (questionIndexes.has(msg.index)) {
        messageType = 'question';
      } else if (answerIndexes.has(msg.index)) {
        messageType = 'answer';
      } else if (goodNewsIndexes.has(msg.index)) {
        messageType = 'good_news';
      } else if (kocIndexes.has(msg.index)) {
        messageType = 'share';
      }

      return {
        id: nanoid(),
        memberId: msg.memberId || null,
        sourceLogId: chatLogId,
        authorName: msg.author,
        authorNormalized: msg.authorNormalized,
        messageContent: msg.text,
        messageTime: msg.timestamp,
        messageIndex: msg.index,
        messageType,
        relatedQaId: null,
        relatedGoodNewsId: null,
        relatedKocId: null,
        contextBefore: null,
        contextAfter: null,
        productLine,
        period,
        groupNumber,
      };
    });

  if (values.length > 0) {
    await db().insert(memberMessage).values(values);
  }

  return values.length;
}

// ============================================
// 更新成员统计（规则引擎）
// ============================================

function ensureNativeDate(value: unknown, fallback?: Date): Date {
  if (!value) return fallback ?? new Date();
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getTime());
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }
  if (value && typeof (value as any).getTime === 'function') {
    const ts = (value as any).getTime();
    if (typeof ts === 'number' && !isNaN(ts)) {
      return new Date(ts);
    }
  }
  try {
    const d = new Date(String(value));
    if (!isNaN(d.getTime())) return d;
  } catch {
    // ignore
  }
  return fallback ?? new Date();
}

async function updateMemberStats(memberId: string): Promise<void> {
  const [memberInfo] = await db()
    .select()
    .from(member)
    .where(eq(member.id, memberId));

  if (!memberInfo) return;

  const messageStats = await db()
    .select({
      totalMessages: sql<number>`count(*)`,
      questionCount: sql<number>`sum(case when message_type = 'question' then 1 else 0 end)`,
      answerCount: sql<number>`sum(case when message_type = 'answer' then 1 else 0 end)`,
      goodNewsCount: sql<number>`sum(case when message_type = 'good_news' then 1 else 0 end)`,
      shareCount: sql<number>`sum(case when message_type = 'share' then 1 else 0 end)`,
      encouragementCount: sql<number>`sum(case when message_type = 'encouragement' then 1 else 0 end)`,
      firstActive: sql<Date>`min(message_time)`,
      lastActive: sql<Date>`max(message_time)`,
    })
    .from(memberMessage)
    .where(eq(memberMessage.memberId, memberId));

  const activeDaysResult = await db()
    .select({
      days: sql<number>`count(distinct date(message_time))`,
    })
    .from(memberMessage)
    .where(eq(memberMessage.memberId, memberId));

  let avgResponseMinutes: number | null = null;
  let resolvedCount: number | null = null;
  let helpedStudents: number | null = null;

  if (memberInfo.role === 'coach' || memberInfo.role === 'volunteer') {
    const qaStats = await db()
      .select({
        avgResponse: sql<number>`avg(response_minutes)`,
        resolved: sql<number>`sum(case when is_resolved then 1 else 0 end)`,
        helped: sql<number>`count(distinct asker_id)`,
      })
      .from(qaRecord)
      .where(eq(qaRecord.answererId, memberId));

    if (qaStats[0]) {
      avgResponseMinutes = qaStats[0].avgResponse ? Math.round(qaStats[0].avgResponse) : null;
      resolvedCount = qaStats[0].resolved || 0;
      helpedStudents = qaStats[0].helped || 0;
    }
  }

  const kocStats = await db()
    .select({
      contributions: sql<number>`count(*)`,
      totalHelped: sql<number>`coalesce(sum(helped_count), 0)`,
    })
    .from(kocRecord)
    .where(eq(kocRecord.memberId, memberId));

  const stats = messageStats[0];

  const statsData = {
    memberId,
    productLine: memberInfo.productLine,
    period: memberInfo.period,
    totalMessages: Number(stats?.totalMessages) || 0,
    questionCount: Number(stats?.questionCount) || 0,
    answerCount: Number(stats?.answerCount) || 0,
    goodNewsCount: Number(stats?.goodNewsCount) || 0,
    shareCount: Number(stats?.shareCount) || 0,
    encouragementCount: Number(stats?.encouragementCount) || 0,
    avgResponseMinutes,
    resolvedCount,
    helpedStudents,
    activeDays: Number(activeDaysResult[0]?.days) || 0,
    lastActiveDate: stats?.lastActive ? ensureNativeDate(stats.lastActive) : undefined,
    firstActiveDate: stats?.firstActive ? ensureNativeDate(stats.firstActive) : undefined,
    kocContributions: Number(kocStats[0]?.contributions) || 0,
    totalHelpedCount: Number(kocStats[0]?.totalHelped) || 0,
    updatedAt: new Date(),
  };

  const existing = await db()
    .select()
    .from(memberStats)
    .where(eq(memberStats.memberId, memberId));

  if (existing.length > 0) {
    await db()
      .update(memberStats)
      .set(statsData)
      .where(eq(memberStats.memberId, memberId));
  } else {
    await db().insert(memberStats).values({
      id: nanoid(),
      ...statsData,
    });
  }
}

async function updateMemberStatsForLog(
  preprocessResult: PreprocessResult,
  ruleResult: RuleEngineResult
): Promise<void> {
  const memberIds = new Set<string>();

  preprocessResult.messages.forEach((msg) => {
    if (msg.memberId) memberIds.add(msg.memberId);
  });

  ruleResult.questions.forEach((q) => {
    if (q.askerId) memberIds.add(q.askerId);
    if (q.answererId) memberIds.add(q.answererId);
  });

  ruleResult.goodNews.forEach((n) => {
    if (n.authorId) memberIds.add(n.authorId);
  });

  ruleResult.kocCandidates.forEach((k) => {
    if (k.authorId) memberIds.add(k.authorId);
  });

  for (const memberId of memberIds) {
    await updateMemberStats(memberId);
  }
}

// ============================================
// 更新 raw_chat_log 状态
// ============================================

async function updateChatLogStatus(
  chatLogId: string,
  status: 'processed' | 'failed',
  error?: string
): Promise<void> {
  await db()
    .update(rawChatLog)
    .set({
      status,
      processedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(rawChatLog.id, chatLogId));
}

// ============================================
// 主函数
// ============================================

export async function writeAnalysisResults(
  options: WriteOptions,
  preprocessResult: PreprocessResult,
  ruleResult: RuleEngineResult
): Promise<WriteResult> {
  try {
    // 写入每日统计
    await writeDailyStats(options, preprocessResult, ruleResult);

    // 写入好事
    const goodNewsCount = await writeGoodNews(options, ruleResult.goodNews);

    // 写入 KOC
    const kocCount = await writeKocRecords(options, ruleResult.kocCandidates);

    // 写入问答
    const qaCount = await writeQaRecords(options, ruleResult.questions);

    // 写入标杆学员
    const starCount = await writeStarStudents(options, ruleResult.goodNews);

    // 写入成员消息
    await writeMemberMessages(options, preprocessResult, ruleResult);

    // 更新成员标签
    await updateMemberTags(ruleResult.goodNews);

    // 更新成员统计
    await updateMemberStatsForLog(preprocessResult, ruleResult);

    // 更新状态
    await updateChatLogStatus(options.chatLogId, 'processed');

    return {
      success: true,
      written: {
        dailyStats: true,
        goodNews: goodNewsCount,
        kocRecords: kocCount,
        qaRecords: qaCount,
        starStudents: starCount,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // 标记失败
    await updateChatLogStatus(options.chatLogId, 'failed', errorMsg);

    return {
      success: false,
      written: {
        dailyStats: false,
        goodNews: 0,
        kocRecords: 0,
        qaRecords: 0,
        starStudents: 0,
      },
      error: errorMsg,
    };
  }
}
