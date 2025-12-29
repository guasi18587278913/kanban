/**
 * 对比文件系统与 raw_chat_log，找出缺失或多余的导入文件
 *
 * 用法:
 *   npx tsx scripts/check-raw-chat-missing.ts
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const IMPORT_DIR = path.join(process.cwd(), 'private/import/AI产品出海');

function getAllTxtFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...getAllTxtFiles(fullPath));
    } else if (item.endsWith('.txt')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function main() {
  const { db } = await import('../src/core/db');
  const { rawChatLog } = await import('../src/config/db/schema-community-v2');

  const database = db();

  const files = getAllTxtFiles(IMPORT_DIR).map((filePath) => path.basename(filePath));
  const fileSet = new Set(files);

  const rows = await database.select({ fileName: rawChatLog.fileName }).from(rawChatLog);
  const dbFiles = rows.map((row) => row.fileName);
  const dbSet = new Set(dbFiles);

  const missingInDb = files.filter((name) => !dbSet.has(name));
  const missingOnDisk = dbFiles.filter((name) => !fileSet.has(name));

  console.log('=== raw_chat_log 文件对账 ===');
  console.log(`文件系统: ${files.length}`);
  console.log(`数据库: ${dbFiles.length}`);
  console.log(`缺失于数据库: ${missingInDb.length}`);
  if (missingInDb.length > 0) {
    missingInDb.slice(0, 20).forEach((name) => console.log(`  - ${name}`));
    if (missingInDb.length > 20) {
      console.log(`  ... 还有 ${missingInDb.length - 20} 条未显示`);
    }
  }
  console.log(`缺失于文件系统: ${missingOnDisk.length}`);
  if (missingOnDisk.length > 0) {
    missingOnDisk.slice(0, 20).forEach((name) => console.log(`  - ${name}`));
    if (missingOnDisk.length > 20) {
      console.log(`  ... 还有 ${missingOnDisk.length - 20} 条未显示`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
