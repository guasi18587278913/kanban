
import { db } from '@/core/db';
import { communityGroup } from '@/config/db/schema';
import { eq, like } from 'drizzle-orm';

async function main() {
  console.log('🔄 Fixing product line name...');

  // Update '海外AI产品' -> 'AI产品出海'
  const result = await db()
    .update(communityGroup)
    .set({ productLine: 'AI产品出海' })
    .where(like(communityGroup.productLine, '%海外AI产品%'))
    .returning();

  console.log(`✅ Updated ${result.length} groups.`);
  console.log('Now the dashboard should show the data.');
  
  process.exit(0);
}

main();
