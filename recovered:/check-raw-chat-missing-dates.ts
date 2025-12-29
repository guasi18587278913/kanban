/**
 * 检查 raw_chat_log 缺失日期（按期数+群号）
 *
 * 用法:
 *   npx tsx scripts/check-raw-chat-missing-dates.ts
 *   npx tsx scripts/check-raw-chat-missing-dates.ts --end 2025-12-26
 */

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

type RawLogRow = {
  period: string;
  groupNumber: number;
  chatDate: Date | string;
};

function formatDateLocal(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateLocal(value: string): Date {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  return new Date(year, month - 1, day);
}

function incrementDate(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

async function main() {
  const args = process.argv.slice(2);
  const endIdx = args.indexOf('--end');
  const endDateValue = endIdx !== -1 ? args[endIdx + 1] : null;
  const endDate = endDateValue ? parseDateLocal(endDateValue) : new Date();
  const endKey = formatDateLocal(endDate);

  const { db } = await import('../src/core/db');
  const { rawChatLog } = await import('../src/config/db/schema-community-v2');

  const database = db();

  const rows = await database.select({
    period: rawChatLog.period,
    groupNumber: rawChatLog.groupNumber,
    chatDate: rawChatLog.chatDate,
  }).from(rawChatLog);

  const groups = new Map<
    string,
    { period: string; groupNumber: number; dates: Set<string> }
  >();

  rows.forEach((row: RawLogRow) => {
    const key = `${row.period}-${row.groupNumber}`;
    const dateKey = formatDateLocal(row.chatDate);
    if (!groups.has(key)) {
      groups.set(key, {
        period: row.period,
        groupNumber: row.groupNumber,
        dates: new Set<string>(),
      });
    }
    groups.get(key)!.dates.add(dateKey);
  });

  console.log(`=== 缺失日期检查（截至 ${endKey}） ===`);

  const groupKeys = Array.from(groups.keys()).sort();
  if (groupKeys.length === 0) {
    console.log('没有找到 raw_chat_log 记录。');
    return;
  }

  for (const groupKey of groupKeys) {
    const group = groups.get(groupKey)!;
    const dateList = Array.from(group.dates).sort();
    const minKey = dateList[0];
    const maxKey = dateList[dateList.length - 1];

    const missing: string[] = [];
    let cursor = parseDateLocal(minKey);
    const endCursor = parseDateLocal(endKey);

    while (cursor <= endCursor) {
      const currentKey = formatDateLocal(cursor);
      if (!group.dates.has(currentKey)) {
        missing.push(currentKey);
      }
      cursor = incrementDate(cursor);
    }

    const tailMissing = missing.filter((key) => key > maxKey);
    const internalMissing = missing.filter((key) => key <= maxKey);

    console.log(
      `\n${group.period}期${group.groupNumber}群 | ${minKey} ~ ${maxKey} | 总记录 ${dateList.length}`
    );
    console.log(`  期间缺失: ${internalMissing.length}`);
    if (internalMissing.length > 0) {
      internalMissing.slice(0, 20).forEach((key) => console.log(`    - ${key}`));
      if (internalMissing.length > 20) {
        console.log(`    ... 还有 ${internalMissing.length - 20} 条未显示`);
      }
    }
    console.log(`  末尾缺失(到 ${endKey}): ${tailMissing.length}`);
    if (tailMissing.length > 0) {
      tailMissing.slice(0, 20).forEach((key) => console.log(`    - ${key}`));
      if (tailMissing.length > 20) {
        console.log(`    ... 还有 ${tailMissing.length - 20} 条未显示`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
