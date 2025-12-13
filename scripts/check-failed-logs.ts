
import { db } from '@/core/db';
import { communityImportLog } from '@/config/db/schema';
import { eq, like } from 'drizzle-orm';

async function main() {
  console.log('🔍 Checking Failed Import Logs...');
  const logs = await db()
    .select()
    .from(communityImportLog)
    .where(eq(communityImportLog.status, 'FAILED'));

  console.log(`Found ${logs.length} failed logs.`);
  
  // Group by error message
  const errors = new Map<string, number>();
  logs.forEach(l => {
    const msg = l.message || 'Unknown Error';
    errors.set(msg, (errors.get(msg) || 0) + 1);
  });

  console.log('\n--- Error Summary ---');
  for (const [msg, count] of errors.entries()) {
    console.log(`[${count}x] ${msg}`);
  }

  console.log('\n--- First 10 Failed Files ---');
  logs.slice(0, 10).forEach(l => console.log(`${l.fileName}: ${l.message}`));
  
  process.exit(0);
}

main();
