
import { db } from '@/core/db';
import { communityDailyReport, communityGroup } from '@/config/db/schema';
import { nanoid } from 'nanoid';

async function main() {
  console.log('🧪 Testing DB Insertion...');

  const groupId = nanoid();
  const reportId = nanoid();

  try {
    // 1. Create Group
    await db().insert(communityGroup).values({
      id: groupId,
      productLine: 'TEST_PRODUCT',
      groupNumber: 999,
      groupName: 'Test Group',
    });
    console.log('✅ Group created');

    // 2. Prepare Data: Force Type Error
    const activityFeature = [{ content: "Test Good News 🌟", author: "Me 👨‍💻" }] as any;
    const actionList = { actionItems: [], questions: [] } as any;
    const fullReport = "## 📅 日报概览\n\n- Some content 🚀";

    console.log('Inserting report with RAW OBJECTS (Simulating Error)...');
    console.log('activityFeature type:', typeof activityFeature); // object
    console.log('actionList type:', typeof actionList); // string

    // 3. Insert Report
    await db().insert(communityDailyReport).values({
      id: reportId,
      groupId: groupId,
      reportDate: new Date(),
      messageCount: 10,
      questionCount: 1,
      avgResponseTime: 0.6, // Float passed to Integer column
      resolutionRate: 100,
      goodNewsCount: 1,
      fullReport: fullReport,
      activityFeature: activityFeature,
      actionList: actionList,
    });
    console.log('✅ Report inserted successfully');

  } catch (e: any) {
    console.error('❌ Insertion Failed:', e);
  } finally {
    // Cleanup
    try {
        await db().delete(communityDailyReport).where({ id: reportId } as any); // Type cast for quick script
        await db().delete(communityGroup).where({ id: groupId } as any);
        console.log('🧹 Cleanup done');
    } catch(e) {}
    process.exit(0);
  }
}

main();
