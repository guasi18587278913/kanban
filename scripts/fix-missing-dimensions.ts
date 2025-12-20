
import 'dotenv/config';
import dotenv from 'dotenv';
// Load envs BEFORE importing app code to ensure config captures them
dotenv.config({ path: '.env.local' });

import { eq, isNull, inArray, or } from 'drizzle-orm';
import { parseArgs } from 'util';

// Parse command line arguments
const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    'batch': { type: 'string', default: '100' },
    'limit': { type: 'string' },
  },
});

const isDryRun = args['dry-run'];
const batchSize = parseInt(args['batch'] || '100', 10);
const limit = args['limit'] ? parseInt(args['limit'], 10) : undefined;

async function main() {
  console.log(`🚀 Starting Fix Script...`);
  console.log(`   Mode: ${isDryRun ? 'DRY-RUN (No changes)' : 'LIVE (Will update DB)'}`);
  console.log(`   Batch Size: ${batchSize}`);
  if (limit) console.log(`   Limit: ${limit}`);

  // Dynamic import to ensure process.env.DATABASE_URL is ready
  const { db } = await import('@/core/db');
  const { 
    rawChatLog, 
    goodNews, 
    qaRecord, 
    kocRecord, 
    starStudent, 
    memberMessage,
    member,
    memberStats,
    dailyStats,
  } = await import('@/config/db/schema-community-v2');

  const database = db();
  
  // Tables to fix
  const tables = [
    { name: 'good_news', schema: goodNews, fields: ['productLine', 'period', 'groupNumber'] },
    { name: 'qa_record', schema: qaRecord, fields: ['productLine', 'period', 'groupNumber'] },
    { name: 'koc_record', schema: kocRecord, fields: ['productLine', 'period', 'groupNumber'] },
    { name: 'star_student', schema: starStudent, fields: ['productLine', 'period', 'groupNumber'] },
    { name: 'member_message', schema: memberMessage, fields: ['productLine', 'period', 'groupNumber'] },
  ];

  let totalFixed = 0;
  let totalErrors = 0;

  for (const t of tables) {
    console.log(`\nChecking table: ${t.name}...`);
    
    // Construct Where Clause
    let whereClause: any;

    // Updated where clause to catch empty strings and zeros
    whereClause = or(
        isNull(t.schema.productLine),
        eq(t.schema.productLine, ''),
        isNull(t.schema.period),
        eq(t.schema.period, ''),
        isNull(t.schema.groupNumber),
        eq(t.schema.groupNumber, 0)
    );

    let query = database.select().from(t.schema).where(whereClause);
    if (limit) query = query.limit(limit);
    
    // @ts-ignore
    const rows = await query;
    console.log(`   Found ${rows.length} rows with missing dimensions.`);

    if (rows.length === 0) continue;

    // Process in batches
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        // @ts-ignore
        const sourceLogIds = [...new Set(batch.map(r => r.sourceLogId).filter(Boolean))];
        
        if (sourceLogIds.length === 0) continue;

        // Fetch raw logs
        const logs = await database
            .select()
            .from(rawChatLog)
            .where(inArray(rawChatLog.id, sourceLogIds));
            
        const logMap = new Map(logs.map(l => [l.id, l]));
        
        await Promise.all(batch.map(async (row) => {
            // @ts-ignore
            const log = logMap.get(row.sourceLogId);
            if (!log) {
                // @ts-ignore
                console.warn(`   [WARN] Raw log not found for ${t.name} ID: ${row.id} (SourceLogId: ${row.sourceLogId})`);
                totalErrors++;
                return;
            }

            // Determine values to update
            const newProductLine = log.productLine;
            const newPeriod = log.period.replace(/期$/, ''); 
            const newGroupNumber = log.groupNumber;
            
            // In dry-run, just log
            if (isDryRun) {
                // console.log(`   [Dry-Run] Would update ${t.name} ${row.id} -> PL:${newProductLine}, P:${newPeriod}, G:${newGroupNumber}`);
            } else {
                 await database
                    .update(t.schema)
                    .set({
                        productLine: newProductLine,
                        period: newPeriod,
                        groupNumber: newGroupNumber
                    })
                     // @ts-ignore
                    .where(eq(t.schema.id, row.id));
            }
            totalFixed++;
        }));
        process.stdout.write(`   Processed ${Math.min(i + batchSize, rows.length)}/${rows.length}\r`);
    }
    console.log(''); // Newline
  }

  // --- Special handling for member_stats (using member table linkage) ---
  console.log(`\nChecking table: member_stats...`);
  const memberStatsWhere = or(
    isNull(memberStats.productLine),
    eq(memberStats.productLine, ''),
    isNull(memberStats.period),
    eq(memberStats.period, '')
  );
  
  let msQuery = database.select().from(memberStats).where(memberStatsWhere);
  if (limit) msQuery = msQuery.limit(limit);
  // @ts-ignore
  const msRows = await msQuery;
  console.log(`   Found ${msRows.length} rows with missing dimensions.`);

  if (msRows.length > 0) {
      for (let i = 0; i < msRows.length; i += batchSize) {
        const batch = msRows.slice(i, i + batchSize);
        // @ts-ignore
        const memberIds = [...new Set(batch.map(r => r.memberId).filter(Boolean))];
        
        if (memberIds.length === 0) continue;

        const members = await database.select().from(member).where(inArray(member.id, memberIds));
        const memberMap = new Map(members.map(m => [m.id, m]));

        await Promise.all(batch.map(async (row) => {
             // @ts-ignore
             const m = memberMap.get(row.memberId);
             if (!m) {
                 totalErrors++;
                 return;
             }
             
             const newPeriod = m.period ? m.period.replace(/期$/, '') : null;
             
             if (isDryRun) {
             } else {
                 if (m.productLine) {
                    await database.update(memberStats).set({
                       productLine: m.productLine,
                       period: newPeriod
                    })
                    // @ts-ignore
                    .where(eq(memberStats.id, row.id));
                    totalFixed++;
                 }
             }
        }));
        process.stdout.write(`   Processed ${Math.min(i + batchSize, msRows.length)}/${msRows.length}\r`);
      }
      console.log('');
  }
  // --- Special handling for daily_stats (using groupNumber linkage) ---
  console.log(`\nChecking table: daily_stats...`);
  const dailyStatsWhere = or(
    isNull(dailyStats.productLine),
    eq(dailyStats.productLine, ''),
    isNull(dailyStats.period),
    eq(dailyStats.period, '')
  );

  let dsQuery = database.select().from(dailyStats).where(dailyStatsWhere);
  if (limit) dsQuery = dsQuery.limit(limit);
  // @ts-ignore
  const dsRows = await dsQuery;
  console.log(`   Found ${dsRows.length} rows with missing dimensions.`);

  if (dsRows.length > 0) {
      for (let i = 0; i < dsRows.length; i += batchSize) {
        const batch = dsRows.slice(i, i + batchSize);
        // @ts-ignore
        const groupNumbers = [...new Set(batch.map(r => r.groupNumber).filter(Boolean))];

        if (groupNumbers.length === 0) continue;

        // Find reference metadata from member_message
        // We group by groupNumber to get unique combinations
        const refs = await database
            .select({
                groupNumber: memberMessage.groupNumber,
                productLine: memberMessage.productLine,
                period: memberMessage.period
            })
            .from(memberMessage)
            .where(inArray(memberMessage.groupNumber, groupNumbers))
            .groupBy(memberMessage.groupNumber, memberMessage.productLine, memberMessage.period);
        
        const refMap = new Map();
        refs.forEach(r => {
            if (r.groupNumber && r.productLine) {
                 refMap.set(r.groupNumber, r);
            }
        });

        await Promise.all(batch.map(async (row) => {
             // @ts-ignore
             const r = refMap.get(row.groupNumber);
             if (!r) {
                 totalErrors++;
                 return;
             }

             const newPeriod = r.period ? r.period.replace(/期$/, '') : '1'; // Default to 1 if missing? Or keep null.

             if (isDryRun) {
                 // console.log(`[Dry] DailyStats ${row.id}: ${row.groupNumber} -> ${r.productLine} / ${newPeriod}`);
             } else {
                 await database.update(dailyStats).set({
                     productLine: r.productLine,
                     period: newPeriod
                 })
                 // @ts-ignore
                 .where(eq(dailyStats.id, row.id));
                 totalFixed++;
             }
        }));
        process.stdout.write(`   Processed ${Math.min(i + batchSize, dsRows.length)}/${dsRows.length}\r`);
      }
      console.log('');
  }
  console.log(`\n🎉 Done!`);
  console.log(`Fixed: ${totalFixed}`);
  console.log(`Errors (Raw Log Missing): ${totalErrors}`);
  process.exit(0);
}

main().catch(console.error);
