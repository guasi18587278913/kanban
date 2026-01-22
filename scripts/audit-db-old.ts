import { db } from '@/core/db';
import {
  communityDailyReport,
  communityGroup,
  communityImportLog,
  communityKoc,
  communityStarStudent,
} from '@/config/db/schema';
import { communityUser } from '@/config/db/schema-community-user';
import { sql } from 'drizzle-orm';

async function countTable(table: any, name: string) {
  try {
    const [row] = await db().select({ count: sql<number>`count(*)` }).from(table);
    const count = row?.count ?? 0;
    console.log(`${name}: ${count}`);
    return count;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(`${name}: (missing table) ${msg}`);
    return 0;
  }
}

async function main() {
  console.log('🔍 Auditing OLD (legacy) Database Content...');

  await countTable(communityGroup, 'community_group');
  await countTable(communityDailyReport, 'community_daily_report');
  await countTable(communityStarStudent, 'community_star_student');
  await countTable(communityKoc, 'community_koc');
  await countTable(communityImportLog, 'community_import_log');
  if (communityUser) {
    await countTable(communityUser, 'community_user');
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Audit failed:', error);
  process.exit(1);
});
