import { clearCommunityData, importRawChatLogWithLLM, getDashboardStats } from '../actions/community-actions';
import * as fs from 'fs';
import * as path from 'path';

async function runTest() {
  console.log('--- STARTING TEST ---');

  // 1. Clear Data
  console.log('1. Clearing existing data...');
  const clearRes = await clearCommunityData();
  console.log('Clear Result:', clearRes);

  if (!clearRes.success) {
    console.error('Failed to clear data, aborting.');
    process.exit(1);
  }

  // 2. Read Sample File
  console.log('2. Reading sample file...');
  const filePath = path.join(process.cwd(), 'sample_chat.txt');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  // Mock filename logic which usually comes from upload
  const mockFilename = '深海圈丨AI产品出海1期1群_2025-12-06.txt'; 
  console.log('File Content Length:', fileContent.length);

  // 3. Import with LLM
  console.log('3. Importing with LLM (External API Call)...');
  const importRes = await importRawChatLogWithLLM(mockFilename, fileContent);
  console.log('Import Result:', importRes);

  if (!importRes.success) {
    console.error('Import failed:', importRes.message);
    process.exit(1);
  }

  // 4. Verify Data in Dashboard
  console.log('4. Verifying Dashboard Stats...');
  const stats = await getDashboardStats();
  console.log('Dashboard Data Count:', stats.length);
  
  if (stats.length > 0) {
    const report = stats[0];
    console.log('--- Extracted Report Data ---');
    console.log('Group:', report.groupName);
    console.log('Date:', new Date(report.reportDate).toLocaleDateString());
    console.log('Messages:', report.messageCount);
    console.log('Questions:', report.questionCount);
    console.log('Avg Time:', report.avgResponseTime);
    console.log('Resolution:', report.resolutionRate);
    console.log('Good News:', report.goodNewsCount);
    console.log('Star Students:', report.starStudentCount);
    console.log('-----------------------------');
  } else {
    console.error('No data found after import!');
  }

  console.log('--- TEST COMPLETE ---');
  process.exit(0);
}

runTest();
