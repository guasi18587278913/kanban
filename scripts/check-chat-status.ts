import 'dotenv/config';
import { db } from '../src/core/db';
import { rawChatLog } from '../src/config/db/schema-community-v2';
import { sql, count, eq } from 'drizzle-orm';

async function checkStatus() {
  // 按状态统计
  const statusCounts = await db()
    .select({
      status: rawChatLog.status,
      count: count(),
    })
    .from(rawChatLog)
    .groupBy(rawChatLog.status);

  console.log('Raw chat log status counts:');
  statusCounts.forEach((row) => {
    console.log(`  ${row.status}: ${row.count}`);
  });

  // 查看几条样例
  const samples = await db()
    .select({
      id: rawChatLog.id,
      fileName: rawChatLog.fileName,
      status: rawChatLog.status,
      chatDate: rawChatLog.chatDate,
    })
    .from(rawChatLog)
    .limit(5);

  console.log('\nSample records:');
  samples.forEach((row) => {
    console.log(`  ${row.fileName} - ${row.status} - ${row.chatDate}`);
  });
}

checkStatus().catch(console.error).finally(() => process.exit(0));
