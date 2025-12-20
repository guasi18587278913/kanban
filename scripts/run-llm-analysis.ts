/**
 * LLM 分析脚本
 *
 * 使用方式:
 *   npx tsx scripts/run-llm-analysis.ts [--force] [--limit N] [--dry-run]
 *
 * 参数:
 *   --force    强制重新处理已处理的记录
 *   --limit N  限制处理数量
 *   --dry-run  仅分析不写入数据库
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
    limit: undefined as number | undefined,
  };

  // 解析 --limit 参数
  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    options.limit = parseInt(args[limitIndex + 1], 10);
  }

  console.log('启动 LLM 分析管道...');
  console.log('选项:', options);

  try {
    const result = await runLLMAnalysisPipeline({
      ...options,
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
