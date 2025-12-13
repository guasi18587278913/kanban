
import { db } from '@/core/db';
import { communityGroup, communityDailyReport } from '@/config/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('🧹 Cleaning up test data...');

  // Delete groups with productLine 'TEST_PRODUCT' (cascade should handle reports, but we can be explicit if needed)
  // The schema defines 'cascade' on delete for references to group.
  
  const result = await db()
    .delete(communityGroup)
    .where(eq(communityGroup.productLine, 'TEST_PRODUCT'))
    .returning();

  console.log(`✅ Deleted ${result.length} test groups.`);
  process.exit(0);
}

main();
