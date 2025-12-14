/**
 * 分析引擎主入口
 */

import { db } from '@/core/db';
import { rawChatLog, member } from '@/config/db/schema-community-v2';
import { eq, asc } from 'drizzle-orm';
import { parseMessages, setMemberLookup } from './preprocessor';
import { runRuleEngine } from './rule-engine';
import { writeAnalysisResults, WriteResult } from './output-writer';

// ============================================
// 类型定义
// ============================================

export interface AnalysisOptions {
  useLlm?: boolean;         // 是否使用 LLM 增强
  force?: boolean;          // 是否强制重新处理已处理的记录
  limit?: number;           // 限制处理数量
  onProgress?: (current: number, total: number, logId: string) => void;
}

export interface AnalysisResult {
  processed: number;
  failed: number;
  skipped: number;
  results: {
    logId: string;
    fileName: string;
    success: boolean;
    stats?: {
      messages: number;
      questions: number;
      goodNews: number;
      koc: number;
    };
    error?: string;
  }[];
}

// ============================================
// 加载成员映射
// ============================================

async function loadMemberLookup(): Promise<Map<string, { id: string; role: string }>> {
  const members = await db().select().from(member);
  const lookup = new Map<string, { id: string; role: string }>();

  for (const m of members) {
    if (m.nicknameNormalized) {
      lookup.set(m.nicknameNormalized, {
        id: m.id,
        role: m.role,
      });
    }
  }

  console.log(`[Analysis] Loaded ${lookup.size} member mappings`);
  return lookup;
}

// ============================================
// 处理单条记录
// ============================================

async function processSingleLog(
  log: typeof rawChatLog.$inferSelect,
  options: AnalysisOptions
): Promise<WriteResult & { stats?: { messages: number; questions: number; goodNews: number; koc: number } }> {
  // 1. 预处理
  const preprocessResult = parseMessages(log.rawContent, log.chatDate);
  console.log(`  [Preprocess] ${preprocessResult.stats.totalMessages} messages, ${preprocessResult.stats.uniqueAuthors} authors`);

  // 2. 规则引擎
  const ruleResult = runRuleEngine(preprocessResult.messages);
  console.log(`  [RuleEngine] ${ruleResult.stats.questionCount} questions, ${ruleResult.stats.goodNewsCount} good news, ${ruleResult.kocCandidates.length} KOC`);

  // 3. LLM 增强（如果需要且启用）
  if (options.useLlm && ruleResult.needsLlmEnhancement) {
    console.log(`  [LLM] Enhancement needed: ${ruleResult.llmEnhancementReason}`);
    // TODO: 实现 LLM 增强
  }

  // 4. 写入结果
  const writeResult = await writeAnalysisResults(
    {
      chatLogId: log.id,
      productLine: log.productLine,
      period: log.period,
      groupNumber: log.groupNumber,
      chatDate: log.chatDate,
    },
    preprocessResult,
    ruleResult
  );

  return {
    ...writeResult,
    stats: {
      messages: ruleResult.stats.messageCount,
      questions: ruleResult.stats.questionCount,
      goodNews: ruleResult.stats.goodNewsCount,
      koc: ruleResult.kocCandidates.length,
    },
  };
}

// ============================================
// 主分析函数
// ============================================

export async function runAnalysis(options: AnalysisOptions = {}): Promise<AnalysisResult> {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║         分析引擎启动                    ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`时间: ${new Date().toLocaleString()}`);
  console.log(`选项: LLM=${options.useLlm ? '启用' : '禁用'}, Force=${options.force ? '是' : '否'}`);

  // 加载成员映射
  const memberLookup = await loadMemberLookup();
  setMemberLookup(memberLookup);

  // 获取待处理的记录
  let query = db()
    .select()
    .from(rawChatLog)
    .orderBy(asc(rawChatLog.chatDate))
    .$dynamic();

  if (!options.force) {
    query = query.where(eq(rawChatLog.status, 'pending'));
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const logs = await query;
  console.log(`\n找到 ${logs.length} 条待处理记录\n`);

  if (logs.length === 0) {
    return {
      processed: 0,
      failed: 0,
      skipped: 0,
      results: [],
    };
  }

  // 处理每条记录
  const results: AnalysisResult['results'] = [];
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    console.log(`[${i + 1}/${logs.length}] ${log.fileName}`);

    if (options.onProgress) {
      options.onProgress(i + 1, logs.length, log.id);
    }

    try {
      const result = await processSingleLog(log, options);

      if (result.success) {
        processed++;
        console.log(`  ✅ 成功: ${result.written.goodNews} 好事, ${result.written.kocRecords} KOC, ${result.written.qaRecords} 问答`);
      } else {
        failed++;
        console.log(`  ❌ 失败: ${result.error}`);
      }

      results.push({
        logId: log.id,
        fileName: log.fileName,
        success: result.success,
        stats: result.stats,
        error: result.error,
      });
    } catch (error) {
      failed++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ 异常: ${errorMsg}`);

      results.push({
        logId: log.id,
        fileName: log.fileName,
        success: false,
        error: errorMsg,
      });
    }
  }

  // 汇总
  console.log('\n════════════════════════════════════════');
  console.log(`处理完成: ${processed} 成功, ${failed} 失败, ${skipped} 跳过`);

  // 统计总数
  const totalGoodNews = results.reduce((sum, r) => sum + (r.stats?.goodNews || 0), 0);
  const totalKoc = results.reduce((sum, r) => sum + (r.stats?.koc || 0), 0);
  const totalQuestions = results.reduce((sum, r) => sum + (r.stats?.questions || 0), 0);

  console.log(`提取结果: ${totalGoodNews} 好事, ${totalKoc} KOC, ${totalQuestions} 问答`);

  return {
    processed,
    failed,
    skipped,
    results,
  };
}

// 导出子模块
export * from './preprocessor';
export * from './rule-engine';
export * from './output-writer';
export * from './patterns';
