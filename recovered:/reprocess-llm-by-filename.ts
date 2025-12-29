/**
 * 重跑指定文件的 LLM 解析（按 fileName 精确匹配）
 *
 * 用法:
 *   npx tsx scripts/reprocess-llm-by-filename.ts "文件1.txt" "文件2.txt"
 */

import dotenv from 'dotenv';
import { inArray } from 'drizzle-orm';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  if (args.length === 0) {
    console.error('请提供 fileName，例如: npx tsx scripts/reprocess-llm-by-filename.ts "xxx.txt"');
    process.exit(1);
  }

  const { db } = await import('../src/core/db');
  const { rawChatLog } = await import('../src/config/db/schema-community-v2');
  const { processSingleChatLog } = await import('../src/lib/llm-analysis-pipeline');

  const logs = await db()
    .select({
      id: rawChatLog.id,
      fileName: rawChatLog.fileName,
      status: rawChatLog.status,
    })
    .from(rawChatLog)
    .where(inArray(rawChatLog.fileName, args));

  const found = new Set(logs.map((l) => l.fileName));
  const missing = args.filter((name) => !found.has(name));

  if (missing.length > 0) {
    console.warn('未在数据库找到以下文件:');
    missing.forEach((name) => console.warn(`  - ${name}`));
  }

  for (const log of logs) {
    console.log(`\n[Reprocess] ${log.fileName} (status=${log.status})`);
    const ok = await processSingleChatLog(log.id);
    console.log(`[Reprocess] ${log.fileName} => ${ok ? 'OK' : 'FAILED'}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
