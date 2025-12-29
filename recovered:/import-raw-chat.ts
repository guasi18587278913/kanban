/**
 * 导入原始群聊记录
 *
 * 用法:
 *   npx tsx scripts/import-raw-chat.ts                    # 导入所有
 *   npx tsx scripts/import-raw-chat.ts --period 1         # 只导入1期
 *   npx tsx scripts/import-raw-chat.ts --date 2025-12-01  # 只导入指定日期
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

type Database = ReturnType<typeof import('../src/core/db').db>;
type RawChatLogTable = typeof import('../src/config/db/schema-community-v2').rawChatLog;

const IMPORT_DIR = path.join(process.cwd(), 'private/import/AI产品出海');
const PRODUCT_LINE = 'AI产品出海';

// 解析命令行参数
const args = process.argv.slice(2);
const periodIdx = args.indexOf('--period');
const PERIOD_FILTER = periodIdx !== -1 ? args[periodIdx + 1] : null;
const dateIdx = args.indexOf('--date');
const DATE_FILTER = dateIdx !== -1 ? args[dateIdx + 1] : null;

// 从文件名解析元数据
// 格式: 深海圈丨AI产品出海1期1群_2025-12-01.txt
function parseFilename(filename: string): {
  period: string;
  groupNumber: number;
  chatDate: Date;
} | null {
  // 匹配: xxx1期1群_2025-12-01.txt 或 xxx2期2群_2025-12-01.txt
  const match = filename.match(/(\d+)期(\d+)群_(\d{4}-\d{2}-\d{2})\.txt$/);
  if (!match) {
    console.warn(`  无法解析文件名: ${filename}`);
    return null;
  }

  return {
    period: match[1],
    groupNumber: parseInt(match[2]),
    chatDate: new Date(match[3]),
  };
}

// 计算文件 MD5 哈希
function getFileHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

// 统计消息数（简单按行数估算）
function countMessages(content: string): number {
  // 匹配消息格式: 昵称(wxid) 日期 时间
  const messagePattern = /^.+?(?:\([^)]*\)\s+)?(?:\d{2}-\d{2}\s+)?\d{2}:\d{2}:\d{2}/gm;
  const matches = content.match(messagePattern);
  return matches ? matches.length : 0;
}

// 导入单个文件
async function importFile(
  filePath: string,
  database: Database,
  rawChatLog: RawChatLogTable
): Promise<boolean> {
  const filename = path.basename(filePath);
  const meta = parseFilename(filename);
  if (!meta) return false;

  // 过滤条件
  if (PERIOD_FILTER && meta.period !== PERIOD_FILTER) {
    return false;
  }
  if (DATE_FILTER && meta.chatDate.toISOString().split('T')[0] !== DATE_FILTER) {
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const fileHash = getFileHash(content);
  const messageCount = countMessages(content);

  // 检查是否已存在（通过唯一索引）
  const existing = await database
    .select()
    .from(rawChatLog)
    .where(
      and(
        eq(rawChatLog.productLine, PRODUCT_LINE),
        eq(rawChatLog.period, meta.period),
        eq(rawChatLog.groupNumber, meta.groupNumber),
        eq(rawChatLog.chatDate, meta.chatDate)
      )
    );

  if (existing.length > 0) {
    // 检查内容是否有变化
    if (existing[0].fileHash === fileHash) {
      // console.log(`  跳过 (无变化): ${filename}`);
      return false;
    }

    // 更新
    await database
      .update(rawChatLog)
      .set({
        rawContent: content,
        fileHash,
        messageCount,
        fileName: filename,
        status: 'pending', // 重置状态，需要重新分析
        updatedAt: new Date(),
      })
      .where(eq(rawChatLog.id, existing[0].id));

    console.log(`  更新: ${filename}`);
    return true;
  }

  // 新增
  await database.insert(rawChatLog).values({
    id: nanoid(),
    productLine: PRODUCT_LINE,
    period: meta.period,
    groupNumber: meta.groupNumber,
    chatDate: meta.chatDate,
    fileName: filename,
    fileHash,
    rawContent: content,
    messageCount,
    status: 'pending',
  });

  console.log(`  新增: ${filename}`);
  return true;
}

// 递归获取所有 .txt 文件
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

async function main() {
  const { db } = await import('../src/core/db');
  const { rawChatLog } = await import('../src/config/db/schema-community-v2');

  const database = db();

  console.log('=== 导入原始群聊记录 ===\n');
  console.log(`源目录: ${IMPORT_DIR}`);
  if (PERIOD_FILTER) console.log(`过滤期数: ${PERIOD_FILTER}期`);
  if (DATE_FILTER) console.log(`过滤日期: ${DATE_FILTER}`);
  console.log('');

  const files = getAllTxtFiles(IMPORT_DIR);
  console.log(`找到 ${files.length} 个文件\n`);

  let imported = 0;
  let skipped = 0;

  for (const file of files) {
    const result = await importFile(file, database, rawChatLog);
    if (result) {
      imported++;
    } else {
      skipped++;
    }
  }

  console.log('\n=== 导入完成 ===');
  console.log(`新增/更新: ${imported}`);
  console.log(`跳过: ${skipped}`);

  // 统计
  const stats = await database.select().from(rawChatLog);
  const period1 = stats.filter(r => r.period === '1').length;
  const period2 = stats.filter(r => r.period === '2').length;

  console.log(`\n数据库总计: ${stats.length} 条`);
  console.log(`  1期: ${period1}`);
  console.log(`  2期: ${period2}`);
}

main().catch(console.error);
