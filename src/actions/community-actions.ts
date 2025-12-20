'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/core/db';
import {
  communityGroup,
  communityDailyReport,
  communityStarStudent,
  communityKoc,
  communityImportLog,
} from '@/config/db/schema';
import { communityUser } from '@/config/db/schema-community-user';
import {
  rawChatLog,
  member,
  memberAlias,
  dailyStats,
  goodNews,
  kocRecord,
  starStudent as starStudentV2,
  qaRecord,
  memberMessage,
  memberStats,
} from '@/config/db/schema-community-v2';
import { retryQueue } from '@/config/db/schema-retry';
import { parseCommunityReport, ParsedReport } from '@/lib/community-parser';
import { parseRawChatLog, parseFilenameMeta, timePattern, questionRegex, goodNewsRegex, shareRegex, thanksRegex } from '@/lib/community-raw-parser';
import { extractWithLLM } from '@/lib/community-llm-extractor';
import { eq, and, or } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';

export interface ImportResult {
  success: boolean;
  message: string;
  data?: any;
}

async function safeRevalidate(path: string) {
  try {
    // @ts-ignore
    await revalidatePath(path);
  } catch (e) {
    console.warn('Revalidate skipped:', e);
  }
}

function normalizeName(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·｜|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function slugifyName(name: string) {
  return normalizeName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || nanoid();
}

function normalizePeriodForV2(period?: string | null) {
  if (!period) return '';
  return period.replace(/期$/g, '').trim();
}

function toDateOnly(date: Date | string) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function buildMemberLookup(database: ReturnType<typeof db>) {
  const lookup = new Map<string, string>();
  const members = await database
    .select({ id: member.id, nicknameNormalized: member.nicknameNormalized })
    .from(member)
    .where(eq(member.status, 'active'));
  members.forEach((m: { id: string; nicknameNormalized: string | null }) => {
    if (m.nicknameNormalized) {
      lookup.set(m.nicknameNormalized, m.id);
    }
  });

  const aliases = await database
    .select({ memberId: memberAlias.memberId, alias: memberAlias.alias })
    .from(memberAlias);
  aliases.forEach((a: { memberId: string; alias: string | null }) => {
    if (a.alias) {
      lookup.set(normalizeName(a.alias), a.memberId);
    }
  });

  return lookup;
}

/**
 * 确保 raw_chat_log 至少落库一条占位（便于后续重试/容灾）
 */
async function ensureRawLogPlaceholder(filename: string, rawContent: string, dateOverride?: string) {
  const meta = parseFilenameMeta(filename);
  const productLine = meta.productLine || '未知';
  const period = normalizePeriodForV2(meta.period || '1');
  const groupNumber = parseInt(meta.groupNumber || '1', 10) || 1;
  const statsDate = toDateOnly(dateOverride || meta.dateStr || new Date());

  const existing = await db()
    .select({ id: rawChatLog.id })
    .from(rawChatLog)
    .where(
      and(
        eq(rawChatLog.productLine, productLine),
        eq(rawChatLog.period, period),
        eq(rawChatLog.groupNumber, groupNumber),
        eq(rawChatLog.chatDate, statsDate)
      )
    );

  if (existing.length > 0) {
    return existing[0].id;
  }

  const newId = nanoid();
  await db().insert(rawChatLog).values({
    id: newId,
    productLine,
    period,
    groupNumber,
    chatDate: statsDate,
    fileName: filename,
    rawContent,
    messageCount: 0,
    status: 'pending',
    statusReason: null,
  });
  return newId;
}

async function markRawLogFailed(rawLogId: string | null, reason: string) {
  if (!rawLogId) return;
  try {
    await db()
      .update(rawChatLog)
      .set({ status: 'failed', statusReason: reason, updatedAt: new Date() })
      .where(eq(rawChatLog.id, rawLogId));
  } catch (e) {
    console.error('Failed to mark raw_chat_log failed', e);
  }
}

function parseMessagesForV2(rawText: string, statsDate: Date) {
  const lines = rawText.split(/\r?\n/);
  const messages: {
    author: string;
    time: string;
    hour: number;
    text: string;
    messageTime: Date;
  }[] = [];
  let current: any = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const timeMatch = trimmed.match(timePattern);
    const looksLikeHeader = timeMatch && trimmed.indexOf(timeMatch[0]) > -1;

    if (looksLikeHeader) {
      if (current) messages.push(current);
      const time = timeMatch![0];
      const hour = parseInt(time.slice(0, 2), 10);
      const author = normalizeName(trimmed.replace(time, '')).trim();
      const msgTime = new Date(statsDate);
      msgTime.setHours(parseInt(time.slice(0, 2), 10));
      msgTime.setMinutes(parseInt(time.slice(3, 5), 10));
      msgTime.setSeconds(parseInt(time.slice(6, 8), 10));
      current = { author, time, hour, text: '', messageTime: msgTime };
    } else if (current) {
      current.text = current.text ? `${current.text}\n${trimmed}` : trimmed;
    }
  }

  if (current) messages.push(current);
  return messages;
}

function classifyMessage(text: string) {
  const flat = text.replace(/\s+/g, ' ');
  if (questionRegex.test(flat)) return 'question';
  if (goodNewsRegex.test(flat)) return 'good_news';
  if (shareRegex.test(flat)) return 'share';
  if (thanksRegex.test(flat)) return 'encouragement';
  return 'normal';
}

// --- Helper: ensureMembersForV2 ---
// Upsert members into V2 `member` table to ensure FKs exist.
// Strategy: Nickname -> Slug (UUID) -> Upsert.
async function ensureMembersForV2(
  database: ReturnType<typeof db>,
  names: Set<string>,
  productLine: string,
  period: string
) {
  if (names.size === 0) return;
  const nameArray = Array.from(names);
  
  for (const name of nameArray) {
    if (!name || name.length > 20) continue; // Skip invalid names
    const norm = normalizeName(name);
    if (!norm) continue;

    // 0. 如果已经存在相同 nicknameNormalized，直接跳过（避免每次导入生成一批新 member）
    const existingByNorm = await database.query.member.findFirst({
      where: and(
        eq(member.status, 'active'),
        eq(member.productLine, productLine),
        eq(member.nicknameNormalized, norm)
      ),
    });
    if (existingByNorm) continue;

    // 1. Check alias 
    const aliasRec = await database.query.memberAlias.findFirst({
        where: eq(memberAlias.alias, norm)
    });
    if (aliasRec) continue; // Already mapped

    // 2. Resolve ID (Slug)
    // 注意：不要使用 slugifyName（中文会走 nanoid，导致重复插入）
    const id = nanoid();

    // 3. Upsert Member
    const existing = await database.query.member.findFirst({
        where: eq(member.id, id)
    });

    if (!existing) {
        try {
            await database.insert(member).values({
                id,
                nickname: name,
                nicknameNormalized: norm,
                role: 'student', // Default
                productLine,
                period,
                status: 'active'
            }).onConflictDoNothing();
        } catch (e) {
            console.warn(`Failed to insert member ${name}:`, e);
        }
    }
  }
}

// --- Helper: L1 Filter ---
function filterLowQualityMessages(msgs: any[]) {
    return msgs.filter(m => {
        const text = (m.messageContent || '').trim();
        // 1. Length check
        if (text.length <= 1) return false;
        // 2. Common noise
        // 过滤常见的无效回复，保留可能有意义的互动
        if (/^(收到|哈哈|1|dd|打卡|签到|来了|早|安)$/i.test(text)) return false;
        // 3. Pure emoji/symbol (simple heuristic)
        if (!/[\u4e00-\u9fa5a-zA-Z0-9]/.test(text)) return false; 
        return true;
    });
}

export async function writeV2FromParsedReport(parsed: ParsedReport, rawContent: string, fileName: string) {
  const database = db();
  const productLine = parsed.productLine || '未知';
  const period = normalizePeriodForV2(parsed.period);
  const groupNumber = parseInt(parsed.groupNumber || '1', 10) || 1;
  const statsDate = toDateOnly(parsed.reportDate || new Date());
  const importTime = new Date();

  // 0. Pre-scan names for Upsert (Member Identity Alignment)
  const nameSet = new Set<string>();
  
  // From Raw Messages
  const parsedMessages = parseMessagesForV2(rawContent, statsDate);
  parsedMessages.forEach(m => { if(m.author) nameSet.add(m.author); });
  
  // From LLM extracted lists
  parsed.questions?.forEach(q => {
      if(q.author) nameSet.add(q.author); 
      if(q.answeredBy) nameSet.add(q.answeredBy);
  });
  parsed.goodNews?.forEach(g => { if(g.author) nameSet.add(g.author); });
  parsed.kocs?.forEach(k => { if(k.name) nameSet.add(k.name); });
  parsed.starStudents?.forEach(s => { if(s.name) nameSet.add(s.name); });

  // Execute Upsert
  await ensureMembersForV2(database, nameSet, productLine, period);

  // Re-build lookup to get fresh mappings
  const memberLookup = await buildMemberLookup(database);
  const resolveMemberId = (name?: string | null) => {
    if (!name) return null;
    const key = normalizeName(name);
    return memberLookup.get(key) || null; // Return actual UUID or null
  };

  // 1) raw_chat_log upsert
  let rawLogId = '';
  const existingRaw = await database
    .select({ id: rawChatLog.id })
    .from(rawChatLog)
    .where(
      and(
        eq(rawChatLog.productLine, productLine),
        eq(rawChatLog.period, period),
        eq(rawChatLog.groupNumber, groupNumber),
        eq(rawChatLog.chatDate, statsDate)
      )
    );

  if (existingRaw.length > 0) {
    rawLogId = existingRaw[0].id;
    await database
      .update(rawChatLog)
      .set({
        fileName,
        rawContent,
        messageCount: parsed.messageCount ?? 0,
        status: 'processed',
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(rawChatLog.id, rawLogId));
  } else {
    rawLogId = nanoid();
    await database.insert(rawChatLog).values({
      id: rawLogId,
      productLine,
      period,
      groupNumber,
      chatDate: statsDate,
      fileName,
      rawContent,
      messageCount: parsed.messageCount ?? 0,
      status: 'processed',
      processedAt: new Date(),
    });
  }

  // 2) daily_stats upsert
  const resolvedCount = (parsed.questions || []).filter(
    (q) => q.resolved || q.status === 'resolved'
  ).length;
  const goodNewsCount = parsed.goodNewsCount ?? parsed.goodNews?.length ?? 0;
  const kocCount = parsed.kocs?.length ?? 0;
  const activeUsers = (parsed as any).activeUserCount ?? 0;
  const actionList = parsed.actionItems && parsed.actionItems.length > 0
    ? JSON.stringify({ actionItems: parsed.actionItems })
    : null;

  const existingStats = await database
    .select({ id: dailyStats.id, actionListVerified: dailyStats.actionListVerified })
    .from(dailyStats)
    .where(
      and(
        eq(dailyStats.productLine, productLine),
        eq(dailyStats.period, period),
        eq(dailyStats.groupNumber, groupNumber),
        eq(dailyStats.statsDate, statsDate)
      )
    );

  const dailyPayload = {
    productLine,
    period,
    groupNumber,
    statsDate,
    messageCount: parsed.messageCount ?? 0,
    questionCount: parsed.questionCount ?? 0,
    resolvedCount,
    activeUsers,
    resolutionRate: parsed.resolutionRate ?? null,
    avgResponseMinutes: parsed.avgResponseTime ?? null,
    goodNewsCount,
    kocCount,
    hourlyDistribution: null,
    actionList,
    actionListVerified: existingStats.length > 0 ? existingStats[0].actionListVerified : null,
    createdAt: existingStats.length > 0 ? statsDate : importTime,
    updatedAt: importTime,
  };

  if (existingStats.length > 0) {
    await database.update(dailyStats).set(dailyPayload).where(eq(dailyStats.id, existingStats[0].id));
  } else {
    await database.insert(dailyStats).values({
      id: nanoid(),
      ...dailyPayload,
    });
  }

  // 3) Derived tables: clear existing for this sourceLogId then insert
  await database.delete(goodNews).where(eq(goodNews.sourceLogId, rawLogId));
  await database.delete(kocRecord).where(eq(kocRecord.sourceLogId, rawLogId));
  await database.delete(starStudentV2).where(eq(starStudentV2.sourceLogId, rawLogId));
  await database.delete(qaRecord).where(eq(qaRecord.sourceLogId, rawLogId));
  await database.delete(memberMessage).where(eq(memberMessage.sourceLogId, rawLogId));

  if (parsed.goodNews && parsed.goodNews.length > 0) {
    await database.insert(goodNews).values(
      parsed.goodNews.map((g) => ({
        id: nanoid(),
        sourceLogId: rawLogId,
        memberId: resolveMemberId(g.author), // UUID
        productLine,
        period,
        groupNumber,
        authorName: g.author || '未注明',
        content: g.content,
        eventDate: statsDate,
        category: null,
        revenueLevel: null,
        milestones: null,
        confidence: null,
        isVerified: false,
      }))
    );
  }

  if (parsed.kocs && parsed.kocs.length > 0) {
    await database.insert(kocRecord).values(
      parsed.kocs.map((k) => ({
        id: nanoid(),
        sourceLogId: rawLogId,
        memberId: resolveMemberId(k.name), // UUID
        productLine,
        period,
        groupNumber,
        kocName: k.name,
        contribution: k.contribution,
        contributionType: k.type,
        recordDate: statsDate,
        isVerified: false,
      }))
    );
  }

  if (parsed.starStudents && parsed.starStudents.length > 0) {
    await database.insert(starStudentV2).values(
      parsed.starStudents.map((s) => ({
        id: nanoid(),
        sourceLogId: rawLogId,
        memberId: resolveMemberId(s.name), // UUID
        productLine,
        period,
        groupNumber,
        studentName: s.name,
        type: s.type,
        achievement: s.achievement,
        revenueLevel: null,
        recordDate: statsDate,
        isVerified: false,
      }))
    );
  }

  if (parsed.questions && parsed.questions.length > 0) {
    await database.insert(qaRecord).values(
      parsed.questions.map((q) => ({
        id: nanoid(),
        sourceLogId: rawLogId,
        productLine,
        period,
        groupNumber,
        askerId: resolveMemberId(q.author), // UUID
        askerName: q.author || '未注明',
        questionContent: q.content,
        questionTime: statsDate,
        answererId: resolveMemberId(q.answeredBy), // UUID
        answererName: q.answeredBy || null,
        answerContent: q.reply || null,
        answerTime:
          q.waitMins != null ? new Date(statsDate.getTime() + q.waitMins * 60 * 1000) : null,
        responseMinutes: q.waitMins ?? null,
        isResolved: Boolean(q.resolved || q.status === 'resolved'),
        answererRole: null,
      }))
    );
  }

  // member_message: parse raw chat log AND apply L1 Filter
  if (parsedMessages.length > 0) {
    const rawObjs = parsedMessages
      .map((m, idx) => {
        const content = (m.text || '').trim();
        return {
          id: nanoid(),
          memberId: resolveMemberId(m.author), // UUID
          sourceLogId: rawLogId,
          authorName: m.author || '未知',
          authorNormalized: normalizeName(m.author || ''),
          messageContent: content.slice(0, 2000),
          messageTime: m.messageTime,
          messageIndex: idx,
          messageType: classifyMessage(content),
          relatedQaId: null,
          relatedGoodNewsId: null,
          relatedKocId: null,
          contextBefore: null,
          contextAfter: null,
          productLine,
          period,
          groupNumber,
          status: 'active',
        };
      });

    // Apply L1 Filter
    const filtered = filterLowQualityMessages(rawObjs);

    if (filtered.length > 0) {
      await database.insert(memberMessage).values(filtered);
    }
  }

  // 5) member_stats aggregation (using UUIDs now)
  const msgs = await database
    .select({
      memberId: memberMessage.memberId, // Use memberId grouping first, fallback to authorNormalized
      authorNormalized: memberMessage.authorNormalized,
      cnt: sql<number>`count(*)`,
    })
    .from(memberMessage)
    .where(eq(memberMessage.sourceLogId, rawLogId))
    .groupBy(memberMessage.memberId, memberMessage.authorNormalized);

  for (const m of msgs) {
    const memberId = m.memberId || (m.authorNormalized ? memberLookup.get(m.authorNormalized) : null);
    if (!memberId) continue; // Skip if no member ID (shouldn't happen if we upserted)

    const existing = await database
      .select()
      .from(memberStats)
      .where(eq(memberStats.memberId, memberId));

    const base = {
      memberId,
      productLine,
      period,
      totalMessages: Number(m.cnt) || 0,
      questionCount: 0,
      answerCount: 0,
      goodNewsCount: 0,
      kocContributions: 0,
      activeDays: 1,
      lastActiveDate: statsDate,
      firstActiveDate: statsDate,
      helpedStudents: 0,
    };

    // Recalculate stats based on linked tables (qaRecord etc)
    const qaAsker = await database
      .select({ cnt: sql<number>`count(*)` })
      .from(qaRecord)
      .where(and(eq(qaRecord.sourceLogId, rawLogId), eq(qaRecord.askerId, memberId)));
    const qaAnswer = await database
      .select({ cnt: sql<number>`count(*)` })
      .from(qaRecord)
      .where(and(eq(qaRecord.sourceLogId, rawLogId), eq(qaRecord.answererId, memberId)));
    const gnCnt = await database
      .select({ cnt: sql<number>`count(*)` })
      .from(goodNews)
      .where(and(eq(goodNews.sourceLogId, rawLogId), eq(goodNews.memberId, memberId)));
    const kocCnt = await database
      .select({ cnt: sql<number>`count(*)` })
      .from(kocRecord)
      .where(and(eq(kocRecord.sourceLogId, rawLogId), eq(kocRecord.memberId, memberId)));

    base.questionCount = qaAsker[0]?.cnt ? Number(qaAsker[0].cnt) : 0;
    base.answerCount = qaAnswer[0]?.cnt ? Number(qaAnswer[0].cnt) : 0;
    base.goodNewsCount = gnCnt[0]?.cnt ? Number(gnCnt[0].cnt) : 0;
    base.kocContributions = kocCnt[0]?.cnt ? Number(kocCnt[0].cnt) : 0;
    base.lastActiveDate = statsDate;

    if (existing.length > 0) {
      // upsert aggregate (add counts)
      const prev = existing[0];
      await database
        .update(memberStats)
        .set({
          totalMessages: (prev.totalMessages || 0) + base.totalMessages,
          questionCount: (prev.questionCount || 0) + base.questionCount,
          answerCount: (prev.answerCount || 0) + base.answerCount,
          goodNewsCount: (prev.goodNewsCount || 0) + base.goodNewsCount,
          kocContributions: (prev.kocContributions || 0) + base.kocContributions,
          activeDays: (prev.activeDays || 0) + 1,
          lastActiveDate: statsDate,
        })
        .where(eq(memberStats.memberId, memberId));
    } else {
      await database.insert(memberStats).values({
        id: nanoid(),
        ...base,
      });
    }
  }

  return { rawLogId };
}

async function upsertReport(parsed: ParsedReport) {
  // helper: ensure user exists
  const upsertUser = async (nickname: string, role: 'coach' | 'student' | 'member' = 'member') => {
    if (!nickname) return;
    const id = slugifyName(nickname);
    const existing = await db()
      .select()
      .from(communityUser)
      .where(eq(communityUser.id, id));
    if (existing.length === 0) {
      await db().insert(communityUser).values({
        id,
        nickname,
        normalized: normalizeName(nickname),
        role,
        source: 'import',
      });
    } else {
      await db()
        .update(communityUser)
        .set({
          nickname,
          normalized: normalizeName(nickname),
          role,
          updatedAt: new Date(),
        })
        .where(eq(communityUser.id, id));
    }
  };

  // ensure group
  const existingGroups = await db()
    .select()
    .from(communityGroup)
    .where(
      and(
        eq(communityGroup.productLine, parsed.productLine),
        eq(communityGroup.groupNumber, parseInt(parsed.groupNumber)),
        parsed.period ? eq(communityGroup.period, parsed.period) : undefined
      )
    );
  let groupId = '';
  if (existingGroups.length > 0) {
    groupId = existingGroups[0].id;
  } else {
    groupId = nanoid();
    await db().insert(communityGroup).values({
      id: groupId,
      productLine: parsed.productLine,
      period: parsed.period,
      groupNumber: parseInt(parsed.groupNumber),
      groupName: `${parsed.productLine}${parsed.period ? parsed.period + '期' : ''}${parsed.groupNumber}群`,
    });
  }

  // upsert daily report
  const existingReports = await db()
    .select()
    .from(communityDailyReport)
    .where(and(eq(communityDailyReport.groupId, groupId), eq(communityDailyReport.reportDate, parsed.reportDate)));

  let reportId = '';
  if (existingReports.length > 0) {
    reportId = existingReports[0].id;
    const existingReport = existingReports[0];

    // 基础更新数据（统计信息总是可以更新）
    const updateData: any = {
      messageCount: parsed.messageCount,
      questionCount: parsed.questionCount,
      avgResponseTime: parsed.avgResponseTime ? Math.round(parsed.avgResponseTime) : null,
      resolutionRate: parsed.resolutionRate ? Math.round(parsed.resolutionRate) : null,
      fullReport: parsed.fullText,
      updatedAt: new Date(),
    };

    // 检查是否已审核：如果已审核，保护 activityFeature 和 goodNewsCount
    // @ts-ignore - isVerified 是新字段
    if (!existingReport.isVerified) {
      // 未审核，可以更新 LLM 提取的好事数据
      updateData.goodNewsCount = parsed.goodNewsCount;
      updateData.activityFeature = parsed.goodNews && parsed.goodNews.length > 0 ? JSON.stringify(parsed.goodNews) : null;
      updateData.actionList =
        (parsed.actionItems && parsed.actionItems.length > 0) || (parsed.questions && parsed.questions.length > 0)
          ? JSON.stringify({
              actionItems: parsed.actionItems || [],
              questions: parsed.questions || [],
            })
          : null;
    } else {
      // 已审核，只更新 actionList（问答数据），保护 activityFeature（好事数据）
      updateData.actionList =
        (parsed.actionItems && parsed.actionItems.length > 0) || (parsed.questions && parsed.questions.length > 0)
          ? JSON.stringify({
              actionItems: parsed.actionItems || [],
              questions: parsed.questions || [],
            })
          : null;
      console.log(`[PROTECTED] Report ${reportId} is verified, skipping activityFeature/goodNewsCount update`);
    }

    await db()
      .update(communityDailyReport)
      .set(updateData)
      .where(eq(communityDailyReport.id, reportId));

    // 只有未审核时才重建 star students 和 KOCs
    // @ts-ignore
    if (!existingReport.isVerified) {
      await db().delete(communityStarStudent).where(eq(communityStarStudent.reportId, reportId));
      await db().delete(communityKoc).where(eq(communityKoc.reportId, reportId));
    } else {
      console.log(`[PROTECTED] Report ${reportId} is verified, skipping star students and KOCs rebuild`);
      return { reportId, groupId };
    }
  } else {
    reportId = nanoid();
    await db().insert(communityDailyReport).values({
      id: reportId,
      groupId: groupId,
      reportDate: parsed.reportDate,
      messageCount: parsed.messageCount,
      questionCount: parsed.questionCount,
      avgResponseTime: parsed.avgResponseTime ? Math.round(parsed.avgResponseTime) : null,
      resolutionRate: parsed.resolutionRate ? Math.round(parsed.resolutionRate) : null,
      goodNewsCount: parsed.goodNewsCount,
      activityFeature: parsed.goodNews && parsed.goodNews.length > 0 ? JSON.stringify(parsed.goodNews) : null,
      actionList:
        (parsed.actionItems && parsed.actionItems.length > 0) || (parsed.questions && parsed.questions.length > 0)
          ? JSON.stringify({
              actionItems: parsed.actionItems || [],
              questions: parsed.questions || [],
            })
          : null,
      fullReport: parsed.fullText,
    });
  }

  if (parsed.starStudents.length > 0) {
    await db().insert(communityStarStudent).values(
      parsed.starStudents.map((s) => ({
        id: nanoid(),
        reportId: reportId,
        studentName: s.name,
        type: s.type,
        achievement: s.achievement,
        highlight: s.highlight,
        suggestion: s.suggestion,
      }))
    );
  }

  if (parsed.kocs.length > 0) {
    await db().insert(communityKoc).values(
      parsed.kocs.map((k) => ({
        id: nanoid(),
        reportId: reportId,
        kocName: k.name,
        contribution: k.contribution,
        highlight: k.highlight,
        suggestion: k.suggestion,
      }))
    );
  }

  // Upsert users for questions (asker/answeredBy)
  if (parsed.questions) {
    for (const q of parsed.questions) {
      if (q.author) await upsertUser(q.author, 'student');
      if (q.answeredBy) await upsertUser(q.answeredBy, 'coach');
    }
  }

  return { reportId, groupId };
}

export async function submitDailyReport(filename: string, fileContent: string): Promise<ImportResult> {
  try {
    const parsed = parseCommunityReport(filename, fileContent);
    if (!parsed) {
      return { success: false, message: 'Parsing failed' };
    }

    await upsertReport(parsed);
    await db().insert(communityImportLog).values({
      id: nanoid(),
      fileName: filename,
      status: 'SUCCESS',
      message: `Imported report for ${parsed.productLine} - ${parsed.reportDate.toISOString().split('T')[0]}`,
    });
    safeRevalidate('/community');
    return { success: true, message: 'Report imported successfully' };
  } catch (error) {
    console.error('Import Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    try {
      await db().insert(communityImportLog).values({
        id: nanoid(),
        fileName: filename,
        status: 'FAILED',
        message: errorMessage,
      });
    } catch (e) {
      console.error('Failed to log import error:', e);
    }
    return { success: false, message: `Error: ${errorMessage}` };
  }
}

export async function importRawChatLog(filename: string, fileContent: string): Promise<ImportResult> {
  try {
    const parsed = parseRawChatLog(filename, fileContent);
    await upsertReport(parsed);
    try {
      await writeV2FromParsedReport(parsed, fileContent, filename);
    } catch (e) {
      console.error('V2 sync (raw) failed:', e);
    }
    await db().insert(communityImportLog).values({
      id: nanoid(),
      fileName: filename,
      status: 'SUCCESS',
      message: `Imported raw chat for ${parsed.productLine} - ${parsed.reportDate.toISOString().split('T')[0]}`,
    });
    safeRevalidate('/community');
    return { success: true, message: 'Report imported successfully' };
  } catch (error) {
    console.error('Raw Import Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    try {
      await db().insert(communityImportLog).values({
        id: nanoid(),
        fileName: filename,
        status: 'FAILED',
        message: errorMessage,
      });
    } catch (e) {
      console.error('Failed to log import error:', e);
    }
    return { success: false, message: `Error: ${errorMessage}` };
  }
}

export async function retryFailedImports() {
    const database = db();
    // find pending retries
    const retries = await database.select().from(retryQueue).where(eq(retryQueue.status, 'pending')).limit(5);
    const results = [];
    
    for(const r of retries) {
        try {
            // Find raw log
            const raw = await database.select().from(rawChatLog).where(eq(rawChatLog.id, r.rawLogId));
            if(!raw.length) {
                 await database.update(retryQueue).set({ status: 'failed', error: 'Raw log not found' }).where(eq(retryQueue.id, r.id));
                 continue;
            }
            const log = raw[0];
            
            // Re-run LLM extraction
            const parsed = await extractWithLLM(log.fileName, log.rawContent, log.chatDate.toISOString());
            await writeV2FromParsedReport(parsed, log.rawContent, log.fileName);
            
            await database.update(retryQueue).set({ status: 'success', error: null, updatedAt: new Date() }).where(eq(retryQueue.id, r.id));
            results.push({ id: r.rawLogId, status: 'success' });
        } catch (e) {
            console.error('Retry failed', e);
            await database.update(retryQueue).set({ status: 'failed', error: String(e), updatedAt: new Date() }).where(eq(retryQueue.id, r.id));
            results.push({ id: r.rawLogId, status: 'failed' });
        }
    }
    return results;
}

export async function importRawChatLogWithLLM(
  filename: string,
  fileContent: string,
  dateOverride?: string
): Promise<ImportResult> {
  // 先落 raw_chat_log，占位，便于 LLM 失败时重试
  let rawLogId: string | null = null;
  try {
    rawLogId = await ensureRawLogPlaceholder(filename, fileContent, dateOverride);
    const parsed = await extractWithLLM(filename, fileContent, dateOverride);
    await upsertReport(parsed);
    try {
      const res = await writeV2FromParsedReport(parsed, fileContent, filename);
      rawLogId = res.rawLogId || rawLogId;
    } catch (e) {
      console.error('V2 sync (LLM) failed:', e);
      // fallback: record retry
      await db().insert(retryQueue).values({
        id: nanoid(),
        rawLogId: rawLogId || filename,
        status: 'pending',
        error: e instanceof Error ? e.message : String(e),
      });
    }
    await db().insert(communityImportLog).values({
      id: nanoid(),
      fileName: filename,
      status: 'SUCCESS',
      message: `Imported raw chat with LLM for ${parsed.productLine} - ${parsed.reportDate.toISOString().split('T')[0]}`,
    });
    safeRevalidate('/community');
    return { success: true, message: 'Report imported successfully (LLM)' };
  } catch (error) {
    console.error('Raw LLM Import Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await markRawLogFailed(rawLogId, errorMessage);
    try {
      await db().insert(communityImportLog).values({
        id: nanoid(),
        fileName: filename,
        status: 'FAILED',
        message: `LLM: ${errorMessage}`,
      });
      if (rawLogId) {
        await db().insert(retryQueue).values({
          id: nanoid(),
          rawLogId,
          status: 'pending',
          error: errorMessage,
        });
      }
    } catch (e) {
      console.error('Failed to log raw LLM import error:', e);
    }
    return { success: false, message: `Error: ${errorMessage}` };
  }
}

/**
 * Script-safe version (skips revalidatePath)
 */
export async function importRawChatLogWithLLM_Script(
  filename: string,
  fileContent: string,
  dateOverride?: string
): Promise<ImportResult> {
  let rawLogId: string | null = null;
  try {
    rawLogId = await ensureRawLogPlaceholder(filename, fileContent, dateOverride);
    const parsed = await extractWithLLM(filename, fileContent, dateOverride);
    await upsertReport(parsed);
    try {
      const res = await writeV2FromParsedReport(parsed, fileContent, filename);
      rawLogId = res.rawLogId || rawLogId;
    } catch (e) {
      console.error('V2 sync (LLM Script) failed:', e);
      if (rawLogId) {
        await db().insert(retryQueue).values({
          id: nanoid(),
          rawLogId,
          status: 'pending',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
    await db().insert(communityImportLog).values({
      id: nanoid(),
      fileName: filename,
      status: 'SUCCESS',
      message: `[Script] Imported raw chat with LLM for ${parsed.productLine}`,
    });
    // NO revalidatePath
    return { success: true, message: 'Report imported successfully (LLM Script)' };
  } catch (error) {
    console.error('Script Import Error:', error);
    await markRawLogFailed(rawLogId, error instanceof Error ? error.message : String(error));
    return { success: false, message: `Error: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function getDashboardStats() {
  const reports = await db()
    .select({
      id: communityDailyReport.id,
      reportDate: communityDailyReport.reportDate,
      messageCount: communityDailyReport.messageCount,
      questionCount: communityDailyReport.questionCount,
      avgResponseTime: communityDailyReport.avgResponseTime,
      resolutionRate: communityDailyReport.resolutionRate,
      goodNewsCount: communityDailyReport.goodNewsCount,
      activityFeature: communityDailyReport.activityFeature,
      actionList: communityDailyReport.actionList,
      // 新增：审核后的字段
      activityFeatureVerified: communityDailyReport.activityFeatureVerified,
      goodNewsCountVerified: communityDailyReport.goodNewsCountVerified,
      actionListVerified: communityDailyReport.actionListVerified,
      isVerified: communityDailyReport.isVerified,
      groupName: communityGroup.groupName,
      productLine: communityGroup.productLine,
    })
    .from(communityDailyReport)
    .leftJoin(communityGroup, eq(communityDailyReport.groupId, communityGroup.id))
    .orderBy(communityDailyReport.reportDate);

  const allStarStudents = await db().select().from(communityStarStudent);
  const allKocs = await db().select().from(communityKoc);

  const enhancedReports = reports.map((report: any) => {
    const myStudents = allStarStudents.filter((s: any) => s.reportId === report.id);
    const myKocs = allKocs.filter((k: any) => k.reportId === report.id);

    let goodNewsParsed: { content: string; author?: string; date: string; group: string }[] = [];
    let questionsParsed: any[] = [];
    let actionItemsParsed: any[] = [];

    // 优先使用审核后的数据，如果没有则回退到 LLM 提取的数据
    const activityFeatureToUse = report.activityFeatureVerified || report.activityFeature;
    const actionListToUse = report.actionListVerified || report.actionList;
    const goodNewsCountToUse = report.goodNewsCountVerified ?? report.goodNewsCount;

    if (activityFeatureToUse) {
      try {
        const parsed = JSON.parse(activityFeatureToUse);
        if (Array.isArray(parsed)) {
          goodNewsParsed = parsed.map((item: any) => ({
            content: item.content || '',
            author: item.author || '未注明',
            date: report.reportDate.toISOString().split('T')[0],
            group: report.groupName || '',
          }));
        }
      } catch (e) {
        // ignore
      }
    }

    if (actionListToUse) {
      try {
        const parsed = JSON.parse(actionListToUse);
        if (parsed.questions) questionsParsed = parsed.questions;
        if (parsed.actionItems) actionItemsParsed = parsed.actionItems;
      } catch (e) {
        // ignore
      }
    }

    return {
      ...report,
      // 使用审核后的 goodNewsCount
      goodNewsCount: goodNewsCountToUse,
      starStudents: myStudents,
      starStudentCount: myStudents.length,
      kocs: myKocs,
      kocCount: myKocs.length,
      goodNewsParsed,
      questions: questionsParsed,
      actionItems: actionItemsParsed,
    };
  });

  return enhancedReports;
}

export async function clearCommunityData() {
  try {
    await db().delete(communityStarStudent);
    await db().delete(communityKoc);
    await db().delete(communityDailyReport);
    await db().delete(communityGroup);
    await db().delete(communityImportLog);

    safeRevalidate('/community');
    return { success: true, message: 'All data cleared successfully' };
  } catch (error) {
    console.error('Clear Data Error:', error);
    return { success: false, message: 'Failed to clear data' };
  }
}

export async function getReportById(id: string) {
  const reports = await db()
    .select({
      id: communityDailyReport.id,
      reportDate: communityDailyReport.reportDate,
      messageCount: communityDailyReport.messageCount,
      questionCount: communityDailyReport.questionCount,
      avgResponseTime: communityDailyReport.avgResponseTime,
      resolutionRate: communityDailyReport.resolutionRate,
      goodNewsCount: communityDailyReport.goodNewsCount,
      activityFeature: communityDailyReport.activityFeature,
      actionList: communityDailyReport.actionList,
      fullReport: communityDailyReport.fullReport,
      // 新增：审核后的字段
      activityFeatureVerified: communityDailyReport.activityFeatureVerified,
      goodNewsCountVerified: communityDailyReport.goodNewsCountVerified,
      actionListVerified: communityDailyReport.actionListVerified,
      isVerified: communityDailyReport.isVerified,
      groupName: communityGroup.groupName,
      productLine: communityGroup.productLine,
    })
    .from(communityDailyReport)
    .leftJoin(communityGroup, eq(communityDailyReport.groupId, communityGroup.id))
    .where(eq(communityDailyReport.id, id));

  if (reports.length === 0) return null;
  const report = reports[0];

  const starStudents = await db().select().from(communityStarStudent).where(eq(communityStarStudent.reportId, id));
  const kocs = await db().select().from(communityKoc).where(eq(communityKoc.reportId, id));

  let goodNewsParsed: { content: string; author?: string; date: string; group: string }[] = [];
  let questionsParsed: any[] = [];
  let actionItemsParsed: any[] = [];

  // 优先使用审核后的数据，如果没有则回退到 LLM 提取的数据
  const activityFeatureToUse = report.activityFeatureVerified || report.activityFeature;
  const actionListToUse = report.actionListVerified || report.actionList;
  const goodNewsCountToUse = report.goodNewsCountVerified ?? report.goodNewsCount;

  if (activityFeatureToUse) {
    try {
      const parsed = JSON.parse(activityFeatureToUse);
      if (Array.isArray(parsed)) {
        goodNewsParsed = parsed.map((item: any) => ({
          content: item.content || '',
          author: item.author || '未注明',
          date: report.reportDate.toISOString().split('T')[0],
          group: report.groupName || '',
        }));
      }
    } catch (e) {
      // ignore
    }
  }

  if (actionListToUse) {
    try {
      const parsed = JSON.parse(actionListToUse);
      if (parsed.questions) questionsParsed = parsed.questions;
      if (parsed.actionItems) actionItemsParsed = parsed.actionItems;
    } catch (e) {
      // ignore
    }
  }

  return {
    ...report,
    // 使用审核后的 goodNewsCount
    goodNewsCount: goodNewsCountToUse,
    starStudents,
    kocs,
    goodNewsParsed,
    questions: questionsParsed,
    actionItems: actionItemsParsed,
  };
}
