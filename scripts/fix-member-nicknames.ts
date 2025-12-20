import { eq } from 'drizzle-orm';

import { db, closeDb } from '@/core/db';
import { member } from '@/config/db/schema-community-v2';

function normalizeName(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

async function main() {
  console.log('loading students...');
  const rows = await db()
    .select({
      id: member.id,
      nickname: member.nickname,
      norm: member.nicknameNormalized,
      planetId: member.planetId,
    })
    .from(member)
    .where(eq(member.role, 'student'));

  type Row = typeof rows[number] & { newNick?: string; newNorm?: string };
  const mutated: Row[] = rows.map((r) => ({ ...r }));
  const normSet = new Set<string>(mutated.map((r) => r.norm || ''));

  let invalidFixed = 0;

  // 1) 修复空昵称或“0”等无效占位：用星球编号或 id 代替
  for (const r of mutated) {
    const norm = (r.norm || '').trim();
    const nick = (r.nickname || '').trim();
    const isInvalid = !nick || !norm || norm === '0';
    if (!isInvalid) continue;

    let base = (r.planetId || '').trim();
    if (!base) base = `id-${r.id.slice(0, 6)}`;
    let newNick = base;
    let newNorm = normalizeName(newNick);
    let guard = 0;
    while (normSet.has(newNorm) && guard < 5) {
      newNick = `${base}~${r.id.slice(0, 4)}${guard}`;
      newNorm = normalizeName(newNick);
      guard++;
    }

    normSet.delete(r.norm || '');
    normSet.add(newNorm);
    r.newNick = newNick;
    r.newNorm = newNorm;
    r.nickname = newNick;
    r.norm = newNorm;
    invalidFixed++;
  }

  // 2) 处理重复规范化昵称：循环去重，保留第一条，其余追加 ~星球编号/ID
  let dupFixed = 0;
  let loop = 0;
  while (loop < 5) {
    const map = new Map<string, Row[]>();
    for (const r of mutated) {
      const key = r.norm || '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }

    let changed = 0;
    for (const [, list] of map.entries()) {
      if (list.length <= 1) continue;
      const [, ...dups] = list;
      for (const d of dups) {
        const base = (d.nickname || 'user').trim();
        const safeBase = base.replace(/[-_—–·•‧·|].*$/, '') || base;
        const suffix = (d.planetId || d.id).replace(/\\s+/g, '');
        let newNick = `${safeBase}~${suffix}`;
        let newNorm = normalizeName(newNick);
        let guard = 0;
        while (normSet.has(newNorm) && guard < 5) {
          newNick = `${base}~${suffix}~${guard}`;
          newNorm = normalizeName(newNick);
          guard++;
        }

        normSet.delete(d.norm || '');
        normSet.add(newNorm);
        d.newNick = newNick;
        d.newNorm = newNorm;
        d.nickname = newNick;
        d.norm = newNorm;
        dupFixed++;
        changed++;
      }
    }

    if (changed === 0) break;
    loop++;
  }

  const toUpdate = mutated.filter((r) => r.newNick || r.newNorm);
  console.log(`applying updates: ${toUpdate.length}`);
  for (const r of toUpdate) {
    await db()
      .update(member)
      .set({ nickname: r.newNick, nicknameNormalized: r.newNorm })
      .where(eq(member.id, r.id));
  }

  console.log({ totalRows: rows.length, invalidFixed, dupFixed, updated: toUpdate.length });
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
