
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../core/db';
import { communityGroup } from '../config/db/schema';
import { eq, like, and } from 'drizzle-orm';

async function unifyYoutubeGroups() {
    console.log('--- Unifying YouTube Group Names ---');
    
    // Target: "YouTube AI视频2群"
    // Source Pattern: Anything with "YouTube" AND "新人营" AND "2群" (or similar)
    // Actually, user provided screenshot shows "YouTube AI 视频新人营2群" (spaces vary).
    
    const TARGET_NAME = 'YouTube AI视频2群';
    const TARGET_PRODUCT = 'YouTube AI视频';
    
    // Logic: Find any YouTube group that mentions "新人营" and "2群"
    const groups = await db().select().from(communityGroup)
        .where(and(
            like(communityGroup.groupName, '%YouTube%'),
            like(communityGroup.groupName, '%新人营%'),
            like(communityGroup.groupName, '%2群%')
        ));

    if (groups.length === 0) {
        console.log('No "YouTube ... 新人营 ... 2群" groups found.');
    } else {
        console.log(`Found ${groups.length} matching groups to unify.`);
        
        for (const g of groups) {
             if (g.groupName === TARGET_NAME) continue;

             console.log(`Fixing "${g.groupName}" -> "${TARGET_NAME}"`);
             await db().update(communityGroup)
                .set({
                    groupName: TARGET_NAME,
                    productLine: TARGET_PRODUCT
                })
                .where(eq(communityGroup.id, g.id));
        }
    }
    
    // Also check for "YouTube AI 视频2群" (extra space variant shown in screenshot)
    // To be safe, let's normalize ANY "YouTube ... 2群" that isn't the distinct correct name?
    // User specifically asked for this conversion.
    
    const groupsSpaces = await db().select().from(communityGroup)
        .where(like(communityGroup.groupName, 'YouTube AI 视频2群%')); // Matches specific space pattern
        
    for (const g of groupsSpaces) {
         if (g.groupName === TARGET_NAME) continue;
         
         console.log(`Fixing Space Variant "${g.groupName}" -> "${TARGET_NAME}"`);
         await db().update(communityGroup)
            .set({ groupName: TARGET_NAME, productLine: TARGET_PRODUCT })
            .where(eq(communityGroup.id, g.id));
    }
    
    console.log('✅ YouTube Unification Complete.');
    process.exit(0);
}

unifyYoutubeGroups();
