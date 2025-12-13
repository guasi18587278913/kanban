
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../core/db';
import { communityGroup } from '../config/db/schema';
import { sql } from 'drizzle-orm';

async function audit() {
    console.log('--- DB Audit: Distinct Product Lines ---');
    const lines = await db().select({ 
        name: communityGroup.productLine, 
        count: sql<number>`count(*)` 
    })
    .from(communityGroup)
    .groupBy(communityGroup.productLine);
    
    console.table(lines);
    
    console.log('\n--- DB Audit: Distinct Group Names ---');
    const groups = await db().select({ 
        name: communityGroup.groupName,
        line: communityGroup.productLine,
        count: sql<number>`count(*)` 
    })
    .from(communityGroup)
    .groupBy(communityGroup.groupName, communityGroup.productLine)
    .orderBy(communityGroup.groupName);
    
    console.table(groups);
    
    process.exit(0);
}

audit();
