import 'dotenv/config';
import { db } from '@/core/db';
import { member, memberTag, goodNews, memberStats } from '@/config/db/schema-community-v2';
import { eq, and, sql, or, ilike, desc } from 'drizzle-orm';

async function main() {
  // 1. 获取有产品上线标签的学员
  const tagMembers = await db()
    .selectDistinct({
      memberId: memberTag.memberId,
      tagName: memberTag.tagName,
    })
    .from(memberTag)
    .innerJoin(member, eq(memberTag.memberId, member.id))
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
        )
      )
    );

  // 2. 获取有产品相关好事的学员
  const goodNewsMembers = await db()
    .selectDistinct({ memberId: goodNews.memberId })
    .from(goodNews)
    .innerJoin(member, eq(goodNews.memberId, member.id))
    .where(
      and(
        eq(member.role, 'student'),
        eq(member.productLine, 'AI产品出海'),
        eq(member.period, '1'),
        or(
          ilike(goodNews.content, '%上线%'),
          ilike(goodNews.content, '%上架%'),
          ilike(goodNews.content, '%发布%'),
          ilike(goodNews.content, '%部署%'),
          ilike(goodNews.content, '%网站%'),
          ilike(goodNews.content, '%插件%'),
          ilike(goodNews.content, '%MVP%'),
          ilike(goodNews.content, '%过审%'),
          eq(goodNews.category, 'milestone')
        )
      )
    );

  // 合并学员ID和标签
  const memberIds = new Set<string>();
  const memberTags = new Map<string, string[]>();

  tagMembers.forEach(m => {
    if (m.memberId) {
      memberIds.add(m.memberId);
      const tags = memberTags.get(m.memberId) || [];
      if (m.tagName) tags.push(m.tagName);
      memberTags.set(m.memberId, tags);
    }
  });

  goodNewsMembers.forEach(m => {
    if (m.memberId) memberIds.add(m.memberId);
  });

  // 获取学员详细信息
  const memberDetails = await db()
    .select({
      id: member.id,
      planetId: member.planetId,
      nickname: member.nickname,
      totalMessages: sql<number>`coalesce(${memberStats.totalMessages}, 0)`,
      goodNewsCount: sql<number>`coalesce(${memberStats.goodNewsCount}, 0)`,
    })
    .from(member)
    .leftJoin(memberStats, eq(member.id, memberStats.memberId))
    .where(
      and(
        eq(member.role, 'student'),
        eq(member.productLine, 'AI产品出海'),
        eq(member.period, '1')
      )
    )
    .orderBy(desc(sql`coalesce(${memberStats.goodNewsCount}, 0)`));

  // 输出名单
  console.log('序号\t星球编号\t昵称\t好事数\t消息数\t产品相关标签');
  console.log('----\t--------\t----\t------\t------\t------------');

  let index = 0;
  for (const m of memberDetails) {
    if (memberIds.has(m.id) === false) continue;
    // 过滤掉消息数<10的不可靠数据
    if (Number(m.totalMessages) < 10) continue;
    index++;
    const tags = (memberTags.get(m.id) || []).slice(0, 3).join(' | ');
    console.log(`${index}\t${m.planetId || '-'}\t${m.nickname}\t${m.goodNewsCount}\t${m.totalMessages}\t${tags}`);
  }

  console.log('----\t--------\t----\t------\t------\t------------');
  console.log(`总计: ${index} 人`);

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
