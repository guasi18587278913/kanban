/**
 * 导入 AI 产品出海 成员名单（教练/志愿者/学员）到 V2 member 表
 *
 * 用法：
 *   DATABASE_URL="..." pnpm tsx scripts/import-members-from-csv.ts               # 实际写库
 *   DATABASE_URL="..." pnpm tsx scripts/import-members-from-csv.ts --dry-run     # 仅打印不写库
 *
 * 优化点：
 * 1. 使用 PapaParse 处理复杂的 CSV 格式（引号、换行）
 * 2. 使用 Drizzle 的 Batch Insert 提高写入速度
 * 3. 增加 DATABASE_URL 检查和错误处理
 */
import 'dotenv/config';
import dotenv from 'dotenv';
// 尝试加载 .env.local，如果存在
dotenv.config({ path: '.env.local' });

import fs from 'fs';
import path from 'path';
import { parseArgs } from 'util';
import { db } from '@/core/db';
import { member } from '@/config/db/schema-community-v2';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import Papa from 'papaparse';

// 定义文件路径常量
const STUDENT_CSV = path.resolve('private/import/AI产品出海/AI 产品出海 -学员名单.csv');
const COACH_CSV = path.resolve('private/import/AI产品出海/AI 产品出海 -教练&志愿者名单.csv');
const PRODUCT_LINE = 'AI产品出海';
const BATCH_SIZE = 500; // 批量插入大小

// 解析命令行参数
const { values: args } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
  },
});

const isDryRun = args['dry-run'];

// 工具函数：归一化昵称
function normalizeName(name: string) {
  if (!name) return '';
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '') // 去除括号内容
    .replace(/[-_—–·•‧·｜|].*$/, '') // 去除分隔符后缀（含 | / ｜）
    .replace(/\s+/g, '') // 去除空格
    .trim()
    .toLowerCase(); // 转小写
}

// 工具函数：生成 ID (基于昵称的 slug，如果是纯 ASCII 使用 slug，否则生成 nanoid)
function slugifyName(name: string, planetId?: string | null) {
  if (planetId) return planetId;
  const norm = normalizeName(name);
  // 如果全是字母数字
  if (/^[a-z0-9]+$/.test(norm)) {
    return norm;
  }
  // 否则返回 nanoid
  return nanoid();
}

// 工具函数：解析日期
function parseDate(str?: string) {
  if (!str) return null;
  const t = str.trim();
  if (!t) return null;
  // 处理 Excel 可能的无效日期文本
  if (t === '-' || t === '/') return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

// 工具函数：归一化期数
function normalizePeriod(raw?: string | null) {
  if (!raw) return '';
  const input = String(raw).trim();
  if (!input) return '';
  const cleaned = input.replace(/^第/, '').replace(/期$/g, '').trim();
  if (!cleaned) return '';

  // 数字优先
  if (/^\d+$/.test(cleaned)) return String(parseInt(cleaned, 10));
  const digitMatch = cleaned.match(/\d+/);
  if (digitMatch) return String(parseInt(digitMatch[0], 10));

  // 常见中文期数（到 99 足够用）
  const map: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (cleaned === '十') return '10';
  const tenIndex = cleaned.indexOf('十');
  if (tenIndex !== -1) {
    const left = cleaned.slice(0, tenIndex);
    const right = cleaned.slice(tenIndex + 1);
    const tens = left ? map[left] ?? 0 : 1;
    const ones = right ? map[right] ?? 0 : 0;
    const value = tens * 10 + ones;
    if (value > 0) return String(value);
  }
  if (cleaned.length === 1 && cleaned in map) return String(map[cleaned]);

  // fallback：不强转，避免误伤
  return cleaned;
}

// 定义数据结构
interface MemberEntry {
  id: string;
  planetId: string | null;
  nickname: string;
  nicknameNormalized: string;
  role: 'coach' | 'volunteer' | 'student';
  productLine: string;
  period: string | null;
  joinDate: Date | null;
  expireDate: Date | null;
  status: 'active' | 'expired';
}

// 读取并解析 CSV
function parseCsvFile(filePath: string): any[] {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ 文件不存在: ${filePath}`);
    process.exit(1);
  }
  // 处理 BOM
  const fileContent = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const { data, errors } = Papa.parse(fileContent, {
    header: true, // 使用第一行作为表头
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(), // 去除表头空格
  });

  if (errors.length > 0) {
    console.warn(`⚠️ 解析 ${path.basename(filePath)} 时遇到 ${errors.length} 个警告:`);
    errors.slice(0, 3).forEach((e) => console.warn(`   Row ${e.row}: ${e.message}`));
  }

  return data;
}

// 解析学员
function getStudents(): MemberEntry[] {
  console.log(`正在读取学员名单: ${path.basename(STUDENT_CSV)}...`);
  const rows = parseCsvFile(STUDENT_CSV);
  const entries: MemberEntry[] = [];

  for (const row of rows) {
    // 实际表头: 星球编号, 微信昵称, 加入时间, 到期时间, 期数
    const nickname = row['微信昵称'] || row['昵称'] || row['Name'];
    if (!nickname) continue;

    const planetId = row['星球编号'] || row['星球ID'] || null;
    const period = normalizePeriod(row['期数'] || row['Period']);
    
    entries.push({
      id: planetId || slugifyName(nickname),
      planetId: planetId || null,
      nickname: nickname.trim(),
      nicknameNormalized: normalizeName(nickname),
      role: 'student',
      productLine: PRODUCT_LINE,
      period: period || null,
      joinDate: parseDate(row['加入时间']),
      expireDate: parseDate(row['到期时间']),
      status: 'active',
    });
  }
  return entries;
}

// 解析教练/志愿者
function getCoaches(): MemberEntry[] {
  console.log(`正在读取教练/志愿者名单: ${path.basename(COACH_CSV)}...`);
  const rows = parseCsvFile(COACH_CSV);
  const entries: MemberEntry[] = [];

  for (const row of rows) {
    // 实际表头: 星球编号, 微信昵称, 身份, 期数
    const nickname = row['微信昵称'] || row['昵称'] || row['Name'];
    if (!nickname) continue;

    // 身份判
    const identityRaw = row['身份'] || row['角色'] || '';
    const isVolunteer = identityRaw.includes('志愿者');
    const role = isVolunteer ? 'volunteer' : 'coach';

    const planetId = row['星球编号'] || row['星球ID'] || null;
    const period = normalizePeriod(row['期数']);

    entries.push({
      id: planetId || slugifyName(nickname),
      planetId: planetId || null,
      nickname: nickname.trim(),
      nicknameNormalized: normalizeName(nickname),
      role,
      productLine: PRODUCT_LINE,
      period: period || null,
      joinDate: null,
      expireDate: null,
      status: 'active',
    });
  }
  return entries;
}

// 批量写入数据库 (Upsert)
async function batchUpsert(entries: MemberEntry[]) {
  if (isDryRun) {
    console.log(`\n[Dry Run] 准备写入 ${entries.length} 条数据...`);
    // 打印前 3 条作为示例
    entries.slice(0, 3).forEach(e => {
      console.log(`   [${e.role}] ${e.nickname} (ID: ${e.id}, Period: ${e.period})`);
    });
    return;
  }

  const database = db();

  console.log(`\n🚀 开始批量写入 ${entries.length} 条数据 (Batch Size: ${BATCH_SIZE})...`);
  
  // 分批处理
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    
    try {
      await database
        .insert(member)
        .values(batch.map(e => ({
          id: e.id,
          planetId: e.planetId,
          nickname: e.nickname,
          nicknameNormalized: e.nicknameNormalized,
          role: e.role,
          productLine: e.productLine,
          period: e.period,
          joinDate: e.joinDate,
          expireDate: e.expireDate,
          status: e.status,
          updatedAt: new Date(),
        })))
        .onConflictDoUpdate({
          target: member.id, // 假设 id 冲突
          set: {
            nickname: sql`excluded.nickname`,
            nicknameNormalized: sql`excluded.nickname_normalized`,
            role: sql`excluded.role`,
            period: sql`excluded.period`, // 更新期数
            updatedAt: new Date(),
          }
        });
      
      process.stdout.write(`\r   进度: ${Math.min(i + BATCH_SIZE, entries.length)} / ${entries.length}`);
    } catch (err) {
      console.error(`\n❌ [Batch Error] Index ${i} - ${i + BATCH_SIZE}:`, err);
      // 可以选择抛出或者继续
      throw err; 
    }
  }
  console.log('\n✅ 写入完成');
}

// 主函数
async function main() {
  if (!isDryRun && !process.env.DATABASE_URL) {
    console.error('\n🔴 错误: DATABASE_URL 未设置。');
    console.error('请在 .env.local 中配置，或在命令前添加: DATABASE_URL="..." pnpm tsx ...\n');
    process.exit(1);
  }

  try {
    const students = getStudents();
    const coaches = getCoaches();
    const allEntries = [...students, ...coaches];

    console.log(`\n📊 原始统计:`);
    console.log(`   - 学员: ${students.length}`);
    console.log(`   - 教练/志愿者: ${coaches.length}`);
    console.log(`   - 总计: ${allEntries.length}`);

    // 去重逻辑：保留最后出现的记录（假设后面的记录更新）
    const uniqueEntriesMap = new Map<string, MemberEntry>();
    for (const entry of allEntries) {
      if (uniqueEntriesMap.has(entry.id)) {
        // 可选：打印重复警告
        // console.warn(`⚠️ 发现重复 ID: ${entry.id} (${entry.nickname}), 保留最新记录`);
      }
      uniqueEntriesMap.set(entry.id, entry);
    }
    const uniqueEntries = Array.from(uniqueEntriesMap.values());

    console.log(`\n✂️ 去重后统计:`);
    console.log(`   - 有效记录: ${uniqueEntries.length}`);
    console.log(`   - 移除重复: ${allEntries.length - uniqueEntries.length}`);

    await batchUpsert(uniqueEntries);

  } catch (err) {
    console.error('\n💥 程序异常退出:', err);
    process.exit(1);
  }
}

main().catch(console.error);
