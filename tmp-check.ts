import { db } from '@/core/db';
import { communityDailyReport, communityGroup, communityImportLog } from '@/config/db/schema';

async function main() {
  const groups = await db().select().from(communityGroup);
  const reports = await db().select().from(communityDailyReport);
  const logs = await db().select().from(communityImportLog);
  const failed = logs.filter((l) => l.status === 'FAILED');
  const success = logs.filter((l) => l.status === 'SUCCESS');
  const byGroup: Record<string, number> = {};
  reports.forEach((r) => {
    const g = groups.find((g) => g.id === r.groupId);
    const name = g
      ? `${g.productLine}${g.period || ''}-${g.groupNumber}群`
      : r.groupId;
    byGroup[name] = (byGroup[name] || 0) + 1;
  });
  console.log({
    groups: groups.length,
    dailyReports: reports.length,
    importLogs: logs.length,
    success: success.length,
    failed: failed.length,
    reportsByGroup: byGroup,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
