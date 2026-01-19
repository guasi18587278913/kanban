import 'dotenv/config';
import { db } from '@/core/db';
import { member, memberStats, goodNews } from '@/config/db/schema-community-v2';
import { eq, and, gt, sql, count, countDistinct } from 'drizzle-orm';

/**
 * 统计 AI产品出海1期 学员有多少人有好事发生
 */

async function main() {
  console.log('开始统计 AI产品出海1期 学员好事数据...\n');

  // 1. 统计一期学员总数
  const [totalStudents] = await db()
    .select({ count: count() })
    .from(member)
    .where(
      and(
        eq(member.role, 'student'),
        eq(member.productLine, 'AI产品出海'),
        eq(member.period, '1')  // 数据库中存储为 '1' 而非 '1期'
      )
    );
  console.log(`一期学员总数: ${totalStudents?.count || 0}`);

  // 2. 方法1：通过 memberStats 表统计有好事的学员数
  const [withGoodNewsViaStats] = await db()
    .select({ count: count() })
    .from(member)
    .leftJoin(memberStats, eq(member.id, memberStats.memberId))
    .where(
      and(
        eq(member.role, 'student'),
        eq(member.productLine, 'AI产品出海'),
        eq(member.period, '1')  // 数据库中存储为 '1' 而非 '1期',
        gt(memberStats.goodNewsCount, 0)
      )
    );
  console.log(`\n通过 memberStats 统计有好事的学员: ${withGoodNewsViaStats?.count || 0}`);

  // 3. 方法2：直接从 goodNews 表统计去重的学员数
  const [withGoodNewsViaDirect] = await db()
    .select({ count: countDistinct(goodNews.memberId) })
    .from(goodNews)
    .innerJoin(member, eq(goodNews.memberId, member.id))
    .where(
      and(
        eq(member.role, 'student'),
        eq(member.productLine, 'AI产品出海'),
        eq(member.period, '1')  // 数据库中存储为 '1' 而非 '1期',
        eq(goodNews.isVerified, true) // 只统计已审核的好事
      )
    );
  console.log(`通过 goodNews 表直接统计(已审核): ${withGoodNewsViaDirect?.count || 0}`);

  // 4. 不限审核状态的统计
  const [withGoodNewsAll] = await db()
    .select({ count: countDistinct(goodNews.memberId) })
    .from(goodNews)
    .innerJoin(member, eq(goodNews.memberId, member.id))
    .where(
      and(
        eq(member.role, 'student'),
        eq(member.productLine, 'AI产品出海'),
        eq(member.period, '1')  // 数据库中存储为 '1' 而非 '1期'
      )
    );
  console.log(`通过 goodNews 表直接统计(全部): ${withGoodNewsAll?.count || 0}`);

  // 5. 好事总数统计
  const [totalGoodNews] = await db()
    .select({ count: count() })
    .from(goodNews)
    .innerJoin(member, eq(goodNews.memberId, member.id))
    .where(
      and(
        eq(member.role, 'student'),
        eq(member.productLine, 'AI产品出海'),
        eq(member.period, '1')  // 数据库中存储为 '1' 而非 '1期'
      )
    );
  console.log(`一期学员好事总数: ${totalGoodNews?.count || 0}`);

  // 6. 按好事数量分布统计
  console.log('\n--- 好事数量分布 ---');
  const distribution = await db()
    .select({
      goodNewsCount: memberStats.goodNewsCount,
      studentCount: count(),
    })
    .from(member)
    .leftJoin(memberStats, eq(member.id, memberStats.memberId))
    .where(
      and(
        eq(member.role, 'student'),
        eq(member.productLine, 'AI产品出海'),
        eq(member.period, '1')  // 数据库中存储为 '1' 而非 '1期'
      )
    )
    .groupBy(memberStats.goodNewsCount)
    .orderBy(memberStats.goodNewsCount);

  for (const row of distribution) {
    const cnt = row.goodNewsCount ?? 0;
    console.log(`  ${cnt} 条好事: ${row.studentCount} 人`);
  }

  // 汇总
  const total = Number(totalStudents?.count || 0);
  const withNews = Number(withGoodNewsViaStats?.count || 0);
  const percentage = total > 0 ? ((withNews / total) * 100).toFixed(2) : '0';

  console.log('\n========== 统计结果 ==========');
  console.log(`AI产品出海1期 学员总数: ${total} 人`);
  console.log(`有好事发生的学员: ${withNews} 人`);
  console.log(`好事发生率: ${percentage}%`);
  console.log('================================');

  process.exit(0);
}

main().catch((e) => {
  console.error('统计失败:', e);
  process.exit(1);
});
