'use server';

/**
 * 社群数据 V2 操作层
 *
 * 提供对新架构数据的访问:
 * - rawChatLog: 原始群聊记录
 * - member: 成员信息（含标签）
 * - dailyStats: 每日统计
 * - goodNews: 好事记录
 * - kocRecord: KOC贡献
 * - qaRecord: 问答记录
 * - starStudent: 标杆学员
 */

import { db } from '@/core/db';
import {
  rawChatLog,
  member,
  memberStats,
  memberTag,
  dailyStats,
  goodNews,
  kocRecord,
  qaRecord,
  starStudent,
  tagCatalog,
} from '@/config/db/schema-community-v2';
import { eq, and, gte, lte, sql, desc, asc, like, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { parseFilenameMeta } from '@/lib/community-raw-parser';
import { processSingleChatLog } from '@/lib/llm-analysis-pipeline';

// ============================================
// 成员相关
// ============================================

export interface MemberFilters {
  role?: 'coach' | 'volunteer' | 'student';
  productLine?: string;
  period?: string;
  activityLevel?: string;
  revenueLevel?: string;
  status?: 'active' | 'expired';
  search?: string;
}

export async function getMembers(filters: MemberFilters = {}) {
  let query = db().select().from(member).$dynamic();

  // 构建 WHERE 条件
  const conditions: any[] = [];

  if (filters.role) {
    conditions.push(eq(member.role, filters.role));
  }
  if (filters.productLine) {
    conditions.push(eq(member.productLine, filters.productLine));
  }
  if (filters.period) {
    conditions.push(eq(member.period, filters.period));
  }
  if (filters.activityLevel) {
    conditions.push(eq(member.activityLevel, filters.activityLevel));
  }
  if (filters.revenueLevel) {
    conditions.push(eq(member.revenueLevel, filters.revenueLevel));
  }
  if (filters.status) {
    conditions.push(eq(member.status, filters.status));
  }
  if (filters.search) {
    conditions.push(like(member.nickname, `%${filters.search}%`));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const members = await query.orderBy(asc(member.nickname));
  return members;
}

export async function getMemberById(id: string) {
  const members = await db()
    .select()
    .from(member)
    .where(eq(member.id, id));
  return members[0] || null;
}

export async function getMemberStats() {
  const allMembers = await db().select().from(member);

  const stats = {
    total: allMembers.length,
    byRole: {
      coach: allMembers.filter((m: any) => m.role === 'coach').length,
      volunteer: allMembers.filter((m: any) => m.role === 'volunteer').length,
      student: allMembers.filter((m: any) => m.role === 'student').length,
    },
    byStatus: {
      active: allMembers.filter((m: any) => m.status === 'active').length,
      expired: allMembers.filter((m: any) => m.status === 'expired').length,
    },
    byActivityLevel: {
      high: allMembers.filter((m: any) => m.activityLevel === '高活').length,
      medium: allMembers.filter((m: any) => m.activityLevel === '中活').length,
      low: allMembers.filter((m: any) => m.activityLevel === '低活').length,
      silent: allMembers.filter((m: any) => m.activityLevel === '沉默').length,
    },
    byRevenueLevel: {
      none: allMembers.filter((m: any) => m.revenueLevel === '未变现').length,
      small: allMembers.filter((m: any) => m.revenueLevel === '小额(<100)').length,
      hundred: allMembers.filter((m: any) => m.revenueLevel === '百元级').length,
      thousand: allMembers.filter((m: any) => m.revenueLevel === '千元级').length,
      tenThousand: allMembers.filter((m: any) => m.revenueLevel === '万元级').length,
    },
  };

  return stats;
}

export async function updateMemberTags(
  memberId: string,
  tags: {
    activityLevel?: string;
    circleIdentity?: string;
    location?: string;
    progressAiProduct?: string;
    progressYoutube?: string;
    progressBilibili?: string;
    milestones?: string;
    revenueLevel?: string;
    niche?: string;
  }
) {
  await db()
    .update(member)
    .set({
      ...tags,
      updatedAt: new Date(),
    })
    .where(eq(member.id, memberId));
}

// ============================================
// 原始群聊记录相关
// ============================================

export interface ChatLogFilters {
  productLine?: string;
  period?: string;
  groupNumber?: number;
  dateFrom?: Date;
  dateTo?: Date;
  status?: 'pending' | 'processed' | 'failed';
}

export async function getRawChatLogs(filters: ChatLogFilters = {}) {
  let query = db()
    .select({
      id: rawChatLog.id,
      productLine: rawChatLog.productLine,
      period: rawChatLog.period,
      groupNumber: rawChatLog.groupNumber,
      chatDate: rawChatLog.chatDate,
      fileName: rawChatLog.fileName,
      messageCount: rawChatLog.messageCount,
      status: rawChatLog.status,
      processedAt: rawChatLog.processedAt,
      createdAt: rawChatLog.createdAt,
    })
    .from(rawChatLog)
    .$dynamic();

  const conditions: any[] = [];

  if (filters.productLine) {
    conditions.push(eq(rawChatLog.productLine, filters.productLine));
  }
  if (filters.period) {
    conditions.push(eq(rawChatLog.period, filters.period));
  }
  if (filters.groupNumber) {
    conditions.push(eq(rawChatLog.groupNumber, filters.groupNumber));
  }
  if (filters.status) {
    conditions.push(eq(rawChatLog.status, filters.status));
  }
  if (filters.dateFrom) {
    conditions.push(gte(rawChatLog.chatDate, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(rawChatLog.chatDate, filters.dateTo));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const logs = await query.orderBy(desc(rawChatLog.chatDate));
  return logs;
}

export async function getRawChatLogById(id: string) {
  const logs = await db()
    .select()
    .from(rawChatLog)
    .where(eq(rawChatLog.id, id));
  return logs[0] || null;
}

export async function getChatLogStats() {
  const allLogs = await db().select().from(rawChatLog);

  const stats = {
    total: allLogs.length,
    byStatus: {
      pending: allLogs.filter((l: any) => l.status === 'pending').length,
      processed: allLogs.filter((l: any) => l.status === 'processed').length,
      failed: allLogs.filter((l: any) => l.status === 'failed').length,
    },
    byPeriod: {} as Record<string, number>,
    totalMessages: allLogs.reduce((sum: number, l: any) => sum + (l.messageCount || 0), 0),
  };

  // 按期数统计
  for (const log of allLogs) {
    const key = `${log.period}期`;
    stats.byPeriod[key] = (stats.byPeriod[key] || 0) + 1;
  }

  return stats;
}

// ============================================
// 好事记录相关
// ============================================

export async function getGoodNews(options: {
  limit?: number;
  dateFrom?: Date;
  dateTo?: Date;
  verified?: boolean;
} = {}) {
  let query = db()
    .select({
      id: goodNews.id,
      authorName: goodNews.authorName,
      content: goodNews.content,
      category: goodNews.category,
      eventDate: goodNews.eventDate,
      isVerified: goodNews.isVerified,
      memberId: goodNews.memberId,
    })
    .from(goodNews)
    .$dynamic();

  const conditions: any[] = [];

  if (options.verified !== undefined) {
    conditions.push(eq(goodNews.isVerified, options.verified));
  }
  if (options.dateFrom) {
    conditions.push(gte(goodNews.eventDate, options.dateFrom));
  }
  if (options.dateTo) {
    conditions.push(lte(goodNews.eventDate, options.dateTo));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  query = query.orderBy(desc(goodNews.eventDate));

  if (options.limit) {
    query = query.limit(options.limit);
  }

  return await query;
}

// ============================================
// KOC 贡献相关
// ============================================

export async function getKocRecords(options: {
  limit?: number;
  dateFrom?: Date;
  dateTo?: Date;
  verified?: boolean;
} = {}) {
  let query = db()
    .select({
      id: kocRecord.id,
      kocName: kocRecord.kocName,
      contribution: kocRecord.contribution,
      contributionType: kocRecord.contributionType,
      recordDate: kocRecord.recordDate,
      isVerified: kocRecord.isVerified,
      memberId: kocRecord.memberId,
    })
    .from(kocRecord)
    .$dynamic();

  const conditions: any[] = [];

  if (options.verified !== undefined) {
    conditions.push(eq(kocRecord.isVerified, options.verified));
  }
  if (options.dateFrom) {
    conditions.push(gte(kocRecord.recordDate, options.dateFrom));
  }
  if (options.dateTo) {
    conditions.push(lte(kocRecord.recordDate, options.dateTo));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  query = query.orderBy(desc(kocRecord.recordDate));

  if (options.limit) {
    query = query.limit(options.limit);
  }

  return await query;
}

// ============================================
// 标杆学员相关
// ============================================

export async function getStarStudents(options: {
  limit?: number;
  type?: string;
  dateFrom?: Date;
  dateTo?: Date;
  verified?: boolean;
} = {}) {
  let query = db()
    .select({
      id: starStudent.id,
      studentName: starStudent.studentName,
      type: starStudent.type,
      achievement: starStudent.achievement,
      revenueLevel: starStudent.revenueLevel,
      recordDate: starStudent.recordDate,
      isVerified: starStudent.isVerified,
      memberId: starStudent.memberId,
    })
    .from(starStudent)
    .$dynamic();

  const conditions: any[] = [];

  if (options.type) {
    conditions.push(eq(starStudent.type, options.type));
  }
  if (options.verified !== undefined) {
    conditions.push(eq(starStudent.isVerified, options.verified));
  }
  if (options.dateFrom) {
    conditions.push(gte(starStudent.recordDate, options.dateFrom));
  }
  if (options.dateTo) {
    conditions.push(lte(starStudent.recordDate, options.dateTo));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  query = query.orderBy(desc(starStudent.recordDate));

  if (options.limit) {
    query = query.limit(options.limit);
  }

  return await query;
}

// ============================================
// 问答记录相关
// ============================================

export async function getQaRecords(options: {
  limit?: number;
  dateFrom?: Date;
  dateTo?: Date;
  resolved?: boolean;
} = {}) {
  let query = db()
    .select({
      id: qaRecord.id,
      askerName: qaRecord.askerName,
      questionContent: qaRecord.questionContent,
      questionTime: qaRecord.questionTime,
      answererName: qaRecord.answererName,
      answererRole: qaRecord.answererRole,
      answerContent: qaRecord.answerContent,
      answerTime: qaRecord.answerTime,
      responseMinutes: qaRecord.responseMinutes,
      isResolved: qaRecord.isResolved,
    })
    .from(qaRecord)
    .$dynamic();

  const conditions: any[] = [];

  if (options.resolved !== undefined) {
    conditions.push(eq(qaRecord.isResolved, options.resolved));
  }
  if (options.dateFrom) {
    conditions.push(gte(qaRecord.questionTime, options.dateFrom));
  }
  if (options.dateTo) {
    conditions.push(lte(qaRecord.questionTime, options.dateTo));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  query = query.orderBy(desc(qaRecord.questionTime));

  if (options.limit) {
    query = query.limit(options.limit);
  }

  return await query;
}

// ============================================
// 每日统计相关
// ============================================

export async function getDailyStats(options: {
  productLine?: string;
  period?: string;
  dateFrom?: Date;
  dateTo?: Date;
} = {}) {
  let query = db()
    .select()
    .from(dailyStats)
    .$dynamic();

  const conditions: any[] = [];

  if (options.productLine) {
    conditions.push(eq(dailyStats.productLine, options.productLine));
  }
  if (options.period) {
    conditions.push(eq(dailyStats.period, options.period));
  }
  if (options.dateFrom) {
    conditions.push(gte(dailyStats.statsDate, options.dateFrom));
  }
  if (options.dateTo) {
    conditions.push(lte(dailyStats.statsDate, options.dateTo));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  return await query.orderBy(desc(dailyStats.statsDate));
}

// ============================================
// 综合面板数据
// ============================================

export async function getDashboardOverview() {
  // 成员统计
  const memberStats = await getMemberStats();

  // 群聊记录统计
  const chatLogStats = await getChatLogStats();

  // 最近好事（从 V2 表，如果没有则返回空）
  const recentGoodNews = await getGoodNews({ limit: 10, verified: true });

  // 最近 KOC
  const recentKocs = await getKocRecords({ limit: 5 });

  // 最近问答
  const recentQa = await getQaRecords({ limit: 10 });

  return {
    members: memberStats,
    chatLogs: chatLogStats,
    recentGoodNews,
    recentKocs,
    recentQa,
  };
}

// ============================================
// 兼容旧版前端的面板数据
// ============================================

/**
 * 获取面板统计数据（兼容旧版前端格式）
 * 从 V2 表读取数据，但返回与旧版 getDashboardStats 兼容的格式
 */
export async function getDashboardStatsV2() {
  // 获取每日统计
  const stats = await db()
    .select()
    .from(dailyStats)
    .orderBy(asc(dailyStats.statsDate));

  // 获取所有好事（仅已审核）
  const allGoodNews = (
    await db().select().from(goodNews)
  ).filter((g: typeof goodNews.$inferSelect) => g.isVerified);

  // 获取所有 KOC
  const allKocs = await db().select().from(kocRecord);

  // 获取所有问答
  const allQa = await db().select().from(qaRecord);

  const normalizeName = (name: string) =>
    name
      .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
      .replace(/[-_—–·•‧·｜|].*$/, '')
      .replace(/\s+/g, '')
      .trim()
      .toLowerCase();

  const normalizeTagValue = (value: string) =>
    value.replace(/\s+/g, '').trim().toLowerCase();

  const weakExpertise = new Set(['技术', '产品', '运营', '增长', '营销', '商务', '综合', '全栈', '默认']);
  const weakNiche = new Set(['AI工具', 'AI应用', '工具', '工具类', 'AI产品', 'AI']);

  const members = await db()
    .select({
      id: member.id,
      nickname: member.nickname,
      nicknameNormalized: member.nicknameNormalized,
      role: member.role,
      questionCount: memberStats.questionCount,
    })
    .from(member)
    .leftJoin(memberStats, eq(member.id, memberStats.memberId));

  type MemberRow = (typeof members)[number];
  const memberById = new Map<string, MemberRow>();
  const memberByNormalized = new Map<string, MemberRow>();
  members.forEach((m: MemberRow) => {
    memberById.set(m.id, m);
    const key = m.nicknameNormalized || normalizeName(m.nickname || '');
    if (key) {
      memberByNormalized.set(key, m);
    }
  });

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

  const memberTags = await db()
    .select({
      memberId: memberTag.memberId,
      category: memberTag.tagCategory,
      name: memberTag.tagName,
      confidence: memberTag.confidence,
      updatedAt: memberTag.updatedAt,
    })
    .from(memberTag)
    .where(inArray(memberTag.tagCategory, ['expertise', 'niche']));

  type MemberTagRow = (typeof memberTags)[number];
  const tagByMember = new Map<string, { expertise: typeof memberTags; niche: typeof memberTags }>();
  memberTags.forEach((tag: MemberTagRow) => {
    if (!tag.memberId || !tag.name) return;
    const normalized = normalizeTagValue(tag.name);
    if (!normalized) return;
    const inactiveKey = `${tag.category}:${normalized}`;
    if (inactiveSet.has(inactiveKey)) return;
    if (tag.category === 'expertise' && weakExpertise.has(normalized)) return;
    if (tag.category === 'niche' && weakNiche.has(normalized)) return;

    const entry = tagByMember.get(tag.memberId) || { expertise: [], niche: [] };
    entry[tag.category === 'expertise' ? 'expertise' : 'niche'].push(tag);
    tagByMember.set(tag.memberId, entry);
  });

  const confidenceRank = (value?: string | null) =>
    value === 'high' ? 3 : value === 'medium' ? 2 : value === 'low' ? 1 : 0;

  const pickTags = (tags: typeof memberTags) => {
    const seen = new Set<string>();
    return [...tags]
      .sort((a, b) => {
        const confidence = confidenceRank(b.confidence) - confidenceRank(a.confidence);
        if (confidence !== 0) return confidence;
        const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bTime - aTime;
      })
      .filter((tag) => {
        const key = normalizeTagValue(tag.name || '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((tag) => tag.name || '')
      .filter(Boolean);
  };

  const resolveMemberInfo = (koc: any) => {
    if (koc?.memberId && memberById.has(koc.memberId)) {
      return memberById.get(koc.memberId) || null;
    }
    const key = normalizeName(koc?.kocName || '');
    return memberByNormalized.get(key) || null;
  };

  // 获取所有标杆学员
  const allStarStudents = await db().select().from(starStudent);

  // 按来源 ID 分组好事
  const goodNewsBySource = new Map<string, typeof allGoodNews>();
  for (const n of allGoodNews) {
    const key = n.sourceLogId;
    if (!goodNewsBySource.has(key)) {
      goodNewsBySource.set(key, []);
    }
    goodNewsBySource.get(key)!.push(n);
  }

  // 按来源 ID 分组 KOC
  const kocsBySource = new Map<string, typeof allKocs>();
  for (const k of allKocs) {
    const key = k.sourceLogId;
    if (!kocsBySource.has(key)) {
      kocsBySource.set(key, []);
    }
    kocsBySource.get(key)!.push(k);
  }

  // 按来源 ID 分组问答
  const qaBySource = new Map<string, typeof allQa>();
  for (const q of allQa) {
    const key = q.sourceLogId;
    if (!qaBySource.has(key)) {
      qaBySource.set(key, []);
    }
    qaBySource.get(key)!.push(q);
  }

  // 按来源 ID 分组标杆学员
  const starsBySource = new Map<string, typeof allStarStudents>();
  for (const s of allStarStudents) {
    const key = s.sourceLogId;
    if (!starsBySource.has(key)) {
      starsBySource.set(key, []);
    }
    starsBySource.get(key)!.push(s);
  }

  // 获取 rawChatLog 的 ID 映射（用于关联 sourceLogId）
  const rawLogs = await db()
    .select({ id: rawChatLog.id, productLine: rawChatLog.productLine, period: rawChatLog.period, groupNumber: rawChatLog.groupNumber, chatDate: rawChatLog.chatDate })
    .from(rawChatLog);

  const rawLogMap = new Map<string, typeof rawLogs[0]>();
  for (const log of rawLogs) {
    rawLogMap.set(log.id, log);
  }

  // 转换为旧版格式
  const enhancedReports = stats.map((stat: any) => {
    // 找到对应的 rawChatLog ID
    const matchingLog = rawLogs.find(
      (log: any) =>
        log.productLine === stat.productLine &&
        log.period === stat.period &&
        log.groupNumber === stat.groupNumber &&
        log.chatDate.toDateString() === stat.statsDate.toDateString()
    );

    const sourceLogId = matchingLog?.id || '';

    // 获取该来源的数据
    const dayGoodNews = goodNewsBySource.get(sourceLogId) || [];
    const dayKocs = kocsBySource.get(sourceLogId) || [];
    const dayStars = starsBySource.get(sourceLogId) || [];
    const dayQa = qaBySource.get(sourceLogId) || [];

    // 构建 groupName
    const groupName = `${stat.productLine}${stat.period}期${stat.groupNumber}群`;

    const verifiedGoodNewsCount = dayGoodNews.length;

    return {
      id: stat.id,
      reportDate: stat.statsDate,
      messageCount: stat.messageCount,
      questionCount: stat.questionCount,
      avgResponseTime: stat.avgResponseMinutes,
      resolutionRate: stat.resolutionRate,
      goodNewsCount: verifiedGoodNewsCount,
      groupName,
      productLine: stat.productLine,
      // 标杆学员（兼容旧格式）
      starStudents: dayStars.map((s: any) => ({
        id: s.id,
        studentName: s.studentName,
        type: s.type,
        achievement: s.achievement,
      })),
      starStudentCount: dayStars.length,
      // KOC（兼容旧格式）
      kocs: dayKocs.map((k: any) => {
        const memberInfo = resolveMemberInfo(k);
        const memberId = memberInfo?.id || k.memberId || null;
        const tagEntry = memberId ? tagByMember.get(memberId) : null;
        const expertiseTags = tagEntry ? pickTags(tagEntry.expertise).slice(0, 3) : [];
        const nicheTags = tagEntry ? pickTags(tagEntry.niche).slice(0, 3) : [];
        const resolvedExpertise = expertiseTags.length > 0 ? expertiseTags : nicheTags;
        return {
        id: k.id,
        kocName: k.kocName,
        contribution: k.contribution,
        model: k.model,
        coreAchievement: k.coreAchievement,
        highlightQuote: k.highlightQuote,
        suggestedTitle: k.suggestedTitle,
        messageIndex: k.messageIndex,
        sourceLogId: k.sourceLogId,
        memberId,
        memberRole: memberInfo?.role || null,
        memberQuestionCount: memberInfo?.questionCount ?? null,
        expertiseTags: resolvedExpertise,
        title: k.suggestedTitle,
        tags: k.tags,
        reason: k.reason,
        score: k.scoreTotal != null || k.scoreReproducibility != null || k.scoreScarcity != null || k.scoreValidation != null
          ? {
              reproducibility: k.scoreReproducibility ?? undefined,
              scarcity: k.scoreScarcity ?? undefined,
              validation: k.scoreValidation ?? undefined,
              total: k.scoreTotal ?? undefined,
            }
          : null,
        recordDate: k.recordDate,
      };
      }),
      kocCount: dayKocs.length,
      // 好事（解析后的格式）
      goodNewsParsed: dayGoodNews.map((n: any) => ({
        content: n.content,
        author: n.authorName,
        date: n.eventDate.toISOString().split('T')[0],
        group: groupName,
      })),
      // 兼容字段
      questions: dayQa.map((q: any) => ({
        id: q.id,
        content: q.questionContent,
        author: q.askerName,
        answer: q.answerContent,
        a: q.answerContent,
        waitMins: q.responseMinutes,
        isResolved: q.isResolved,
        questionTime: q.questionTime,
        answerTime: q.answerTime,
        answerer: q.answererName,
      })),
      actionItems: [],
    };
  });

  return enhancedReports;
}

// ============================================
// V2 导入功能
// ============================================

export interface ImportResult {
  success: boolean;
  message: string;
  data?: {
    logId?: string;
    stats?: {
      qa: number;
      goodNews: number;
      koc: number;
    };
  };
}

/**
 * 安全地调用 revalidatePath
 */
async function safeRevalidate(path: string) {
  try {
    await revalidatePath(path);
  } catch (e) {
    console.warn('[V2 Import] Revalidate skipped:', e);
  }
}

/**
 * 计算文件内容的 MD5 哈希
 */
function getFileHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * 统计消息数（简单按消息格式行数估算）
 */
function countMessages(content: string): number {
  // 匹配消息格式: 昵称 日期 时间 或 昵称(wxid) 日期 时间
  const messagePattern = /^.+\s+\d{2}:\d{2}:\d{2}/gm;
  const matches = content.match(messagePattern);
  return matches ? matches.length : 0;
}

/**
 * V2 版本的导入函数
 *
 * 流程：
 * 1. 解析文件名获取元信息
 * 2. 写入 rawChatLog 表（保存原始数据）
 * 3. 调用 LLM 分析管道处理
 * 4. 分析结果写入新表（dailyStats, goodNews, kocRecord, qaRecord 等）
 */
export async function importRawChatLogV2(
  filename: string,
  fileContent: string,
  dateOverride?: string
): Promise<ImportResult> {
  try {
    console.log(`[V2 Import] Starting import: ${filename}`);

    // 1. 解析文件名
    const meta = parseFilenameMeta(filename);
    const chatDateStr = dateOverride || meta.dateStr;
    const chatDate = new Date(chatDateStr);

    // 提取期数（去掉"期"字）
    let period = meta.period;
    if (period && period.endsWith('期')) {
      period = period.replace('期', '');
    }

    // 提取群号
    let groupNumber = parseInt(meta.groupNumber || '1', 10);
    if (isNaN(groupNumber)) groupNumber = 1;

    console.log(`[V2 Import] Parsed meta:`, {
      productLine: meta.productLine,
      period,
      groupNumber,
      chatDate: chatDateStr,
    });

    // 2. 计算文件哈希
    const fileHash = getFileHash(fileContent);
    const messageCount = countMessages(fileContent);

    // 3. 检查是否已存在
    const existing = await db()
      .select()
      .from(rawChatLog)
      .where(
        and(
          eq(rawChatLog.productLine, meta.productLine),
          eq(rawChatLog.period, period || '1'),
          eq(rawChatLog.groupNumber, groupNumber),
          eq(rawChatLog.chatDate, chatDate)
        )
      );

    let logId: string;

    if (existing.length > 0) {
      // 检查内容是否有变化
      if (existing[0].fileHash === fileHash) {
        console.log(`[V2 Import] Content unchanged, skipping: ${filename}`);
        // 内容没变，但仍然需要触发分析（如果之前失败了）
        if (existing[0].status === 'processed') {
          return {
            success: true,
            message: '文件内容无变化，已跳过',
            data: { logId: existing[0].id },
          };
        }
      }

      // 更新现有记录
      logId = existing[0].id;
      await db()
        .update(rawChatLog)
        .set({
          rawContent: fileContent,
          fileHash,
          messageCount,
          fileName: filename,
          status: 'pending', // 重置状态，需要重新分析
          updatedAt: new Date(),
        })
        .where(eq(rawChatLog.id, logId));

      console.log(`[V2 Import] Updated existing record: ${logId}`);
    } else {
      // 新增记录
      logId = nanoid();
      await db().insert(rawChatLog).values({
        id: logId,
        productLine: meta.productLine,
        period: period || '1',
        groupNumber,
        chatDate,
        fileName: filename,
        fileHash,
        rawContent: fileContent,
        messageCount,
        status: 'pending',
      });

      console.log(`[V2 Import] Created new record: ${logId}`);
    }

    // 4. 调用 LLM 分析管道
    console.log(`[V2 Import] Starting LLM analysis for: ${logId}`);
    const analysisSuccess = await processSingleChatLog(logId);

    if (!analysisSuccess) {
      // 分析失败，更新状态
      await db()
        .update(rawChatLog)
        .set({
          status: 'failed',
          statusReason: 'LLM analysis failed',
          updatedAt: new Date(),
        })
        .where(eq(rawChatLog.id, logId));

      return {
        success: false,
        message: 'LLM 分析失败，请检查日志',
        data: { logId },
      };
    }

    // 5. 刷新缓存
    await safeRevalidate('/community');

    console.log(`[V2 Import] Successfully imported: ${filename}`);

    return {
      success: true,
      message: '导入成功（V2 流程）',
      data: { logId },
    };
  } catch (error) {
    console.error('[V2 Import] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `导入失败: ${errorMessage}`,
    };
  }
}
