import 'dotenv/config';
import { db } from '@/core/db';
import { kocRecord, member, goodNews } from '@/config/db/schema-community-v2';
import { eq, and, desc, gte, isNotNull, sql } from 'drizzle-orm';

async function main() {
  // 1. 获取所有KOC记录（降低分数门槛到5）
  const kocRecords = await db()
    .select({
      suggestedTitle: kocRecord.suggestedTitle,
      coreAchievement: kocRecord.coreAchievement,
      tags: kocRecord.tags,
      contribution: kocRecord.contribution,
      scoreTotal: kocRecord.scoreTotal,
    })
    .from(kocRecord)
    .innerJoin(member, eq(kocRecord.memberId, member.id))
    .where(
      and(
        eq(member.productLine, 'AI产品出海'),
        gte(kocRecord.scoreTotal, 5),
        isNotNull(kocRecord.suggestedTitle)
      )
    )
    .orderBy(desc(kocRecord.scoreTotal))
    .limit(200);

  console.log(`=== KOC记录 (${kocRecords.length}条) ===\n`);

  for (const r of kocRecords) {
    console.log(`[${r.scoreTotal}分] ${r.suggestedTitle}`);
  }

  // 2. 获取好事记录中的独特内容
  console.log('\n\n=== 好事记录摘要 ===\n');

  const goodNewsRecords = await db()
    .select({
      content: goodNews.content,
      category: goodNews.category,
    })
    .from(goodNews)
    .innerJoin(member, eq(goodNews.memberId, member.id))
    .where(
      and(
        eq(member.productLine, 'AI产品出海'),
        eq(member.period, '1')
      )
    )
    .limit(500);

  // 提取关键词和主题
  const keywords = new Map<string, number>();
  const patterns = [
    /上线了?(.{2,20})(网站|产品|工具|插件|应用|APP)/g,
    /做了?(.{2,20})(工具|产品|网站|插件)/g,
    /(Claude|Cursor|Lovable|Bolt|Vercel|Supabase|Stripe|Creem|SEO|MCP|API).{0,30}/gi,
    /(\d+)(美金|美元|刀|USD|\$|单|用户|访问)/g,
    /(引流|变现|出单|收入|订阅|付费).{0,20}/g,
  ];

  for (const n of goodNewsRecords) {
    const content = n.content || '';
    for (const p of patterns) {
      const matches = content.matchAll(p);
      for (const m of matches) {
        const key = m[0].slice(0, 50);
        keywords.set(key, (keywords.get(key) || 0) + 1);
      }
    }
  }

  // 按频率排序输出
  const sorted = [...keywords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100);
  for (const [k, v] of sorted) {
    if (v >= 2) console.log(`[${v}次] ${k}`);
  }

  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
