/**
 * 教练候选人搜索脚本 V2 - 完整版
 *
 * 改进：
 * 1. 合并同一人的所有发言（不按日期拆分）
 * 2. 保留完整发言内容作为证据
 * 3. 深度评估每个候选人的能力
 * 4. 输出详细的 Markdown 报告
 */

import 'dotenv/config';
import { db } from '@/core/db';
import { rawChatLog } from '@/config/db/schema-community-v2';
import { desc } from 'drizzle-orm';
import * as fs from 'fs';

// ============================================
// 选题关键词配置（更精细）
// ============================================

interface TopicConfig {
  name: string;
  description: string;
  // 核心关键词（必须匹配）
  coreKeywords: string[];
  // 辅助关键词（加分项）
  supportKeywords: string[];
  // 排除词（避免误匹配）
  excludePatterns: RegExp[];
  // 评估维度
  evaluationCriteria: string[];
}

const TOPICS: TopicConfig[] = [
  {
    name: '一周开发垂直类产品',
    description: '快速 MVP 开发、复刻验证产品、跑通从选题到上线的全流程',
    coreKeywords: [
      // 时间维度（核心）
      '一周', '几天', '两天', '三天', '五天', '2天', '3天', '5天', '7天',
      '一天', '半天', '一个月',
      // 流程维度（核心）
      '从0到1', '从零到一', '全流程', '跑通', '上线了', '上架了', '发布了',
      // 方法论（核心）
      'MVP', '最小可行', '复刻', '仿', '快速验证',
    ],
    supportKeywords: [
      // 工具
      'ShipAny', 'Ship', 'Vercel', 'Supabase', 'Cursor', 'Bolt', 'Lovable',
      // 产品类型
      '垂直', '细分', '小众', 'niche', '长尾',
      // 成果
      '出单', '收入', '用户', '访问量',
      // 平台
      'Product Hunt', 'ProductHunt',
    ],
    excludePatterns: [
      /请问.*(怎么|如何)/,
      /有没有人.*教/,
    ],
    evaluationCriteria: [
      '是否有实际上线的产品',
      '开发周期是否够快（一周内）',
      '是否跑通了完整流程（选题->开发->上线->变现）',
      '是否有可复现的方法论',
    ],
  },
  {
    name: '打新词',
    description: 'SEO 长尾关键词策略、蓝海词挖掘、搜索流量获取',
    coreKeywords: [
      // 核心概念
      '新词', '长尾词', '蓝海词', '关键词', '热词',
      'SEO', '搜索排名', '谷歌排名', 'Google排名',
      // 工具
      'Google Trends', 'Semrush', 'Ahrefs', 'Keywords Everywhere',
      // 策略
      '挖词', '选词', '抢占', '布局',
    ],
    supportKeywords: [
      // 指标
      '搜索量', 'KD', '竞争度', '难度',
      // 策略
      '蓝海', '红海', '低竞争', '外链',
      // 结果
      '首页', '排名', '流量',
    ],
    excludePatterns: [],
    evaluationCriteria: [
      '是否有具体的选词方法论',
      '是否有成功的关键词案例（如进首页）',
      '是否了解 SEO 工具的使用',
      '是否有流量获取的实操经验',
    ],
  },
  {
    name: 'Agent Skills 开发',
    description: 'Claude MCP、Agent 工具开发、AI 自动化工作流',
    coreKeywords: [
      // 核心概念
      'Agent', 'Skills', 'MCP',
      'Claude Code', 'ClaudeCode',
      'function calling', 'tool use',
      // 工作流
      'n8n', '工作流', 'workflow', '自动化',
      // 智能体
      '智能体', 'AI Agent',
    ],
    supportKeywords: [
      // Anthropic 生态
      'Claude', 'Anthropic',
      // 开发相关
      'prompt', '模板', '指令', 'API',
      // 工具
      'Cursor', 'Roo', 'Cline',
    ],
    excludePatterns: [],
    evaluationCriteria: [
      '是否有 Agent/MCP 开发经验',
      '是否了解 Claude Code 的高级用法',
      '是否有工作流自动化的实操案例',
      '是否能讲清楚技术原理',
    ],
  },
];

// ============================================
// 消息解析（改进版）
// ============================================

interface ParsedMessage {
  author: string;
  authorNormalized: string; // 标准化昵称（去除日期后缀等）
  time: string;
  content: string;
  chatDate: string;
  groupInfo: string;
  isQuestion: boolean;
  isShare: boolean;
  contentLength: number;
}

// 消息头部正则
const MESSAGE_HEADER_PATTERN = /^(.+?)\s+(?:\d{4}\/\d{1,2}\/\d{1,2}\s+)?(\d{1,2}:\d{2}:\d{2})\s*$/;

// 提问特征
const QUESTION_PATTERNS = [
  /[?？]$/,
  /^请问/, /^求助/, /^问一下/, /^想问/, /^请教/,
  /怎么办/, /怎么弄/, /怎么搞/, /如何.*\?/,
  /有没有人/, /有人知道/, /谁知道/,
  /能不能/, /可不可以/,
  /为什么.*\?/, /什么意思.*\?/,
  /#举手/,
];

// 分享特征
const SHARE_PATTERNS = [
  /分享一下/, /分享给大家/, /说一下我/, /讲一下/,
  /我的经验/, /我的做法/, /我是这样/,
  /给大家参考/, /供参考/,
  /成功了/, /搞定了/, /解决了/, /跑通了/,
  /上线了/, /上架了/, /发布了/, /提交了/,
  /收入/, /出单/, /变现/, /赚了/, /美金/, /美刀/,
  /\[链接\|/, // 星球链接，通常是分享
];

// 标准化昵称（去除日期后缀、特殊符号等）
function normalizeAuthor(author: string): string {
  return author
    .replace(/\s+\d{4}-\d{2}-\d{2}$/, '') // 去除日期后缀
    .replace(/\s+\d{2}-\d{2}$/, '') // 去除短日期后缀
    .replace(/[>\s]+$/, '') // 去除尾部 > 和空格
    .replace(/^[>\s]+/, '') // 去除头部 > 和空格
    .replace(/\(wxid_[^)]+\)/, '') // 去除 wxid
    .replace(/\([a-z0-9]+\)$/i, '') // 去除其他 ID 后缀
    .trim();
}

function parseMessages(rawContent: string, chatDate: string, groupInfo: string): ParsedMessage[] {
  const lines = rawContent.split(/\r?\n/);
  const messages: ParsedMessage[] = [];
  let current: { author: string; time: string } | null = null;
  let contentLines: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(MESSAGE_HEADER_PATTERN);

    if (headerMatch) {
      // 保存上一条消息
      if (current && current.author) {
        const content = contentLines.join('\n').trim();
        if (content && content.length > 5) { // 过滤太短的消息
          const isQuestion = QUESTION_PATTERNS.some(p => p.test(content));
          const isShare = !isQuestion && (
            content.length > 80 ||
            SHARE_PATTERNS.some(p => p.test(content))
          );
          messages.push({
            author: current.author,
            authorNormalized: normalizeAuthor(current.author),
            time: current.time,
            content,
            chatDate,
            groupInfo,
            isQuestion,
            isShare,
            contentLength: content.length,
          });
        }
      }

      current = {
        author: headerMatch[1].trim(),
        time: headerMatch[2],
      };
      contentLines = [];
    } else if (current) {
      contentLines.push(line);
    }
  }

  // 处理最后一条消息
  if (current && current.author) {
    const content = contentLines.join('\n').trim();
    if (content && content.length > 5) {
      const isQuestion = QUESTION_PATTERNS.some(p => p.test(content));
      const isShare = !isQuestion && (
        content.length > 80 ||
        SHARE_PATTERNS.some(p => p.test(content))
      );
      messages.push({
        author: current.author,
        authorNormalized: normalizeAuthor(current.author),
        time: current.time,
        content,
        chatDate,
        groupInfo,
        isQuestion,
        isShare,
        contentLength: content.length,
      });
    }
  }

  return messages;
}

// ============================================
// 关键词匹配与评分
// ============================================

interface MatchResult {
  message: ParsedMessage;
  topic: string;
  matchedCoreKeywords: string[];
  matchedSupportKeywords: string[];
  relevanceScore: number;
}

function matchKeywords(message: ParsedMessage, topic: TopicConfig): MatchResult | null {
  const content = message.content;
  const contentLower = content.toLowerCase();

  // 检查排除模式
  for (const pattern of topic.excludePatterns) {
    if (pattern.test(content)) {
      return null;
    }
  }

  const matchedCore: string[] = [];
  const matchedSupport: string[] = [];

  // 匹配核心关键词
  for (const keyword of topic.coreKeywords) {
    if (contentLower.includes(keyword.toLowerCase())) {
      matchedCore.push(keyword);
    }
  }

  // 匹配辅助关键词
  for (const keyword of topic.supportKeywords) {
    if (contentLower.includes(keyword.toLowerCase())) {
      matchedSupport.push(keyword);
    }
  }

  // 至少匹配一个核心关键词
  if (matchedCore.length === 0) {
    return null;
  }

  // 计算相关度评分
  let score = 0;

  // 核心关键词：每个 15 分
  score += matchedCore.length * 15;

  // 辅助关键词：每个 5 分
  score += matchedSupport.length * 5;

  // 长消息加分（更可能是深度分享）
  if (message.contentLength > 300) score += 25;
  else if (message.contentLength > 150) score += 15;
  else if (message.contentLength > 80) score += 5;

  // 分享类型加分
  if (message.isShare) score += 20;

  // 提问类型减分
  if (message.isQuestion) score -= 15;

  return {
    message,
    topic: topic.name,
    matchedCoreKeywords: matchedCore,
    matchedSupportKeywords: matchedSupport,
    relevanceScore: score,
  };
}

// ============================================
// 候选人汇总（按标准化昵称合并）
// ============================================

interface CandidateEvidence {
  date: string;
  group: string;
  content: string;
  score: number;
  matchedKeywords: string[];
  isShare: boolean;
  isQuestion: boolean;
}

interface CandidateSummary {
  name: string;                    // 显示名称（最常用的昵称）
  alternativeNames: Set<string>;   // 其他昵称变体
  totalScore: number;
  shareCount: number;
  questionCount: number;
  evidences: CandidateEvidence[];  // 所有证据
  allKeywords: Set<string>;
  firstSeen: string;
  lastSeen: string;
  activeGroups: Set<string>;
}

function summarizeCandidates(matches: MatchResult[]): Map<string, CandidateSummary> {
  const candidates = new Map<string, CandidateSummary>();

  for (const match of matches) {
    const normalizedName = match.message.authorNormalized;
    const existing = candidates.get(normalizedName);

    const evidence: CandidateEvidence = {
      date: match.message.chatDate,
      group: match.message.groupInfo,
      content: match.message.content,
      score: match.relevanceScore,
      matchedKeywords: [...match.matchedCoreKeywords, ...match.matchedSupportKeywords],
      isShare: match.message.isShare,
      isQuestion: match.message.isQuestion,
    };

    if (existing) {
      existing.totalScore += match.relevanceScore;
      if (match.message.isShare) existing.shareCount++;
      if (match.message.isQuestion) existing.questionCount++;
      existing.evidences.push(evidence);
      existing.alternativeNames.add(match.message.author);
      match.matchedCoreKeywords.forEach(k => existing.allKeywords.add(k));
      match.matchedSupportKeywords.forEach(k => existing.allKeywords.add(k));
      existing.activeGroups.add(match.message.groupInfo);

      // 更新时间范围
      if (match.message.chatDate < existing.firstSeen) {
        existing.firstSeen = match.message.chatDate;
      }
      if (match.message.chatDate > existing.lastSeen) {
        existing.lastSeen = match.message.chatDate;
      }
    } else {
      candidates.set(normalizedName, {
        name: normalizedName,
        alternativeNames: new Set([match.message.author]),
        totalScore: match.relevanceScore,
        shareCount: match.message.isShare ? 1 : 0,
        questionCount: match.message.isQuestion ? 1 : 0,
        evidences: [evidence],
        allKeywords: new Set([...match.matchedCoreKeywords, ...match.matchedSupportKeywords]),
        firstSeen: match.message.chatDate,
        lastSeen: match.message.chatDate,
        activeGroups: new Set([match.message.groupInfo]),
      });
    }
  }

  // 按分数排序证据
  for (const candidate of candidates.values()) {
    candidate.evidences.sort((a, b) => b.score - a.score);
  }

  return candidates;
}

// ============================================
// 报告生成
// ============================================

function generateMarkdownReport(
  topicResults: Map<string, Map<string, CandidateSummary>>,
  totalLogs: number,
  totalMessages: number
): string {
  let report = '';

  report += `# 教练候选人分析报告\n\n`;
  report += `> 生成时间: ${new Date().toLocaleString('zh-CN')}\n\n`;

  report += `## 📊 数据概览\n\n`;
  report += `| 指标 | 数值 |\n`;
  report += `|------|------|\n`;
  report += `| 聊天记录文件数 | ${totalLogs} |\n`;
  report += `| 消息总数 | ${totalMessages.toLocaleString()} |\n`;
  report += `| 分析选题数 | ${TOPICS.length} |\n\n`;

  // 综合推荐（在多个选题中出现的人）
  const allCandidates = new Map<string, { topics: string[], totalScore: number, details: Map<string, CandidateSummary> }>();

  for (const [topicName, candidates] of topicResults) {
    for (const [name, summary] of candidates) {
      // 过滤：至少有1条分享，或总分超过50
      if (summary.shareCount === 0 && summary.totalScore < 50) continue;

      const existing = allCandidates.get(name);
      if (existing) {
        existing.topics.push(topicName);
        existing.totalScore += summary.totalScore;
        existing.details.set(topicName, summary);
      } else {
        allCandidates.set(name, {
          topics: [topicName],
          totalScore: summary.totalScore,
          details: new Map([[topicName, summary]]),
        });
      }
    }
  }

  // 找出在多个选题中出现的人
  const multiTopicCandidates = [...allCandidates.entries()]
    .filter(([_, v]) => v.topics.length >= 2)
    .sort((a, b) => {
      // 先按涉及选题数排序，再按总分排序
      if (b[1].topics.length !== a[1].topics.length) {
        return b[1].topics.length - a[1].topics.length;
      }
      return b[1].totalScore - a[1].totalScore;
    });

  report += `## 🌟 综合推荐（涉及多个选题）\n\n`;
  report += `以下候选人在多个选题中都有相关发言，说明知识面较广，可能更适合做综合性分享：\n\n`;

  if (multiTopicCandidates.length > 0) {
    report += `| 排名 | 候选人 | 涉及选题 | 综合分数 |\n`;
    report += `|------|--------|----------|----------|\n`;

    for (let i = 0; i < Math.min(30, multiTopicCandidates.length); i++) {
      const [name, info] = multiTopicCandidates[i];
      const topicList = info.topics.map(t => {
        if (t === '一周开发垂直类产品') return '快速开发';
        if (t === '打新词') return 'SEO';
        if (t === 'Agent Skills 开发') return 'Agent';
        return t;
      }).join(' / ');
      report += `| ${i + 1} | **${name}** | ${topicList} | ${info.totalScore} |\n`;
    }
    report += '\n';
  } else {
    report += `暂未发现在多个选题中都有表现的候选人。\n\n`;
  }

  // 每个选题的详细分析
  for (const topic of TOPICS) {
    const candidates = topicResults.get(topic.name)!;

    report += `---\n\n`;
    report += `## 📌 选题: ${topic.name}\n\n`;
    report += `**选题说明**: ${topic.description}\n\n`;

    // 统计
    const allMatches = [...candidates.values()];
    const totalMatches = allMatches.reduce((sum, c) => sum + c.evidences.length, 0);
    const shareMatches = allMatches.reduce((sum, c) => sum + c.shareCount, 0);

    report += `**匹配统计**:\n`;
    report += `- 相关消息总数: ${totalMatches}\n`;
    report += `- 分享类消息: ${shareMatches}\n`;
    report += `- 候选人数量: ${candidates.size}\n\n`;

    // 评估标准
    report += `**评估标准**:\n`;
    for (const criterion of topic.evaluationCriteria) {
      report += `- ${criterion}\n`;
    }
    report += '\n';

    // 排序候选人
    const sortedCandidates = [...candidates.values()]
      .filter(c => c.shareCount > 0 || c.totalScore > 40)
      .sort((a, b) => {
        // 优先按分享数，其次按总分
        if (b.shareCount !== a.shareCount) {
          return b.shareCount - a.shareCount;
        }
        return b.totalScore - a.totalScore;
      });

    if (sortedCandidates.length === 0) {
      report += `⚠️ 未找到合适的候选人\n\n`;
      continue;
    }

    // 输出 Top 候选人详情
    report += `### 🏆 Top 候选人\n\n`;

    const topN = Math.min(10, sortedCandidates.length);
    for (let i = 0; i < topN; i++) {
      const c = sortedCandidates[i];
      const shareRatio = c.evidences.length > 0
        ? Math.round((c.shareCount / c.evidences.length) * 100)
        : 0;

      report += `#### ${i + 1}. ${c.name}\n\n`;

      report += `| 指标 | 数值 |\n`;
      report += `|------|------|\n`;
      report += `| 总分 | ${c.totalScore} |\n`;
      report += `| 相关发言 | ${c.evidences.length} 条 |\n`;
      report += `| 分享类 | ${c.shareCount} 条 (${shareRatio}%) |\n`;
      report += `| 提问类 | ${c.questionCount} 条 |\n`;
      report += `| 活跃时间 | ${c.firstSeen} ~ ${c.lastSeen} |\n`;
      report += `| 活跃群组 | ${[...c.activeGroups].join(', ')} |\n`;
      report += `| 关键词 | ${[...c.allKeywords].slice(0, 10).join(', ')} |\n\n`;

      // 代表性发言（最多5条高分的）
      const topEvidences = c.evidences
        .filter(e => e.isShare || e.score > 30)
        .slice(0, 5);

      if (topEvidences.length > 0) {
        report += `**代表性发言**:\n\n`;
        for (const e of topEvidences) {
          const tag = e.isShare ? '📢 分享' : (e.isQuestion ? '❓ 提问' : '💬 发言');
          const preview = e.content
            .replace(/\n+/g, ' ')
            .slice(0, 500);
          report += `> **[${e.date}]** [${tag}] [分数:${e.score}]\n`;
          report += `> \n`;
          report += `> ${preview}${e.content.length > 500 ? '...' : ''}\n`;
          report += `> \n`;
          report += `> *关键词: ${e.matchedKeywords.join(', ')}*\n\n`;
        }
      }

      report += '\n';
    }

    // 其他候选人列表
    if (sortedCandidates.length > topN) {
      report += `### 📋 其他候选人\n\n`;
      report += `| 候选人 | 分享数 | 总分 | 关键词 |\n`;
      report += `|--------|--------|------|--------|\n`;

      for (let i = topN; i < Math.min(30, sortedCandidates.length); i++) {
        const c = sortedCandidates[i];
        const keywords = [...c.allKeywords].slice(0, 5).join(', ');
        report += `| ${c.name} | ${c.shareCount} | ${c.totalScore} | ${keywords} |\n`;
      }
      report += '\n';
    }
  }

  // 附录：完整候选人列表
  report += `---\n\n`;
  report += `## 📎 附录：各选题完整候选人列表\n\n`;

  for (const topic of TOPICS) {
    const candidates = topicResults.get(topic.name)!;
    const sorted = [...candidates.values()]
      .filter(c => c.shareCount > 0 || c.totalScore > 30)
      .sort((a, b) => b.totalScore - a.totalScore);

    report += `### ${topic.name}\n\n`;
    report += `共 ${sorted.length} 人\n\n`;

    if (sorted.length > 0) {
      report += `<details>\n`;
      report += `<summary>点击展开完整列表</summary>\n\n`;
      report += `| 排名 | 候选人 | 分享 | 提问 | 总分 |\n`;
      report += `|------|--------|------|------|------|\n`;
      for (let i = 0; i < sorted.length; i++) {
        const c = sorted[i];
        report += `| ${i + 1} | ${c.name} | ${c.shareCount} | ${c.questionCount} | ${c.totalScore} |\n`;
      }
      report += `\n</details>\n\n`;
    }
  }

  return report;
}

// ============================================
// 主函数
// ============================================

async function main() {
  console.log('🔍 教练候选人搜索脚本 V2\n');
  console.log('正在加载群聊记录...\n');

  // 1. 获取所有聊天记录
  const logs = await db()
    .select({
      id: rawChatLog.id,
      productLine: rawChatLog.productLine,
      period: rawChatLog.period,
      groupNumber: rawChatLog.groupNumber,
      chatDate: rawChatLog.chatDate,
      rawContent: rawChatLog.rawContent,
      messageCount: rawChatLog.messageCount,
    })
    .from(rawChatLog)
    .orderBy(desc(rawChatLog.chatDate));

  console.log(`📊 共加载 ${logs.length} 条聊天记录\n`);

  // 统计
  let totalMessages = 0;
  const topicMatches: Map<string, MatchResult[]> = new Map();

  for (const topic of TOPICS) {
    topicMatches.set(topic.name, []);
  }

  // 2. 遍历每条聊天记录
  let processedLogs = 0;
  for (const log of logs) {
    const chatDate = log.chatDate instanceof Date
      ? log.chatDate.toISOString().split('T')[0]
      : String(log.chatDate).split('T')[0];
    const groupInfo = `${log.productLine}${log.period}期${log.groupNumber}群`;

    const messages = parseMessages(log.rawContent, chatDate, groupInfo);
    totalMessages += messages.length;

    // 3. 对每条消息，检查是否匹配各个选题
    for (const message of messages) {
      for (const topic of TOPICS) {
        const match = matchKeywords(message, topic);
        if (match) {
          topicMatches.get(topic.name)!.push(match);
        }
      }
    }

    processedLogs++;
    if (processedLogs % 100 === 0) {
      console.log(`处理进度: ${processedLogs}/${logs.length}`);
    }
  }

  console.log(`\n📝 共解析 ${totalMessages} 条消息\n`);

  // 4. 汇总候选人
  const topicResults: Map<string, Map<string, CandidateSummary>> = new Map();

  for (const topic of TOPICS) {
    const matches = topicMatches.get(topic.name)!;
    const candidates = summarizeCandidates(matches);
    topicResults.set(topic.name, candidates);

    console.log(`选题「${topic.name}」: ${matches.length} 条匹配, ${candidates.size} 个候选人`);
  }

  // 5. 生成报告
  console.log('\n正在生成报告...\n');

  const report = generateMarkdownReport(topicResults, logs.length, totalMessages);

  // 保存报告
  const reportPath = '/Users/liyadong/Documents/GitHub/00群看板/coach-candidates-report.md';
  fs.writeFileSync(reportPath, report);

  console.log(`✅ 报告已保存到: ${reportPath}\n`);

  // 输出到控制台
  console.log(report);

  process.exit(0);
}

main().catch(e => {
  console.error('❌ 脚本执行失败:', e);
  process.exit(1);
});
