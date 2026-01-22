import { db } from '@/core/db';
import {
  dailyStats,
  goodNews,
  kocRecord,
  member,
  memberMessage,
  qaRecord,
  rawChatLog,
  starStudent,
} from '@/config/db/schema-community-v2';
import { asc, sql } from 'drizzle-orm';

async function countTable(table: any, name: string) {
  const [row] = await db().select({ count: sql<number>`count(*)` }).from(table);
  const count = row?.count ?? 0;
  console.log(`${name}: ${count}`);
  return count;
}

async function main() {
  console.log('🔍 Auditing V2 Database Content...');

  await countTable(member, 'member');
  await countTable(rawChatLog, 'raw_chat_log');
  await countTable(dailyStats, 'daily_stats');
  await countTable(goodNews, 'good_news');
  await countTable(kocRecord, 'koc_record');
  await countTable(qaRecord, 'qa_record');
  await countTable(starStudent, 'star_student');
  await countTable(memberMessage, 'member_message');

  const groups = await db()
    .select({
      productLine: rawChatLog.productLine,
      period: rawChatLog.period,
      groupNumber: rawChatLog.groupNumber,
      count: sql<number>`count(*)`,
    })
    .from(rawChatLog)
    .groupBy(rawChatLog.productLine, rawChatLog.period, rawChatLog.groupNumber)
    .orderBy(asc(rawChatLog.productLine), asc(rawChatLog.period), asc(rawChatLog.groupNumber));

  console.log(`groups: ${groups.length}`);
  if (groups.length > 0) {
    console.log('sample groups:');
    groups.slice(0, 10).forEach((g) => {
      console.log(`- ${g.productLine || 'unknown'} ${g.period || ''}期${g.groupNumber}群 · logs ${g.count}`);
    });
  }

  const [latestLog] = await db()
    .select({ maxDate: sql<Date>`max(${rawChatLog.chatDate})` })
    .from(rawChatLog);
  const [latestStats] = await db()
    .select({ maxDate: sql<Date>`max(${dailyStats.statsDate})` })
    .from(dailyStats);

  const formatDate = (value: unknown) => {
    if (!value) return 'N/A';
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toISOString();
  };

  console.log(`latest raw_chat_log: ${formatDate(latestLog?.maxDate)}`);
  console.log(`latest daily_stats: ${formatDate(latestStats?.maxDate)}`);

  process.exit(0);
}

main().catch((error) => {
  console.error('Audit failed:', error);
  process.exit(1);
});
