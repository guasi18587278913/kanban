/**
 * LLM 聊天记录分析器
 *
 * 设计目标：
 * 1. 一次 LLM 调用提取所有需要的数据
 * 2. 支持个人 CRM 看板所需的消息级别标注
 * 3. 高精度提取问答、好事、KOC 贡献
 */

import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

// ============================================
// LLM 配置
// ============================================

let llmProvider: ReturnType<typeof createOpenAI> | null = null;

function getProvider() {
  if (!llmProvider) {
    if (process.env.EVOLINK_API_KEY) {
      llmProvider = createOpenAI({
        apiKey: process.env.EVOLINK_API_KEY,
        baseURL: process.env.EVOLINK_BASE_URL || 'https://api.evolink.ai/v1',
      });
    } else if (process.env.OPENROUTER_API_KEY) {
      llmProvider = createOpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      });
    } else {
      throw new Error('Missing EVOLINK_API_KEY or OPENROUTER_API_KEY');
    }
  }
  return llmProvider;
}

function getModel() {
  const modelId = process.env.EVOLINK_MODEL || process.env.OPENROUTER_MODEL || 'gemini-2.5-flash';
  return getProvider().chat(modelId);
}

// ============================================
// 类型定义
// ============================================

/** 消息类型 */
export type MessageCategory =
  | 'question'      // 提问
  | 'answer'        // 回答问题
  | 'good_news'     // 好事分享
  | 'share'         // 知识/资源分享
  | 'encouragement' // 鼓励/加油
  | 'normal';       // 普通交流

/** 单条消息分析结果 */
export interface AnalyzedMessage {
  index: number;              // 消息序号
  author: string;             // 作者昵称
  time: string;               // 时间 HH:MM:SS
  category: MessageCategory;  // 消息类型

  // 关联信息
  linkedToIndex?: number;     // 如果是回答，关联的问题索引

  // 内容摘要（用于 CRM 展示）
  summary?: string;           // 简短摘要（30字以内）

  // 原始内容（用于上下文展示）
  content: string;
}

/** 问答对 */
export interface QAPair {
  questionIndex: number;
  questionAuthor: string;
  questionContent: string;
  questionTime: string;

  answerIndex?: number;
  answerAuthor?: string;
  answerContent?: string;
  answerTime?: string;
  answerRole?: 'coach' | 'volunteer' | 'student';

  waitMinutes?: number;       // 等待时间（分钟）
  isResolved: boolean;        // 是否解决
  resolutionSignal?: string;  // 解决信号（如"谢谢"、"好了"）
}

/** 好事记录 */
export interface GoodNewsItem {
  messageIndex: number;
  author: string;
  content: string;
  time: string;

  category: 'revenue' | 'milestone' | 'platform' | 'growth' | 'other';

  // 提取的结构化数据
  revenueAmount?: number;     // 金额（人民币）
  revenueCurrency?: 'CNY' | 'USD';
  revenueLevel?: '小额(<100)' | '百元级' | '千元级' | '万元级';
  milestones?: string[];      // 里程碑标签

  confidence: 'high' | 'medium' | 'low';
}

/** KOC 贡献 */
export interface KOCContribution {
  messageIndex: number;
  author: string;
  content: string;
  time: string;

  contributionType: 'share' | 'help' | 'resource' | 'atmosphere';
  description: string;        // 贡献描述
}

/** 成员参与摘要 */
export interface MemberSummary {
  name: string;               // 昵称
  nameNormalized: string;     // 标准化昵称
  role?: 'coach' | 'volunteer' | 'student';

  // 统计
  messageCount: number;
  questionCount: number;
  answerCount: number;
  goodNewsCount: number;
  shareCount: number;

  // 亮点
  highlights?: string[];      // 值得关注的行为

  // AI 标签
  tags?: Array<{
    category: 'niche' | 'stage' | 'intent' | 'activity' | 'sentiment' | 'risk';
    value: string;
    confidence?: 'high' | 'medium' | 'low';
  }>;

  // 情绪与风险
  sentiment?: 'positive' | 'neutral' | 'negative';
  riskFlags?: string[];
}

/** 完整分析结果 */
export interface ChatAnalysisResult {
  // 元数据
  meta: {
    productLine: string;
    period: string;
    groupNumber: number;
    chatDate: string;
    totalMessages: number;
    analyzedMessages: number;
  };

  // 统计摘要
  stats: {
    messageCount: number;
    activeUsers: number;
    questionCount: number;
    answeredCount: number;
    resolvedCount: number;
    avgResponseMinutes?: number;
    goodNewsCount: number;
    kocCount: number;
  };

  // 详细数据
  messages: AnalyzedMessage[];
  qaPairs: QAPair[];
  goodNews: GoodNewsItem[];
  kocContributions: KOCContribution[];
  memberSummaries: MemberSummary[];

  // 业务洞察
  insights?: string;
}

// ============================================
// LLM 提示词
// ============================================

const SYSTEM_PROMPT = `你是一位资深的社群运营分析专家，拥有 10 年互联网社群运营经验。
你的任务是分析微信群聊记录，提取结构化数据。

【核心能力】
1. 精准识别问题和回答的配对关系
2. 区分真正的"好事"（如出单、里程碑）与普通的正面表达
3. 识别 KOC（关键意见消费者）的贡献行为
4. 理解上下文语境，避免误判
5. 为成员打上标签（赛道/阶段/意图/活跃度）并标注情绪与风险信号

【判断标准】

■ 问题识别：
- 含问号且是真实疑问（排除反问、设问）
- 求助性表达：请问、求助、怎么、如何、能不能
- 最小长度：5个字符

■ 回答识别：
- 紧跟问题的非提问者回复
- 内容具有解答性质
- 排除：表情、无意义回复

■ 好事判断（严格标准）：
✓ 真正的好事：
  - 明确的收入/变现（出单、成交、提现、赚了 XX 元）
  - 里程碑成就（首单、破百、YPP 通过、上架成功）
  - 可量化的增长（涨粉 1000、播放量 10 万）

✗ 不是好事：
  - 泛泛的正面表达（太棒了、加油、厉害）
  - 学习体验分享（学到了、干货满满）
  - 计划或意向（准备做、打算试试）
  - 转发他人的成果

■ KOC 贡献：
- 分享干货/教程/经验（至少 50 字的有价值内容）
- 回答 2 个及以上问题
- 分享工具/资源/模板

【输出要求】
- 只输出 JSON，不要其他文字
- 所有文本内容保持原样，不要翻译或改写
- 时间格式：HH:MM:SS
- 索引从 0 开始

【标签/情绪/风险规则】
- niche/赛道：SaaS、工具、内容号、AI应用等；stage/阶段：MVP/上线/变现/增长；intent：求反馈/求资源/报错；activity：高活跃/中活跃/低活跃；sentiment：positive/neutral/negative；risk：churn_risk（流失风险）、escalation_needed（需升级处理）
- 标签挑最确定的 1-3 个，置信度 high/medium/low
- 情绪/风险按消息语气和上下文判断，谨慎输出`;

function buildAnalysisPrompt(rawContent: string, meta: { fileName: string; chatDate: string }): string {
  return `【分析任务】
请分析以下群聊记录，提取结构化数据。

【文件信息】
文件名：${meta.fileName}
日期：${meta.chatDate}

【输出格式】
\`\`\`json
{
  "stats": {
    "totalMessages": 消息总数,
    "validMessages": 有效消息数（排除图片、表情等）,
    "questionCount": 问题数,
    "answeredCount": 已回答问题数,
    "resolvedCount": 已解决问题数,
    "goodNewsCount": 好事数,
    "kocCount": KOC贡献者数
  },

  "qaPairs": [
    {
      "questionIndex": 问题消息序号,
      "questionAuthor": "提问者昵称",
      "questionContent": "问题内容（前 200 字）",
      "questionTime": "HH:MM:SS",
      "answerIndex": 回答消息序号（可选）,
      "answerAuthor": "回答者昵称",
      "answerContent": "回答内容（前 200 字）",
      "answerTime": "HH:MM:SS",
      "answerRole": "coach/volunteer/student",
      "waitMinutes": 等待分钟数,
      "isResolved": true/false,
      "resolutionSignal": "解决信号文本（如有）"
    }
  ],

  "goodNews": [
    {
      "messageIndex": 消息序号,
      "author": "作者昵称",
      "content": "完整内容",
      "time": "HH:MM:SS",
      "category": "revenue/milestone/platform/growth/other",
      "revenueAmount": 金额数值（可选）,
      "revenueCurrency": "CNY/USD",
      "revenueLevel": "小额(<100)/百元级/千元级/万元级",
      "milestones": ["首单", "破百"],
      "confidence": "high/medium/low"
    }
  ],

  "kocContributions": [
    {
      "messageIndex": 消息序号,
      "author": "贡献者昵称",
      "content": "贡献内容（前 500 字）",
      "time": "HH:MM:SS",
      "contributionType": "share/help/resource/atmosphere",
      "description": "贡献描述（20字内）"
    }
  ],

  "memberHighlights": [
    {
      "name": "成员昵称",
      "role": "coach/volunteer/student",
      "questionCount": 提问数,
      "answerCount": 回答数,
      "goodNewsCount": 好事数,
      "highlights": ["亮点1", "亮点2"],
      "tags": [
        { "category": "niche", "value": "SaaS出海", "confidence": "high" },
        { "category": "stage", "value": "MVP/上线", "confidence": "medium" },
        { "category": "intent", "value": "求反馈", "confidence": "medium" },
        { "category": "activity", "value": "高活跃", "confidence": "high" },
        { "category": "sentiment", "value": "positive" },
        { "category": "risk", "value": "churn_risk" }
      ],
      "sentiment": "positive/neutral/negative",
      "riskFlags": ["churn_risk", "escalation_needed"]
    }
  ],

  "insights": "今日群聊洞察（100字内）"
}
\`\`\`

【群聊记录】
${rawContent}`;
}

// ============================================
// JSON 解析
// ============================================

interface LLMRawResponse {
  stats?: {
    totalMessages?: number;
    validMessages?: number;
    questionCount?: number;
    answeredCount?: number;
    resolvedCount?: number;
    goodNewsCount?: number;
    kocCount?: number;
  };
  qaPairs?: Array<{
    questionIndex?: number;
    questionAuthor?: string;
    questionContent?: string;
    questionTime?: string;
    answerIndex?: number;
    answerAuthor?: string;
    answerContent?: string;
    answerTime?: string;
    answerRole?: string;
    waitMinutes?: number;
    isResolved?: boolean;
    resolutionSignal?: string;
  }>;
  goodNews?: Array<{
    messageIndex?: number;
    author?: string;
    content?: string;
    time?: string;
    category?: string;
    revenueAmount?: number;
    revenueCurrency?: string;
    revenueLevel?: string;
    milestones?: string[];
    confidence?: string;
  }>;
  kocContributions?: Array<{
    messageIndex?: number;
    author?: string;
    content?: string;
    time?: string;
    contributionType?: string;
    description?: string;
  }>;
  memberHighlights?: Array<{
    name?: string;
    role?: string;
    questionCount?: number;
    answerCount?: number;
    goodNewsCount?: number;
    highlights?: string[];
    tags?: Array<{
      category?: string;
      value?: string;
      confidence?: string;
    }>;
    sentiment?: string;
    riskFlags?: string[];
  }>;
  insights?: string;
}

function extractJson(text: string): LLMRawResponse {
  // 尝试提取 ```json ... ``` 块
  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonBlockMatch) {
    try {
      return JSON.parse(jsonBlockMatch[1]);
    } catch (e) {
      console.warn('Failed to parse JSON block, trying fallback...');
    }
  }

  // 尝试直接解析
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (e) {
      // 尝试修复常见 JSON 错误
      const fixed = text.slice(start, end + 1)
        .replace(/,\s*([\]}])/g, '$1')  // 移除尾随逗号
        .replace(/'/g, '"');            // 单引号转双引号
      try {
        return JSON.parse(fixed);
      } catch (e2) {
        console.error('JSON parsing failed:', e2);
      }
    }
  }

  return {};
}

// ============================================
// 分块处理
// ============================================

const CHUNK_LINES = 200;  // 每块约 200 条消息（减小以避免推理模型超时）

function splitIntoChunks(rawContent: string): string[] {
  const lines = rawContent.split(/\r?\n/);
  const chunks: string[] = [];

  for (let i = 0; i < lines.length; i += CHUNK_LINES) {
    chunks.push(lines.slice(i, i + CHUNK_LINES).join('\n'));
  }

  return chunks;
}

// ============================================
// 结果合并
// ============================================

function mergeResults(results: LLMRawResponse[]): LLMRawResponse {
  const merged: LLMRawResponse = {
    stats: {
      totalMessages: 0,
      validMessages: 0,
      questionCount: 0,
      answeredCount: 0,
      resolvedCount: 0,
      goodNewsCount: 0,
      kocCount: 0,
    },
    qaPairs: [],
    goodNews: [],
    kocContributions: [],
    memberHighlights: [],
    insights: '',
  };

  let indexOffset = 0;

  for (const r of results) {
    // 合并统计
    if (r.stats) {
      merged.stats!.totalMessages! += r.stats.totalMessages || 0;
      merged.stats!.validMessages! += r.stats.validMessages || 0;
      merged.stats!.questionCount! += r.stats.questionCount || 0;
      merged.stats!.answeredCount! += r.stats.answeredCount || 0;
      merged.stats!.resolvedCount! += r.stats.resolvedCount || 0;
      merged.stats!.goodNewsCount! += r.stats.goodNewsCount || 0;
    }

    // 合并问答对（调整索引）
    if (r.qaPairs) {
      for (const qa of r.qaPairs) {
        merged.qaPairs!.push({
          ...qa,
          questionIndex: (qa.questionIndex || 0) + indexOffset,
          answerIndex: qa.answerIndex !== undefined ? qa.answerIndex + indexOffset : undefined,
        });
      }
    }

    // 合并好事
    if (r.goodNews) {
      for (const gn of r.goodNews) {
        merged.goodNews!.push({
          ...gn,
          messageIndex: (gn.messageIndex || 0) + indexOffset,
        });
      }
    }

    // 合并 KOC 贡献
    if (r.kocContributions) {
      for (const koc of r.kocContributions) {
        merged.kocContributions!.push({
          ...koc,
          messageIndex: (koc.messageIndex || 0) + indexOffset,
        });
      }
    }

    // 合并成员亮点（后续去重）
    if (r.memberHighlights) {
      merged.memberHighlights!.push(...r.memberHighlights);
    }

    // 合并洞察
    if (r.insights) {
      merged.insights += (merged.insights ? '\n' : '') + r.insights;
    }

    // 更新偏移量
    indexOffset += r.stats?.totalMessages || CHUNK_LINES;
  }

  // 去重 KOC（同一作者只保留最重要的贡献）
  const kocMap = new Map<string, NonNullable<typeof merged.kocContributions>[0]>();
  for (const koc of merged.kocContributions!) {
    const existing = kocMap.get(koc.author || '');
    if (!existing || (koc.content?.length || 0) > (existing.content?.length || 0)) {
      kocMap.set(koc.author || '', koc);
    }
  }
  merged.kocContributions = Array.from(kocMap.values());
  merged.stats!.kocCount = merged.kocContributions.length;

  // 合并成员亮点
  const memberMap = new Map<string, NonNullable<typeof merged.memberHighlights>[0]>();
  for (const m of merged.memberHighlights!) {
    const existing = memberMap.get(m.name || '');
    if (existing) {
      existing.questionCount = (existing.questionCount || 0) + (m.questionCount || 0);
      existing.answerCount = (existing.answerCount || 0) + (m.answerCount || 0);
      existing.goodNewsCount = (existing.goodNewsCount || 0) + (m.goodNewsCount || 0);
      if (m.highlights) {
        existing.highlights = [...(existing.highlights || []), ...m.highlights];
      }
      if (m.tags) {
        existing.tags = [...(existing.tags || []), ...m.tags];
      }
      if (m.sentiment && !existing.sentiment) {
        existing.sentiment = m.sentiment as any;
      }
      if (m.riskFlags) {
        existing.riskFlags = [...(existing.riskFlags || []), ...m.riskFlags];
      }
    } else {
      memberMap.set(m.name || '', { ...m });
    }
  }
  // 去重标签/风险
  merged.memberHighlights = Array.from(memberMap.values()).map((m) => {
    if (m.tags) {
      const keySet = new Set<string>();
      m.tags = m.tags.filter((t) => {
        const key = `${t.category || ''}-${t.value || ''}`;
        if (keySet.has(key)) return false;
        keySet.add(key);
        return true;
      });
    }
    if (m.riskFlags) {
      const keySet = new Set<string>();
      m.riskFlags = m.riskFlags.filter((r) => {
        if (keySet.has(r)) return false;
        keySet.add(r);
        return true;
      });
    }
    return m;
  });

  return merged;
}

// ============================================
// 主函数
// ============================================

export async function analyzeChatWithLLM(
  rawContent: string,
  meta: {
    fileName: string;
    chatDate: string;
    productLine: string;
    period: string;
    groupNumber: number;
  }
): Promise<ChatAnalysisResult> {
  console.log(`[LLM Analyzer] Starting analysis for ${meta.fileName}`);

  // 分块
  const chunks = splitIntoChunks(rawContent);
  console.log(`[LLM Analyzer] Split into ${chunks.length} chunks`);

  // 处理每个块
  const results: LLMRawResponse[] = [];

  for (let i = 0; i < chunks.length; i++) {
    console.log(`[LLM Analyzer] Processing chunk ${i + 1}/${chunks.length}...`);

    const prompt = buildAnalysisPrompt(chunks[i], {
      fileName: meta.fileName,
      chatDate: meta.chatDate,
    });

    try {
      // 将 system prompt 合并到 user prompt 中，因为 Gemini API 不支持 system role
      const fullPrompt = `${SYSTEM_PROMPT}\n\n${prompt}`;

      const { text } = await generateText({
        model: getModel(),
        prompt: fullPrompt,
        temperature: 0.1,  // 低温度确保一致性
      });

      const parsed = extractJson(text);
      results.push(parsed);

      console.log(`[LLM Analyzer] Chunk ${i + 1} done: ${parsed.stats?.questionCount || 0} questions, ${parsed.goodNews?.length || 0} good news`);
    } catch (error) {
      console.error(`[LLM Analyzer] Chunk ${i + 1} failed:`, error);
      results.push({});
    }

    // 避免速率限制
    if (i < chunks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 合并结果
  const merged = mergeResults(results);

  // 转换为最终格式
  const analysis: ChatAnalysisResult = {
    meta: {
      productLine: meta.productLine,
      period: meta.period,
      groupNumber: meta.groupNumber,
      chatDate: meta.chatDate,
      totalMessages: merged.stats?.totalMessages || 0,
      analyzedMessages: merged.stats?.validMessages || 0,
    },
    stats: {
      messageCount: merged.stats?.totalMessages || 0,
      activeUsers: merged.memberHighlights?.length || 0,
      questionCount: merged.stats?.questionCount || 0,
      answeredCount: merged.stats?.answeredCount || 0,
      resolvedCount: merged.stats?.resolvedCount || 0,
      avgResponseMinutes: calculateAvgResponseTime(merged.qaPairs || []),
      goodNewsCount: merged.goodNews?.length || 0,
      kocCount: merged.kocContributions?.length || 0,
    },
    messages: [],  // 将在后续处理中填充
    qaPairs: (merged.qaPairs || []).map(qa => ({
      questionIndex: qa.questionIndex || 0,
      questionAuthor: qa.questionAuthor || '',
      questionContent: qa.questionContent || '',
      questionTime: qa.questionTime || '',
      answerIndex: qa.answerIndex,
      answerAuthor: qa.answerAuthor,
      answerContent: qa.answerContent,
      answerTime: qa.answerTime,
      answerRole: qa.answerRole as 'coach' | 'volunteer' | 'student' | undefined,
      waitMinutes: qa.waitMinutes,
      isResolved: qa.isResolved || false,
      resolutionSignal: qa.resolutionSignal,
    })),
    goodNews: (merged.goodNews || []).map(gn => ({
      messageIndex: gn.messageIndex || 0,
      author: gn.author || '',
      content: gn.content || '',
      time: gn.time || '',
      category: (gn.category as GoodNewsItem['category']) || 'other',
      revenueAmount: gn.revenueAmount,
      revenueCurrency: gn.revenueCurrency as 'CNY' | 'USD' | undefined,
      revenueLevel: gn.revenueLevel as GoodNewsItem['revenueLevel'],
      milestones: gn.milestones,
      confidence: (gn.confidence as GoodNewsItem['confidence']) || 'medium',
    })),
    kocContributions: (merged.kocContributions || []).map(koc => ({
      messageIndex: koc.messageIndex || 0,
      author: koc.author || '',
      content: koc.content || '',
      time: koc.time || '',
      contributionType: (koc.contributionType as KOCContribution['contributionType']) || 'share',
      description: koc.description || '',
    })),
    memberSummaries: (merged.memberHighlights || []).map(m => ({
      name: m.name || '',
      nameNormalized: normalizeNickname(m.name || ''),
      role: m.role as 'coach' | 'volunteer' | 'student' | undefined,
      messageCount: 0,  // 需要从原始消息计算
      questionCount: m.questionCount || 0,
      answerCount: m.answerCount || 0,
      goodNewsCount: m.goodNewsCount || 0,
      shareCount: 0,
      highlights: m.highlights,
      tags: (m.tags || []).map(t => ({
        category: (t.category || '') as any,
        value: t.value || '',
        confidence: (t.confidence as any) || undefined,
      })),
      sentiment: m.sentiment as any,
      riskFlags: m.riskFlags,
    })),
    insights: merged.insights,
  };

  console.log(`[LLM Analyzer] Analysis complete: ${analysis.stats.questionCount} questions, ${analysis.stats.goodNewsCount} good news, ${analysis.stats.kocCount} KOCs`);

  return analysis;
}

// ============================================
// 辅助函数
// ============================================

function calculateAvgResponseTime(qaPairs: LLMRawResponse['qaPairs']): number | undefined {
  if (!qaPairs || qaPairs.length === 0) return undefined;

  const validTimes = qaPairs
    .filter(qa => qa.waitMinutes !== undefined && qa.waitMinutes >= 0)
    .map(qa => qa.waitMinutes!);

  if (validTimes.length === 0) return undefined;

  return Math.round(validTimes.reduce((a, b) => a + b, 0) / validTimes.length);
}

function normalizeNickname(name: string): string {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')  // 移除括号内容
    .replace(/[-_—–·•‧·｜|].*$/, '')               // 移除分隔符后内容
    .replace(/\s+/g, '')                           // 移除空白
    .trim()
    .toLowerCase();
}
