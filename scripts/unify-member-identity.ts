/**
 * 统一 member 身份（canonical id = planet_id），并修复各引用表的 memberId/askerId/answererId。
 *
 * 目标：
 * - 解决同一人多条 member 记录（旧 id 方案）导致的 CRM/排行榜关联不稳定
 * - 将引用表中的旧 member_id 统一迁移为 planet_id（通常为星球编号，字符串数字）
 * - 过期掉旧 member 记录（id <> planet_id），避免后续 lookup 冲突
 *
 * 用法：
 *   pnpm tsx scripts/unify-member-identity.ts --dry-run
 *   pnpm tsx scripts/unify-member-identity.ts --product-line "AI产品出海" --execute
 *
 * 参数：
 *   --product-line <string>   仅处理指定产品线（默认：AI产品出海）
 *   --dry-run                 只打印统计与将要执行的变更（默认）
 *   --execute                 真正执行写库
 */
import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { parseArgs } from 'util';
import { nanoid } from 'nanoid';
import { sql } from 'drizzle-orm';

import { db } from '@/core/db';

type CliArgs = {
  'product-line': string;
  'dry-run': boolean;
  execute: boolean;
};

function normalizeName(name: string) {
  return (name || '')
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·｜|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function normalizePeriod(raw?: string | null) {
  if (!raw) return null;
  const input = String(raw).trim();
  if (!input) return null;
  const cleaned = input.replace(/^第/, '').replace(/期$/g, '').trim();
  if (!cleaned) return null;

  // Digits
  if (/^\d+$/.test(cleaned)) return String(parseInt(cleaned, 10));
  const digitMatch = cleaned.match(/\d+/);
  if (digitMatch) return String(parseInt(digitMatch[0], 10));

  // Chinese numerals (up to 99)
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

  return cleaned; // fallback (保留原值，避免误伤)
}

async function getCount(query: any) {
  // drizzle execute 的返回在不同 driver 下不完全一致，这里做兼容解析
  const res = await db().execute(query);
  const rows = (res as any).rows || res;
  const first = rows?.[0];
  if (!first) return 0;
  const value = first.count ?? first.cnt ?? Object.values(first)[0];
  return typeof value === 'string' ? parseInt(value, 10) : Number(value || 0);
}

async function main() {
const { values } = parseArgs({
  options: {
    'product-line': { type: 'string', default: 'AI产品出海' },
    'dry-run': { type: 'boolean', default: false },
    execute: { type: 'boolean', default: false },
  },
});

const args = values as unknown as CliArgs;
const productLine = args['product-line'] || 'AI产品出海';
const isExecute = Boolean(args.execute);
const isDryRun = Boolean(args['dry-run'] || !isExecute);

  if (!process.env.DATABASE_URL) {
    console.error('\n🔴 缺少 DATABASE_URL。请在 .env.local 配置后重试。\n');
    process.exit(1);
  }

  console.log(`=== 统一 Member 身份 (productLine=${productLine}) ===`);
  console.log(isDryRun ? '模式：DRY-RUN（不写库）' : '模式：EXECUTE（会写库）');
  console.log('');

  const totalMembers = await getCount(
    sql`select count(*)::int as count from member where product_line=${productLine} and status='active'`
  );
  const distinctPlanet = await getCount(
    sql`select count(distinct planet_id)::int as count from member where product_line=${productLine} and status='active'`
  );
  const duplicateMembers = await getCount(
    sql`select count(*)::int as count from member where product_line=${productLine} and status='active' and id <> planet_id`
  );

  console.log(`成员现状：`);
  console.log(`- member(active) 总数: ${totalMembers}`);
  console.log(`- planet_id 去重数: ${distinctPlanet}`);
  console.log(`- 需要合并( id <> planet_id ): ${duplicateMembers}`);
  console.log('');

  // 预检查：member_stats 若映射到同一 planet_id 会产生 UNIQUE 冲突
  const statsCollision = await db().execute(sql`
    select m.planet_id, count(*)::int as cnt
    from member_stats s
    join member m on m.id = s.member_id
    where s.product_line = ${productLine}
      and m.product_line = ${productLine}
      and m.planet_id is not null
    group by m.planet_id
    having count(*) > 1
    order by cnt desc
    limit 5
  `);
  const collisionRows = (statsCollision as any).rows || (statsCollision as any) || [];
  if (collisionRows.length > 0) {
    console.error('❌ 检测到 member_stats 映射冲突（同一 planet_id 多条 stats），会触发 UNIQUE(member_id) 约束：');
    console.error(collisionRows);
    console.error('建议先人工处理或扩展脚本做 stats 合并。');
    process.exit(1);
  }

  const refs = {
    member_message: await getCount(sql`
      select count(*)::int as count
      from member_message mm
      join member m on mm.member_id = m.id
      where mm.product_line=${productLine}
        and m.product_line=${productLine}
        and m.id <> m.planet_id
    `),
    qa_asker: await getCount(sql`
      select count(*)::int as count
      from qa_record q
      join member m on q.asker_id = m.id
      where q.product_line=${productLine}
        and m.product_line=${productLine}
        and m.id <> m.planet_id
    `),
    qa_answerer: await getCount(sql`
      select count(*)::int as count
      from qa_record q
      join member m on q.answerer_id = m.id
      where q.product_line=${productLine}
        and m.product_line=${productLine}
        and m.id <> m.planet_id
    `),
    good_news: await getCount(sql`
      select count(*)::int as count
      from good_news g
      join member m on g.member_id = m.id
      where g.product_line=${productLine}
        and m.product_line=${productLine}
        and m.id <> m.planet_id
    `),
    koc_record: await getCount(sql`
      select count(*)::int as count
      from koc_record k
      join member m on k.member_id = m.id
      where k.product_line=${productLine}
        and m.product_line=${productLine}
        and m.id <> m.planet_id
    `),
    star_student: await getCount(sql`
      select count(*)::int as count
      from star_student s
      join member m on s.member_id = m.id
      where s.product_line=${productLine}
        and m.product_line=${productLine}
        and m.id <> m.planet_id
    `),
    member_stats: await getCount(sql`
      select count(*)::int as count
      from member_stats ms
      join member m on ms.member_id = m.id
      where ms.product_line=${productLine}
        and m.product_line=${productLine}
        and m.id <> m.planet_id
    `),
  };

  console.log('引用表待迁移统计（旧 member_id -> planet_id）：');
  console.log(`- member_message.member_id: ${refs.member_message}`);
  console.log(`- qa_record.asker_id: ${refs.qa_asker}`);
  console.log(`- qa_record.answerer_id: ${refs.qa_answerer}`);
  console.log(`- good_news.member_id: ${refs.good_news}`);
  console.log(`- koc_record.member_id: ${refs.koc_record}`);
  console.log(`- star_student.member_id: ${refs.star_student}`);
  console.log(`- member_stats.member_id: ${refs.member_stats}`);
  console.log('');

  // 采样：输出几个 planet_id 下的重复 member（便于肉眼确认）
  const sample = await db().execute(sql`
    select planet_id, array_agg(id order by id) as ids
    from member
    where product_line=${productLine}
      and status='active'
      and planet_id is not null
    group by planet_id
    having count(*) > 1
    order by count(*) desc
    limit 5
  `);
  const sampleRows = (sample as any).rows || sample;
  if (sampleRows?.length) {
    console.log('重复样例（planet_id -> ids）：');
    for (const row of sampleRows) {
      console.log(`- ${row.planet_id}: ${Array.isArray(row.ids) ? row.ids.slice(0, 5).join(', ') : row.ids}`);
    }
    console.log('');
  }

  if (isDryRun) {
    console.log('✅ Dry-run 完成。若确认无误，请使用 --execute 真正写库。');
    return;
  }

  console.log('🚀 开始执行迁移/清理（事务内）...');
  await db().transaction(async (tx: any) => {
    // 1) 修复引用表：将旧 member_id 统一替换为 planet_id
    await tx.execute(sql`
      update member_message mm
      set member_id = m.planet_id
      from member m
      where mm.member_id = m.id
        and mm.product_line = ${productLine}
        and m.product_line = ${productLine}
        and m.planet_id is not null
        and m.id <> m.planet_id
    `);

    await tx.execute(sql`
      update qa_record q
      set asker_id = m.planet_id
      from member m
      where q.asker_id = m.id
        and q.product_line = ${productLine}
        and m.product_line = ${productLine}
        and m.planet_id is not null
        and m.id <> m.planet_id
    `);

    await tx.execute(sql`
      update qa_record q
      set answerer_id = m.planet_id
      from member m
      where q.answerer_id = m.id
        and q.product_line = ${productLine}
        and m.product_line = ${productLine}
        and m.planet_id is not null
        and m.id <> m.planet_id
    `);

    await tx.execute(sql`
      update good_news g
      set member_id = m.planet_id
      from member m
      where g.member_id = m.id
        and g.product_line = ${productLine}
        and m.product_line = ${productLine}
        and m.planet_id is not null
        and m.id <> m.planet_id
    `);

    await tx.execute(sql`
      update koc_record k
      set member_id = m.planet_id
      from member m
      where k.member_id = m.id
        and k.product_line = ${productLine}
        and m.product_line = ${productLine}
        and m.planet_id is not null
        and m.id <> m.planet_id
    `);

    await tx.execute(sql`
      update star_student s
      set member_id = m.planet_id
      from member m
      where s.member_id = m.id
        and s.product_line = ${productLine}
        and m.product_line = ${productLine}
        and m.planet_id is not null
        and m.id <> m.planet_id
    `);

    await tx.execute(sql`
      update member_stats ms
      set member_id = m.planet_id
      from member m
      where ms.member_id = m.id
        and ms.product_line = ${productLine}
        and m.product_line = ${productLine}
        and m.planet_id is not null
        and m.id <> m.planet_id
    `);

    // 2) 规范 canonical member（id == planet_id）：period 转数字、nickname_normalized 对齐统一规则
    const canonicalRows = await tx.execute(sql`
      select id, nickname, nickname_normalized, period
      from member
      where product_line=${productLine}
        and status='active'
        and planet_id is not null
        and id = planet_id
    `);
    const canonical = ((canonicalRows as any).rows || canonicalRows) as Array<{
      id: string;
      nickname: string;
      nickname_normalized: string | null;
      period: string | null;
    }>;

    const updates = canonical
      .map((m) => {
        const nextNorm = normalizeName(m.nickname);
        const nextPeriod = normalizePeriod(m.period);
        const patch: any = { id: m.id };
        let changed = false;
        if (nextNorm && nextNorm !== (m.nickname_normalized || '')) {
          patch.nicknameNormalized = nextNorm;
          changed = true;
        }
        if (nextPeriod && nextPeriod !== (m.period || '')) {
          patch.period = nextPeriod;
          changed = true;
        }
        if (!changed) return null;
        return patch;
      })
      .filter(Boolean) as Array<{ id: string; nicknameNormalized?: string; period?: string }>;

    // 批量 update（避免逐条 update 的网络开销，且不引入“占位插入”风险）
    const BATCH = 500;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH).map((u) => ({
        id: u.id,
        nickname_normalized: u.nicknameNormalized ?? null,
        period: u.period ?? null,
      }));

      await tx.execute(sql`
        update member m
        set
          nickname_normalized = coalesce(x.nickname_normalized, m.nickname_normalized),
          period = coalesce(x.period, m.period),
          updated_at = now()
        from json_to_recordset(${JSON.stringify(batch)}::json) as x(
          id text,
          nickname_normalized text,
          period text
        )
        where m.id = x.id
      `);
    }

    // 3) 过期旧 member（避免 lookup 冲突）
    await tx.execute(sql`
      update member
      set status='expired', updated_at=now()
      where product_line=${productLine}
        and status='active'
        and planet_id is not null
        and id <> planet_id
    `);

    // 4) 为 merge 预留：把“过期 member 的昵称”写入 member_alias（仅写入在 canonical 中唯一的 key，避免歧义）
    //    注意：member_alias.alias 有 UNIQUE 约束；这里 on conflict do nothing。
    const uniqNorms = await tx.execute(sql`
      select nickname_normalized, min(id) as member_id, count(*)::int as cnt
      from member
      where product_line=${productLine}
        and status='active'
        and planet_id is not null
        and id = planet_id
        and nickname_normalized is not null
        and nickname_normalized <> ''
      group by nickname_normalized
      having count(*) = 1
    `);
    const uniqRows = ((uniqNorms as any).rows || uniqNorms) as Array<{
      nickname_normalized: string;
    }>;
    const uniqNormSet = new Set(uniqRows.map((r) => String(r.nickname_normalized)));

    const aliasSource = await tx.execute(sql`
      select planet_id as member_id, nickname
      from member
      where product_line=${productLine}
        and status='expired'
        and planet_id is not null
        and id <> planet_id
    `);
    const aliasRows = ((aliasSource as any).rows || aliasSource) as Array<{
      member_id: string;
      nickname: string;
    }>;

    const aliasValues = aliasRows
      .map((r) => {
        const rawAlias = (r.nickname || '').trim();
        const aliasKey = normalizeName(rawAlias);
        if (!aliasKey || aliasKey.length < 2) return null;
        if (aliasKey === '0') return null; // 避免大量低质量 alias 占位
        if (!uniqNormSet.has(aliasKey)) return null; // 只写入 canonical 唯一 key，避免歧义映射
        return {
          id: `${r.member_id}-alias-${nanoid(6)}`,
          member_id: r.member_id,
          alias: rawAlias,
          created_at: new Date(),
        };
      })
      .filter(Boolean) as Array<{ id: string; member_id: string; alias: string; created_at: Date }>;

    if (aliasValues.length > 0) {
      // 直接 SQL 写入（不依赖 schema import，避免循环依赖）
      for (let i = 0; i < aliasValues.length; i += 500) {
        const batch = aliasValues.slice(i, i + 500);
        // 使用 json_to_recordset 批量插入
        await tx.execute(sql`
          insert into member_alias (id, member_id, alias, created_at)
          select x.id, x.member_id, x.alias, x.created_at
          from json_to_recordset(${JSON.stringify(batch)}::json) as x(
            id text,
            member_id text,
            alias text,
            created_at timestamp
          )
          on conflict (alias) do nothing
        `);
      }
    }
  });

  console.log('✅ 执行完成。建议再跑一次 --dry-run 确认各引用表待迁移数变为 0。');
}

main().catch((e) => {
  console.error('💥 脚本异常退出：', e);
  process.exit(1);
});
