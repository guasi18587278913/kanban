/**
 * 增加 member.wechat_id 列
 *
 * 用法:
 *   npx tsx scripts/add-member-wechat-id.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const dbModule = await import('../src/core/db');
  const { db } = dbModule as any;
  const { sql } = await import('drizzle-orm');

  await db().execute(sql`ALTER TABLE member ADD COLUMN IF NOT EXISTS wechat_id TEXT;`);
  console.log('✅ 已添加 wechat_id 列');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
