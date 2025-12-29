/**
 * 批量导入教练/志愿者/学员名单（基于 CSV）
 *
 * 用法：
 *   npx tsx scripts/import-members-bulk.ts
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { nanoid } from 'nanoid';

dotenv.config({ path: '.env.local' });
dotenv.config();

const PRODUCT_LINE = 'AI产品出海';
const BASE_DIR = path.join(process.cwd(), 'private/import/AI产品出海');
const COACH_CSV = path.join(BASE_DIR, 'AI 产品出海 -教练&志愿者名单.csv');
const STUDENT_CSV = path.join(BASE_DIR, 'AI 产品出海 -学员名单.csv');

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  result.push(current);
  return result;
}

function parseCSV(content: string) {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  let headerLine = lines[0];
  if (headerLine.charCodeAt(0) === 0xfeff) {
    headerLine = headerLine.slice(1);
  }
  const headers = parseCsvLine(headerLine).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      record[header] = (values[idx] || '').trim().replace(/^"|"$/g, '');
    });
    return record;
  });
}

function normalizeNickname(name: string) {
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
    一: '1',
    二: '2',
    三: '3',
    四: '4',
    五: '5',
    六: '6',
    七: '7',
    八: '8',
    九: '9',
    十: '10',
  };
  return map[match[0]] || match[0];
}

function parseRole(roleStr: string): 'coach' | 'volunteer' | 'student' {
  const lower = (roleStr || '').toLowerCase();
  if (lower.includes('教练') || lower.includes('助教')) return 'coach';
  if (lower.includes('志愿者')) return 'volunteer';
  return 'student';
}

async function main() {
  const dbModule = await import('../src/core/db');
  const { db, closeDb } = dbModule as any;
  const schema = await import('../src/config/db/schema-community-v2');
  const { member } = schema as any;
  const { sql, eq } = await import('drizzle-orm');

  const now = new Date();

  const coachRows = fs.existsSync(COACH_CSV) ? parseCSV(fs.readFileSync(COACH_CSV, 'utf-8')) : [];
  const studentRows = fs.existsSync(STUDENT_CSV) ? parseCSV(fs.readFileSync(STUDENT_CSV, 'utf-8')) : [];

  if (coachRows.length === 0 && studentRows.length === 0) {
    console.log('未找到可导入的 CSV 文件');
    return;
  }

  const existingMembers = await db()
    .select({
      id: member.id,
      planetId: member.planetId,
      nicknameNormalized: member.nicknameNormalized,
      role: member.role,
    })
    .from(member)
    .where(eq(member.productLine, PRODUCT_LINE));

  const byPlanetRole = new Map<string, string>();
  const planetToIds = new Map<string, { id: string; role: string | null }[]>();
  const byNameRole = new Map<string, string>();
  const existingIds = new Set<string>();
  const guessRoleFromId = (id: string): 'coach' | 'volunteer' | 'student' | null => {
    if (id.includes('-coach-')) return 'coach';
    if (id.includes('-volunteer-')) return 'volunteer';
    if (id.includes('-student-')) return 'student';
    return null;
  };

  for (const m of existingMembers) {
    if (m.id) existingIds.add(m.id);
    if (m.planetId) {
      const list = planetToIds.get(m.planetId) || [];
      list.push({ id: m.id, role: m.role });
      planetToIds.set(m.planetId, list);
      if (m.role) {
        const key = `${m.planetId}:${m.role}`;
        const existingId = byPlanetRole.get(key);
        if (!existingId) {
          byPlanetRole.set(key, m.id);
        } else {
          const existingHint = guessRoleFromId(existingId);
          const nextHint = guessRoleFromId(m.id);
          if (nextHint === m.role && existingHint !== m.role) {
            byPlanetRole.set(key, m.id);
          }
        }
      }
    }
    if (m.nicknameNormalized && m.role) {
      byNameRole.set(`${m.role}:${m.nicknameNormalized}`, m.id);
    }
  }

  const rowsById = new Map<string, any>();
  const seenIds = new Set<string>();
  let inserted = 0;
  let updated = 0;

  const stageMember = (payload: {
    planetId?: string | null;
    nickname: string;
    nicknameNormalized: string;
    wechatId?: string | null;
    role: 'coach' | 'volunteer' | 'student';
    productLine: string;
    period?: string | null;
    status?: string;
    joinDate?: Date | null;
    expireDate?: Date | null;
  }) => {
    const planetId = payload.planetId?.trim() || null;
    const nameKey = payload.nicknameNormalized ? `${payload.role}:${payload.nicknameNormalized}` : null;
    let existingId: string | null = null;
    if (planetId) {
      existingId = byPlanetRole.get(`${planetId}:${payload.role}`) || null;
      if (existingId) {
        const hinted = guessRoleFromId(existingId);
        if (hinted && hinted !== payload.role) {
          existingId = null;
        }
      }
      if (!existingId) {
        const candidates = planetToIds.get(planetId) || [];
        const hinted = candidates.find((c) => guessRoleFromId(c.id) === payload.role);
        if (hinted) existingId = hinted.id;
      }
    }
    if (!existingId && !planetId && nameKey) {
      existingId = byNameRole.get(nameKey) || null;
    }

    let id = existingId || '';
    if (!id) {
      const baseId = planetId || payload.nicknameNormalized || nanoid(6);
      id = `${PRODUCT_LINE}-${payload.role}-${baseId}`;
      if (existingIds.has(id)) {
        id = `${id}-${nanoid(4)}`;
      }
      existingIds.add(id);
    }

    if (!seenIds.has(id)) {
      if (existingId) {
        updated += 1;
      } else {
        inserted += 1;
      }
      seenIds.add(id);
    }

    if (planetId) {
      byPlanetRole.set(`${planetId}:${payload.role}`, id);
      const list = planetToIds.get(planetId) || [];
      if (!list.find((item) => item.id === id)) {
        list.push({ id, role: payload.role });
        planetToIds.set(planetId, list);
      }
    }
    if (nameKey) byNameRole.set(nameKey, id);

    rowsById.set(id, {
      id,
      planetId,
      nickname: payload.nickname,
      nicknameNormalized: payload.nicknameNormalized,
      wechatId: payload.wechatId || null,
      role: payload.role,
      productLine: payload.productLine,
      period: payload.period ?? null,
      status: payload.status ?? 'active',
      joinDate: payload.joinDate ?? null,
      expireDate: payload.expireDate ?? null,
      createdAt: now,
      updatedAt: now,
    });
  };

  if (coachRows.length > 0) {
    console.log(`导入教练/志愿者：${coachRows.length} 条`);
    for (const record of coachRows) {
      const planetId = record['星球编号']?.trim() || '';
      const nicknameRaw = record['微信昵称']?.trim() || '';
      const wechatIdRaw = record['wechat_id']?.trim() || record['微信号']?.trim() || '';
      const roleStr = record['身份']?.trim();
      const periodStr = record['期数']?.trim();
      const nickname = nicknameRaw || planetId;
      if (!nickname) continue;

      const role = parseRole(roleStr);
      const period = parsePeriod(periodStr);
      let nicknameNormalized = normalizeNickname(nickname);
      if (!nicknameNormalized && planetId) {
        nicknameNormalized = normalizeNickname(planetId) || planetId;
      }
      if (!nicknameNormalized) continue;

      stageMember({
        planetId,
        nickname,
        nicknameNormalized,
        wechatId: wechatIdRaw || null,
        role,
        productLine: PRODUCT_LINE,
        period,
        status: 'active',
      });
    }
  }

  if (studentRows.length > 0) {
    console.log(`导入学员：${studentRows.length} 条`);
    for (const record of studentRows) {
      const planetId = record['星球编号']?.trim() || '';
      const nicknameRaw = record['微信昵称']?.trim() || '';
      const wechatIdRaw = record['wechat_id']?.trim() || record['微信号']?.trim() || '';
      const joinDateStr = record['加入时间']?.trim();
      const expireDateStr = record['到期时间']?.trim();
      const periodStr = record['期数']?.trim();
      const nickname = nicknameRaw || planetId;
      if (!nickname) continue;

      let nicknameNormalized = normalizeNickname(nickname || planetId);
      if (!nicknameNormalized && planetId) {
        nicknameNormalized = normalizeNickname(planetId) || planetId;
      }
      if (!nicknameNormalized) continue;
      const period = parsePeriod(periodStr);
      const joinDate = joinDateStr ? new Date(joinDateStr) : null;
      const expireDate = expireDateStr ? new Date(expireDateStr) : null;
      const status = expireDate && expireDate < now ? 'expired' : 'active';

      stageMember({
        planetId,
        nickname,
        nicknameNormalized,
        wechatId: wechatIdRaw || null,
        role: 'student',
        productLine: PRODUCT_LINE,
        period,
        status,
        joinDate,
        expireDate,
      });
    }
  }

  const updateSet = {
    planetId: sql`excluded.planet_id`,
    nickname: sql`excluded.nickname`,
    nicknameNormalized: sql`excluded.nickname_normalized`,
    wechatId: sql`coalesce(excluded.wechat_id, ${member.wechatId})`,
    role: sql`excluded.role`,
    productLine: sql`excluded.product_line`,
    period: sql`excluded.period`,
    status: sql`excluded.status`,
    joinDate: sql`excluded.join_date`,
    expireDate: sql`excluded.expire_date`,
    updatedAt: sql`excluded.updated_at`,
  };

  const rowsToUpsert = Array.from(rowsById.values());
  const BATCH_SIZE = 200;
  for (let i = 0; i < rowsToUpsert.length; i += BATCH_SIZE) {
    const batch = rowsToUpsert.slice(i, i + BATCH_SIZE);
    await db()
      .insert(member)
      .values(batch)
      .onConflictDoUpdate({
        target: [member.id],
        set: updateSet,
      });
  }

  console.log(`导入完成：新增 ${inserted}，更新 ${updated}`);

  const [totalRow] = await db().select({ c: sql`count(*)` }).from(member);
  console.log('完成，成员总数:', Number(totalRow.c));

  if (typeof closeDb === 'function') {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
