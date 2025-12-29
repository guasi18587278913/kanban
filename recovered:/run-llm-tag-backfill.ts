/**
 * LLM 标签回填脚本
 *
 * 使用方式:
 *   npx tsx scripts/run-llm-tag-backfill.ts [--all] [--limit N] [--dry-run]
 *
 * 参数:
 *   --all      回填所有已处理日志（默认只补缺失标签的日志）
 *   --limit N  限制处理数量
 *   --dry-run  仅分析不写入数据库
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const { runLLMTagBackfill } = await import('../src/lib/llm-analysis-pipeline');
  const args = process.argv.slice(2);

  const options = {
    missingOnly: !args.includes('--all'),
    dryRun: args.includes('--dry-run'),
    limit: undefined as number | undefined,
  };

  const limitIndex = args.indexOf('--limit');
  if (limitIndex !== -1 && args[limitIndex + 1]) {
    options.limit = parseInt(args[limitIndex + 1], 10);
  }

  console.log('启动 LLM 标签回填...');
  console.log('选项:', options);

  try {
    const result = await runLLMTagBackfill({
      ...options,
      onProgress: (current, total, fileName) => {
        const percent = Math.round((current / total) * 100);
        process.stdout.write(`\r[${percent}%] ${current}/${total} - ${fileName}          `);
      },
    });

    console.log('\n\n=== 回填完成 ===');
    console.log(`成功: ${result.processed}`);
    console.log(`失败: ${result.failed}`);
    console.log(`新增标签: ${result.totalTags}`);

    if (result.errors.length > 0) {
      console.log('\n失败详情:');
      for (const err of result.errors) {
        console.log(`  - ${err.fileName}: ${err.error}`);
      }
    }

    process.exit(result.failed > 0 ? 1 : 0);
  } catch (error) {
    console.error('回填失败:', error);
    process.exit(1);
  }
}

main();
