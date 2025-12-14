/**
 * 导入成员数据（教练/志愿者/学员）
 *
 * 用法:
 *   npx tsx scripts/import-members.ts
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { db } from '@/core/db';
import { member } from '@/config/db/schema-community-v2';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// 简单的 CSV 解析器
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  // 处理 BOM
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

const IMPORT_DIR = path.join(process.cwd(), 'private/import/AI产品出海');
const PRODUCT_LINE = 'AI产品出海';

// 标准化昵称（用于匹配）
function normalizeNickname(name: string): string {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')  // 移除括号内容
    .replace(/[-_—–·•‧·｜|].*$/, '')                  // 移除分隔符后的内容
    .replace(/\s+/g, '')                               // 移除空格
    .trim()
    .toLowerCase();
}

// 解析期数
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

// 解析角色
function parseRole(roleStr: string): 'coach' | 'volunteer' | 'student' {
  if (!roleStr) return 'student';
  const lower = roleStr.toLowerCase();
  if (lower.includes('教练') || lower.includes('助教')) return 'coach';
  if (lower.includes('志愿者')) return 'volunteer';
  return 'student';
}

async function importCoachesAndVolunteers() {
  const filePath = path.join(IMPORT_DIR, 'AI 产品出海 -教练&志愿者名单.csv');
  if (!fs.existsSync(filePath)) {
    console.log('教练&志愿者名单文件不存在，跳过');
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

    // 检查是否已存在
    const existing = await db()
      .select()
      .from(member)
      .where(eq(member.id, id));

    if (existing.length > 0) {
      // 更新
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
      // 插入
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

async function importStudents() {
  const filePath = path.join(IMPORT_DIR, 'AI 产品出海 -学员名单.csv');
  if (!fs.existsSync(filePath)) {
    console.log('学员名单文件不存在，跳过');
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

    // 解析日期
    const joinDate = joinDateStr ? new Date(joinDateStr) : undefined;
    const expireDate = expireDateStr ? new Date(expireDateStr) : undefined;
    const status = expireDate && expireDate < new Date() ? 'expired' : 'active';

    // 检查是否已存在
    const existing = await db()
      .select()
      .from(member)
      .where(eq(member.id, id));

    if (existing.length > 0) {
      // 更新
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
      // 插入
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

async function main() {
  console.log('=== 导入成员数据 ===\n');

  console.log('导入教练&志愿者...');
  const coachCount = await importCoachesAndVolunteers();
  console.log(`  新增: ${coachCount} 人\n`);

  console.log('导入学员...');
  const studentCount = await importStudents();
  console.log(`  新增: ${studentCount} 人\n`);

  // 统计
  const stats = await db()
    .select()
    .from(member);

  const coaches = stats.filter(m => m.role === 'coach').length;
  const volunteers = stats.filter(m => m.role === 'volunteer').length;
  const students = stats.filter(m => m.role === 'student').length;

  console.log('=== 导入完成 ===');
  console.log(`总计: ${stats.length} 人`);
  console.log(`  教练/助教: ${coaches}`);
  console.log(`  志愿者: ${volunteers}`);
  console.log(`  学员: ${students}`);
}

main().catch(console.error);
