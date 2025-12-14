import fs from 'fs';
import path from 'path';
// Load environment variables immediately
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env

import { db } from '@/core/db';
import {
  communityGroup,
  communityDailyReport,
  communityStarStudent,
  communityKoc,
  communityImportLog,
} from '@/config/db/schema';
import { extractWithLLM } from '@/lib/community-llm-extractor';
import { parseFilenameMeta } from '@/lib/community-raw-parser';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const DEFAULT_BASE_PATH = path.join(process.cwd(), 'private/import');
const args = process.argv.slice(2);
const failedFlagIndex = args.indexOf('--failed');
const ONLY_FAILED = failedFlagIndex !== -1;
const protectFlagIndex = args.indexOf('--protect-mode');
const PROTECT_MODE = protectFlagIndex !== -1;
const forceFlagIndex = args.indexOf('--force');
const FORCE_MODE = forceFlagIndex !== -1;

const monthsFlagIndex = args.indexOf('--months');
let MONTHS_LIMIT = 0;
if (monthsFlagIndex !== -1 && args[monthsFlagIndex + 1]) {
  MONTHS_LIMIT = parseInt(args[monthsFlagIndex + 1], 10);
}

// If the first argument is NOT a flag, treat it as custom input directory
let inputDirArg = args[0];
if (inputDirArg && inputDirArg.startsWith('--')) {
  inputDirArg = undefined as any;
} else if (ONLY_FAILED && args.indexOf(inputDirArg) === failedFlagIndex) {
    // Handling edge case where --failed might be first but logic above catches it.
    // Basically if args[0] is --failed, we don't have a custom dir.
    inputDirArg = undefined as any;
}

const INPUT_DIR = inputDirArg
  ? path.resolve(inputDirArg)
  : DEFAULT_BASE_PATH;

async function processFile(filePath: string) {
  const filename = path.basename(filePath);
  if (!filename.endsWith('.txt')) return;

  console.log(`Processing: ${filename}...`);
  const content = fs.readFileSync(filePath, 'utf-8');

  // STRICT Whitelist for Good News
  const goodNewsKeywords = [
    '业务成果',
    '变现',
    '上线',
    '里程碑',
    '涨粉',
    '买断',
    '签约',
    '订单',
    '收入',
    '支付',
    '出单',
    '售出',
    '盈利',
  ];

  // Aggressive Bad News Filter
  const badNewsKeywords = [
    '学习',
    '进度',
    '复盘',
    '感谢',
    '表扬',
    '称赞',
    '好看',
    '设计',
    '心得',
    '体验',
    '安装',
    '注册',
    '报错',
    '验证',
    '网络',
    '梯子',
    '提醒',
    '反馈',
    '问题',
    '解决',
    '修复',
    '教程',
    '求教',
    '请问',
    '为什么',
    '通过', // "通过" is dangerous (e.g. through API), unless "审核通过" but that's specific
  ];

  try {
    const meta = parseFilenameMeta(filename);
    const metaDate = meta.dateStr ? new Date(meta.dateStr) : undefined;
    
    // Date Range Filtering (Optimization: Check before LLM)
    if (MONTHS_LIMIT > 0 && metaDate) {
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - metaDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      if (diffDays > MONTHS_LIMIT * 30) {
        console.log(`  Skipping ${filename} (Date ${metaDate.toISOString()} older than ${MONTHS_LIMIT} months)`);
        return;
      }
    }

    // Use LLM for deep parsing
    // NOTE: Running sequentially to avoid Rate Limits
    const parsed = await extractWithLLM(filename, content);

    parsed.productLine = meta.productLine || parsed.productLine;
    parsed.groupNumber = meta.groupNumber || parsed.groupNumber || '1';
    parsed.period = meta.period || parsed.period;
    parsed.reportDate = metaDate || parsed.reportDate;

    if (!parsed) {
      console.error(`  Failed to parse ${filename}`);
      return;
    }

    // Robust Cleanup for LLM output variances
    let cleanGroupNum = parsed.groupNumber ? String(parsed.groupNumber).replace(/[^\d]/g, '') : '1';
    if (!cleanGroupNum) cleanGroupNum = '1';

    let cleanPeriod = parsed.period ? String(parsed.period).replace(/群.*$/, '').trim() : undefined;
    
    const periodNormalized = cleanPeriod
      ? cleanPeriod.includes('期')
        ? cleanPeriod
        : `${cleanPeriod}期`
      : undefined;
      
    // Update parsed object to safely use later
    parsed.groupNumber = cleanGroupNum;
    parsed.period = periodNormalized ? periodNormalized.replace('期', '') : undefined; // keep raw period simple if needed, but logic below uses periodNormalized

    const groupName =
      meta.groupName ||
      `${parsed.productLine}${periodNormalized ? `${periodNormalized}-` : ''}${cleanGroupNum}群`;

    // 1. Ensure Group
    const existingGroups = await db()
      .select()
      .from(communityGroup)
      .where(
        and(
          eq(communityGroup.productLine, parsed.productLine),
          eq(communityGroup.groupNumber, parseInt(parsed.groupNumber)),
          periodNormalized ? eq(communityGroup.period, periodNormalized) : undefined
        )
      );

    let groupId = '';
    if (existingGroups.length > 0) {
      groupId = existingGroups[0].id;
      if (existingGroups[0].groupName !== groupName) {
        await db()
          .update(communityGroup)
          .set({ groupName })
          .where(eq(communityGroup.id, groupId));
      }
    } else {
      groupId = nanoid();
      await db().insert(communityGroup).values({
        id: groupId,
        productLine: parsed.productLine,
        period: periodNormalized,
        groupNumber: parseInt(parsed.groupNumber),
        groupName,
      });
      console.log(`  Created Group: ${groupName}`);
    }

    // 2. Report
    const existingReports = await db()
      .select()
      .from(communityDailyReport)
      .where(
        and(
          eq(communityDailyReport.groupId, groupId),
          eq(communityDailyReport.reportDate, parsed.reportDate)
        )
      );

    // Serialize structured data for DB columns (activityFeature, actionList)
    const filteredGoodNews =
      parsed.goodNews?.filter((g) => {
        const text = `${g.content || ''}`.toLowerCase();
        const hasGood = goodNewsKeywords.some((k) => text.includes(k));
        const hasBad = badNewsKeywords.some((k) => text.includes(k));
        return hasGood && !hasBad;
      }) || [];

    const activityFeature = JSON.stringify(
      filteredGoodNews.map((g) => ({ content: g.content, author: g.author }))
    );

    const actionList = JSON.stringify({
      questions: parsed.questions,
      actionItems: parsed.actionItems,
    });

    // Prepare new values object
    const newValues = {
      messageCount: parsed.messageCount,
      questionCount: parsed.questionCount,
      avgResponseTime:
        parsed.avgResponseTime !== undefined && parsed.avgResponseTime !== null
          ? Math.round(parsed.avgResponseTime)
          : 0,
      resolutionRate:
        parsed.resolutionRate !== undefined && parsed.resolutionRate !== null
          ? Math.round(parsed.resolutionRate)
          : 0,
      goodNewsCount: filteredGoodNews.length,
      fullReport: parsed.fullText,
      activityFeature: activityFeature,
      actionList: actionList,
      updatedAt: new Date(),
    };

      const reportId = existingReports[0].id;
      const existingReport = existingReports[0] as any;

      // 检查是否已审核：isVerified 为 true 时，保护数据不被覆盖
      const isReportVerified = existingReport.isVerified === true;
      const shouldProtect = PROTECT_MODE || isReportVerified;

      const updateData: any = { ...newValues };

      if (shouldProtect) {
          // In protect mode OR if report is verified, DO NOT overwrite Good News or KOCs
          // We only want to backfill Questions (actionList), Response Rates, etc.
          delete updateData.goodNewsCount;
          delete updateData.activityFeature;
          // Keep other stats like messageCount, questionCount, etc.

          const reason = isReportVerified ? 'VERIFIED' : 'PROTECT_MODE';
          console.log(`  [${reason}] Updating Report ${reportId} (Skipping GoodNews/KOC overwrite)`);
      } else {
          console.log(`  Updating Report ${reportId}`);
      }

      await db()
        .update(communityDailyReport)
        .set(updateData)
        .where(eq(communityDailyReport.id, reportId));

      if (!shouldProtect) {
        // Clear and Re-insert children ONLY if NOT protecting
        await db()
            .delete(communityStarStudent)
            .where(eq(communityStarStudent.reportId, reportId));
        await db().delete(communityKoc).where(eq(communityKoc.reportId, reportId));

        // Insert new children
        if (parsed.starStudents.length > 0) {
            await db()
              .insert(communityStarStudent)
              .values(
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
            await db()
              .insert(communityKoc)
              .values(
                parsed.kocs.map((k) => ({
                  id: nanoid(),
                  reportId: reportId,
                  kocName: k.name,
                  contribution: k.contribution || k.highlight || '贡献未填',
                  highlight: k.highlight,
                  suggestion: k.suggestion,
                }))
              );
          }
      }

    // Log Success
    await db().insert(communityImportLog).values({
      id: nanoid(),
      fileName: filename,
      status: 'SUCCESS',
      message: `Batch Import: ${parsed.productLine} - ${parsed.reportDate
        .toISOString()
        .split('T')[0]}`,
    });
  } catch (e: any) {
    console.error(`  Error processing ${filename}:`, e);
    // Log Failure
    try {
      await db().insert(communityImportLog).values({
        id: nanoid(),
        fileName: filename,
        status: 'FAILED',
        message: e instanceof Error ? e.message : 'Unknown Error',
      });
    } catch (logErr) {
      console.error('Failed to log error to DB', logErr);
    }
  }
}

// Recursive function to walk directory
function walkSync(dir: string, filelist: string[] = []) {
  if (!fs.existsSync(dir)) return filelist;
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filepath = path.join(dir, file);
    if (fs.statSync(filepath).isDirectory()) {
      filelist = walkSync(filepath, filelist);
    } else {
      if (file.endsWith('.txt')) {
        filelist.push(filepath);
      }
    }
  });
  return filelist;
}

async function main() {
  console.log(`Scanning for .txt files in: ${INPUT_DIR}`);
  const allFiles = walkSync(INPUT_DIR);

  // Resume Capability: Get list of already successfully imported files
  const successLogs = await db()
    .select({ fileName: communityImportLog.fileName })
    .from(communityImportLog)
    .where(eq(communityImportLog.status, 'SUCCESS'));
  
  const successSet = new Set(successLogs.map((l: { fileName: string }) => l.fileName));
  console.log(`Found ${successSet.size} already imported files.`);

  let files: string[] = [];

  if (ONLY_FAILED) {
    // Only retry explicitly failed ones
    const logs = await db().select().from(communityImportLog);
    const failedNames: string[] = Array.from(
      new Set(logs.filter((l: any) => l.status === 'FAILED').map((l: any) => l.fileName as string))
    );

    // If it failed before but eventually succeeded (retry succeeded), don't add it back
    // UNLESS FORCE_MODE is on, then we might want to retry even if succeeded?
    // But ONLY_FAILED usually implies intent to fix failures.
    const realFailedNames: string[] = FORCE_MODE ? failedNames : failedNames.filter((n) => !successSet.has(n));

    const pathMap = new Map<string, string>();
    allFiles.forEach((p) => pathMap.set(path.basename(p), p));
    files = realFailedNames
      .map((name) => pathMap.get(name))
      .filter((p): p is string => Boolean(p));

    console.log(
      `Failed files to reprocess: ${files.length} (Total failed logs minus success retries)`
    );
  } else {
    // Process everything NOT in successSet UNLESS FORCE_MODE
    if (FORCE_MODE) {
        files = allFiles;
        console.log(`[FORCE MODE] Processing all ${files.length} found files (ignoring existing status).`);
    } else {
        files = allFiles.filter(f => !successSet.has(path.basename(f)));
        console.log(`To Process: ${files.length} / ${allFiles.length} (Skipped ${successSet.size} existing)`);
    }
  }

  if (files.length === 0) {
      console.log('Nothing to process. All files imported or no files found.');
      return;
  }

  // Sort files by date/name to be deterministic
  files.sort();

  for (const [index, file] of files.entries()) {
    console.log(`[${index + 1}/${files.length}] processing...`);
    await processFile(file);
  }
  console.log('Batch Import Completed!');
}

main();
