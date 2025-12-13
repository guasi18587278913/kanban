
import { db } from '@/core/db';
import { communityGroup, communityDailyReport } from '@/config/db/schema';
import { eq, and } from 'drizzle-orm';

async function main() {
  // 1. Get Canonical Groups
  const groups = await db().select().from(communityGroup);
  
  const p2g1 = groups.find(g => g.period === '2期' && g.groupNumber === 1);
  const p2g2 = groups.find(g => g.period === '2期' && g.groupNumber === 2);

  if (!p2g1 || !p2g2) {
    console.error('Critical: Canonical groups not found!');
    process.exit(1);
  }

  console.log(`Canonical Targets:`);
  console.log(`  2期1群 -> ${p2g1.id}`);
  console.log(`  2期2群 -> ${p2g2.id}`);

  // 2. Identify and Migreate Bad Groups
  // Bad Pattern 1: Period '2期1群', No 1
  // Bad Pattern 2: Period '2期1', No 1
  // Bad Pattern 3: Period '2期1', No 21
  
  const badGroups = groups.filter(g => 
    g.period !== '1期' && g.period !== '2期' // Any period that isn't clean
  );

  console.log(`Found ${badGroups.length} fragmented groups.`);

  for (const bg of badGroups) {
      // Determine target
      let targetId = '';
      const name = bg.groupName || '';
      const p = bg.period || '';
      const n = bg.groupNumber;

      // Logic to guess intent
      if (name.includes('1群') || p.includes('1群') || n === 1 || n === 21) {
          targetId = p2g1.id;
      } else if (name.includes('2群') || p.includes('2群') || n === 2) {
          targetId = p2g2.id;
      } else {
          console.log(`Skipping ambiguous group: ${name} (P:${p}, N:${n})`);
          continue;
      }

      console.log(`Migrating ${name} -> ${targetId === p2g1.id ? '2期1群' : '2期2群'}...`);
      
      // Move Reports
      await db()
        .update(communityDailyReport)
        .set({ groupId: targetId })
        .where(eq(communityDailyReport.groupId, bg.id));
      
      // Delete Bad Group
      await db()
        .delete(communityGroup)
        .where(eq(communityGroup.id, bg.id));
  }

  console.log('Consolidation Complete.');
  process.exit(0);
}
main();
