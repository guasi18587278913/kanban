/**
 * 每日数据导入脚本
 *
 * 整合导入流程:
 * 1. 导入/更新成员数据
 * 2. 导入新的群聊记录
 * 3. 处理待分析的记录
 *
 * 用法:
 *   npx tsx scripts/daily-import.ts                    # 完整导入流程
 *   npx tsx scripts/daily-import.ts --members-only     # 只导入成员
 *   npx tsx scripts/daily-import.ts --chat-only        # 只导入群聊
 *   npx tsx scripts/daily-import.ts --date 2025-12-14  # 只导入指定日期
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { db } from '@/core/db';
import { rawChatLog, member } from '@/config/db/schema-community-v2';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// 配置
const IMPORT_DIR = path.join(process.cwd(), 'private/import/AI产品出海');
const PRODUCT_LINE = 'AI产品出海';

// 命令行参数
const args = process.argv.slice(2);
const MEMBERS_ONLY = args.includes('--members-only');
const CHAT_ONLY = args.includes('--chat-only');
const dateIdx = args.indexOf('--date');
const DATE_FILTER = dateIdx !== -1 ? args[dateIdx + 1] : null;

// ============================================
// 工具函数
// ============================================

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  let headerLine = lines[0];
  if (headerLine.charCodeAt(0) === 0xFEFF) {
    headerLine = headerLine.slice(1);
  }

  const headers = headerLine.split(',').map(h => h.trim());
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      record[header] = (values[idx] || '').trim().replace(/^"|"$/g, '');
    });
    records.push(record);
  }

  return records;
}

function normalizeNickname(name: string): string {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·｜|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function parsePeriod(periodStr: string): string {
  if (!periodStr) return '1';
  const match = periodStr.match(/[一二三四五六七八九十\d]+/);
  if (!match) return '1';
  const map: Record<string, string> = {
    '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
    '六': '6', '七': '7', '八': '8', '九': '9', '十': '10'
  };
  return map[match[0]] || match[0];
}

function parseRole(roleStr: string): 'coach' | 'volunteer' | 'student' {
  if (!roleStr) return 'student';
  const lower = roleStr.toLowerCase();
  if (lower.includes('教练') || lower.includes('助教')) return 'coach';
  if (lower.includes('志愿者')) return 'volunteer';
  return 'student';
}

function getFileHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

function countMessages(content: string): number {
  const messagePattern = /^.+\(.+\)\s+\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/gm;
  const matches = content.match(messagePattern);
  return matches ? matches.length : 0;
}

function parseFilename(filename: string): {
  period: string;
  groupNumber: number;
  chatDate: Date;
} | null {
  const match = filename.match(/(\d+)期(\d+)群_(\d{4}-\d{2}-\d{2})\.txt$/);
  if (!match) {
    return null;
  }

  return {
    period: match[1],
    groupNumber: parseInt(match[2]),
    chatDate: new Date(match[3]),
  };
}

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

// ============================================
// 成员导入
// ============================================

async function importCoachesAndVolunteers(): Promise<number> {
  const filePath = path.join(IMPORT_DIR, 'AI 产品出海 -教练&志愿者名单.csv');
  if (!fs.existsSync(filePath)) {
    console.log('  教练&志愿者名单文件不存在，跳过');
    return 0;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parseCSV(content);

  let count = 0;
  for (const record of records) {
    const planetId = record['星球编号']?.trim();
    const nickname = record['微信昵称']?.trim();
    const roleStr = record['身份']?.trim();
    const periodStr = record['期数']?.trim();

    if (!nickname) continue;

    const role = parseRole(roleStr);
    const period = parsePeriod(periodStr);
    const id = `${PRODUCT_LINE}-${role}-${normalizeNickname(nickname) || nanoid(6)}`;

    const existing = await db()
      .select()
      .from(member)
      .where(eq(member.id, id));

    if (existing.length > 0) {
      await db()
        .update(member)
        .set({
          planetId,
          nickname,
          nicknameNormalized: normalizeNickname(nickname),
          role,
          period,
          updatedAt: new Date(),
        })
        .where(eq(member.id, id));
    } else {
      await db().insert(member).values({
        id,
        planetId,
        nickname,
        nicknameNormalized: normalizeNickname(nickname),
        role,
        productLine: PRODUCT_LINE,
        period,
        status: 'active',
      });
      count++;
    }
  }

  return count;
}

async function importStudents(): Promise<number> {
  const filePath = path.join(IMPORT_DIR, 'AI 产品出海 -学员名单.csv');
  if (!fs.existsSync(filePath)) {
    console.log('  学员名单文件不存在，跳过');
    return 0;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parseCSV(content);

  let count = 0;
  for (const record of records) {
    const planetId = record['星球编号']?.trim();
    const nickname = record['微信昵称']?.trim();
    const joinDateStr = record['加入时间']?.trim();
    const expireDateStr = record['到期时间']?.trim();
    const periodStr = record['期数']?.trim();

    if (!nickname) continue;

    const period = parsePeriod(periodStr);
    const id = `${PRODUCT_LINE}-student-${normalizeNickname(nickname) || nanoid(6)}`;

    const joinDate = joinDateStr ? new Date(joinDateStr) : undefined;
    const expireDate = expireDateStr ? new Date(expireDateStr) : undefined;
    const status = expireDate && expireDate < new Date() ? 'expired' : 'active';

    const existing = await db()
      .select()
      .from(member)
      .where(eq(member.id, id));

    if (existing.length > 0) {
      await db()
        .update(member)
        .set({
          planetId,
          nickname,
          nicknameNormalized: normalizeNickname(nickname),
          period,
          joinDate,
          expireDate,
          status,
          updatedAt: new Date(),
        })
        .where(eq(member.id, id));
    } else {
      await db().insert(member).values({
        id,
        planetId,
        nickname,
        nicknameNormalized: normalizeNickname(nickname),
        role: 'student',
        productLine: PRODUCT_LINE,
        period,
        joinDate,
        expireDate,
        status,
      });
      count++;
    }
  }

  return count;
}

async function importMembers(): Promise<{ coaches: number; students: number }> {
  console.log('\n[1/3] 导入成员数据...');

  console.log('  导入教练&志愿者...');
  const coachCount = await importCoachesAndVolunteers();
  console.log(`    新增: ${coachCount} 人`);

  console.log('  导入学员...');
  const studentCount = await importStudents();
  console.log(`    新增: ${studentCount} 人`);

  return { coaches: coachCount, students: studentCount };
}

// ============================================
// 群聊记录导入
// ============================================

async function importChatFile(filePath: string): Promise<boolean> {
  const filename = path.basename(filePath);
  const meta = parseFilename(filename);
  if (!meta) return false;

  // 日期过滤
  if (DATE_FILTER && meta.chatDate.toISOString().split('T')[0] !== DATE_FILTER) {
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const fileHash = getFileHash(content);
  const messageCount = countMessages(content);

  const existing = await db()
    .select()
    .from(rawChatLog)
    .where(
      and(
        eq(rawChatLog.productLine, PRODUCT_LINE),
        eq(rawChatLog.period, meta.period),
        eq(rawChatLog.groupNumber, meta.groupNumber),
        eq(rawChatLog.chatDate, meta.chatDate)
      )
    );

  if (existing.length > 0) {
    if (existing[0].fileHash === fileHash) {
      return false; // 无变化
    }

    // 更新
    await db()
      .update(rawChatLog)
      .set({
        rawContent: content,
        fileHash,
        messageCount,
        fileName: filename,
        status: 'pending',
        updatedAt: new Date(),
      })
      .where(eq(rawChatLog.id, existing[0].id));

    console.log(`    更新: ${filename}`);
    return true;
  }

  // 新增
  await db().insert(rawChatLog).values({
    id: nanoid(),
    productLine: PRODUCT_LINE,
    period: meta.period,
    groupNumber: meta.groupNumber,
    chatDate: meta.chatDate,
    fileName: filename,
    fileHash,
    rawContent: content,
    messageCount,
    status: 'pending',
  });

  console.log(`    新增: ${filename}`);
  return true;
}

async function importChatLogs(): Promise<{ imported: number; skipped: number }> {
  console.log('\n[2/3] 导入群聊记录...');
  console.log(`  源目录: ${IMPORT_DIR}`);
  if (DATE_FILTER) console.log(`  过滤日期: ${DATE_FILTER}`);

  const files = getAllTxtFiles(IMPORT_DIR);
  console.log(`  找到 ${files.length} 个文件`);

  let imported = 0;
  let skipped = 0;

  for (const file of files) {
    const result = await importChatFile(file);
    if (result) {
      imported++;
    } else {
      skipped++;
    }
  }

  return { imported, skipped };
}

// ============================================
// 统计信息
// ============================================

async function printStats() {
  console.log('\n[3/3] 数据库统计...');

  // 成员统计
  const members = await db().select().from(member);
  const coaches = members.filter(m => m.role === 'coach').length;
  const volunteers = members.filter(m => m.role === 'volunteer').length;
  const students = members.filter(m => m.role === 'student').length;

  console.log(`\n  成员: ${members.length} 人`);
  console.log(`    教练/助教: ${coaches}`);
  console.log(`    志愿者: ${volunteers}`);
  console.log(`    学员: ${students}`);

  // 群聊记录统计
  const chatLogs = await db().select().from(rawChatLog);
  const pending = chatLogs.filter(r => r.status === 'pending').length;
  const processed = chatLogs.filter(r => r.status === 'processed').length;
  const period1 = chatLogs.filter(r => r.period === '1').length;
  const period2 = chatLogs.filter(r => r.period === '2').length;

  console.log(`\n  群聊记录: ${chatLogs.length} 条`);
  console.log(`    1期: ${period1}`);
  console.log(`    2期: ${period2}`);
  console.log(`    待处理: ${pending}`);
  console.log(`    已处理: ${processed}`);
}

// ============================================
// 主函数
// ============================================

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║         每日数据导入                    ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`时间: ${new Date().toLocaleString()}`);

  if (!CHAT_ONLY) {
    await importMembers();
  }

  if (!MEMBERS_ONLY) {
    await importChatLogs();
  }

  await printStats();

  console.log('\n✅ 导入完成!');
}

main().catch(console.error);
