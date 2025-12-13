import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { db } from '../core/db';
import { communityGroup, communityDailyReport } from '../config/db/schema';
import { eq, and } from 'drizzle-orm';
import { parseFilenameMeta } from '../lib/community-raw-parser';
import { clearCommunityData, importRawChatLogWithLLM } from '../actions/community-actions';
import { ChatSplitter } from '../lib/chat-splitter';
import * as fs from 'fs';
import * as path from 'path';

// This script simulates a server environment to import files dropped into private/import
async function runBatchImport() {
  const importDir = path.join(process.cwd(), 'private/import');
  
  if (!fs.existsSync(importDir)) {
    console.error(`Directory not found: ${importDir}`);
    console.log('Please create private/import and put .txt files there.');
    process.exit(1);
  }

  // 1. Clear Old Data (Only if no filter)
  const filter = process.argv[2];
  
  if (filter === '--cleanup') {
      console.log('--- Cleaning up "Unknown" Group Data ---');
      try {
          // Use direct SQL or schema method if available, or just delete logic
          // Since we already imported clearCommunityData, let's use db directly
          const { communityGroup } = await import('../config/db/schema');
          const { like } = await import('drizzle-orm');
          
          await db().delete(communityGroup)
            .where(like(communityGroup.groupName, '%Unknown%'));
            
          console.log('✅ Deleted "Unknown" groups (and cascaded reports).');
          process.exit(0);
      } catch (e) {
          console.error('Cleanup failed:', e);
          process.exit(1);
      }
  }

  if (!filter) {
      console.log('--- 1. Clearing Database ---');
      await clearCommunityData();
      console.log('Database cleared.');
  } else {
      console.log(`--- 1. Appending Mdoe (Filter: "${filter}") ---`);
      console.log('Skipping DB clear.');
  }

  // 2. Find Files (Recursive)
  function findTxtFiles(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        results = results.concat(findTxtFiles(filePath));
      } else if (file.endsWith('.txt')) {
        results.push(filePath); // Store absolute path
      }
    });
    return results;
  }

  let allFiles = findTxtFiles(importDir);
  
  // CLI Filter Application
  if (filter) {
      console.log(`\n🔍 Filtering files by keyword: "${filter}"`);
      allFiles = allFiles.filter(f => f.includes(filter));
  }

  console.log(`--- 2. Found ${allFiles.length} files to import ---`);

  if (allFiles.length === 0) {
    console.log('No .txt files found.');
    process.exit(0);
  }

  // 3. Process each file
  let successCount = 0;
  let failCount = 0;

  for (const filePath of allFiles) {
    let filename = path.basename(filePath);
    
    // Context Injection:
    // If filename starts with a digit (e.g. "2群...") or doesn't look like a full name,
    // try to prepend the parent directory name to help the parser.
    const parentDir = path.basename(path.dirname(filePath));
    if (!filename.includes('深海圈') && !filename.includes('丨') && parentDir && parentDir !== 'import') {
        // Construct a virtual filename: "深海圈丨ParentDir_Filename"
        const cleanParent = parentDir.trim();
        // Remove simple dates if present in parent dir to avoid double dates
        const prefix = `深海圈丨${cleanParent}`;
        
        // If filename starts with digit, join with underscore. 
        // 2群... -> 深海圈丨YouTube AI_2群...
        filename = `${prefix}_${filename}`;
    }

    console.log(`\nProcessing File: ${path.basename(filePath)} (Virtual: ${filename})...`);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Split Content
    const chunks = ChatSplitter.split(content);
    console.log(`> Detected dates: ${chunks.length}`);

    if (chunks.length === 0) {
        console.warn(`> Warning: No date usage detected, importing as single file.`);
        chunks.push({ dateStr: '', content }); // Fallback to normal behavior (empty override)
    }

    // Process Chunks
    for (const [index, chunk] of chunks.entries()) {
        if (chunk.content.length < 50) {
            console.log(`> Skipping short chunk [${chunk.dateStr}] (${chunk.content.length} chars)`);
            continue;
        }

        const dateStr = chunk.dateStr || 'Auto-Date';
        console.log(`> Processing [${index + 1}/${chunks.length}]: ${dateStr} (${chunk.content.length} chars)...`);

        // --- SMART SKIP LOGIC ---
        if (chunk.dateStr) {
            try {
                // 1. Parse Group Info from the (virtual) filename
                const meta = parseFilenameMeta(filename);
                // Note: parseFilenameMeta returns { groupName, ... }
                
                if (meta.groupName) {
                    // 2. Find Group ID
                    // Use select() instead of query API to avoid type issues if schema binding is loose
                    const existingGroups = await db().select().from(communityGroup)
                        .where(eq(communityGroup.groupName, meta.groupName))
                        .limit(1);

                    if (existingGroups.length > 0) {
                        const group = existingGroups[0];
                        
                        // 3. Find Report for Date
                        const targetDate = new Date(chunk.dateStr);
                        // Check if valid
                        if (!isNaN(targetDate.getTime())) {
                             const existingReports = await db().select().from(communityDailyReport)
                                .where(and(
                                    eq(communityDailyReport.groupId, group.id),
                                    eq(communityDailyReport.reportDate, targetDate)
                                ))
                                .limit(1);
                            
                            if (existingReports.length > 0) {
                                 console.log(`  ⏭️  Skipping existing report for ${meta.groupName} on ${chunk.dateStr}`);
                                 successCount++; 
                                 continue;
                            }
                        }
                    }
                } else {
                     console.warn('  ⚠️  Could not extract group name from filename for skip check.');
                }
            } catch (err) {
                // If skip logic fails, just proceed to import to be safe
                console.warn('  ⚠️  Skip check failed, proceeding to import:', err);
            }
        }
        // ------------------------
        
        try {
            // Pass dateOverride if chunk has one
            const res = await importRawChatLogWithLLM(filename, chunk.content, chunk.dateStr || undefined);
            
            if (res.success) {
                console.log(`  ✅ Success`);
                successCount++;
            } else {
                if (res.message.includes('static generation store missing')) {
                    console.log(`  ✅ Success (DB persisted)`);
                    successCount++;
                } else {
                    console.error(`  ❌ Failed: ${res.message}`);
                    failCount++;
                }
            }
        } catch (e) {
            console.error(`  ❌ Error:`, e);
            failCount++;
        }

        // Add delay to avoid rate limits
        await new Promise(r => setTimeout(r, 2000)); 
    }
  }

  console.log(`\n--- Batch Import Complete ---`);
  console.log(`Total Operations: ${successCount + failCount}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  process.exit(0);
}

runBatchImport();
