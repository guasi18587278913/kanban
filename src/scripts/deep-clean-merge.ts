
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../core/db';
import { communityGroup, communityDailyReport } from '../config/db/schema';
import { eq, like, or, not, and } from 'drizzle-orm';

async function deepClean() {
    console.log('--- Deep Clean & Merge Started ---');

    // 1. Define Canonical Groups we want to allow
    // Format: { name: string, product: string, aliases: string[] }
    // We will search for 'aliases' (fuzzy or exact) and MERGE them into 'name'.
    const RULES = [
        {
            targetName: 'YouTube AI视频2群',
            targetProduct: 'YouTube AI视频',
            // Match any group name containing these, UNLESS it is the target itself
            matchLike: ['%YouTube%AI%视频%2群%', '%YouTube%AI%Video%2群%', '%10月09日-12月03日%'] 
        },
        {
            targetName: 'YouTube AI视频1群',
            targetProduct: 'YouTube AI视频',
            matchLike: ['%YouTube%AI%视频%1群%', '%YouTube%AI%Video%1群%']
        },
        {
            // Fix the Space in Product Line "YouTube AI 视频"
            targetName: 'YouTube AI视频2群', // Fallback target if we can't determine number? 
                                          // Actually checking ProductLine level first might be better.
            targetProduct: 'YouTube AI视频',
            matchLike: [] 
        }
    ];

    // --- STEP A: Normalise Product Lines (Update strings first) ---
    console.log('\n--- Step A: Normalizing Product Lines ---');
    // Fix "YouTube AI 视频" -> "YouTube AI视频"
    await db().update(communityGroup)
        .set({ productLine: 'YouTube AI视频' })
        .where(like(communityGroup.productLine, 'YouTube AI 视频%')); // Catch suffix chars too if any
        
    await db().update(communityGroup)
        .set({ productLine: 'YouTube AI视频' })
        .where(like(communityGroup.productLine, 'YouTube AI Video%'));
        
    console.log('Product Line strings normalized.');


    // --- STEP B: Merge Duplicate Groups ---
    console.log('\n--- Step B: Merging Duplicate Groups ---');
    
    // We need to handle specific merges. 
    // Key problem: We might have multiple groups named "YouTube AI视频2群" now (if previous script just renamed them).
    // Or we have "YouTube AI 视频10月..." (Bad Name).
    
    // Strategy:
    // 1. Find the "Master" ID for 'YouTube AI视频2群'. If multiple, pick one as Master.
    // 2. Find all other IDs that SHOULD be 'YouTube AI视频2群' (based on name or previous bad name).
    // 3. Move reports, Delete others.

    const GROUPS_TO_FIX = [
        'YouTube AI视频2群',
        'YouTube AI视频1群', 
        'YouTube AI视频3群'
    ];

    for (const groupName of GROUPS_TO_FIX) {
        console.log(`Processing ${groupName}...`);
        
        // Find ALL groups that look like this (exact match)
        // PLUS groups that look like "YouTube AI 视频...2群" (Bad names)
        
        // Actually, let's grab everything that looks like YouTube 2群
        const candidates = await db().select().from(communityGroup)
            .where(or(
                eq(communityGroup.groupName, groupName),
                and(like(communityGroup.groupName, '%YouTube%'), like(communityGroup.groupName, '%2群%')),
                // Catch the specific bad one user showed
                like(communityGroup.groupName, '%10月09日-12月03日%')
            ));
            
        // Filter candidates to those that really seem to be this group
        // If we are processing '2群', we don't want to accidentally grab '1群' if logic is loose.
        const targetNumber = groupName.match(/(\d+)群/)?.[1];
        
        const validCandidates = candidates.filter(c => {
            // Confirm it contains the right number, OR is the known weird date one which is 2群
            if (c.groupName.includes(`${targetNumber}群`)) return true;
            if (c.groupName.includes('2群') && targetNumber === '2') return true;
            return false;
        });

        if (validCandidates.length <= 1) {
             if (validCandidates.length === 1 && validCandidates[0].groupName !== groupName) {
                 // Rename single bad record to good record
                 console.log(`  Renaming single record: ${validCandidates[0].groupName} -> ${groupName}`);
                 await db().update(communityGroup)
                    .set({ groupName: groupName, productLine: 'YouTube AI视频' })
                    .where(eq(communityGroup.id, validCandidates[0].id));
             }
             continue; // Nothing to merge
        }
        
        console.log(`  Found ${validCandidates.length} potential duplicates/variants for ${groupName}`);
        
        // Pick Master: Prefer one that already has the exact correct name
        let master = validCandidates.find(c => c.groupName === groupName);
        if (!master) {
            master = validCandidates[0];
            // Rename it to be standard
            await db().update(communityGroup)
                .set({ groupName: groupName, productLine: 'YouTube AI视频' })
                .where(eq(communityGroup.id, master!.id));
        }
        
        console.log(`  Selected Master ID: ${master!.id} (${master!.groupName})`);
        
        // Merge others
        for (const other of validCandidates) {
            if (other.id === master!.id) continue;
            
            console.log(`  Merging contents of [${other.groupName}] (ID: ${other.id}) into Master...`);
            
            // 1. Update Reports
            await db().update(communityDailyReport)
                .set({ groupId: master!.id })
                .where(eq(communityDailyReport.groupId, other.id));
                
            // 2. Delete Group
            await db().delete(communityGroup)
                .where(eq(communityGroup.id, other.id));
        }
    }
    
    console.log('--- Deep Clean Complete ---');
    process.exit(0);
}

deepClean();
