/**
 * LLM 分析管道
 *
 * 完整流程：
 * 1. 从数据库读取待处理的原始聊天记录
 * 2. 调用 LLM 进行分析
 * 3. 将结果写入各派生表
 * 4. 更新成员统计
 */

import { db } from '@/core/db';
import { eq, and, inArray, asc, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
  rawChatLog,
  member,
  dailyStats,
  goodNews,
  kocRecord,
  qaRecord,
  starStudent,
  memberMessage,
  memberStats,
  memberTag,
} from '@/config/db/schema-community-v2';
import {
  analyzeChatWithLLM,
  ChatAnalysisResult,
  QAPair,
  GoodNewsItem,
  KOCContribution,
} from './llm-chat-analyzer';
import { parseMessages } from './analysis/preprocessor';

type TagCategory = 'niche' | 'stage' | 'intent' | 'activity' | 'sentiment' | 'risk';

// ============================================
// 类型定义
// ============================================

export interface PipelineOptions {
  force?: boolean;           // 强制重新处理已处理的记录
  limit?: number;            // 限制处理数量
  dryRun?: boolean;          // 仅分析不写入
  onProgress?: (current: number, total: number, fileName: string) => void;
}

export interface PipelineResult {
  processed: number;
  failed: number;
  skipped: number;
  totalGoodNews: number;
  totalQA: number;
  totalKOC: number;
  errors: Array<{ fileName: string; error: string }>;
}

// ============================================
// 成员匹配
// ============================================

let memberLookup: Map<string, { id: string; role: string; nickname: string }> | null = null;

async function loadMemberLookup(): Promise<Map<string, { id: string; role: string; nickname: string }>> {
  if (memberLookup) return memberLookup;

  const members = await db().select().from(member);
  const lookup = new Map<string, { id: string; role: string; nickname: string }>();

  for (const m of members) {
    const key = m.nicknameNormalized || normalizeNickname(m.nickname);
    lookup.set(key, {
      id: m.id,
      role: m.role,
      nickname: m.nickname,
    });
  }

  memberLookup = lookup;
  console.log(`[Pipeline] Loaded ${lookup.size} member mappings`);
  return lookup;
}

function normalizeNickname(name: string): string {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·｜|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function findMember(authorName: string): { id: string; role: string } | null {
  if (!memberLookup) return null;
  const normalized = normalizeNickname(authorName);
  return memberLookup.get(normalized) || null;
}

// ============================================
// 辅助：确保日期是真正的原生 Date
// ============================================

function ensureNativeDate(value: unknown, fallback?: Date): Date {
  if (!value) return fallback ?? new Date();

  // 已经是有效的原生 Date
  if (value instanceof Date && !isNaN(value.getTime())) {
    return new Date(value.getTime()); // 创建新副本
  }

  // 字符串或数字
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }

  // Date-like 对象（有 getTime 方法）
  if (value && typeof (value as any).getTime === 'function') {
    const ts = (value as any).getTime();
    if (typeof ts === 'number' && !isNaN(ts)) {
      return new Date(ts);
    }
  }

  // 尝试 toString
  try {
    const d = new Date(String(value));
    if (!isNaN(d.getTime())) return d;
  } catch {
    // ignore
  }

  console.warn(`[ensureNativeDate] Failed to convert: ${value}, using fallback`);
  return fallback ?? new Date();
}

// ============================================
// 写入每日统计
// ============================================

async function writeDailyStats(
  logMeta: {
    productLine: string;
    period: string;
    groupNumber: number;
    chatDate: Date;
  },
  result: ChatAnalysisResult
): Promise<void> {
  const statsDateValue = ensureNativeDate(logMeta.chatDate);

  const existing = await db()
    .select()
    .from(dailyStats)
    .where(
      and(
        eq(dailyStats.productLine, logMeta.productLine),
        eq(dailyStats.period, logMeta.period),
        eq(dailyStats.groupNumber, logMeta.groupNumber),
        eq(dailyStats.statsDate, statsDateValue)
      )
    );

  const statsData = {
    productLine: logMeta.productLine,
    period: logMeta.period,
    groupNumber: logMeta.groupNumber,
    statsDate: statsDateValue,
    messageCount: result.stats.messageCount,
    activeUsers: result.stats.activeUsers,
    questionCount: result.stats.questionCount,
    resolvedCount: result.stats.resolvedCount,
    resolutionRate: result.stats.questionCount > 0
      ? Math.round((result.stats.resolvedCount / result.stats.questionCount) * 100)
      : null,
    avgResponseMinutes: result.stats.avgResponseMinutes,
    goodNewsCount: result.stats.goodNewsCount,
    kocCount: result.stats.kocCount,
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
}

// ============================================
// 写入问答记录
// ============================================

async function writeQARecords(
  sourceLogId: string,
  chatDate: Date,
  logMeta: { productLine: string; period: string; groupNumber: number },
  qaPairs: QAPair[]
): Promise<{ qaIds: Map<number, string>; count: number }> {
  if (qaPairs.length === 0) return { qaIds: new Map(), count: 0 };

  // 删除该来源的旧记录
  await db().delete(qaRecord).where(eq(qaRecord.sourceLogId, sourceLogId));

  const qaIds = new Map<number, string>();

  // 过滤并转换数据，确保必填字段不为空
  const validPairs = qaPairs.filter((qa) => {
    // 必须有问题作者和问题内容
    if (!qa.questionAuthor || !qa.questionContent) {
      console.warn(`[Pipeline] Skipping QA: missing questionAuthor or questionContent`);
      return false;
    }
    return true;
  });

  if (validPairs.length === 0) return { qaIds: new Map(), count: 0 };

  // 分批插入（每批最多 10 条，避免 PostgreSQL 参数数量限制）
  const BATCH_SIZE = 10;
  let totalInserted = 0;

  for (let i = 0; i < validPairs.length; i += BATCH_SIZE) {
    const batch = validPairs.slice(i, i + BATCH_SIZE);

    const values = batch.map((qa) => {
      const id = nanoid();
      qaIds.set(qa.questionIndex, id);

      const asker = findMember(qa.questionAuthor);
      const answerer = qa.answerAuthor ? findMember(qa.answerAuthor) : null;

      // 解析时间，确保有默认值
      const questionTime = parseTimeToDate(chatDate, qa.questionTime || '00:00:00');
      // answerTime 需要检查是否为有效字符串（非空且包含冒号）
      const answerTime = (qa.answerTime && qa.answerTime.includes(':'))
        ? parseTimeToDate(chatDate, qa.answerTime)
        : null;

      return {
        id,
        sourceLogId,
        askerId: asker?.id || null,
        askerName: qa.questionAuthor,
        productLine: logMeta.productLine,
        period: logMeta.period,
        groupNumber: logMeta.groupNumber,
        questionContent: qa.questionContent.slice(0, 2000), // 限制长度
        questionTime,
        answererId: answerer?.id || null,
        answererName: qa.answerAuthor || null,
        answererRole: qa.answerRole || answerer?.role || null,
        answerContent: qa.answerContent?.slice(0, 2000) || null,
        answerTime,
        responseMinutes: typeof qa.waitMinutes === 'number' ? qa.waitMinutes : null,
        isResolved: qa.isResolved ?? false,
      };
    });

    await db().insert(qaRecord).values(values);
    totalInserted += values.length;
  }

  return { qaIds, count: totalInserted };
}

// ============================================
// 写入好事记录
// ============================================

async function writeGoodNewsRecords(
  sourceLogId: string,
  chatDate: Date,
  logMeta: { productLine: string; period: string; groupNumber: number },
  goodNewsList: GoodNewsItem[]
): Promise<{ goodNewsIds: Map<number, string>; count: number }> {
  if (goodNewsList.length === 0) return { goodNewsIds: new Map(), count: 0 };

  // 删除旧记录
  await db().delete(goodNews).where(eq(goodNews.sourceLogId, sourceLogId));

  const goodNewsIds = new Map<number, string>();

  // 过滤无效记录
  const validGoodNews = goodNewsList.filter((gn) => {
    if (!gn.author || !gn.content) {
      console.warn(`[Pipeline] Skipping good news: missing author or content`);
      return false;
    }
    return true;
  });

  if (validGoodNews.length === 0) return { goodNewsIds: new Map(), count: 0 };

  const values = validGoodNews.map((gn) => {
    const id = nanoid();
    goodNewsIds.set(gn.messageIndex, id);

    const author = findMember(gn.author);
    const eventTime = (gn.time && gn.time.includes(':'))
      ? parseTimeToDate(chatDate, gn.time)
      : parseTimeToDate(chatDate, '00:00:00');

    return {
      id,
      sourceLogId,
      memberId: author?.id || null,
      productLine: logMeta.productLine,
      period: logMeta.period,
      groupNumber: logMeta.groupNumber,
      authorName: gn.author,
      content: gn.content.slice(0, 2000),
      category: gn.category || 'other',
      revenueLevel: gn.revenueLevel || null,
      milestones: gn.milestones ? JSON.stringify(gn.milestones) : null,
      eventDate: eventTime,
      confidence: gn.confidence || 'medium',
      isVerified: gn.confidence === 'high',  // 高置信度自动验证
    };
  });

  await db().insert(goodNews).values(values);

  // 同时写入标杆学员 (高置信度的收入/里程碑类好事)
  const starCandidates = goodNewsList.filter(
    (gn) => gn.confidence === 'high' && (gn.category === 'revenue' || gn.category === 'milestone')
  );

  if (starCandidates.length > 0) {
    await db().delete(starStudent).where(eq(starStudent.sourceLogId, sourceLogId));

    const starValues = starCandidates.slice(0, 5).map((gn) => {
      const author = findMember(gn.author);
      return {
        id: nanoid(),
        sourceLogId,
        memberId: author?.id,
        productLine: logMeta.productLine,
        period: logMeta.period,
        groupNumber: logMeta.groupNumber,
        studentName: gn.author,
        type: gn.category === 'milestone' ? '里程碑' : '变现',
        achievement: gn.content.slice(0, 500),
        revenueLevel: gn.revenueLevel,
        recordDate: parseTimeToDate(chatDate, gn.time),
        isVerified: true,
      };
    });

    await db().insert(starStudent).values(starValues);
  }

  return { goodNewsIds, count: values.length };
}

// ============================================
// 写入 KOC 记录
// ============================================

async function writeKOCRecords(
  sourceLogId: string,
  chatDate: Date,
  logMeta: { productLine: string; period: string; groupNumber: number },
  kocList: KOCContribution[]
): Promise<{ kocIds: Map<number, string>; count: number }> {
  if (kocList.length === 0) return { kocIds: new Map(), count: 0 };

  // 删除旧记录
  await db().delete(kocRecord).where(eq(kocRecord.sourceLogId, sourceLogId));

  const kocIds = new Map<number, string>();

  // 过滤无效记录
  const validKocList = kocList.filter((koc) => {
    if (!koc.author || !koc.content) {
      console.warn(`[Pipeline] Skipping KOC: missing author or content`);
      return false;
    }
    return true;
  });

  if (validKocList.length === 0) return { kocIds: new Map(), count: 0 };

  const values = validKocList.map((koc) => {
    const id = nanoid();
    kocIds.set(koc.messageIndex, id);

    const author = findMember(koc.author);
    const recordTime = (koc.time && koc.time.includes(':'))
      ? parseTimeToDate(chatDate, koc.time)
      : parseTimeToDate(chatDate, '00:00:00');

    return {
      id,
      sourceLogId,
      memberId: author?.id || null,
      productLine: logMeta.productLine,
      period: logMeta.period,
      groupNumber: logMeta.groupNumber,
      kocName: koc.author,
      contribution: koc.content.slice(0, 1000),
      contributionType: koc.contributionType || 'share',
      recordDate: recordTime,
      isVerified: false,
    };
  });

  await db().insert(kocRecord).values(values);
  return { kocIds, count: values.length };
}

// ============================================
// 写入成员消息记录 (CRM 数据)
// ============================================

async function writeMemberMessages(
  sourceLogId: string,
  logMeta: {
    productLine: string;
    period: string;
    groupNumber: number;
    chatDate: Date;
  },
  rawContent: string,
  result: ChatAnalysisResult,
  qaIds: Map<number, string>,
  goodNewsIds: Map<number, string>,
  kocIds: Map<number, string>
): Promise<number> {
  // 删除旧记录
  await db().delete(memberMessage).where(eq(memberMessage.sourceLogId, sourceLogId));

  // 解析原始消息以获取完整内容
  const preprocessed = parseMessages(rawContent, logMeta.chatDate);
  const messages = preprocessed.messages;

  if (messages.length === 0) return 0;

  // 构建索引映射
  const qaIndexSet = new Set(result.qaPairs.map((qa) => qa.questionIndex));
  const answerIndexMap = new Map<number, number>();  // answerIndex -> questionIndex
  for (const qa of result.qaPairs) {
    if (qa.answerIndex !== undefined) {
      answerIndexMap.set(qa.answerIndex, qa.questionIndex);
    }
  }

  const goodNewsIndexSet = new Set(result.goodNews.map((gn) => gn.messageIndex));
  const kocIndexSet = new Set(result.kocContributions.map((koc) => koc.messageIndex));

  // 批量写入（每批最多 10 条，避免 PostgreSQL 参数数量限制）
  const BATCH_SIZE = 10;
  let totalWritten = 0;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    const values = batch.map((msg, batchIndex) => {
      const globalIndex = i + batchIndex;

      // 确定消息类型
      let messageType: string = 'normal';
      let relatedQaId: string | undefined;
      let relatedGoodNewsId: string | undefined;
      let relatedKocId: string | undefined;

      if (qaIndexSet.has(globalIndex)) {
        messageType = 'question';
        relatedQaId = qaIds.get(globalIndex);
      } else if (answerIndexMap.has(globalIndex)) {
        messageType = 'answer';
        relatedQaId = qaIds.get(answerIndexMap.get(globalIndex)!);
      } else if (goodNewsIndexSet.has(globalIndex)) {
        messageType = 'good_news';
        relatedGoodNewsId = goodNewsIds.get(globalIndex);
      } else if (kocIndexSet.has(globalIndex)) {
        messageType = 'share';
        relatedKocId = kocIds.get(globalIndex);
      }

      // 构建上下文
      const contextBefore = messages
        .slice(Math.max(0, globalIndex - 2), globalIndex)
        .map((m) => ({
          author: m.author,
          content: m.text.slice(0, 100),
          time: m.time,
        }));

      const contextAfter = messages
        .slice(globalIndex + 1, globalIndex + 3)
        .map((m) => ({
          author: m.author,
          content: m.text.slice(0, 100),
          time: m.time,
        }));

      const author = findMember(msg.author);

      // 确保 messageTime 是有效的 Date 对象
      let messageTime: Date;
      if (msg.timestamp instanceof Date && !isNaN(msg.timestamp.getTime())) {
        messageTime = new Date(msg.timestamp.getTime());
      } else if (typeof msg.timestamp === 'string' || typeof msg.timestamp === 'number') {
        messageTime = new Date(msg.timestamp);
      } else {
        messageTime = new Date();
      }
      // 验证
      if (isNaN(messageTime.getTime())) {
        messageTime = new Date();
      }

      return {
        id: nanoid(),
        memberId: author?.id,
        sourceLogId,
        authorName: msg.author,
        authorNormalized: msg.authorNormalized,
        messageContent: msg.text,
        messageTime,
        messageIndex: globalIndex,
        messageType,
        relatedQaId,
        relatedGoodNewsId,
        relatedKocId,
        contextBefore: JSON.stringify(contextBefore),
        contextAfter: JSON.stringify(contextAfter),
        productLine: logMeta.productLine,
        period: logMeta.period,
        groupNumber: logMeta.groupNumber,
      };
    });

    // 过滤无效消息
    const validValues = values.filter((v) => v.messageContent.trim().length > 0);

    if (validValues.length > 0) {
      await db().insert(memberMessage).values(validValues);
      totalWritten += validValues.length;
    }
  }

  return totalWritten;
}

// ============================================
// 更新成员统计
// ============================================

async function updateMemberStats(memberId: string): Promise<void> {
  // 获取成员信息
  const [memberInfo] = await db()
    .select()
    .from(member)
    .where(eq(member.id, memberId));

  if (!memberInfo) return;

  // 统计消息
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

  // 统计活跃天数
  const activeDaysResult = await db()
    .select({
      days: sql<number>`count(distinct date(message_time))`,
    })
    .from(memberMessage)
    .where(eq(memberMessage.memberId, memberId));

  // 统计教练/志愿者专属数据
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

  // 统计 KOC 贡献
  const kocStats = await db()
    .select({
      contributions: sql<number>`count(*)`,
      totalHelped: sql<number>`coalesce(sum(helped_count), 0)`,
    })
    .from(kocRecord)
    .where(eq(kocRecord.memberId, memberId));

  // 更新或插入统计
  const stats = messageStats[0];

  // 安全地转换日期（SQL 返回的可能是字符串、Date-like 对象或 null）
  const toSafeDate = (value: unknown): Date | undefined => {
    if (!value) return undefined;
    try {
      const d = ensureNativeDate(value);
      return d;
    } catch {
      return undefined;
    }
  };

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
    lastActiveDate: toSafeDate(stats?.lastActive),
    firstActiveDate: toSafeDate(stats?.firstActive),
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

// ============================================
// 写入成员标签（LLM 自动标签）
// ============================================

interface TagRecord {
  memberId: string;
  tagCategory: TagCategory;
  tagName: string;
  tagValue?: string | null;
  confidence?: string | null;
  sourceLogId: string;
}

function collectMemberTags(result: ChatAnalysisResult, sourceLogId: string): TagRecord[] {
  const records: TagRecord[] = [];
  if (!result.memberSummaries) return records;

  for (const m of result.memberSummaries) {
    const target = findMember(m.name);
    if (!target) continue;

    const pushTag = (category: TagCategory, value: string, confidence?: string | null) => {
      if (!value) return;
      records.push({
        memberId: target.id,
        tagCategory: category,
        tagName: value,
        tagValue: null,
        confidence: confidence || null,
        sourceLogId,
      });
    };

    if (m.tags) {
      for (const t of m.tags) {
        pushTag((t.category as TagCategory) || 'niche', t.value, t.confidence);
      }
    }
    if (m.sentiment) {
      pushTag('sentiment', m.sentiment, 'medium');
    }
    if (m.riskFlags) {
      m.riskFlags.forEach((r) => pushTag('risk', r, 'medium'));
    }
  }

  return records;
}

async function upsertMemberTags(tags: TagRecord[]) {
  if (!tags.length) return;
  const now = new Date();
  for (const t of tags) {
    try {
      await db()
        .insert(memberTag)
        .values({
          id: nanoid(),
          memberId: t.memberId,
          tagCategory: t.tagCategory,
          tagName: t.tagName,
          tagValue: t.tagValue,
          source: 'llm',
          sourceLogId: t.sourceLogId,
          confidence: t.confidence || null,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [memberTag.memberId, memberTag.tagCategory, memberTag.tagName],
          set: {
            tagValue: t.tagValue ?? null,
            source: 'llm',
            sourceLogId: t.sourceLogId,
            confidence: t.confidence || null,
            updatedAt: now,
          },
        });
    } catch (e) {
      console.warn(`[Pipeline] upsert member tag failed for ${t.memberId} ${t.tagCategory}/${t.tagName}`, e);
    }
  }
}

// ============================================
// 处理单条记录
// ============================================

async function processSingleLog(
  log: typeof rawChatLog.$inferSelect,
  options: PipelineOptions
): Promise<{ success: boolean; stats?: { qa: number; goodNews: number; koc: number; messages: number }; error?: string }> {
  try {
    console.log(`[Pipeline] Analyzing ${log.fileName}...`);

    // 确保 chatDate 是 Date 对象（处理 Drizzle 返回的字符串或 Date-like 对象）
    let chatDateObj: Date;
    if (log.chatDate instanceof Date) {
      chatDateObj = new Date(log.chatDate.getTime());
    } else if (typeof log.chatDate === 'string') {
      chatDateObj = new Date(log.chatDate);
    } else {
      // 处理可能的 Date-like 对象
      chatDateObj = new Date(String(log.chatDate));
    }
    // 验证 Date 对象
    if (isNaN(chatDateObj.getTime())) {
      throw new Error(`Invalid chatDate: ${log.chatDate}`);
    }
    const chatDateStr = chatDateObj.toISOString().split('T')[0];

    // 调用 LLM 分析
    const result = await analyzeChatWithLLM(log.rawContent, {
      fileName: log.fileName,
      chatDate: chatDateStr,
      productLine: log.productLine,
      period: log.period,
      groupNumber: log.groupNumber,
    });

    if (options.dryRun) {
      console.log(`[Pipeline] Dry run - would write ${result.qaPairs.length} QA, ${result.goodNews.length} good news, ${result.kocContributions.length} KOC`);
      return {
        success: true,
        stats: {
          qa: result.qaPairs.length,
          goodNews: result.goodNews.length,
          koc: result.kocContributions.length,
          messages: result.stats.messageCount,
        },
      };
    }

    // 写入数据
    const logMeta = {
      productLine: log.productLine,
      period: log.period,
      groupNumber: log.groupNumber,
      chatDate: chatDateObj,
    };

    // 1. 写入每日统计
    await writeDailyStats(logMeta, result);

    // 2. 写入问答记录
    const { qaIds, count: qaCount } = await writeQARecords(log.id, chatDateObj, logMeta, result.qaPairs);

    // 3. 写入好事记录
    const { goodNewsIds, count: goodNewsCount } = await writeGoodNewsRecords(log.id, chatDateObj, logMeta, result.goodNews);

    // 4. 写入 KOC 记录
    const { kocIds, count: kocCount } = await writeKOCRecords(log.id, chatDateObj, logMeta, result.kocContributions);

    // 5. 写入成员消息记录
    const messagesCount = await writeMemberMessages(
      log.id,
      logMeta,
      log.rawContent,
      result,
      qaIds,
      goodNewsIds,
      kocIds
    );

    // 6. 写入成员标签（LLM 自动标签）
    const tagRecords = collectMemberTags(result, log.id);
    await upsertMemberTags(tagRecords);

    // 6. 更新处理状态
    await db()
      .update(rawChatLog)
      .set({
        status: 'processed',
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(rawChatLog.id, log.id));

    // 7. 收集需要更新统计的成员
    const memberIdsToUpdate = new Set<string>();

    for (const qa of result.qaPairs) {
      const asker = findMember(qa.questionAuthor);
      if (asker) memberIdsToUpdate.add(asker.id);
      if (qa.answerAuthor) {
        const answerer = findMember(qa.answerAuthor);
        if (answerer) memberIdsToUpdate.add(answerer.id);
      }
    }

    for (const gn of result.goodNews) {
      const author = findMember(gn.author);
      if (author) memberIdsToUpdate.add(author.id);
    }

    for (const koc of result.kocContributions) {
      const author = findMember(koc.author);
      if (author) memberIdsToUpdate.add(author.id);
    }
    for (const t of tagRecords) {
      memberIdsToUpdate.add(t.memberId);
    }

    // 8. 更新成员统计（批量）
    for (const memberId of memberIdsToUpdate) {
      await updateMemberStats(memberId);
    }

    console.log(`[Pipeline] ✅ ${log.fileName}: ${qaCount} QA, ${goodNewsCount} good news, ${kocCount} KOC, ${messagesCount} messages`);

    return {
      success: true,
      stats: {
        qa: qaCount,
        goodNews: goodNewsCount,
        koc: kocCount,
        messages: messagesCount,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';
    console.error(`[Pipeline] ❌ ${log.fileName}: ${errorMsg}`);
    if (errorStack) {
      console.error(`[Pipeline] Stack: ${errorStack.split('\n').slice(0, 5).join('\n')}`);
    }

    // 标记失败
    await db()
      .update(rawChatLog)
      .set({
        status: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(rawChatLog.id, log.id));

    return { success: false, error: errorMsg };
  }
}

// ============================================
// 主函数
// ============================================

export async function runLLMAnalysisPipeline(options: PipelineOptions = {}): Promise<PipelineResult> {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║      LLM 分析管道启动                  ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`时间: ${new Date().toLocaleString()}`);
  console.log(`选项: force=${options.force}, limit=${options.limit}, dryRun=${options.dryRun}`);

  // 加载成员映射
  await loadMemberLookup();

  // 获取待处理记录
  let query = db()
    .select()
    .from(rawChatLog)
    .orderBy(asc(rawChatLog.chatDate))
    .$dynamic();

  if (!options.force) {
    query = query.where(eq(rawChatLog.status, 'pending'));
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const logs = await query;
  console.log(`\n找到 ${logs.length} 条待处理记录\n`);

  if (logs.length === 0) {
    return {
      processed: 0,
      failed: 0,
      skipped: 0,
      totalGoodNews: 0,
      totalQA: 0,
      totalKOC: 0,
      errors: [],
    };
  }

  // 处理记录
  const result: PipelineResult = {
    processed: 0,
    failed: 0,
    skipped: 0,
    totalGoodNews: 0,
    totalQA: 0,
    totalKOC: 0,
    errors: [],
  };

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];

    if (options.onProgress) {
      options.onProgress(i + 1, logs.length, log.fileName);
    }

    console.log(`\n[${i + 1}/${logs.length}] ${log.fileName}`);

    const processResult = await processSingleLog(log, options);

    if (processResult.success) {
      result.processed++;
      if (processResult.stats) {
        result.totalQA += processResult.stats.qa;
        result.totalGoodNews += processResult.stats.goodNews;
        result.totalKOC += processResult.stats.koc;
      }
    } else {
      result.failed++;
      result.errors.push({
        fileName: log.fileName,
        error: processResult.error || 'Unknown error',
      });
    }

    // 避免 API 速率限制
    if (i < logs.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // 汇总
  console.log('\n════════════════════════════════════════');
  console.log(`处理完成: ${result.processed} 成功, ${result.failed} 失败`);
  console.log(`提取结果: ${result.totalQA} 问答, ${result.totalGoodNews} 好事, ${result.totalKOC} KOC`);

  if (result.errors.length > 0) {
    console.log('\n失败记录:');
    for (const err of result.errors) {
      console.log(`  - ${err.fileName}: ${err.error}`);
    }
  }

  return result;
}

// ============================================
// 辅助函数
// ============================================

function parseTimeToDate(baseDate: Date, timeStr: string): Date {
  // 使用 ensureNativeDate 确保是原生 Date
  let result = ensureNativeDate(baseDate);

  if (!timeStr) return result;

  const parts = timeStr.split(':');
  if (parts.length >= 2) {
    result.setHours(parseInt(parts[0], 10) || 0);
    result.setMinutes(parseInt(parts[1], 10) || 0);
    if (parts.length >= 3) {
      result.setSeconds(parseInt(parts[2], 10) || 0);
    }
  }

  return result;
}

// ============================================
// 单条记录处理（用于每日导入）
// ============================================

export async function processSingleChatLog(logId: string): Promise<boolean> {
  await loadMemberLookup();

  const [log] = await db()
    .select()
    .from(rawChatLog)
    .where(eq(rawChatLog.id, logId));

  if (!log) {
    console.error(`[Pipeline] Log not found: ${logId}`);
    return false;
  }

  const result = await processSingleLog(log, {});
  return result.success;
}
