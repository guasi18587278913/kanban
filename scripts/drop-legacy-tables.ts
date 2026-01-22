import { db } from '@/core/db';
import { sql } from 'drizzle-orm';

const tables = [
  'community_koc',
  'community_star_student',
  'community_daily_report',
  'community_group',
  'community_import_log',
  'community_user',
];

async function main() {
  console.log('🧹 Dropping legacy tables...');

  for (const table of tables) {
    try {
      await db().execute(sql.raw(`DROP TABLE IF EXISTS ${table}`));
      console.log(`- dropped ${table}`);
    } catch (error) {
      console.error(`- failed to drop ${table}:`, error);
      throw error;
    }
  }

  console.log('✅ Legacy tables dropped.');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Drop failed:', error);
  process.exit(1);
});
