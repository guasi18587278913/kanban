/**
 * 检查已处理日志中是否存在“缺失标签”的记录（不调用 LLM）
 *
 * 用法:
 *   npx tsx scripts/check-missing-tags.ts
 */

import dotenv from 'dotenv';
import { and, asc, eq, sql } from 'drizzle-orm';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const { db } = await import('../src/core/db');
  const { rawChatLog, memberTag } = await import('../src/config/db/schema-community-v2');

  const rows = await db()
    .select({
      id: rawChatLog.id,
      fileName: rawChatLog.fileName,
      chatDate: rawChatLog.chatDate,
    })
    .from(rawChatLog)
    .where(
      and(
        eq(rawChatLog.status, 'processed'),
        sql`not exists (select 1 from ${memberTag} where ${memberTag.sourceLogId} = ${rawChatLog.id})`
      )
    )
    .orderBy(asc(rawChatLog.chatDate));

  console.log('=== 缺失标签检查 ===');
  console.log(`缺失标签的日志数: ${rows.length}`);
  if (rows.length > 0) {
    rows.slice(0, 20).forEach((row) => {
      console.log(`  - ${row.fileName}`);
    });
    if (rows.length > 20) {
      console.log(`  ... 还有 ${rows.length - 20} 条未显示`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
