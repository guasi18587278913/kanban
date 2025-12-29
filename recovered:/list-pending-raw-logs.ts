/**
 * 列出待处理 (pending) 的原始聊天记录
 *
 * 用法:
 *   npx tsx scripts/list-pending-raw-logs.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const { db } = await import('../src/core/db');
  const { rawChatLog } = await import('../src/config/db/schema-community-v2');
  const { eq, asc } = await import('drizzle-orm');

  const pending = await db()
    .select({
      fileName: rawChatLog.fileName,
      chatDate: rawChatLog.chatDate,
      period: rawChatLog.period,
      groupNumber: rawChatLog.groupNumber,
    })
    .from(rawChatLog)
    .where(eq(rawChatLog.status, 'pending'))
    .orderBy(asc(rawChatLog.chatDate));

  console.log(`Pending 总数: ${pending.length}`);
  pending.slice(0, 50).forEach((log) => {
    console.log(`${log.chatDate.toISOString().slice(0, 10)} | ${log.period}期${log.groupNumber}群 | ${log.fileName}`);
  });

  if (pending.length > 50) {
    console.log(`... 还有 ${pending.length - 50} 条未显示`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
