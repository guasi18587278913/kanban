
import { db } from '@/core/db';
import { 
  communityGroup, 
  communityDailyReport, 
  communityStarStudent, 
  communityKoc 
} from '@/config/db/schema';

async function main() {
  try {
    console.log('🗑️  Cleaning up database...');
    
    // Delete in order of dependencies (though Cascade might handle it, explicit is safer)
    await db().delete(communityStarStudent);
    await db().delete(communityKoc);
    await db().delete(communityDailyReport);
    await db().delete(communityGroup);
    
    console.log('✅ All community data cleared successfully.');
  } catch (error) {
    console.error('❌ Error clearing database:', error);
  }
}

main();
