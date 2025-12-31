/**
 * LLM 分析脚本
 *
 * 使用方式:
 *   npx tsx scripts/run-llm-analysis.ts [--force] [--limit N] [--dry-run] [--reset-tags] [--workers N] [--delay MS]
 *
 * 参数:
 *   --force    强制重新处理已处理的记录
 *   --limit N  限制处理数量
 *   --dry-run  仅分析不写入数据库
 *   --reset-tags  先清空全部 LLM 标签再回填
 *   --workers  并发 worker 数量（建议 2~3）
 *   --delay    每条日志之间的延迟毫秒数
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
async function main() {
  const { runLLMAnalysisPipeline } = await import('../src/lib/llm-analysis-pipeline');
  const args = process.argv.slice(2);

  const options = {
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
    resetTags: args.includes('--reset-tags'),
    workers: undefined as number | undefined,
    delayMs: undefined as number | undefined,
    limit: undefined as number | undefined,
  };

  // 解析 --limit 参数
  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    options.limit = parseInt(args[limitIndex + 1], 10);
  }
  const workerIndex = args.indexOf('--workers');
  if (workerIndex !== -1 && args[workerIndex + 1]) {
    options.workers = parseInt(args[workerIndex + 1], 10);
  }
  const delayIndex = args.indexOf('--delay');
  if (delayIndex !== -1 && args[delayIndex + 1]) {
    options.delayMs = parseInt(args[delayIndex + 1], 10);
  }

  console.log('启动 LLM 分析管道...');
  console.log('选项:', options);

  try {
    if (options.resetTags) {
      const { db } = await import('../src/core/db');
      const { memberTag } = await import('../src/config/db/schema-community-v2');
      const { eq } = await import('drizzle-orm');
      await db().delete(memberTag).where(eq(memberTag.source, 'llm'));
      console.log('已清空全部 LLM 标签');
    }

    const result = await runLLMAnalysisPipeline({
      force: options.force,
      dryRun: options.dryRun,
      limit: options.limit,
      workers: options.workers,
      delayMs: options.delayMs,
      onProgress: (current, total, fileName) => {
        const percent = Math.round((current / total) * 100);
        process.stdout.write(`\r[${percent}%] ${current}/${total} - ${fileName}          `);
      },
    });

    console.log('\n\n=== 分析完成 ===');
    console.log(`成功: ${result.processed}`);
    console.log(`失败: ${result.failed}`);
    console.log(`问答: ${result.totalQA}`);
    console.log(`好事: ${result.totalGoodNews}`);
    console.log(`KOC: ${result.totalKOC}`);

    if (result.errors.length > 0) {
      console.log('\n失败详情:');
      for (const err of result.errors) {
        console.log(`  - ${err.fileName}: ${err.error}`);
      }
    }

    process.exit(result.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('分析失败:', error);
    process.exit(1);
  }
}

main();
