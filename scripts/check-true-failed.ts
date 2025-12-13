
import { db } from '@/core/db';
import { communityImportLog } from '@/config/db/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  // Get all logs
  const allLogs = await db()
    .select({ 
      fileName: communityImportLog.fileName, 
      status: communityImportLog.status,
      date: communityImportLog.importDate
    })
    .from(communityImportLog);

  // Group by filename
  const fileStatus = new Map<string, Array<{status: string, date: Date}>>();
  
  allLogs.forEach(l => {
    if (!fileStatus.has(l.fileName)) fileStatus.set(l.fileName, []);
    fileStatus.get(l.fileName)!.push({ status: l.status!, date: l.date });
  });

  const trueFailures: string[] = [];
  
  for (const [fileName, logs] of fileStatus.entries()) {
    // Sort logs descending by date
    logs.sort((a, b) => b.date.getTime() - a.date.getTime());
    
    // Check if the LATEST log is FAILED, or if there is NO SUCCESS log at all?
    // User said "failed files". Usually means no success.
    const hasSuccess = logs.some(l => l.status === 'SUCCESS');
    
    // Also check if latest is success
    const latest = logs[0];
    
    if (!hasSuccess) {
        trueFailures.push(fileName);
    } 
    // Maybe user cares about latest status? 
    // If latest is FAILED, but had success before? Rare.
  }

  console.log(`Total Files Tracked: ${fileStatus.size}`);
  console.log(`Files with NO Success Logs: ${trueFailures.length}`);
  
  if (trueFailures.length > 0) {
      console.log('--- True Failures ---');
      trueFailures.slice(0, 10).forEach(f => console.log(f));
  }
  
  process.exit(0);
}

main();
