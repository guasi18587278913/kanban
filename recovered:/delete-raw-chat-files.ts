/**
 * 删除指定文件名对应的原始群聊记录及衍生数据
 *
 * 用法:
 *   npx tsx scripts/delete-raw-chat-files.ts <file-or-path> [more...]
 */

import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

import { and, eq, inArray, or } from 'drizzle-orm';

function normalizeFileNames(args: string[]): string[] {
  const files = args
    .map((arg) => arg.trim())
    .filter(Boolean)
    .map((arg) => path.basename(arg));

  return Array.from(new Set(files));
}

async function main() {
  const args = process.argv.slice(2);
  const fileNames = normalizeFileNames(args);

  if (fileNames.length === 0) {
    console.log('请提供需要删除的文件名或文件路径。');
    console.log('示例: npx tsx scripts/delete-raw-chat-files.ts ./a.txt ./b.txt');
    process.exit(1);
  }

  const dbModule = await import('../src/core/db');
  const schemaModule = await import('../src/config/db/schema-community-v2');

  const { db } = dbModule;
  const {
    rawChatLog,
    dailyStats,
    goodNews,
    kocRecord,
    qaRecord,
    starStudent,
    memberMessage,
  } = schemaModule;

  const database = db();

  const logs = await database
    .select({
      id: rawChatLog.id,
      fileName: rawChatLog.fileName,
      productLine: rawChatLog.productLine,
      period: rawChatLog.period,
      groupNumber: rawChatLog.groupNumber,
      chatDate: rawChatLog.chatDate,
    })
    .from(rawChatLog)
    .where(inArray(rawChatLog.fileName, fileNames));

  if (logs.length === 0) {
    console.log('未找到匹配的 raw_chat_log 记录。');
    return;
  }

  const logIds = logs.map((log) => log.id);
  const logNames = logs.map((log) => log.fileName).join(', ');

  console.log(`找到 ${logs.length} 条记录: ${logNames}`);

  await database.delete(memberMessage).where(inArray(memberMessage.sourceLogId, logIds));
  await database.delete(goodNews).where(inArray(goodNews.sourceLogId, logIds));
  await database.delete(kocRecord).where(inArray(kocRecord.sourceLogId, logIds));
  await database.delete(qaRecord).where(inArray(qaRecord.sourceLogId, logIds));
  await database.delete(starStudent).where(inArray(starStudent.sourceLogId, logIds));

  const dailyConditions = logs.map((log) =>
    and(
      eq(dailyStats.productLine, log.productLine),
      eq(dailyStats.period, log.period),
      eq(dailyStats.groupNumber, log.groupNumber),
      eq(dailyStats.statsDate, log.chatDate)
    )
  );

  if (dailyConditions.length === 1) {
    await database.delete(dailyStats).where(dailyConditions[0]);
  } else if (dailyConditions.length > 1) {
    await database.delete(dailyStats).where(or(...dailyConditions));
  }

  await database.delete(rawChatLog).where(inArray(rawChatLog.id, logIds));

  console.log('删除完成。');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
