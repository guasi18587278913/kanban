/**
 * 学员去重：按 CSV 规范化昵称归并到唯一学员。
 * 简化实现：逐条更新映射，删除多余成员，合并统计/标签。
 * 请先备份数据库。
 */

import fs from 'fs';
import { nanoid } from 'nanoid';
import { eq, inArray, sql, or } from 'drizzle-orm';

import { db } from '@/core/db';
import {
  member,
  memberStats,
  memberMessage,
  memberTag,
  qaRecord,
  goodNews,
  kocRecord,
  starStudent,
} from '@/config/db/schema-community-v2';

const CSV_PATH = 'private/import/AI产品出海/AI 产品出海 -学员名单.csv';

function normalizeName(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}
function looseNormalize(name: string) {
  return normalizeName(name.replace(/~.*/, ''));
}

type MemberRow = typeof member.$inferSelect;
type StatsRow = typeof memberStats.$inferSelect;

function parseCsv() {
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const data: { planetId: string; nickname: string; norm: string; period: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const planetId = (cols[0] || '').trim().replace(/^\ufeff/, '');
    const nickname = (cols[1] || '').trim();
    const period = (cols[4] || '').trim();
    if (!nickname) continue;
    const norm = normalizeName(nickname);
    data.push({ planetId, nickname, norm, period });
  }
  return data;
}

function pickKeep(candidates: MemberRow[], targetPlanet: string) {
  if (candidates.length === 0) return null;
  if (targetPlanet) {
    const hit = candidates.find((c) => (c.planetId || '').trim() === targetPlanet);
    if (hit) return hit;
  }
  const withPlanet = candidates.find((c) => c.planetId && c.planetId.trim().length > 0);
  return withPlanet || candidates[0];
}

function aggregateStats(rows: StatsRow[], keep: MemberRow | undefined) {
  if (!keep || rows.length === 0) return null;
  const sum = (k: keyof StatsRow) => rows.reduce((a, b) => a + (Number((b as any)[k]) || 0), 0);
  const minNonNull = (k: keyof StatsRow) => {
    const vals = rows.map((r) => (r as any)[k]).filter((v) => v !== null && v !== undefined);
    if (vals.length === 0) return null;
    return Math.min(...vals.map((v: any) => Number(v)));
  };
  const minDate = (k: keyof StatsRow) => {
    const vals = rows.map((r) => (r as any)[k]).filter((v) => v !== null && v !== undefined);
    if (vals.length === 0) return null;
    return new Date(Math.min(...vals.map((v: any) => new Date(v).getTime())));
  };
  const maxDate = (k: keyof StatsRow) => {
    const vals = rows.map((r) => (r as any)[k]).filter((v) => v !== null && v !== undefined);
    if (vals.length === 0) return null;
    return new Date(Math.max(...vals.map((v: any) => new Date(v).getTime())));
  };
  return {
    id: nanoid(),
    memberId: keep.id,
    productLine: keep.productLine || 'AI产品出海',
    period: keep.period,
    totalMessages: sum('totalMessages'),
    questionCount: sum('questionCount'),
    answerCount: sum('answerCount'),
    goodNewsCount: sum('goodNewsCount'),
    shareCount: sum('shareCount'),
    encouragementCount: sum('encouragementCount'),
    avgResponseMinutes: minNonNull('avgResponseMinutes'),
    resolvedCount: sum('resolvedCount'),
    helpedStudents: sum('helpedStudents'),
    activeDays: Math.max(...rows.map((r) => r.activeDays || 0)),
    lastActiveDate: maxDate('lastActiveDate'),
    firstActiveDate: minDate('firstActiveDate'),
    kocContributions: sum('kocContributions'),
    totalHelpedCount: sum('totalHelpedCount'),
  };
}

async function main() {
  const csv = parseCsv();
  const csvMap = new Map<string, { planetId: string; nickname: string; period: string }>();
  csv.forEach((r) => {
    if (!csvMap.has(r.norm)) csvMap.set(r.norm, { planetId: r.planetId, nickname: r.nickname, period: r.period });
  });
  const csvNorms = new Set(csv.map((r) => r.norm));

  const students = await db().select().from(member).where(eq(member.role, 'student'));
  const byLooseNorm = new Map<string, MemberRow[]>();
  students.forEach((m) => {
    const ln = looseNormalize(m.nickname || '');
    if (!byLooseNorm.has(ln)) byLooseNorm.set(ln, []);
    byLooseNorm.get(ln)!.push(m);
  });

  const keepMap = new Map<string, string>(); // old -> keep
  const keepRows = new Map<string, MemberRow>();
  const keepIdByNorm = new Map<string, string>();
  const newMembers: MemberRow[] = [];
  const deleteOnly: string[] = [];

  for (const norm of csvNorms) {
    const target = csvMap.get(norm)!;
    const candidates = byLooseNorm.get(norm) || [];
    const keep = pickKeep(candidates, target.planetId);
    let keepId = keep?.id;
    if (!keep) {
      const id = nanoid();
      const row: MemberRow = {
        id,
        planetId: target.planetId || null,
        nickname: target.nickname,
        nicknameNormalized: norm,
        role: 'student',
        productLine: 'AI产品出海',
        period: target.period || null,
        circleIdentity: null,
        location: null,
        activityLevel: null,
        joinDate: null,
        expireDate: null,
        status: 'active',
        progressAiProduct: null,
        progressYoutube: null,
        progressBilibili: null,
        milestones: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      newMembers.push(row);
      keepId = id;
      keepRows.set(id, row);
    } else {
      keepRows.set(keep.id, keep);
    }
    keepIdByNorm.set(norm, keepId!);
    candidates.forEach((c) => {
      if (c.id !== keepId) keepMap.set(c.id, keepId!);
    });
  }

  students.forEach((m) => {
    const ln = looseNormalize(m.nickname || '');
    if (!csvNorms.has(ln) && !keepMap.has(m.id)) {
      deleteOnly.push(m.id);
    }
  });

  console.log({
    csvUnique: csvNorms.size,
    existing: students.length,
    toInsert: newMembers.length,
    toMerge: keepMap.size,
    deleteOnly: deleteOnly.length,
  });

  if (newMembers.length) await db().insert(member).values(newMembers);

  // 简单更新外键：逐条处理映射
  for (const [oldId, keepId] of keepMap.entries()) {
    await db().update(memberMessage).set({ memberId: keepId }).where(eq(memberMessage.memberId, oldId));
    await db().update(qaRecord).set({ askerId: keepId }).where(eq(qaRecord.askerId, oldId));
    await db().update(qaRecord).set({ answererId: keepId }).where(eq(qaRecord.answererId, oldId));
    await db().update(goodNews).set({ memberId: keepId }).where(eq(goodNews.memberId, oldId));
    await db().update(kocRecord).set({ memberId: keepId }).where(eq(kocRecord.memberId, oldId));
    await db().update(starStudent).set({ memberId: keepId }).where(eq(starStudent.memberId, oldId));
    // 标签：直接把旧的删除，避免唯一冲突，再补充合并
    await db().delete(memberTag).where(eq(memberTag.memberId, oldId));
  }

  if (deleteOnly.length) {
    await db().delete(memberMessage).where(inArray(memberMessage.memberId, deleteOnly));
    await db().update(qaRecord).set({ askerId: null }).where(inArray(qaRecord.askerId, deleteOnly));
    await db().update(qaRecord).set({ answererId: null }).where(inArray(qaRecord.answererId, deleteOnly));
    await db().update(goodNews).set({ memberId: null }).where(inArray(goodNews.memberId, deleteOnly));
    await db().update(kocRecord).set({ memberId: null }).where(inArray(kocRecord.memberId, deleteOnly));
    await db().update(starStudent).set({ memberId: null }).where(inArray(starStudent.memberId, deleteOnly));
    await db().delete(memberTag).where(inArray(memberTag.memberId, deleteOnly));
    await db().delete(memberStats).where(inArray(memberStats.memberId, deleteOnly));
  }

  // 合并标签：把 keep 自身和映射来源的标签去重后重建
  const affectedIds = Array.from(new Set([...keepMap.keys(), ...keepMap.values()]));
  if (affectedIds.length > 0) {
    const tags = await db()
      .select({
        memberId: memberTag.memberId,
        category: memberTag.tagCategory,
        name: memberTag.tagName,
      })
      .from(memberTag)
      .where(inArray(memberTag.memberId, affectedIds));
    const grouped = new Map<string, Set<string>>();
    tags.forEach((t) => {
      const keepId = keepMap.get(t.memberId) || t.memberId;
      const key = `${t.category}::${t.name}`;
      if (!grouped.has(keepId)) grouped.set(keepId, new Set());
      grouped.get(keepId)!.add(key);
    });
    await db().delete(memberTag).where(inArray(memberTag.memberId, Array.from(grouped.keys())));
    const insertTags: any[] = [];
    grouped.forEach((set, keepId) => {
      set.forEach((key) => {
        const [category, name] = key.split('::');
        insertTags.push({
          id: nanoid(),
          memberId: keepId,
          tagCategory: category,
          tagName: name,
          tagValue: null,
          source: 'auto',
          sourceLogId: null,
          confidence: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
    });
    if (insertTags.length) {
      await db().insert(memberTag).values(insertTags);
    }
  }

  // 合并 stats
  const statsMap = new Map<string, StatsRow[]>();
  const statsRows = await db()
    .select()
    .from(memberStats)
    .where(or(inArray(memberStats.memberId, Array.from(keepMap.keys())), inArray(memberStats.memberId, Array.from(keepMap.values()))));
  statsRows.forEach((row) => {
    const keepId = keepMap.get(row.memberId) || row.memberId;
    if (!statsMap.has(keepId)) statsMap.set(keepId, []);
    statsMap.get(keepId)!.push(row);
  });
  if (statsMap.size) {
    await db().delete(memberStats).where(inArray(memberStats.memberId, Array.from(statsMap.keys())));
    const inserts: any[] = [];
    statsMap.forEach((rows, keepId) => {
      const keep = keepRows.get(keepId) || students.find((s) => s.id === keepId);
      const agg = aggregateStats(rows, keep);
      if (agg) inserts.push(agg);
    });
    if (inserts.length) await db().insert(memberStats).values(inserts);
  }

  // 删除多余成员（旧 ID + deleteOnly）
  const toDeleteMembers = Array.from(new Set([...keepMap.keys(), ...deleteOnly]));
  if (toDeleteMembers.length) {
    await db().delete(member).where(inArray(member.id, toDeleteMembers));
  }

  // 更新保留成员昵称为 CSV
  for (const [norm, target] of csvMap.entries()) {
    const keepId = keepIdByNorm.get(norm);
    if (!keepId) continue;
    await db()
      .update(member)
      .set({
        nickname: target.nickname,
        nicknameNormalized: norm,
        planetId: target.planetId || null,
        period: target.period || null,
        productLine: 'AI产品出海',
        updatedAt: new Date(),
      })
      .where(eq(member.id, keepId));
  }

  const total = await db().select({ c: sql`count(*)` }).from(member).where(eq(member.role, 'student'));
  const distinctNorm = await db()
    .select({ c: sql`count(distinct ${member.nicknameNormalized})` })
    .from(member)
    .where(eq(member.role, 'student'));
  console.log('done', { total: Number(total[0].c), distinctNorm: Number(distinctNorm[0].c) });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
