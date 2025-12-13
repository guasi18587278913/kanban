
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../core/db';
import { communityGroup } from '../config/db/schema';
import { like, not, and, or, eq } from 'drizzle-orm';

async function masterUnify() {
    console.log('--- Master Unification Started ---');
    
    const allGroups = await db().select().from(communityGroup);
    console.log(`Analyzing ${allGroups.length} total groups...`);
    
    let updates = 0;
    
    for (const g of allGroups) {
        let newName = g.groupName;
        let newProduct = g.productLine;
        let newPeriod = g.period;
        let newNumber = g.groupNumber;
        
        const currentName = g.groupName;
        
        // --- 1. YouTube Strategy ---
        if (currentName.toLowerCase().includes('youtube')) {
            newProduct = 'YouTube AI视频';
            
            if (currentName.includes('1群')) {
                newName = 'YouTube AI视频1群';
                newNumber = 1;
            } else if (currentName.includes('2群')) {
                newName = 'YouTube AI视频2群';
                newNumber = 2;
            } else if (currentName.includes('3群')) {
                newName = 'YouTube AI视频3群';
                newNumber = 3;
            }
            // Period is usually undefined for YouTube in this scheme
            newPeriod = null; 
        }
        
        // --- 2. Bilibili Strategy ---
        else if (currentName.includes('B站') || currentName.includes('好物')) {
            newProduct = 'B站好物';
            newName = 'B站好物1期';
            newPeriod = '1期';
            newNumber = 1; // User said unified to "1期", implying 1 group? Or "1期" is the name?
                           // User request: "统一叫——B站好物1期". 
                           // I'll set groupName='B站好物1期'.
        }
        
        // --- 3. AI Product Strategy (The Rest) ---
        else {
            // Assume belonging to AI Product Line
            newProduct = 'AI产品出海';
            
            let isPeriod1 = currentName.includes('1期');
            let isPeriod2 = currentName.includes('2期') || currentName.includes('新人营') || currentName.includes('新手村');
            
            let isGroup1 = currentName.includes('1群') || currentName.includes('11群') || currentName.includes('21群');
            let isGroup2 = currentName.includes('2群') || currentName.includes('12群') || currentName.includes('22群');
            
            // Deduce Period
            if (isPeriod1) {
                newPeriod = '1期';
            } else if (isPeriod2) {
                newPeriod = '2期';
            } else {
                // If neither found, looking at name like "深海圈1期1群" -> caught by isPeriod1.
                // What about "深海圈" generic? If nothing found, maybe default to 1期? 
                // Or leave as is if we can't determine.
                // But generally "Unknown" files were deleted. Everything here should have at least a group number.
                if (isGroup1) newPeriod = '1期'; // Weak fallback if period missing? No, risky.
            }
            
            // Deduce Group Number & Construct Name
            if (newPeriod === '1期') {
                if (isGroup2) {
                    newName = 'AI产品出海1期-2群';
                    newNumber = 2;
                } else {
                    newName = 'AI产品出海1期-1群';
                    newNumber = 1;
                }
            } else if (newPeriod === '2期') {
                if (isGroup2) {
                    newName = 'AI产品出海2期-2群';
                    newNumber = 2;
                } else {
                    newName = 'AI产品出海2期-1群';
                    newNumber = 1;
                }
            }
        }
        
        // Apply Update if Changed
        if (newName !== g.groupName || newProduct !== g.productLine) {
            console.log(`Updating: [${g.groupName}] -> [${newName}] | Product: ${newProduct}`);
            
            await db().update(communityGroup)
                .set({
                    groupName: newName,
                    productLine: newProduct,
                    period: newPeriod,
                    groupNumber: newNumber
                })
                .where(eq(communityGroup.id, g.id));
                
            updates++;
        }
    }
    
    console.log(`--- Master Unification Complete. Updated ${updates} records. ---`);
    process.exit(0);
}

masterUnify();
