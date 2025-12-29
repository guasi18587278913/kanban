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
import { parseMessages } from './analysis/preprocessor';

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
  model: '实战派/赚钱大神' | '技术极客/效率狂人' | '避坑指南/问题终结者' | '深度思考/认知输出者';
  coreAchievement: string;
  highlightQuote: string;
  suggestedTitle: string;
  reason: string;
  score: {
    reproducibility: number;
    scarcity: number;
    validation: number;
    total: number;
  };
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
3. 识别潜力作者（10万阅读量潜力）
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

■ 潜力作者（10万阅读量）识别：
- 目标是挖掘可产出“最佳实践”的作者，而非水群活跃者
- 必须至少满足以下价值判断中的 2 项：可复现性、稀缺性、结果验证
- 仅在证据充分时入选，不要为了凑数
- 可复现性：别人照着做也能复现结果
- 稀缺性：官方文档或常识里没有的隐性知识
- 结果验证：方法已跑通并产生真实结果

【四类模型】
1) 实战派/赚钱大神：带结果、可验证的战报或闭环
2) 技术极客/效率狂人：长文本、流程/工具/对比/工作流
3) 避坑指南/问题终结者：提问-自答闭环，带完整排查链路
4) 深度思考/认知输出者：高密度“小作文”、深度认知/复盘

【关键词雷达（辅助判断，不是硬规则）】
- 实战派/赚钱大神：出单/第一单/入账/美金/闭环/跑通/过审/通过/注册量/付费
- 技术极客/效率狂人：实测/对比/工作流/SOP/自动化/GitHub/工具/插件/新模型
- 避坑指南/问题终结者：踩坑/避坑/血泪/原来是/发现是/排查/搞定/解决
- 深度思考/认知输出者：复盘/心得/感悟/本质/底层逻辑/长期主义/认知

【行为信号（优先级高）】
- 实战派/赚钱大神：明确结果 + 可验证证据 + 群友强反馈（恭喜/接好运）
- 技术极客/效率狂人：长文本解释步骤/原理 + 分享链接或工具
- 避坑指南/问题终结者：同一人“提问-自答”闭环，给出完整解决链路
- 深度思考/认知输出者：小作文 + 复盘/模型化表达 + 结合自身背景

【输出要求】
- 只输出 JSON，不要其他文字
- 所有文本内容保持原样，不要翻译或改写
- 时间格式：HH:MM:SS
- messageIndex 必须引用 [#数字] 的编号

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

【项目背景】
生财有术深海圈：海外 AI 产品。高客单、强实战、结果导向。

【输出格式】
\`\`\`json
{
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
      "messageIndex": 消息序号（必须来自 [#数字]）,
      "author": "候选人昵称",
      "model": "实战派/赚钱大神 | 技术极客/效率狂人 | 避坑指南/问题终结者 | 深度思考/认知输出者",
      "coreAchievement": "一句话概括核心事迹",
      "highlightQuote": "候选人原话",
      "suggestedTitle": "推荐选题标题",
      "reason": "基于可复现/稀缺/结果验证的入选理由",
      "score": { "reproducibility": 0-3, "scarcity": 0-3, "validation": 0-3, "total": 0-9 }
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

【重要提示】
- 消息以 [#序号] 开头，序号即 messageIndex，必须引用该编号
- 如当天没有候选人，kocContributions 返回空数组，不要强行生成

【群聊记录】
${rawContent}`;
}

// ============================================
// JSON 解析
// ============================================

interface LLMRawResponse {
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
    model?: string;
    coreAchievement?: string;
    highlightQuote?: string;
    suggestedTitle?: string;
    reason?: string;
    score?: {
      reproducibility?: number;
      scarcity?: number;
      validation?: number;
      total?: number;
    };
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

function normalizeIndex(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

// ============================================
// 分块处理
// ============================================

const CHUNK_MESSAGES = 180;  // 每块约 180 条消息（控制推理成本）

function formatMessageForLLM(message: { index: number; author: string; time: string; text: string }) {
  const content = message.text ? message.text.trim() : '';
  return `[#${message.index}] ${message.author} ${message.time}\n${content}`;
}

function splitIntoChunks(messages: { index: number; author: string; time: string; text: string }[]): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < messages.length; i += CHUNK_MESSAGES) {
    const slice = messages.slice(i, i + CHUNK_MESSAGES);
    chunks.push(slice.map(formatMessageForLLM).join('\n\n'));
  }
  return chunks;
}

// ============================================
// 结果合并
// ============================================

function mergeResults(results: LLMRawResponse[]): LLMRawResponse {
  const merged: LLMRawResponse = {
    qaPairs: [],
    goodNews: [],
    kocContributions: [],
    memberHighlights: [],
    insights: '',
  };

  for (const r of results) {
    // 合并问答对（调整索引）
    if (r.qaPairs) {
      for (const qa of r.qaPairs) {
        const questionIndex = normalizeIndex(qa.questionIndex);
        const answerIndex = normalizeIndex(qa.answerIndex);
        merged.qaPairs!.push({
          ...qa,
          questionIndex,
          answerIndex,
        });
      }
    }

    // 合并好事
    if (r.goodNews) {
      for (const gn of r.goodNews) {
        const messageIndex = normalizeIndex(gn.messageIndex);
        merged.goodNews!.push({
          ...gn,
          messageIndex,
        });
      }
    }

    // 合并 KOC 贡献
    if (r.kocContributions) {
      for (const koc of r.kocContributions) {
        const messageIndex = normalizeIndex(koc.messageIndex);
        merged.kocContributions!.push({
          ...koc,
          messageIndex,
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

  }

  // 去重潜力作者（同一作者保留总分最高）
  const kocMap = new Map<string, NonNullable<typeof merged.kocContributions>[0]>();
  for (const koc of merged.kocContributions!) {
    const key = koc.author || '';
    if (!key) continue;
    const existing = kocMap.get(key);
    if (!existing) {
      kocMap.set(key, koc);
      continue;
    }
    const currentScore = koc.score?.total ?? 0;
    const existingScore = existing.score?.total ?? 0;
    if (currentScore > existingScore) {
      kocMap.set(key, koc);
    }
  }
  merged.kocContributions = Array.from(kocMap.values());

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

  // 预解析消息，用于统计与索引
  const chatDateObj = new Date(meta.chatDate);
  const preprocessed = parseMessages(rawContent, chatDateObj);
  const validMessages = preprocessed.messages.filter((m) => m.isValid && m.text.trim().length > 0);

  // 分块（基于消息数组，保留全局索引）
  const chunks = splitIntoChunks(validMessages);
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

      console.log(
        `[LLM Analyzer] Chunk ${i + 1} done: ${parsed.qaPairs?.length || 0} questions, ${parsed.goodNews?.length || 0} good news`
      );
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
  const normalizedQaPairs = (merged.qaPairs || []).map((qa) => ({
    questionIndex: normalizeIndex(qa.questionIndex) ?? -1,
    questionAuthor: qa.questionAuthor || '',
    questionContent: qa.questionContent || '',
    questionTime: qa.questionTime || '',
    answerIndex: normalizeIndex(qa.answerIndex),
    answerAuthor: qa.answerAuthor,
    answerContent: qa.answerContent,
    answerTime: qa.answerTime,
    answerRole: qa.answerRole as 'coach' | 'volunteer' | 'student' | undefined,
    waitMinutes: qa.waitMinutes,
    isResolved: qa.isResolved || false,
    resolutionSignal: qa.resolutionSignal,
  }));
  const validQaPairs = normalizedQaPairs.filter((qa) => qa.questionIndex >= 0);
  const answeredCount = validQaPairs.filter((qa) => !!qa.answerAuthor).length;
  const resolvedCount = validQaPairs.filter((qa) => qa.isResolved).length;

  const normalizedGoodNews = (merged.goodNews || []).map((gn) => ({
    messageIndex: normalizeIndex(gn.messageIndex) ?? -1,
    author: gn.author || '',
    content: gn.content || '',
    time: gn.time || '',
    category: (gn.category as GoodNewsItem['category']) || 'other',
    revenueAmount: gn.revenueAmount,
    revenueCurrency: gn.revenueCurrency as 'CNY' | 'USD' | undefined,
    revenueLevel: gn.revenueLevel as GoodNewsItem['revenueLevel'],
    milestones: gn.milestones,
    confidence: (gn.confidence as GoodNewsItem['confidence']) || 'medium',
  }));

  const normalizedKocContributions = (merged.kocContributions || []).map((koc) => ({
    messageIndex: normalizeIndex(koc.messageIndex) ?? -1,
    author: koc.author || '',
    model: (koc.model as KOCContribution['model']) || '实战派/赚钱大神',
    coreAchievement: koc.coreAchievement || '',
    highlightQuote: koc.highlightQuote || '',
    suggestedTitle: koc.suggestedTitle || '',
    reason: koc.reason || '',
    score: {
      reproducibility: koc.score?.reproducibility ?? 0,
      scarcity: koc.score?.scarcity ?? 0,
      validation: koc.score?.validation ?? 0,
      total: koc.score?.total ?? 0,
    },
  }));

  const analysis: ChatAnalysisResult = {
    meta: {
      productLine: meta.productLine,
      period: meta.period,
      groupNumber: meta.groupNumber,
      chatDate: meta.chatDate,
      totalMessages: preprocessed.stats.totalMessages,
      analyzedMessages: preprocessed.stats.validMessages,
    },
    stats: {
      messageCount: preprocessed.stats.totalMessages,
      activeUsers: preprocessed.stats.uniqueAuthors,
      questionCount: validQaPairs.length,
      answeredCount,
      resolvedCount,
      avgResponseMinutes: calculateAvgResponseTime(validQaPairs),
      goodNewsCount: normalizedGoodNews.length,
      kocCount: normalizedKocContributions.length,
    },
    messages: [],  // 将在后续处理中填充
    qaPairs: validQaPairs,
    goodNews: normalizedGoodNews,
    kocContributions: normalizedKocContributions,
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

function calculateAvgResponseTime(qaPairs: Array<{ waitMinutes?: number }> | undefined): number | undefined {
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
