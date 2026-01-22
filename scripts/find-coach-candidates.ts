/**
 * 教练候选人搜索脚本
 *
 * 从群聊记录中识别能讲特定话题的圈友
 *
 * 三个选题：
 * 1. 一周开发一个垂直类产品（复刻跑通全流程）
 * 2. 打新词（SEO长尾关键词策略）
 * 3. Agent Skills 开发（Claude MCP）
 */

import 'dotenv/config';
import { db } from '@/core/db';
import { rawChatLog, member } from '@/config/db/schema-community-v2';
import { desc, sql } from 'drizzle-orm';

// ============================================
// 选题关键词配置
// ============================================

interface TopicConfig {
  name: string;
  description: string;
  keywords: string[];
  // 排除词（避免误匹配）
  excludePatterns?: RegExp[];
}

const TOPICS: TopicConfig[] = [
  {
    name: '一周开发垂直类产品',
    description: '快速 MVP 开发、复刻验证产品、跑通全流程',
    keywords: [
      // 时间维度
      '一周', '几天', '两天', '三天', '五天', '2天', '3天', '5天', '7天',
      '快速', '速成', '极速',
      // 动作维度
      '复刻', '仿', '模仿', '参考', '照着做', '抄',
      'MVP', '最小可行', '先上线', '先跑通', '快速验证',
      // 流程维度
      '全流程', '从0到1', '端到端', '从选题到上架', '从想法到上线',
      '上线了', '上架了', '发布了', '提交了', '部署了',
      // 产品维度
      '垂直', '细分', '小众', '长尾', 'niche',
      // 社区黑话
      'Ship', '发船', 'ShipAny', 'ship it',
    ],
  },
  {
    name: '打新词',
    description: 'SEO 长尾关键词、蓝海词挖掘策略',
    keywords: [
      // 核心概念
      '新词', '长尾词', '蓝海词', '关键词', '热词',
      '词根', '词库', '选词', '挖词', '找词',
      // SEO 相关
      'SEO', '搜索', '排名', '流量', '谷歌', 'Google',
      '搜索量', 'KD', 'KD值', '竞争度', '难度',
      // 工具
      'Google Trends', 'Semrush', 'Ahrefs', 'Keywords Everywhere',
      'Ubersuggest', '5118',
      // 策略
      '抢占', '先占', '布局', '蓝海', '红海',
      '低竞争', '高搜索', '精准词',
    ],
  },
  {
    name: 'Agent Skills 开发',
    description: 'Claude MCP、Agent 工具开发',
    keywords: [
      // 核心概念
      'Agent', 'Skills', 'MCP', 'Claude',
      'agent skills', 'claude skills',
      // 技术术语
      '工具调用', 'function calling', 'tool use', 'tool call',
      'function call', 'API调用',
      // 自动化
      '自动化', '工作流', 'workflow', 'automation',
      // Anthropic 生态
      'Anthropic', 'Claude Code', 'Claude Desktop',
      // 开发相关
      'prompt', '模板', '指令', '上下文',
      // 中文表达
      '智能体', '代理', '助手开发',
    ],
  },
];

// ============================================
// 消息解析
// ============================================

interface ParsedMessage {
  author: string;
  time: string;
  content: string;
  isQuestion: boolean;  // 是否是提问
  isShare: boolean;     // 是否是分享（长内容、有实操）
}

// 消息头部正则：匹配 "昵称 HH:MM:SS" 或 "昵称 YYYY/MM/DD HH:MM:SS"
const MESSAGE_HEADER_PATTERN = /^(.+?)\s+(?:\d{4}\/\d{1,2}\/\d{1,2}\s+)?(\d{1,2}:\d{2}:\d{2})\s*$/;

// 提问特征
const QUESTION_PATTERNS = [
  /[?？]/, // 问号
  /^请问/, /^求助/, /^问一下/, /^想问/,
  /怎么办/, /怎么弄/, /怎么搞/, /如何/,
  /有没有人/, /有人知道/, /谁知道/,
  /能不能/, /可不可以/, /是不是/,
  /为什么/, /什么意思/,
];

// 分享特征（正面指标）
const SHARE_PATTERNS = [
  /分享一下/, /说一下/, /讲一下/, /聊一下/,
  /我的经验/, /我的做法/, /我是这样/,
  /给大家/, /供参考/, /仅供参考/,
  /成功了/, /搞定了/, /解决了/, /跑通了/,
  /上线了/, /上架了/, /发布了/,
  /收入/, /出单/, /变现/, /赚了/,
];

function parseMessages(rawContent: string): ParsedMessage[] {
  const lines = rawContent.split(/\r?\n/);
  const messages: ParsedMessage[] = [];
  let current: Partial<ParsedMessage> | null = null;
  let contentLines: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(MESSAGE_HEADER_PATTERN);

    if (headerMatch) {
      // 保存上一条消息
      if (current && current.author) {
        const content = contentLines.join('\n').trim();
        if (content) {
          const isQuestion = QUESTION_PATTERNS.some(p => p.test(content));
          const isShare = !isQuestion && (
            content.length > 100 || // 长消息更可能是分享
            SHARE_PATTERNS.some(p => p.test(content))
          );
          messages.push({
            author: current.author,
            time: current.time || '',
            content,
            isQuestion,
            isShare,
          });
        }
      }

      // 开始新消息
      current = {
        author: headerMatch[1].trim(),
        time: headerMatch[2],
      };
      contentLines = [];
    } else if (current) {
      // 消息内容行
      contentLines.push(line);
    }
  }

  // 处理最后一条消息
  if (current && current.author) {
    const content = contentLines.join('\n').trim();
    if (content) {
      const isQuestion = QUESTION_PATTERNS.some(p => p.test(content));
      const isShare = !isQuestion && (
        content.length > 100 ||
        SHARE_PATTERNS.some(p => p.test(content))
      );
      messages.push({
        author: current.author,
        time: current.time || '',
        content,
        isQuestion,
        isShare,
      });
    }
  }

  return messages;
}

// ============================================
// 关键词匹配
// ============================================

interface MatchResult {
  topic: string;
  author: string;
  content: string;
  time: string;
  chatDate: string;
  groupInfo: string;
  matchedKeywords: string[];
  isQuestion: boolean;
  isShare: boolean;
  relevanceScore: number; // 相关度评分
}

function matchKeywords(
  message: ParsedMessage,
  topic: TopicConfig,
  chatDate: string,
  groupInfo: string
): MatchResult | null {
  const content = message.content.toLowerCase();
  const matchedKeywords: string[] = [];

  for (const keyword of topic.keywords) {
    if (content.includes(keyword.toLowerCase())) {
      matchedKeywords.push(keyword);
    }
  }

  if (matchedKeywords.length === 0) {
    return null;
  }

  // 计算相关度评分
  let relevanceScore = matchedKeywords.length * 10; // 基础分：每个关键词 10 分

  // 长消息加分
  if (message.content.length > 200) relevanceScore += 20;
  else if (message.content.length > 100) relevanceScore += 10;

  // 分享类型加分
  if (message.isShare) relevanceScore += 30;

  // 提问类型减分
  if (message.isQuestion) relevanceScore -= 20;

  return {
    topic: topic.name,
    author: message.author,
    content: message.content,
    time: message.time,
    chatDate,
    groupInfo,
    matchedKeywords,
    isQuestion: message.isQuestion,
    isShare: message.isShare,
    relevanceScore,
  };
}

// ============================================
// 候选人汇总
// ============================================

interface CandidateSummary {
  author: string;
  totalMatches: number;
  shareMatches: number;   // 分享类消息数
  questionMatches: number; // 提问类消息数
  totalScore: number;
  topMessages: MatchResult[]; // 最佳消息（按分数排序）
  matchedKeywords: Set<string>;
}

function summarizeCandidates(matches: MatchResult[]): Map<string, CandidateSummary> {
  const candidates = new Map<string, CandidateSummary>();

  for (const match of matches) {
    const existing = candidates.get(match.author);

    if (existing) {
      existing.totalMatches++;
      existing.totalScore += match.relevanceScore;
      if (match.isShare) existing.shareMatches++;
      if (match.isQuestion) existing.questionMatches++;
      match.matchedKeywords.forEach(k => existing.matchedKeywords.add(k));

      // 保留分数最高的消息
      existing.topMessages.push(match);
      existing.topMessages.sort((a, b) => b.relevanceScore - a.relevanceScore);
      if (existing.topMessages.length > 5) {
        existing.topMessages = existing.topMessages.slice(0, 5);
      }
    } else {
      candidates.set(match.author, {
        author: match.author,
        totalMatches: 1,
        shareMatches: match.isShare ? 1 : 0,
        questionMatches: match.isQuestion ? 1 : 0,
        totalScore: match.relevanceScore,
        topMessages: [match],
        matchedKeywords: new Set(match.matchedKeywords),
      });
    }
  }

  return candidates;
}

// ============================================
// 主函数
// ============================================

async function main() {
  console.log('🔍 教练候选人搜索脚本\n');
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
  for (const log of logs) {
    const messages = parseMessages(log.rawContent);
    totalMessages += messages.length;

    const chatDate = log.chatDate instanceof Date
      ? log.chatDate.toISOString().split('T')[0]
      : String(log.chatDate).split('T')[0];
    const groupInfo = `${log.productLine} ${log.period}期 ${log.groupNumber}群`;

    // 3. 对每条消息，检查是否匹配各个选题
    for (const message of messages) {
      for (const topic of TOPICS) {
        const match = matchKeywords(message, topic, chatDate, groupInfo);
        if (match) {
          topicMatches.get(topic.name)!.push(match);
        }
      }
    }
  }

  console.log(`📝 共解析 ${totalMessages} 条消息\n`);
  console.log('='.repeat(80));

  // 4. 输出每个选题的候选人
  for (const topic of TOPICS) {
    const matches = topicMatches.get(topic.name)!;
    const candidates = summarizeCandidates(matches);

    // 按总分排序
    const sortedCandidates = [...candidates.values()]
      .filter(c => c.shareMatches > 0 || c.totalScore > 30) // 过滤：有分享或高分
      .sort((a, b) => {
        // 优先按分享数排序，其次按总分
        if (b.shareMatches !== a.shareMatches) {
          return b.shareMatches - a.shareMatches;
        }
        return b.totalScore - a.totalScore;
      });

    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`📌 选题: ${topic.name}`);
    console.log(`   ${topic.description}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`\n匹配消息总数: ${matches.length}`);
    console.log(`候选人数量: ${sortedCandidates.length}\n`);

    if (sortedCandidates.length === 0) {
      console.log('⚠️  未找到合适的候选人\n');
      continue;
    }

    // 输出 Top 15 候选人
    const top = sortedCandidates.slice(0, 15);

    for (let i = 0; i < top.length; i++) {
      const c = top[i];
      const shareRatio = c.totalMatches > 0
        ? Math.round((c.shareMatches / c.totalMatches) * 100)
        : 0;

      console.log(`\n${'─'.repeat(60)}`);
      console.log(`#${i + 1} 🎯 ${c.author}`);
      console.log(`${'─'.repeat(60)}`);
      console.log(`   📊 统计: 共${c.totalMatches}条相关发言 | 分享${c.shareMatches}条 | 提问${c.questionMatches}条 | 分享率${shareRatio}%`);
      console.log(`   🏆 总分: ${c.totalScore} | 关键词: ${[...c.matchedKeywords].slice(0, 8).join(', ')}`);

      // 显示最佳发言（最多3条）
      console.log(`\n   💬 代表性发言:`);
      for (const msg of c.topMessages.slice(0, 3)) {
        const preview = msg.content
          .replace(/\n/g, ' ')
          .slice(0, 150);
        const typeTag = msg.isShare ? '📢分享' : (msg.isQuestion ? '❓提问' : '💭发言');
        console.log(`      [${msg.chatDate}] [${typeTag}] ${preview}${msg.content.length > 150 ? '...' : ''}`);
      }
    }

    // 输出完整候选人列表（简略）
    if (sortedCandidates.length > 15) {
      console.log(`\n\n📋 其他候选人 (${sortedCandidates.length - 15}人):`);
      for (const c of sortedCandidates.slice(15, 30)) {
        console.log(`   - ${c.author} (分享${c.shareMatches}条, 总分${c.totalScore})`);
      }
    }
  }

  // 5. 综合推荐
  console.log('\n\n' + '='.repeat(80));
  console.log('🌟 综合推荐（在多个选题中出现的人）');
  console.log('='.repeat(80));

  const allAuthors = new Map<string, { topics: string[], totalScore: number }>();

  for (const topic of TOPICS) {
    const matches = topicMatches.get(topic.name)!;
    const candidates = summarizeCandidates(matches);

    for (const [author, summary] of candidates) {
      if (summary.shareMatches > 0 || summary.totalScore > 30) {
        const existing = allAuthors.get(author);
        if (existing) {
          existing.topics.push(topic.name);
          existing.totalScore += summary.totalScore;
        } else {
          allAuthors.set(author, {
            topics: [topic.name],
            totalScore: summary.totalScore,
          });
        }
      }
    }
  }

  // 找出在多个选题中出现的人
  const multiTopic = [...allAuthors.entries()]
    .filter(([_, v]) => v.topics.length >= 2)
    .sort((a, b) => b[1].totalScore - a[1].totalScore);

  if (multiTopic.length > 0) {
    console.log(`\n找到 ${multiTopic.length} 人在多个选题中有相关发言:\n`);
    for (const [author, info] of multiTopic) {
      console.log(`   🌟 ${author}`);
      console.log(`      涉及选题: ${info.topics.join(' | ')}`);
      console.log(`      综合分数: ${info.totalScore}\n`);
    }
  } else {
    console.log('\n暂未发现在多个选题中都有表现的人\n');
  }

  console.log('\n✅ 分析完成!\n');
  process.exit(0);
}

main().catch(e => {
  console.error('❌ 脚本执行失败:', e);
  process.exit(1);
});
