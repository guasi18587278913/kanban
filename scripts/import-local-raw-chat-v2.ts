/**
 * 导入本地原始群聊记录到 V2 表（不自动跑 LLM）
 *
 * 用法:
 *   npx tsx scripts/import-local-raw-chat-v2.ts --dir "/path/to/聊天记录合集"
 *   npx tsx scripts/import-local-raw-chat-v2.ts --dir "/path" --dry-run
 *   npx tsx scripts/import-local-raw-chat-v2.ts --dir "/path" --analyze --workers 2 --delay 500
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { db } from '@/core/db';
import { rawChatLog } from '@/config/db/schema-community-v2';
import { parseFilenameMeta } from '@/lib/community-raw-parser';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const DEFAULT_DIR = '/Users/liyadong/Desktop/聊天记录合集';

const args = process.argv.slice(2);
const dirIdx = args.indexOf('--dir');
const inputDir = dirIdx !== -1 && args[dirIdx + 1] ? args[dirIdx + 1] : DEFAULT_DIR;
const dryRun = args.includes('--dry-run');
const analyze = args.includes('--analyze');

const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 && args[limitIdx + 1] ? parseInt(args[limitIdx + 1], 10) : undefined;

const workersIdx = args.indexOf('--workers');
const workers = workersIdx !== -1 && args[workersIdx + 1] ? parseInt(args[workersIdx + 1], 10) : undefined;

const delayIdx = args.indexOf('--delay');
const delayMs = delayIdx !== -1 && args[delayIdx + 1] ? parseInt(args[delayIdx + 1], 10) : undefined;

function getAllTxtFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getAllTxtFiles(fullPath));
    } else if (item.endsWith('.txt')) {
      files.push(fullPath);
    }
  }
  return files;
}

function getFileHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

function countMessages(content: string): number {
  // 匹配消息格式: 昵称 HH:MM:SS 或 昵称(wxid) MM-DD HH:MM:SS
  const messagePattern = /^.+\s+\d{2}:\d{2}:\d{2}$/gm;
  const matches = content.match(messagePattern);
  return matches ? matches.length : 0;
}

async function importFile(filePath: string) {
  const filename = path.basename(filePath);
  const meta = parseFilenameMeta(filename);
  if (!meta?.dateStr) {
    console.warn(`  跳过（无法解析日期）: ${filename}`);
    return { imported: false, skipped: true };
  }

  const chatDate = new Date(meta.dateStr);
  if (Number.isNaN(chatDate.getTime())) {
    console.warn(`  跳过（日期无效）: ${filename} => ${meta.dateStr}`);
    return { imported: false, skipped: true };
  }

  let period = meta.period;
  if (period && period.endsWith('期')) period = period.replace('期', '');
  if (!period) period = '1';

  let groupNumber = parseInt(meta.groupNumber || '1', 10);
  if (Number.isNaN(groupNumber)) groupNumber = 1;

  const productLine = meta.productLine || 'Unknown';
  if (productLine === 'Unknown') {
    console.warn(`  跳过（产品线未知）: ${filename}`);
    return { imported: false, skipped: true };
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const fileHash = getFileHash(content);
  const messageCount = countMessages(content);

  if (dryRun) {
    console.log(
      `  [DRY] ${filename} => ${productLine} ${period}期 ${groupNumber}群 ${meta.dateStr} (${messageCount} msgs)`
    );
    return { imported: false, skipped: true };
  }

  const existing = await db()
    .select()
    .from(rawChatLog)
    .where(
      and(
        eq(rawChatLog.productLine, productLine),
        eq(rawChatLog.period, period),
        eq(rawChatLog.groupNumber, groupNumber),
        eq(rawChatLog.chatDate, chatDate)
      )
    );

  if (existing.length > 0) {
    if (existing[0].fileHash === fileHash) {
      return { imported: false, skipped: true };
    }
    await db()
      .update(rawChatLog)
      .set({
        rawContent: content,
        fileHash,
        messageCount,
        fileName: filename,
        status: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(rawChatLog.id, existing[0].id));
    return { imported: true, skipped: false, updated: true };
  }

  await db().insert(rawChatLog).values({
    id: nanoid(),
    productLine,
    period,
    groupNumber,
    chatDate,
    fileName: filename,
    fileHash,
    rawContent: content,
    messageCount,
    status: 'pending',
  });

  return { imported: true, skipped: false, updated: false };
}

async function main() {
  console.log('=== V2 本地聊天记录导入 ===\n');
  console.log(`目录: ${inputDir}`);
  if (dryRun) console.log('模式: DRY RUN');
  if (limit) console.log(`限制: ${limit} 条`);
  console.log('');

  const files = getAllTxtFiles(inputDir).sort();
  const targets = limit ? files.slice(0, limit) : files;
  console.log(`找到 ${targets.length} 个文件\n`);

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of targets) {
    const result = await importFile(file);
    if (result.imported) {
      imported++;
      if (result.updated) updated++;
    } else {
      skipped++;
    }
  }

  console.log('\n=== 导入完成 ===');
  console.log(`新增/更新: ${imported}`);
  console.log(`其中更新: ${updated}`);
  console.log(`跳过: ${skipped}`);

  if (analyze && !dryRun) {
    const { runLLMAnalysisPipeline } = await import('@/lib/llm-analysis-pipeline');
    console.log('\n开始运行 LLM 分析管道...');
    const result = await runLLMAnalysisPipeline({
      force: false,
      dryRun: false,
      workers,
      delayMs,
      onProgress: (current, total, fileName) => {
        const percent = Math.round((current / total) * 100);
        process.stdout.write(`\r[${percent}%] ${current}/${total} - ${fileName}          `);
      },
    });
    console.log('\n\n=== 分析完成 ===');
    console.log(`成功: ${result.processed}`);
    console.log(`失败: ${result.failed}`);
    console.log(`问答: ${result.totalQA}`);
    console.log(`好事: ${result.totalGoodNews}`);
    console.log(`KOC: ${result.totalKOC}`);
    if (result.errors.length > 0) {
      console.log('\n失败详情:');
      for (const err of result.errors) {
        console.log(`  - ${err.fileName}: ${err.error}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
