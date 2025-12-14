/**
 * 标记报告为已审核状态
 * 用法:
 *   npx tsx scripts/mark-verified.ts --all          # 标记所有报告
 *   npx tsx scripts/mark-verified.ts --date 2025-12 # 标记指定月份
 *   npx tsx scripts/mark-verified.ts --copy-to-verified # 复制当前数据到verified字段
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { db } from '@/core/db';
import { communityDailyReport } from '@/config/db/schema';
import { sql } from 'drizzle-orm';

const args = process.argv.slice(2);
const MARK_ALL = args.includes('--all');
const COPY_TO_VERIFIED = args.includes('--copy-to-verified');

const dateIndex = args.indexOf('--date');
const DATE_FILTER = dateIndex !== -1 ? args[dateIndex + 1] : null;

async function main() {
  console.log('=== 标记报告为已审核 ===\n');

  if (COPY_TO_VERIFIED) {
    // 将当前的 activityFeature 复制到 activityFeatureVerified
    console.log('正在复制当前好事数据到 verified 字段...');

    const result = await db().execute(sql`
      UPDATE community_daily_report
      SET
        activity_feature_verified = activity_feature,
        good_news_count_verified = good_news_count,
        action_list_verified = action_list,
        is_verified = true,
        updated_at = NOW()
      WHERE activity_feature IS NOT NULL
        AND activity_feature_verified IS NULL
    `);

    console.log(`✅ 已复制数据到 verified 字段`);
    return;
  }

  let query = '';
  if (MARK_ALL) {
    query = `
      UPDATE community_daily_report
      SET is_verified = true, updated_at = NOW()
      WHERE is_verified IS NOT TRUE
    `;
    console.log('标记所有报告为已审核...');
  } else if (DATE_FILTER) {
    query = `
      UPDATE community_daily_report
      SET is_verified = true, updated_at = NOW()
      WHERE is_verified IS NOT TRUE
        AND to_char(report_date, 'YYYY-MM') = '${DATE_FILTER}'
    `;
    console.log(`标记 ${DATE_FILTER} 的报告为已审核...`);
  } else {
    console.log('用法:');
    console.log('  npx tsx scripts/mark-verified.ts --all');
    console.log('  npx tsx scripts/mark-verified.ts --date 2025-12');
    console.log('  npx tsx scripts/mark-verified.ts --copy-to-verified');
    return;
  }

  const result = await db().execute(sql.raw(query));
  console.log(`✅ 完成`);

  // 统计
  const stats = await db().execute(sql`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN is_verified = true THEN 1 ELSE 0 END) as verified
    FROM community_daily_report
  `);

  const row = (stats as any).rows?.[0] || stats[0];
  console.log(`\n统计: ${row.verified}/${row.total} 已审核`);
}

main().catch(console.error);
