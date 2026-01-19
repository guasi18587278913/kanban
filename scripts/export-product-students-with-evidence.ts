import 'dotenv/config';
import { db } from '@/core/db';
import { member, memberStats, goodNews } from '@/config/db/schema-community-v2';
import { eq, and, sql, gt, gte, desc, inArray } from 'drizzle-orm';

async function main() {
  // 1. 获取符合条件的学员
  const students = await db()
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
        eq(member.period, '1'),
        gte(sql`coalesce(${memberStats.totalMessages}, 0)`, 10),
        gt(sql`coalesce(${memberStats.goodNewsCount}, 0)`, 0)
      )
    )
    .orderBy(desc(sql`coalesce(${memberStats.goodNewsCount}, 0)`));

  // 2. 获取每个学员的好事内容
  const studentIds = students.map(s => s.id);

  const allGoodNews = await db()
    .select({
      memberId: goodNews.memberId,
      content: goodNews.content,
      category: goodNews.category,
      eventDate: goodNews.eventDate,
    })
    .from(goodNews)
    .where(inArray(goodNews.memberId, studentIds))
    .orderBy(desc(goodNews.eventDate));

  // 按学员分组好事
  const newsMap = new Map<string, typeof allGoodNews>();
  for (const n of allGoodNews) {
    if (!n.memberId) continue;
    const list = newsMap.get(n.memberId) || [];
    list.push(n);
    newsMap.set(n.memberId, list);
  }

  // 3. 输出 CSV
  console.log('序号,星球编号,昵称,好事数,消息数,好事原文(证据)');

  let i = 0;
  for (const s of students) {
    i++;
    const nickname = (s.nickname || '').replace(/,/g, '，').replace(/"/g, '""');
    const newsList = newsMap.get(s.id) || [];

    // 合并所有好事内容
    const evidence = newsList
      .map(n => {
        const date = n.eventDate ? new Date(n.eventDate).toISOString().slice(0, 10) : '';
        const content = (n.content || '')
          .replace(/\n/g, ' ')
          .replace(/\r/g, '')
          .replace(/,/g, '，')
          .replace(/"/g, '""')
          .slice(0, 300);
        return `[${date}] ${content}`;
      })
      .join(' ||| ');

    console.log(`${i},${s.planetId || ''},"${nickname}",${s.goodNewsCount},${s.totalMessages},"${evidence}"`);
  }

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
