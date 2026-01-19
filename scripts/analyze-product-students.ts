import 'dotenv/config';
import { db } from '@/core/db';
import { member, memberTag, goodNews, memberStats } from '@/config/db/schema-community-v2';
import { eq, and, sql, or, ilike, desc, gt, gte } from 'drizzle-orm';

/**
 * 分析做出产品的学员数据质量
 * 问题：有些学员消息数为0，但被标记为有产品
 */

async function main() {
  console.log('=== 分析产品学员数据质量 ===\n');

  // 1. 查看有产品标签但消息数为0的学员
  const zeroMsgWithTags = await db()
    .selectDistinct({
      id: member.id,
      nickname: member.nickname,
      totalMessages: sql<number>`coalesce(${memberStats.totalMessages}, 0)`,
    })
    .from(memberTag)
    .innerJoin(member, eq(memberTag.memberId, member.id))
    .leftJoin(memberStats, eq(member.id, memberStats.memberId))
    .where(
      and(
        eq(member.role, 'student'),
        eq(member.productLine, 'AI产品出海'),
        eq(member.period, '1'),
        or(
          and(
            eq(memberTag.tagCategory, 'stage'),
            or(
              ilike(memberTag.tagName, '%上线%'),
              ilike(memberTag.tagName, '%MVP%'),
              ilike(memberTag.tagName, '%变现%'),
              ilike(memberTag.tagName, '%上架%')
            )
          ),
          and(
            eq(memberTag.tagCategory, 'achievement'),
            or(
              ilike(memberTag.tagName, '%上线%'),
              ilike(memberTag.tagName, '%上架%'),
              ilike(memberTag.tagName, '%产品%'),
              ilike(memberTag.tagName, '%MVP%'),
              ilike(memberTag.tagName, '%过审%'),
              ilike(memberTag.tagName, '%首单%'),
              ilike(memberTag.tagName, '%出单%')
            )
          )
        ),
        sql`coalesce(${memberStats.totalMessages}, 0) < 10`
      )
    );

  console.log(`有产品标签但消息数<10的学员: ${zeroMsgWithTags.length} 人`);
  console.log('(这些数据可能不可靠)\n');

  // 2. 更严格的统计：消息数>=10 且 有好事记录
  const reliableWithGoodNews = await db()
    .selectDistinct({ memberId: goodNews.memberId })
    .from(goodNews)
    .innerJoin(member, eq(goodNews.memberId, member.id))
    .leftJoin(memberStats, eq(member.id, memberStats.memberId))
    .where(
      and(
        eq(member.role, 'student'),
        eq(member.productLine, 'AI产品出海'),
        eq(member.period, '1'),
        gte(sql`coalesce(${memberStats.totalMessages}, 0)`, 10),
        or(
          ilike(goodNews.content, '%上线%'),
          ilike(goodNews.content, '%上架%'),
          ilike(goodNews.content, '%发布%'),
          ilike(goodNews.content, '%网站%'),
          ilike(goodNews.content, '%插件%'),
          ilike(goodNews.content, '%MVP%'),
          ilike(goodNews.content, '%过审%'),
          ilike(goodNews.content, '%首单%'),
          ilike(goodNews.content, '%出单%'),
          ilike(goodNews.content, '%变现%'),
          eq(goodNews.category, 'milestone'),
          eq(goodNews.category, 'revenue')
        )
      )
    );

  console.log(`消息数>=10 且 有产品相关好事: ${reliableWithGoodNews.length} 人`);

  // 3. 消息数>=10 且 有产品标签
  const reliableWithTags = await db()
    .selectDistinct({ memberId: memberTag.memberId })
    .from(memberTag)
    .innerJoin(member, eq(memberTag.memberId, member.id))
    .leftJoin(memberStats, eq(member.id, memberStats.memberId))
    .where(
      and(
        eq(member.role, 'student'),
        eq(member.productLine, 'AI产品出海'),
        eq(member.period, '1'),
        gte(sql`coalesce(${memberStats.totalMessages}, 0)`, 10),
        or(
          and(
            eq(memberTag.tagCategory, 'stage'),
            or(
              ilike(memberTag.tagName, '%上线%'),
              ilike(memberTag.tagName, '%MVP%'),
              ilike(memberTag.tagName, '%变现%'),
              ilike(memberTag.tagName, '%上架%')
            )
          ),
          and(
            eq(memberTag.tagCategory, 'achievement'),
            or(
              ilike(memberTag.tagName, '%上线%'),
              ilike(memberTag.tagName, '%上架%'),
              ilike(memberTag.tagName, '%产品%'),
              ilike(memberTag.tagName, '%MVP%'),
              ilike(memberTag.tagName, '%过审%'),
              ilike(memberTag.tagName, '%首单%'),
              ilike(memberTag.tagName, '%出单%')
            )
          )
        )
      )
    );

  console.log(`消息数>=10 且 有产品标签: ${reliableWithTags.length} 人`);

  // 4. 合并去重
  const allReliable = new Set<string>();
  reliableWithGoodNews.forEach(m => { if (m.memberId) allReliable.add(m.memberId); });
  reliableWithTags.forEach(m => { if (m.memberId) allReliable.add(m.memberId); });

  console.log(`\n合并去重后(消息>=10): ${allReliable.size} 人`);

  // 5. 一期学员有消息的总数
  const [activeStudents] = await db()
    .select({ count: sql<number>`count(distinct ${member.id})` })
    .from(member)
    .leftJoin(memberStats, eq(member.id, memberStats.memberId))
    .where(
      and(
        eq(member.role, 'student'),
        eq(member.productLine, 'AI产品出海'),
        eq(member.period, '1'),
        gte(sql`coalesce(${memberStats.totalMessages}, 0)`, 10)
      )
    );

  const activeCount = Number(activeStudents?.count || 0);
  const productCount = allReliable.size;
  const percentage = activeCount > 0 ? ((productCount / activeCount) * 100).toFixed(2) : '0';

  console.log('\n========== 修正后的统计 ==========');
  console.log(`一期学员总数: 899 人`);
  console.log(`活跃学员(消息>=10): ${activeCount} 人`);
  console.log(`做出产品的活跃学员: ${productCount} 人`);
  console.log(`活跃学员产品率: ${percentage}%`);
  console.log(`整体产品率: ${((productCount / 899) * 100).toFixed(2)}%`);
  console.log('===================================');

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
