/**
 * 查看原始群聊导入进度（raw_chat_log）
 *
 * 用法:
 *   npx tsx scripts/check-raw-chat-progress.ts
 */

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const { db } = await import('../src/core/db');
  const { rawChatLog } = await import('../src/config/db/schema-community-v2');
  const { sql, eq } = await import('drizzle-orm');

  const database = db();

  const totalResult = await database
    .select({ count: sql<number>`count(*)` })
    .from(rawChatLog);

  const total = Number(totalResult[0]?.count ?? 0);

  const statusRows = await database
    .select({
      status: rawChatLog.status,
      count: sql<number>`count(*)`,
    })
    .from(rawChatLog)
    .groupBy(rawChatLog.status);

  const pendingRow = statusRows.find((row) => row.status === 'pending');
  const processedRow = statusRows.find((row) => row.status === 'processed');
  const failedRow = statusRows.find((row) => row.status === 'failed');

  const latest = await database
    .select({
      latestChatDate: sql<Date>`max(${rawChatLog.chatDate})`,
      latestCreatedAt: sql<Date>`max(${rawChatLog.createdAt})`,
    })
    .from(rawChatLog);

  console.log('=== raw_chat_log 导入进度 ===');
  console.log(`总数: ${total}`);
  console.log(`pending: ${Number(pendingRow?.count ?? 0)}`);
  console.log(`processed: ${Number(processedRow?.count ?? 0)}`);
  console.log(`failed: ${Number(failedRow?.count ?? 0)}`);
  const latestChatDate = latest[0]?.latestChatDate
    ? new Date(latest[0].latestChatDate as unknown as string)
    : null;
  const latestCreatedAt = latest[0]?.latestCreatedAt
    ? new Date(latest[0].latestCreatedAt as unknown as string)
    : null;

  if (latestChatDate && !Number.isNaN(latestChatDate.getTime())) {
    console.log(`最新聊天日期: ${latestChatDate.toISOString().slice(0, 10)}`);
  }
  if (latestCreatedAt && !Number.isNaN(latestCreatedAt.getTime())) {
    console.log(`最近导入时间: ${latestCreatedAt.toISOString()}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
