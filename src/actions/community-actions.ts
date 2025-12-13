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
import { parseCommunityReport, ParsedReport } from '@/lib/community-parser';
import { parseRawChatLog } from '@/lib/community-raw-parser';
import { extractWithLLM } from '@/lib/community-llm-extractor';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

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
    .replace(/[-_—–·•‧·].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function slugifyName(name: string) {
  return normalizeName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || nanoid();
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
    await db()
      .update(communityDailyReport)
      .set({
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
        updatedAt: new Date(),
      })
      .where(eq(communityDailyReport.id, reportId));

    await db().delete(communityStarStudent).where(eq(communityStarStudent.reportId, reportId));
    await db().delete(communityKoc).where(eq(communityKoc.reportId, reportId));
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

export async function importRawChatLogWithLLM(
  filename: string,
  fileContent: string,
  dateOverride?: string
): Promise<ImportResult> {
  try {
    const parsed = await extractWithLLM(filename, fileContent, dateOverride);
    await upsertReport(parsed);
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
    try {
      await db().insert(communityImportLog).values({
        id: nanoid(),
        fileName: filename,
        status: 'FAILED',
        message: `LLM: ${errorMessage}`,
      });
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
  try {
    const parsed = await extractWithLLM(filename, fileContent, dateOverride);
    await upsertReport(parsed);
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
      groupName: communityGroup.groupName,
      productLine: communityGroup.productLine,
    })
    .from(communityDailyReport)
    .leftJoin(communityGroup, eq(communityDailyReport.groupId, communityGroup.id))
    .orderBy(communityDailyReport.reportDate);

  const allStarStudents = await db().select().from(communityStarStudent);
  const allKocs = await db().select().from(communityKoc);

  const enhancedReports = reports.map((report) => {
    const myStudents = allStarStudents.filter((s) => s.reportId === report.id);
    const myKocs = allKocs.filter((k) => k.reportId === report.id);

    let goodNewsParsed: { content: string; author?: string; date: string; group: string }[] = [];
    let questionsParsed: any[] = [];
    let actionItemsParsed: any[] = [];

    if (report.activityFeature) {
      try {
        const parsed = JSON.parse(report.activityFeature);
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

    if (report.actionList) {
      try {
        const parsed = JSON.parse(report.actionList);
        if (parsed.questions) questionsParsed = parsed.questions;
        if (parsed.actionItems) actionItemsParsed = parsed.actionItems;
      } catch (e) {
        // ignore
      }
    }

    return {
      ...report,
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

  if (report.activityFeature) {
    try {
      const parsed = JSON.parse(report.activityFeature);
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

  if (report.actionList) {
    try {
      const parsed = JSON.parse(report.actionList);
      if (parsed.questions) questionsParsed = parsed.questions;
      if (parsed.actionItems) actionItemsParsed = parsed.actionItems;
    } catch (e) {
      // ignore
    }
  }

  return {
    ...report,
    starStudents,
    kocs,
    goodNewsParsed,
    questions: questionsParsed,
    actionItems: actionItemsParsed,
  };
}
