/**
 * 迁移脚本：从本地 Postgres 迁移到 Neon
 *
 * 步骤：
 * 1. 在 Neon 创建表结构
 * 2. 从本地导出数据
 * 3. 导入到 Neon
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// 配置
const LOCAL_DB = 'postgresql://liyadong@localhost:5432/postgres';
const NEON_DB = 'postgresql://neondb_owner:npg_pOg0PFl8RBvH@ep-shiny-breeze-afp416jf.c-2.us-west-2.aws.neon.tech/neondb?sslmode=require';
const BACKUP_DIR = path.join(process.cwd(), 'backups');

// V2 表列表
const V2_TABLES = [
  'raw_chat_log',
  'member',
  'daily_stats',
  'good_news',
  'koc_record',
  'qa_record',
  'star_student',
];

// 旧表列表（保留结构但不迁移数据）
const OLD_TABLES = [
  'community_group',
  'community_daily_report',
  'community_star_student',
  'community_koc',
  'community_import_log',
  'community_user',
];

function run(cmd: string, env?: Record<string, string>) {
  console.log(`\n> ${cmd}`);
  try {
    const result = execSync(cmd, {
      encoding: 'utf-8',
      env: { ...process.env, ...env },
      maxBuffer: 50 * 1024 * 1024, // 50MB
    });
    return result;
  } catch (error: any) {
    console.error('Error:', error.message);
    throw error;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   迁移数据到 Neon                       ║');
  console.log('╚════════════════════════════════════════╝');

  // 确保备份目录存在
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // ============================================
  // 步骤 1: 导出本地表结构和数据
  // ============================================
  console.log('\n[1/4] 导出本地数据...');

  // 导出 V2 表的结构和数据
  const v2DumpFile = path.join(BACKUP_DIR, `v2_tables_${timestamp}.sql`);
  const v2TableList = V2_TABLES.join(' -t ');

  run(
    `/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump "${LOCAL_DB}" -t ${v2TableList} --no-owner --no-acl > "${v2DumpFile}"`
  );
  console.log(`  V2 表已导出到: ${v2DumpFile}`);

  // 检查文件大小
  const stats = fs.statSync(v2DumpFile);
  console.log(`  文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  // ============================================
  // 步骤 2: 在 Neon 创建旧表结构（空表）
  // ============================================
  console.log('\n[2/4] 在 Neon 创建旧表结构...');

  // 导出旧表结构（仅结构，不含数据）
  const oldSchemaFile = path.join(BACKUP_DIR, `old_schema_${timestamp}.sql`);
  const oldTableList = OLD_TABLES.join(' -t ');

  run(
    `/Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump "${LOCAL_DB}" -t ${oldTableList} --schema-only --no-owner --no-acl > "${oldSchemaFile}"`
  );

  // 导入旧表结构到 Neon
  console.log('  导入旧表结构到 Neon...');
  try {
    run(`/Applications/Postgres.app/Contents/Versions/latest/bin/psql "${NEON_DB}" < "${oldSchemaFile}"`);
    console.log('  旧表结构已创建');
  } catch (e) {
    console.log('  旧表可能已存在，跳过...');
  }

  // ============================================
  // 步骤 3: 导入 V2 数据到 Neon
  // ============================================
  console.log('\n[3/4] 导入 V2 数据到 Neon...');

  try {
    run(`/Applications/Postgres.app/Contents/Versions/latest/bin/psql "${NEON_DB}" < "${v2DumpFile}"`);
    console.log('  V2 数据已导入');
  } catch (e) {
    console.log('  部分数据可能已存在，检查结果...');
  }

  // ============================================
  // 步骤 4: 验证数据
  // ============================================
  console.log('\n[4/4] 验证 Neon 数据...');

  const verifyResult = run(
    `/Applications/Postgres.app/Contents/Versions/latest/bin/psql "${NEON_DB}" -c "
      SELECT 'member' as table_name, COUNT(*) as count FROM member
      UNION ALL SELECT 'raw_chat_log', COUNT(*) FROM raw_chat_log
      UNION ALL SELECT 'daily_stats', COUNT(*) FROM daily_stats
      UNION ALL SELECT 'good_news', COUNT(*) FROM good_news;
    "`
  );
  console.log(verifyResult);

  console.log('\n✅ 迁移完成!');
  console.log('\n下一步:');
  console.log('  1. 重启开发服务器: npm run dev');
  console.log('  2. 访问 http://localhost:3000/community 验证');
}

main().catch(console.error);
