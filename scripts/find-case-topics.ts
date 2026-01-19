import 'dotenv/config';
import { db } from '@/core/db';
import { kocRecord, member, goodNews } from '@/config/db/schema-community-v2';
import { eq, and, desc, gte, isNotNull, or, ilike, sql } from 'drizzle-orm';

async function main() {
  // 1. 获取有具体成果数据的KOC记录
  console.log('=== 有具体案例的KOC记录 ===\n');

  const kocRecords = await db()
    .select({
      suggestedTitle: kocRecord.suggestedTitle,
      coreAchievement: kocRecord.coreAchievement,
      contribution: kocRecord.contribution,
      scoreTotal: kocRecord.scoreTotal,
      nickname: member.nickname,
    })
    .from(kocRecord)
    .innerJoin(member, eq(kocRecord.memberId, member.id))
    .where(
      and(
        eq(member.productLine, 'AI产品出海'),
        gte(kocRecord.scoreTotal, 6)
      )
    )
    .orderBy(desc(kocRecord.scoreTotal))
    .limit(300);

  // 筛选有案例特征的记录
  const caseKeywords = [
    /\d+美金/,
    /\d+美元/,
    /\d+刀/,
    /\d+\$/,
    /\d+USD/,
    /月入/,
    /日入/,
    /收入/,
    /变现/,
    /出单/,
    /首单/,
    /上线/,
    /过审/,
    /用户/,
    /订阅/,
    /付费/,
    /小时/,
    /天/,
    /周/,
    /从零/,
    /零基础/,
    /小白/,
    /逆袭/,
    /实操/,
    /复盘/,
  ];

  let count = 0;
  for (const r of kocRecords) {
    const text = `${r.suggestedTitle || ''} ${r.coreAchievement || ''} ${r.contribution || ''}`;
    const hasCase = caseKeywords.some(k => k.test(text));

    if (hasCase && r.suggestedTitle) {
      count++;
      console.log(`${count}. [${r.scoreTotal}分] ${r.nickname}`);
      console.log(`   标题: ${r.suggestedTitle}`);
      if (r.coreAchievement) {
        console.log(`   成果: ${r.coreAchievement.slice(0, 150)}`);
      }
      console.log('');
    }
  }

  // 2. 获取好事记录中有具体成果的
  console.log('\n\n=== 好事记录中的案例 ===\n');

  const goodNewsRecords = await db()
    .select({
      content: goodNews.content,
      category: goodNews.category,
      nickname: member.nickname,
      planetId: member.planetId,
    })
    .from(goodNews)
    .innerJoin(member, eq(goodNews.memberId, member.id))
    .where(
      and(
        eq(member.productLine, 'AI产品出海'),
        eq(member.period, '1'),
        or(
          ilike(goodNews.content, '%美金%'),
          ilike(goodNews.content, '%美元%'),
          ilike(goodNews.content, '%刀%'),
          ilike(goodNews.content, '%出单%'),
          ilike(goodNews.content, '%首单%'),
          ilike(goodNews.content, '%上线%'),
          ilike(goodNews.content, '%变现%'),
          ilike(goodNews.content, '%收入%'),
          ilike(goodNews.content, '%订阅%'),
          ilike(goodNews.content, '%付费%'),
          ilike(goodNews.content, '%用户%'),
          eq(goodNews.category, 'revenue'),
          eq(goodNews.category, 'milestone')
        )
      )
    )
    .orderBy(desc(goodNews.eventDate))
    .limit(200);

  let newsCount = 0;
  for (const n of goodNewsRecords) {
    newsCount++;
    const content = (n.content || '').replace(/\n/g, ' ').slice(0, 200);
    console.log(`${newsCount}. ${n.nickname} (${n.planetId})`);
    console.log(`   ${content}`);
    console.log('');
  }

  console.log(`\n总计: KOC案例 ${count} 条, 好事案例 ${newsCount} 条`);

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
