/**
 * 标记指定文件为待处理 (pending)
 *
 * 用法:
 *   npx tsx scripts/mark-pending-files.ts
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

const TARGET_FILES = [
  '深海圈丨AI产品出海2期2群_2025-12-10.txt',
  '深海圈丨AI产品出海2期1群_2025-12-10.txt',
  '深海圈丨AI产品出海2期2群_2025-12-09.txt',
  '深海圈丨AI产品出海2期1群_2025-12-09.txt',
];

async function main() {
  const { db } = await import('../src/core/db');
  const { rawChatLog } = await import('../src/config/db/schema-community-v2');
  const { inArray } = await import('drizzle-orm');

  const updated = await db()
    .update(rawChatLog)
    .set({
      status: 'pending',
      statusReason: null,
      processedAt: null,
      updatedAt: new Date(),
    })
    .where(inArray(rawChatLog.fileName, TARGET_FILES))
    .returning({ fileName: rawChatLog.fileName });

  const updatedNames = updated.map((row) => row.fileName);
  console.log(`标记 pending: ${updatedNames.length} 条`);
  updatedNames.forEach((name) => console.log(`- ${name}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
