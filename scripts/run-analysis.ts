/**
 * 批量分析脚本
 *
 * 用法:
 *   npx tsx scripts/run-analysis.ts                    # 处理所有待处理记录
 *   npx tsx scripts/run-analysis.ts --limit 10        # 只处理前10条
 *   npx tsx scripts/run-analysis.ts --force           # 强制重新处理所有记录
 *   npx tsx scripts/run-analysis.ts --llm             # 启用 LLM 增强
 *   npx tsx scripts/run-analysis.ts --date 2025-12-14 # 只处理指定日期
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { runAnalysis } from '@/lib/analysis';
import { db } from '@/core/db';
import { rawChatLog, dailyStats, goodNews, kocRecord, qaRecord, starStudent } from '@/config/db/schema-community-v2';
import { eq, and, gte, lte } from 'drizzle-orm';

// 命令行参数
const args = process.argv.slice(2);
const USE_LLM = args.includes('--llm');
const FORCE = args.includes('--force');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : undefined;
const dateIdx = args.indexOf('--date');
const DATE_FILTER = dateIdx !== -1 ? args[dateIdx + 1] : null;

async function printStats() {
  console.log('\n[统计信息]');

  // 原始记录统计
  const allLogs = await db().select().from(rawChatLog);
  const pending = allLogs.filter(l => l.status === 'pending').length;
  const processed = allLogs.filter(l => l.status === 'processed').length;
  const failed = allLogs.filter(l => l.status === 'failed').length;

  console.log(`原始记录: ${allLogs.length} 条 (待处理: ${pending}, 已处理: ${processed}, 失败: ${failed})`);

  // 派生表统计
  const stats = await db().select().from(dailyStats);
  const news = await db().select().from(goodNews);
  const kocs = await db().select().from(kocRecord);
  const qas = await db().select().from(qaRecord);
  const stars = await db().select().from(starStudent);

  console.log(`派生数据:`);
  console.log(`  - 每日统计: ${stats.length} 条`);
  console.log(`  - 好事记录: ${news.length} 条`);
  console.log(`  - KOC记录: ${kocs.length} 条`);
  console.log(`  - 问答记录: ${qas.length} 条`);
  console.log(`  - 标杆学员: ${stars.length} 条`);
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║         批量分析脚本                    ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`时间: ${new Date().toLocaleString()}`);
  console.log(`参数: LLM=${USE_LLM}, Force=${FORCE}, Limit=${LIMIT || '无'}, Date=${DATE_FILTER || '全部'}`);

  // 如果有日期过滤，先更新待处理状态
  if (DATE_FILTER) {
    const targetDate = new Date(DATE_FILTER);
    const nextDate = new Date(targetDate);
    nextDate.setDate(nextDate.getDate() + 1);

    // 将指定日期的记录标记为待处理
    await db()
      .update(rawChatLog)
      .set({ status: 'pending' })
      .where(
        and(
          gte(rawChatLog.chatDate, targetDate),
          lte(rawChatLog.chatDate, nextDate)
        )
      );
  }

  // 运行分析前的统计
  await printStats();

  // 运行分析
  const result = await runAnalysis({
    useLlm: USE_LLM,
    force: FORCE,
    limit: LIMIT,
    onProgress: (current, total, logId) => {
      // 进度条
      const percent = Math.round((current / total) * 100);
      const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
      process.stdout.write(`\r[${bar}] ${percent}% (${current}/${total})`);
    },
  });

  console.log('\n');

  // 运行分析后的统计
  await printStats();

  // 输出结果摘要
  console.log('\n[结果摘要]');
  console.log(`处理: ${result.processed} 成功, ${result.failed} 失败, ${result.skipped} 跳过`);

  if (result.failed > 0) {
    console.log('\n失败记录:');
    for (const r of result.results.filter(r => !r.success)) {
      console.log(`  - ${r.fileName}: ${r.error}`);
    }
  }

  console.log('\n✅ 分析完成!');
}

main().catch(console.error);
