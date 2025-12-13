
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../core/db';
import { communityGroup } from '../config/db/schema';
import { like, eq } from 'drizzle-orm';

async function fixYoutubeName() {
    console.log('--- Fixing YouTube Group Name ---');
    
    const badNamePattern = '%YouTube AI Video%';
    
    // 1. Find the bad group
    const groups = await db().select().from(communityGroup).where(like(communityGroup.groupName, badNamePattern));
    
    if (groups.length === 0) {
        console.log('No group found matching "YouTube AI Video". It might have been cleaned up explicitly.');
        // Try searching by the weird suffix
        const groups2 = await db().select().from(communityGroup).where(like(communityGroup.groupName, '%2025-11-012群%'));
        if (groups2.length > 0) {
             console.log('Found by suffix match!');
             await updateGroups(groups2);
        } else {
             console.log('❌ Could not find the incorrect group.');
        }
    } else {
        console.log(`Found ${groups.length} matching groups.`);
        await updateGroups(groups);
    }
    
    async function updateGroups(list: typeof groups) {
        for (const g of list) {
            console.log(`Updating "${g.groupName}" -> "YouTube AI视频2群"...`);
            await db().update(communityGroup)
                .set({ 
                    groupName: 'YouTube AI视频2群',
                    productLine: 'YouTube AI视频'
                })
                .where(eq(communityGroup.id, g.id));
        }
        console.log('✅ Update Complete.');
    }
    
    process.exit(0);
}

fixYoutubeName();
