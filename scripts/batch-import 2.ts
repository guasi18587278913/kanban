
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
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const DEFAULT_BASE_PATH = path.join(process.cwd(), 'private/import');
const INPUT_DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : DEFAULT_BASE_PATH;

async function processFile(filePath: string) {
  const filename = path.basename(filePath);
  if (!filename.endsWith('.txt')) return;

  console.log(`Processing: ${filename}...`);
  const content = fs.readFileSync(filePath, 'utf-8');

  try {
    // Use LLM for deep parsing
    // NOTE: Running sequentially to avoid Rate Limits
    const parsed = await extractWithLLM(filename, content);

    if (!parsed) {
      console.error(`  Failed to parse ${filename}`);
      return;
    }

    const periodStr = parsed.period ? String(parsed.period) : undefined;
    const periodNormalized = periodStr
      ? periodStr.includes('期')
        ? periodStr
        : `${periodStr}期`
      : undefined;
    const groupName = `${parsed.productLine}${
      periodNormalized ? `${periodNormalized}-` : ''
    }${parsed.groupNumber}群`;

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
        const existingReports = await db().select().from(communityDailyReport)
            .where(and(
                eq(communityDailyReport.groupId, groupId),
                eq(communityDailyReport.reportDate, parsed.reportDate)
            ));

    // Serialize structured data for DB columns (activityFeature, actionList)
    const activityFeature = JSON.stringify(
      parsed.goodNews?.map((g) => ({ content: g.content, author: g.author })) ||
        []
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
      goodNewsCount: parsed.goodNewsCount,
      fullReport: parsed.fullText,
      activityFeature: activityFeature,
      actionList: actionList,
      updatedAt: new Date(),
    };

        let reportId = '';
        if (existingReports.length > 0) {
            reportId = existingReports[0].id;
             await db().update(communityDailyReport).set(newValues).where(eq(communityDailyReport.id, reportId));
            
             // Clear children
            await db().delete(communityStarStudent).where(eq(communityStarStudent.reportId, reportId));
            await db().delete(communityKoc).where(eq(communityKoc.reportId, reportId));
             console.log(`  Updated Report for ${parsed.reportDate.toISOString().split('T')[0]}`);

        } else {
            reportId = nanoid();
            await db().insert(communityDailyReport).values({
                id: reportId,
                groupId: groupId,
                reportDate: parsed.reportDate,
                ...newValues,
                updatedAt: undefined, // Let DB handle default
            });
             console.log(`  Created Report for ${parsed.reportDate.toISOString().split('T')[0]}`);
        }

        // 3. Children
         if (parsed.starStudents.length > 0) {
            await db().insert(communityStarStudent).values(
                parsed.starStudents.map(s => ({
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
                parsed.kocs.map(k => ({
                id: nanoid(),
                reportId: reportId,
                kocName: k.name,
                contribution: k.contribution,
                highlight: k.highlight,
                suggestion: k.suggestion,
                }))
            );
        }

        // Log Success
        await db().insert(communityImportLog).values({
            id: nanoid(),
            fileName: filename,
            status: 'SUCCESS',
            message: `Batch Import: ${parsed.productLine} - ${parsed.reportDate.toISOString().split('T')[0]}`,
        });

    } catch (e) {
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
  files.forEach(file => {
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
    const files = walkSync(INPUT_DIR);
    console.log(`Found ${files.length} files to process.`);

    for (const file of files) {
        await processFile(file);
    }
    console.log('Batch Import Completed!');
}

main();
