/**
 * 对比学员 CSV 与 member 表，找出多余/缺失记录
 *
 * 用法:
 *   npx tsx scripts/audit-member-csv.ts
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const CSV_PATH = path.join(process.cwd(), 'private/import/AI产品出海/AI 产品出海 -学员名单.csv');

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

function loadPlanetIdSet() {
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return new Set<string>();
  const headers = parseCsvLine(lines[0]).map((col) => col.trim().replace(/^\ufeff/, ''));
  const idxPlanetId = headers.indexOf('星球编号');
  const planetIdx = idxPlanetId >= 0 ? idxPlanetId : 0;

  const set = new Set<string>();
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const planetId = (cols[planetIdx] || '').trim();
    if (planetId) set.add(planetId);
  }
  return set;
}

async function main() {
  const dbModule = await import('../src/core/db');
  const { db } = dbModule as any;
  const schema = await import('../src/config/db/schema-community-v2');
  const { member } = schema as any;
  const { eq } = await import('drizzle-orm');

  const planetIds = loadPlanetIdSet();
  console.log('CSV planet ids:', planetIds.size);

  const students = await db()
    .select({
      id: member.id,
      planetId: member.planetId,
      nickname: member.nickname,
      nicknameNormalized: member.nicknameNormalized,
    })
    .from(member)
    .where(eq(member.role, 'student'));

  const extras = students.filter((s: any) => !s.planetId || !planetIds.has(s.planetId));
  const studentPlanetIds = new Set(students.map((s: any) => s.planetId).filter(Boolean));
  const missing = Array.from(planetIds).filter((pid) => !studentPlanetIds.has(pid));

  const planetMap = new Map<string, any[]>();
  students.forEach((s: any) => {
    if (!s.planetId) return;
    const list = planetMap.get(s.planetId) || [];
    list.push(s);
    planetMap.set(s.planetId, list);
  });
  const duplicates = Array.from(planetMap.entries()).filter(([, list]) => list.length > 1);

  console.log('DB students:', students.length);
  console.log('Extras (not in CSV planetId):', extras.length);
  console.log('Missing (in CSV but not in DB):', missing.length);
  console.log('Duplicate planetId:', duplicates.length);

  if (extras.length > 0) {
    extras.slice(0, 20).forEach((s: any) => {
      console.log(`- extra ${s.id} | ${s.planetId || '-'} | ${s.nickname || '-'} | ${s.nicknameNormalized || '-'}`);
    });
    if (extras.length > 20) {
      console.log(`... 还有 ${extras.length - 20} 条未显示`);
    }
  }

  if (duplicates.length > 0) {
    duplicates.slice(0, 10).forEach(([planetId, list]) => {
      const summary = list.map((s: any) => `${s.id}/${s.nickname || '-'}`).join(' | ');
      console.log(`- dup ${planetId}: ${summary}`);
    });
    if (duplicates.length > 10) {
      console.log(`... 还有 ${duplicates.length - 10} 条未显示`);
    }
  }

  if (missing.length > 0) {
    const { inArray } = await import('drizzle-orm');
    const related = await db()
      .select({
        id: member.id,
        planetId: member.planetId,
        nickname: member.nickname,
        role: member.role,
      })
      .from(member)
      .where(inArray(member.planetId, missing));

    missing.slice(0, 20).forEach((pid) => {
      console.log(`- missing ${pid}`);
    });
    if (missing.length > 20) {
      console.log(`... 还有 ${missing.length - 20} 条未显示`);
    }
    if (related.length > 0) {
      console.log('Missing planetId exists in other roles:');
      related.forEach((r: any) => {
        console.log(`  - ${r.planetId} | ${r.role} | ${r.nickname || '-'} | ${r.id}`);
      });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
