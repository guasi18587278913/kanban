
import { db } from '../db';
import { communityDailyReport } from '../db/schema';
import { like } from 'drizzle-orm';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function cleanup() {
  console.log('--- Cleaning up "Unknown" Group Data ---');
  
  try {
      const result = await db().delete(communityDailyReport)
        .where(like(communityDailyReport.groupName, '%Unknown%'))
        .returning({ id: communityDailyReport.id, groupName: communityDailyReport.groupName });
      
      console.log(`✅ Deleted ${result.length} records with 'Unknown' group name.`);
      process.exit(0);
  } catch (error) {
      console.error('❌ Error cleaning up:', error);
      process.exit(1);
  }
}

cleanup();
