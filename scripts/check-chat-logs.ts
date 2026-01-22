import { db } from '../src/core/db';
import { rawChatLog } from '../src/config/db/schema-community-v2';
import { desc, asc, sql } from 'drizzle-orm';

async function main() {
  // 查询最新和最早的记录
  const latest = await db()
    .select({
      chatDate: rawChatLog.chatDate,
      productLine: rawChatLog.productLine,
      period: rawChatLog.period,
      groupNumber: rawChatLog.groupNumber,
      status: rawChatLog.status,
    })
    .from(rawChatLog)
    .orderBy(desc(rawChatLog.chatDate))
    .limit(10);

  const earliest = await db()
    .select({
      chatDate: rawChatLog.chatDate,
      productLine: rawChatLog.productLine,
      period: rawChatLog.period,
    })
    .from(rawChatLog)
    .orderBy(asc(rawChatLog.chatDate))
    .limit(1);

  // 统计总数
  const countResult = await db()
    .select({ count: sql`count(*)` })
    .from(rawChatLog);

  // 按期数统计
  const byPeriod = await db()
    .select({
      period: rawChatLog.period,
      count: sql`count(*)`,
    })
    .from(rawChatLog)
    .groupBy(rawChatLog.period);

  console.log('=== 聊天记录数据统计 ===\n');
  console.log('总记录数:', countResult[0].count);
  console.log('');

  console.log('按期数统计:');
  byPeriod.forEach((p: any) => {
    console.log(`  ${p.period}期: ${p.count} 条`);
  });
  console.log('');

  console.log('最早记录:', earliest[0]?.chatDate?.toISOString().split('T')[0], '-', earliest[0]?.productLine, earliest[0]?.period + '期');
  console.log('');

  console.log('最新10条记录:');
  latest.forEach((log, i) => {
    const date = log.chatDate?.toISOString().split('T')[0];
    console.log(`  ${i+1}. ${date} - ${log.productLine}${log.period}期${log.groupNumber}群 [${log.status}]`);
  });
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
