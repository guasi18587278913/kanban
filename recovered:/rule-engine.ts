/**
 * 规则引擎
 * 基于关键词和模式的快速提取
 */

import {
  ParsedMessage,
  getMinutesDiff,
} from './preprocessor';

import {
  QUESTION_PATTERNS,
  RESOLUTION_PATTERNS,
  THANKS_PATTERNS,
  GOOD_NEWS_PATTERNS,
  CONTRIBUTION_PATTERNS,
  MILESTONE_PATTERNS,
  matchesAny,
  inferRevenueLevel,
} from './patterns';

// ============================================
// 类型定义
// ============================================

export interface QuestionRecord {
  index: number;
  asker: string;
  askerNormalized: string;
  askerId?: string;
  content: string;
  askTime: Date;
  // 回答信息
  answerIndex?: number;
  answerer?: string;
  answererNormalized?: string;
  answererId?: string;
  answererRole?: string;
  answerContent?: string;
  answerTime?: Date;
  responseMinutes?: number;
  isResolved: boolean;
}

export interface GoodNewsRecord {
  messageIndex?: number;
  author: string;
  authorNormalized: string;
  authorId?: string;
  content: string;
  category: 'revenue' | 'milestone' | 'platform' | 'growth' | 'other';
  eventTime: Date;
  // 推断的数据
  revenueLevel?: string;
  milestones?: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface KocRecord {
  messageIndex?: number;
  author: string;
  authorNormalized: string;
  authorId?: string;
  contribution: string;
  contributionType: 'share' | 'help' | 'resource' | 'atmosphere';
  eventTime: Date;
  helpedCount?: number; // 帮助了多少人（回答问题数）
}

export interface RuleEngineResult {
  // 基础统计
  stats: {
    messageCount: number;
    validMessageCount: number;
    uniqueAuthors: number;
    questionCount: number;
    resolvedCount: number;
    resolutionRate: number;
    avgResponseMinutes?: number;
    goodNewsCount: number;
  };
  // 提取结果
  questions: QuestionRecord[];
  goodNews: GoodNewsRecord[];
  kocCandidates: KocRecord[];
  // 是否需要LLM增强
  needsLlmEnhancement: boolean;
  llmEnhancementReason?: string;
}

// ============================================
// 问答分析
// ============================================

function analyzeQuestions(messages: ParsedMessage[]): QuestionRecord[] {
  const questions: QuestionRecord[] = [];
  const validMessages = messages.filter(m => m.isValid && m.type === 'text');

  for (let i = 0; i < validMessages.length; i++) {
    const msg = validMessages[i];

    // 检测是否为问题
    if (!matchesAny(msg.text, QUESTION_PATTERNS)) continue;

    // 排除过短的消息
    if (msg.text.length < 5) continue;

    const question: QuestionRecord = {
      index: msg.index,
      asker: msg.author,
      askerNormalized: msg.authorNormalized,
      askerId: msg.memberId,
      content: msg.text.slice(0, 500), // 限制长度
      askTime: msg.timestamp,
      isResolved: false,
    };

    // 在后续消息中寻找回答
    for (let j = i + 1; j < validMessages.length && j <= i + 20; j++) {
      const reply = validMessages[j];

      // 跳过提问者自己的消息
      if (reply.authorNormalized === msg.authorNormalized) {
        // 但检查是否是感谢/确认解决
        if (matchesAny(reply.text, THANKS_PATTERNS) || matchesAny(reply.text, RESOLUTION_PATTERNS)) {
          question.isResolved = true;
          // 回答者是上一条非提问者的消息
          if (j > i + 1) {
            const prevReply = validMessages[j - 1];
            if (prevReply.authorNormalized !== msg.authorNormalized) {
              question.answerIndex = prevReply.index;
              question.answerer = prevReply.author;
              question.answererNormalized = prevReply.authorNormalized;
              question.answererId = prevReply.memberId;
              question.answererRole = prevReply.memberRole;
              question.answerContent = prevReply.text.slice(0, 500);
              question.answerTime = prevReply.timestamp;
              question.responseMinutes = getMinutesDiff(msg, prevReply);
            }
          }
          break;
        }
        continue;
      }

      // 跳过过短的回复
      if (reply.text.length < 3) continue;

      // 这是一个回答
      question.answerIndex = reply.index;
      question.answerer = reply.author;
      question.answererNormalized = reply.authorNormalized;
      question.answererId = reply.memberId;
      question.answererRole = reply.memberRole;
      question.answerContent = reply.text.slice(0, 500);
      question.answerTime = reply.timestamp;
      question.responseMinutes = getMinutesDiff(msg, reply);

      // 检查回答是否表示解决
      if (matchesAny(reply.text, RESOLUTION_PATTERNS)) {
        question.isResolved = true;
        break;
      }

      // 继续检查提问者是否确认解决
      break; // 只取第一个回答
    }

    questions.push(question);
  }

  return questions;
}

// ============================================
// 好事检测
// ============================================

function detectGoodNews(messages: ParsedMessage[]): GoodNewsRecord[] {
  const goodNews: GoodNewsRecord[] = [];
  const seen = new Set<string>(); // 去重

  for (const msg of messages) {
    if (!msg.isValid || msg.type !== 'text') continue;
    if (msg.text.length < 10) continue;

    // 检测是否包含好事关键词
    if (!matchesAny(msg.text, GOOD_NEWS_PATTERNS)) continue;

    // 去重：同一作者的相似内容
    const dedupeKey = `${msg.authorNormalized}:${msg.text.slice(0, 50)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    // 判断类别
    let category: GoodNewsRecord['category'] = 'other';
    let confidence: GoodNewsRecord['confidence'] = 'low';

    // 按优先级判断类别
    if (/出单|成交|变现|提现|赚|收入|收款/.test(msg.text)) {
      category = 'revenue';
      confidence = 'high';
    } else if (matchesAny(msg.text, MILESTONE_PATTERNS)) {
      category = 'milestone';
      confidence = 'high';
    } else if (/YPP|过审|上架|通过/.test(msg.text)) {
      category = 'platform';
      confidence = 'high';
    } else if (/涨粉|爆款|播放量/.test(msg.text)) {
      category = 'growth';
      confidence = 'medium';
    }

    // 如果是固定模板，提高置信度
    if (/#生财好事|#举手|喜报/.test(msg.text)) {
      confidence = 'high';
    }

    // 提取变现量级
    const revenueLevel = category === 'revenue' ? inferRevenueLevel(msg.text) ?? undefined : undefined;

    // 提取里程碑
    const milestones: string[] = [];
    if (/首单|第一单/.test(msg.text)) milestones.push('首单');
    if (/首次变现/.test(msg.text)) milestones.push('首次变现');
    if (/破百/.test(msg.text)) milestones.push('破百');
    if (/破千/.test(msg.text)) milestones.push('破千');
    if (/YPP|开通收益/.test(msg.text)) milestones.push('YPP通过');

    goodNews.push({
      messageIndex: msg.index,
      author: msg.author,
      authorNormalized: msg.authorNormalized,
      authorId: msg.memberId,
      content: msg.text.slice(0, 1000),
      category,
      eventTime: msg.timestamp,
      revenueLevel,
      milestones: milestones.length > 0 ? milestones : undefined,
      confidence,
    });
  }

  return goodNews;
}

// ============================================
// KOC 检测
// ============================================

function detectKocCandidates(
  messages: ParsedMessage[],
  questions: QuestionRecord[]
): KocRecord[] {
  const kocMap = new Map<string, KocRecord>();

  // 1. 统计回答问题的人
  const answerCount = new Map<string, number>();
  for (const q of questions) {
    if (q.answererNormalized) {
      answerCount.set(
        q.answererNormalized,
        (answerCount.get(q.answererNormalized) || 0) + 1
      );
    }
  }

  // 回答 >= 2 个问题的人是 KOC 候选
  for (const [authorNorm, count] of answerCount) {
    if (count >= 2) {
      const firstAnswer = questions.find(q => q.answererNormalized === authorNorm);
      if (firstAnswer) {
        kocMap.set(authorNorm, {
          messageIndex: firstAnswer.answerIndex,
          author: firstAnswer.answerer!,
          authorNormalized: authorNorm,
          authorId: firstAnswer.answererId,
          contribution: `回答了 ${count} 个问题`,
          contributionType: 'help',
          eventTime: firstAnswer.answerTime!,
          helpedCount: count,
        });
      }
    }
  }

  // 2. 检测分享干货的人
  for (const msg of messages) {
    if (!msg.isValid || msg.type !== 'text') continue;
    if (msg.text.length < 50) continue; // 分享通常较长

    if (!matchesAny(msg.text, CONTRIBUTION_PATTERNS)) continue;

    // 如果已经因为回答问题被记录，跳过
    if (kocMap.has(msg.authorNormalized)) continue;

    // 判断贡献类型
    let contributionType: KocRecord['contributionType'] = 'share';
    if (/工具|资源|链接|文档/.test(msg.text)) {
      contributionType = 'resource';
    }

    kocMap.set(msg.authorNormalized, {
      messageIndex: msg.index,
      author: msg.author,
      authorNormalized: msg.authorNormalized,
      authorId: msg.memberId,
      contribution: msg.text.slice(0, 500),
      contributionType,
      eventTime: msg.timestamp,
    });
  }

  return Array.from(kocMap.values());
}

// ============================================
// 主函数
// ============================================

export function runRuleEngine(messages: ParsedMessage[]): RuleEngineResult {
  // 分析问答
  const questions = analyzeQuestions(messages);
  const resolvedCount = questions.filter(q => q.isResolved).length;
  const resolutionRate = questions.length > 0
    ? Math.round((resolvedCount / questions.length) * 100)
    : 0;

  // 计算平均响应时间
  const responseTimes = questions
    .filter(q => q.responseMinutes !== undefined && q.responseMinutes >= 0)
    .map(q => q.responseMinutes!);
  const avgResponseMinutes = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : undefined;

  // 检测好事
  const goodNews = detectGoodNews(messages);

  // 检测 KOC
  const kocCandidates = detectKocCandidates(messages, questions);

  // 判断是否需要 LLM 增强
  let needsLlmEnhancement = false;
  let llmEnhancementReason: string | undefined;

  // 条件1：检测到多条低置信度好事
  const lowConfidenceNews = goodNews.filter(n => n.confidence === 'low');
  if (lowConfidenceNews.length >= 3) {
    needsLlmEnhancement = true;
    llmEnhancementReason = `${lowConfidenceNews.length} 条低置信度好事需要 LLM 验证`;
  }

  // 条件2：检测到大量问题但解决率低
  if (questions.length >= 5 && resolutionRate < 30) {
    needsLlmEnhancement = true;
    llmEnhancementReason = `问题数 ${questions.length}，解决率仅 ${resolutionRate}%，需要 LLM 分析`;
  }

  // 统计
  const validMessages = messages.filter(m => m.isValid);
  const uniqueAuthors = new Set(validMessages.map(m => m.authorNormalized)).size;

  return {
    stats: {
      messageCount: messages.length,
      validMessageCount: validMessages.length,
      uniqueAuthors,
      questionCount: questions.length,
      resolvedCount,
      resolutionRate,
      avgResponseMinutes,
      goodNewsCount: goodNews.length,
    },
    questions,
    goodNews,
    kocCandidates,
    needsLlmEnhancement,
    llmEnhancementReason,
  };
}
