
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../core/db';
import { communityGroup } from '../config/db/schema';
import { eq, like } from 'drizzle-orm';

async function unifyBilibiliGroups() {
    console.log('--- Unifying Bilibili Group Names ---');
    
    const TARGET_NAME = 'B站好物1期';
    const TARGET_PRODUCT = 'B站好物交流'; // Or 'B站好物'? Keeping product line slightly descriptive or based on user intent. 
                                         // User only specified group name "B站好物1期". 
                                         // Let's set productLine to "B站好物" to match.
    
    // Find ALL groups containing "B站"
    const groups = await db().select().from(communityGroup)
        .where(like(communityGroup.groupName, '%B站%'));

    if (groups.length === 0) {
        console.log('No "B站" groups found.');
    } else {
        console.log(`Found ${groups.length} matching groups.`);
        
        for (const g of groups) {
             if (g.groupName === TARGET_NAME) continue;

             console.log(`Fixing "${g.groupName}" -> "${TARGET_NAME}"`);
             await db().update(communityGroup)
                .set({
                    groupName: TARGET_NAME,
                    productLine: 'B站好物', 
                    period: '1期',
                    groupNumber: 1
                })
                .where(eq(communityGroup.id, g.id));
        }
    }
    
    console.log('✅ Bilibili Unification Complete.');
    process.exit(0);
}

unifyBilibiliGroups();
