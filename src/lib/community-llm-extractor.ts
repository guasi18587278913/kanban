import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { ParsedReport } from './community-parser';
import { parseFilenameMeta } from './community-raw-parser';

// Use createOpenAI for generic compatibility
let llmProvider: any = null;

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

// Model Selection (Lazy resolution)
function getModelId() {
  const model = 
    process.env.EVOLINK_MODEL ||
    process.env.OPENROUTER_MODEL ||
    'gemini-2.5-flash'; // Correct default for Evolink
  console.log('[LLM] Selected Model:', model);
  return model;
}

function getModel() {
  // Explicitly use .chat() to ensure we target the chat/completions endpoint
  return getProvider().chat(getModelId());
}

const MAX_CHUNK_CHARS = 100000; // 100k chars ~ 25k-30k tokens, well within Gemini's limit but safe for timeouts

type LlmResponse = {
  productLine?: string;
  period?: string;
  groupNumber?: string;
  date?: string;
  messageCount?: number;
  questionCount?: number;
  avgResponseTime?: number;
  resolutionRate?: number;
  goodNewsCount?: number;
  starStudents?: { name: string; type?: string; achievement: string; highlight?: string; suggestion?: string }[];
  kocs?: { name: string; type?: string; contribution: string; highlight?: string; suggestion?: string }[];
  goodNews?: { content: string; author?: string; reply?: string }[];
  questions?: {
    content: string;
    author?: string;
    answeredBy?: string;
    reply?: string;
    status?: string;
    waitMins?: number;
    resolved?: boolean;
  }[];
  actionItems?: { category: string; description: string; relatedTo?: string }[];
  fullText?: string;
};

function extractJson(text: string): LlmResponse {
  const tryParse = (s: string) => {
    const start = s.indexOf('{');
    const end = s.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const jsonStr = s.slice(start, end + 1);
      return JSON.parse(jsonStr) as LlmResponse;
    }
    return null;
  };

  const match = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (match) {
    const parsed = tryParse(match[1]);
    if (parsed) return parsed;
  }
  
  const parsed = tryParse(text);
  if (parsed) return parsed;

  const fixed = text.replace(/,\s*([\]}])/g, '$1');
  const parsedFixed = tryParse(fixed);
  if (parsedFixed) return parsedFixed;

  // Partial or failed JSON
  console.warn('JSON parsing failed.');
  return {}; 
}

function guessAnsweredBy(reply?: string): string | null {
  if (!reply) return null;
  const firstSegment = reply.split(/[,，。；;、]/)[0] || '';
  const cleaned = firstSegment.replace(/^[^\w\u4e00-\u9fa5]+/, '').trim();
  if (!cleaned) return null;
  const token = cleaned.split(/\s+/)[0];
  return token || null;
}

async function processChunk(chunk: string, metaInfo: string): Promise<LlmResponse> {
  const prompt = [
    '【角色设定】你是一位拥有10年经验的高级社群运营总监。',
    '【任务目标】从原始群聊记录中抽取结构化日报（精准版）。',
    '【重要要求】',
    '1. 这是一个长对话的分片，请仅分析当前分片内容，不要跨分片推测。',
    '2. 重点提取：问题（Questions）、好事（Good News）、KOC、标杆学员。',
    '3. **必须**提取字段：answeredBy (回答者), resolved (布尔值), waitMins (等待分钟数)。',
    '   - 对于已回答/已解决的问题，answeredBy 不得为 null，填首个有效回答者昵称；若无法确定也要写 “未知回答者”。',
    '   - 未回答的问题 answeredBy 可以为 null。',
    '4. waitMins = 提问到首条有效回答之间的分钟数；若无回答则为 null。',
    '【输出格式 - JSON Only】',
    '请直接输出 valid JSON，包含字段：',
    '- productLine, period, groupNumber, date',
    '- messageCount, questionCount, avgResponseTime, resolutionRate, goodNewsCount',
    '- starStudents: [{name,type,achievement,highlight,suggestion}]',
    '- kocs: [{name,type,contribution,highlight,suggestion}]',
    '- goodNews: [{content, author}]',
    '- questions: [{content, author, answeredBy, reply, status, resolved, waitMins}]',
    '- actionItems: [{category, description, relatedTo}]',
    '- fullText: "本分片的业务洞察总结"',
    `Meta: ${metaInfo}`,
    'Content:',
    chunk
  ].join('\n');

  try {
    const { text } = await generateText({
      model: getModel(),
      prompt,
      temperature: 0.2,
      // maxTokens: 4000, 
    });
    return extractJson(text);
  } catch (e) {
    console.error('LLM Chunk Error, retrying once...', e);
    try {
      const { text } = await generateText({
        model: getModel(),
        prompt,
        temperature: 0.2,
        // maxTokens: 4000, // Removed
      });
      return extractJson(text);
    } catch (e2) {
      console.error('LLM Chunk Retry Failed', e2);
      return {};
    }
  }
}

export async function extractWithLLM(filename: string, rawChat: string, dateOverride?: string): Promise<ParsedReport> {
  const meta = parseFilenameMeta(filename);
  const targetDateStr = dateOverride || meta.dateStr;
  const metaInfo = `Filename: ${filename}, Date: ${targetDateStr}`;

  // Splitter by message count to preserve dialog context (approx by lines)
  const lines = rawChat.split(/\r?\n/);
  const CHUNK_LINES = 500; // ~500 messages per chunk
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += CHUNK_LINES) {
    chunks.push(lines.slice(i, i + CHUNK_LINES).join('\n'));
  }

  console.log(`Processing ${chunks.length} chunks with LLM...`);
  // Sequential processing to be nicer to rate limits if chunks are many, change to Promise.all if speed is priority
  const results: LlmResponse[] = [];
  for (const chunk of chunks) {
      results.push(await processChunk(chunk, metaInfo));
  }

  // Merge Results
  const merged: LlmResponse = {
    productLine: results.find(r => r.productLine)?.productLine,
    period: results.find(r => r.period)?.period,
    groupNumber: results.find(r => r.groupNumber)?.groupNumber,
    date: results.find(r => r.date)?.date,
    messageCount: 0,
    questionCount: 0,
    goodNewsCount: 0,
    starStudents: [],
    kocs: [],
    goodNews: [],
    questions: [],
    actionItems: [],
    fullText: '',
  };

  let totalResolutionRate = 0;
  let validResolutionCount = 0;
  let totalResponseTime = 0;
  let validResponseTimeCount = 0;

  for (const r of results) {
    merged.messageCount = (merged.messageCount || 0) + (r.messageCount || 0);
    merged.questionCount = (merged.questionCount || 0) + (r.questionCount || 0);
    merged.goodNewsCount = (merged.goodNewsCount || 0) + (r.goodNewsCount || 0);
    
    if (r.starStudents) merged.starStudents?.push(...r.starStudents);
    if (r.kocs) merged.kocs?.push(...r.kocs);
    if (r.goodNews) merged.goodNews?.push(...r.goodNews);
    if (r.questions) merged.questions?.push(...r.questions);
    if (r.actionItems) merged.actionItems?.push(...r.actionItems);
    
    if (r.fullText) merged.fullText += `\n\n--- Part Summary ---\n${r.fullText}`;

    if (r.resolutionRate !== undefined) {
      totalResolutionRate += r.resolutionRate;
      validResolutionCount++;
    }
    if (r.avgResponseTime !== undefined) {
      totalResponseTime += r.avgResponseTime;
      validResponseTimeCount++;
    }
  }

  const normalizedQuestions = (merged.questions || []).map((q) => {
    let answeredBy = q.answeredBy;
    const isResolved = q.resolved || q.status === 'resolved';
    if (!answeredBy && isResolved) {
      answeredBy = guessAnsweredBy(q.reply) || '未知回答者';
    }
    return {
      content: q.content,
      author: q.author || '未注明',
      answeredBy,
      reply: q.reply,
      status: q.status,
      waitMins: q.waitMins,
      resolved: q.resolved ?? isResolved,
    };
  });

  return {
    productLine: merged.productLine || meta.productLine,
    period: merged.period || meta.period,
    groupNumber: merged.groupNumber || meta.groupNumber || '1',
    reportDate: new Date(targetDateStr),
    messageCount: merged.messageCount || 0,
    questionCount: merged.questionCount || 0,
    avgResponseTime: validResponseTimeCount > 0 ? Math.round(totalResponseTime / validResponseTimeCount) : 0,
    resolutionRate: validResolutionCount > 0 ? Math.round(totalResolutionRate / validResolutionCount) : 0,
    goodNewsCount: merged.goodNewsCount || 0,
    starStudents: (merged.starStudents || []).map(s => ({
        name: s.name,
        type: s.type || '未分类',
        achievement: s.achievement,
        highlight: s.highlight,
        suggestion: s.suggestion
    })),
    kocs: merged.kocs || [],
    actionItems: merged.actionItems || [],
    questions: normalizedQuestions,
    fullText: merged.fullText || 'No Summary Generated',
    goodNews: (merged.goodNews || []).map((g) => ({
      content: g.content,
      author: g.author || '未注明',
      reply: g.reply,
    })),
  };
}
