
import { db } from '@/core/db';
import { communityGroup } from '@/config/db/schema';

async function main() {
  const groups = await db().select().from(communityGroup);
  console.log('--- Groups in DB ---');
  groups.forEach(g => {
    console.log(`${g.id}: ${g.groupName} (Line:${g.productLine}, Period:${g.period}, No:${g.groupNumber})`);
  });
  console.log('Total:', groups.length);
  process.exit(0);
}
main();
