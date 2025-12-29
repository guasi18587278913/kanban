/**
 * 清空 V2 派生数据并重置待处理状态
 *
 * 用法:
 *   npx tsx scripts/reset-v2-derived.ts
 */

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const dbModule = await import('../src/core/db');
  const { db } = dbModule as any;
  const schema = await import('../src/config/db/schema-community-v2');
  const {
    rawChatLog,
    dailyStats,
    goodNews,
    kocRecord,
    qaRecord,
    starStudent,
    memberMessage,
    memberStats,
    memberTag,
  } = schema as any;
  const { sql, ne } = await import('drizzle-orm');

  const [rawCount] = await db()
    .select({ c: sql`count(*)` })
    .from(rawChatLog);
  console.log('rawChatLog 总数:', Number(rawCount.c));

  // 清空派生数据
  await db().delete(memberMessage);
  await db().delete(qaRecord);
  await db().delete(goodNews);
  await db().delete(kocRecord);
  await db().delete(starStudent);
  await db().delete(memberStats);
  await db().delete(memberTag).where(ne(memberTag.source, 'manual')); // 保留手动标签
  await db().delete(dailyStats);

  // 重置状态
  await db()
    .update(rawChatLog)
    .set({
      status: 'pending',
      processedAt: null,
      statusReason: null,
      updatedAt: new Date(),
    });

  console.log('✅ 已清空派生数据并重置 pending');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
