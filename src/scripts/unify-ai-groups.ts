
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../core/db';
import { communityGroup } from '../config/db/schema';
import { eq, like, and } from 'drizzle-orm';

async function unifyAiGroups() {
    console.log('--- Unifying AI Product Group Names ---');
    
    // Explicit mappings for the observed "Short Format" -> "Standard Format"
    // Hypothesized Logic: "XY群" -> "X期-Y群"
    const TARGETS = [
        { pattern: '%AI产品出海21群%', target: 'AI产品出海2期-1群', period: '2期', number: 1 },
        { pattern: '%AI产品出海22群%', target: 'AI产品出海2期-2群', period: '2期', number: 2 },
        { pattern: '%AI产品出海11群%', target: 'AI产品出海1期-1群', period: '1期', number: 1 },
        { pattern: '%AI产品出海12群%', target: 'AI产品出海1期-2群', period: '1期', number: 2 },
        
        // Covering potential variants like "AI产品出海新人营2群" seen in previous contexts
        // { pattern: '%新人营%', target: 'AI产品出海2期-1群', period: '2期', number: 1 } // Be careful not to over-match
    ];
    
    let totalUpdated = 0;

    for (const logic of TARGETS) {
        // Find existing groups matching the pattern BUT NOT the target (to avoid double updating)
        const groups = await db().select().from(communityGroup)
            .where(and(
                like(communityGroup.groupName, logic.pattern),
                // Exclude if it's already correct (this check is loose via LIKE, refined below)
             ));
        
        for (const g of groups) {
            if (g.groupName === logic.target) continue; // Already perfect

            console.log(`Fixing "${g.groupName}" -> "${logic.target}"`);
            
            await db().update(communityGroup)
                .set({
                    groupName: logic.target,
                    productLine: 'AI产品出海',
                    period: logic.period,
                    groupNumber: logic.number
                })
                .where(eq(communityGroup.id, g.id));
                
            totalUpdated++;
        }
    }
    
    // Fallback: Check if there are any that match stricter "Digit + 群" logic if not covered above?
    // For now, the user's screenshot showed specific cases "21群", "12群", "11群".
    
    console.log(`✅ Unification Complete. Updated ${totalUpdated} groups.`);
    process.exit(0);
}

unifyAiGroups();
