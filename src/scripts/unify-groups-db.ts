
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../core/db';
import { communityGroup } from '../config/db/schema';
import { eq } from 'drizzle-orm';

const MAPPINGS = [
    { old: '2期AI产品出海新人营-1群', target: 'AI产品出海2期-1群' },
    { old: '2期AI产品出海新人营-2群', target: 'AI产品出海2期-2群' },
];

async function runMigration() {
    console.log('--- Unifying Group Names ---');
    
    for (const map of MAPPINGS) {
        console.log(`Checking ${map.old} -> ${map.target}...`);
        
        // 1. Check if target group exists
        const targets = await db().select().from(communityGroup).where(eq(communityGroup.groupName, map.target));
        const sources = await db().select().from(communityGroup).where(eq(communityGroup.groupName, map.old));
        
        if (sources.length === 0) {
            console.log(`  > Source group "${map.old}" not found. Skipping.`);
            continue;
        }

        console.log(`  > Found ${sources.length} source records for "${map.old}". Updating to "${map.target}"...`);
        
        // Drizzle update
        await db().update(communityGroup)
            .set({ groupName: map.target, productLine: 'AI产品出海' }) // Enforce product line consistency too
            .where(eq(communityGroup.groupName, map.old));
            
        console.log('  > Done.');
    }
    
    console.log('--- Migration Complete ---');
    process.exit(0);
}

runMigration();
