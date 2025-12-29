/**
 * 验证 member.wechat_id 写入/读取流程
 *
 * 用法:
 *   npx tsx scripts/verify-member-wechat-flow.ts
 */

import dotenv from 'dotenv';
import { nanoid } from 'nanoid';

dotenv.config({ path: '.env.local' });
dotenv.config();

function normalizeName(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

async function main() {
  const dbModule = await import('../src/core/db');
  const { db } = dbModule as any;
  const schema = await import('../src/config/db/schema-community-v2');
  const { member } = schema as any;
  const { eq } = await import('drizzle-orm');

  const testId = `verify-wechat-${nanoid(8)}`;
  const planetId = `verify-${nanoid(6)}`;
  const nickname = `测试微信号-${planetId}`;
  const nicknameNormalized = normalizeName(nickname) || planetId;

  try {
    await db().insert(member).values({
      id: testId,
      planetId,
      nickname,
      nicknameNormalized,
      role: 'student',
      productLine: 'AI产品出海',
      status: 'active',
      wechatId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db()
      .update(member)
      .set({ wechatId: 'wx-test-001', updatedAt: new Date() })
      .where(eq(member.id, testId));

    const [row] = await db()
      .select({
        id: member.id,
        wechatId: member.wechatId,
        nickname: member.nickname,
      })
      .from(member)
      .where(eq(member.id, testId))
      .limit(1);

    console.log('验证记录:', row);
  } finally {
    await db().delete(member).where(eq(member.id, testId));
  }

  const [check] = await db()
    .select({ id: member.id })
    .from(member)
    .where(eq(member.id, testId))
    .limit(1);

  console.log('清理完成:', !check);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
