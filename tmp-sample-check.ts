import { db } from '@/core/db';
import { communityDailyReport, communityGroup } from '@/config/db/schema';
import { and, eq } from 'drizzle-orm';

const samples: { groupName: string; date: string }[] = [
  { groupName: 'AI产品出海1期-1群', date: '2025-06-01' },
  { groupName: 'AI产品出海1期-1群', date: '2025-12-05' },
  { groupName: 'AI产品出海1期-2群', date: '2025-10-25' },
  { groupName: 'AI产品出海1期-2群', date: '2025-12-05' },
  { groupName: 'AI产品出海2期-1群', date: '2025-11-02' },
  { groupName: 'AI产品出海2期-2群', date: '2025-11-10' },
];

async function main() {
  const groups = await db().select().from(communityGroup);
  const map = new Map(groups.map((g) => [g.groupName, g.id]));
  const results: any[] = [];

  for (const s of samples) {
    const gid = map.get(s.groupName);
    if (!gid) {
      results.push({ ...s, error: 'group not found' });
      continue;
    }
    const date = new Date(s.date);
    const rows = await db()
      .select()
      .from(communityDailyReport)
      .where(and(eq(communityDailyReport.groupId, gid), eq(communityDailyReport.reportDate, date)));
    if (rows.length === 0) {
      results.push({ ...s, found: false });
    } else {
      const r = rows[0];
      results.push({
        ...s,
        found: true,
        messageCount: r.messageCount,
        questionCount: r.questionCount,
        goodNewsCount: r.goodNewsCount,
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
