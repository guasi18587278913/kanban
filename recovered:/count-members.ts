/**
 * 统计成员数量（按角色/总计）
 *
 * 用法:
 *   npx tsx scripts/count-members.ts
 */

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const dbModule = await import('../src/core/db');
  const { db } = dbModule as any;
  const schema = await import('../src/config/db/schema-community-v2');
  const { member } = schema as any;
  const { eq, count } = await import('drizzle-orm');

  const [studentRow] = await db()
    .select({ c: count() })
    .from(member)
    .where(eq(member.role, 'student'));
  const [coachRow] = await db()
    .select({ c: count() })
    .from(member)
    .where(eq(member.role, 'coach'));
  const [volRow] = await db()
    .select({ c: count() })
    .from(member)
    .where(eq(member.role, 'volunteer'));
  const [totalRow] = await db()
    .select({ c: count() })
    .from(member);

  console.log('students', Number(studentRow.c));
  console.log('coaches', Number(coachRow.c));
  console.log('volunteers', Number(volRow.c));
  console.log('total', Number(totalRow.c));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
