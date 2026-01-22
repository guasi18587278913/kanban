/**
 * Parse raw chat log text (原始群聊记录) into the same ParsedReport shape
 * used by the existing community dashboard.
 *
 * Assumptions about the raw file format:
 * - Filename encodes product line / period / group number / date, e.g.
 *   深海圈丨AI产品出海1期1群_2025-12-03.txt
 * - Each message line begins with "昵称 ... HH:MM:SS", the message text
 *   can span multiple lines until the next timestamped line.
 */

import { ParsedReport } from './community-parser';

type ParsedMessage = {
  author: string;
  time: string; // HH:MM:SS
  hour: number;
  text: string;
};

export const timePattern = /(\d{2}):(\d{2}):(\d{2})/;
export const questionRegex = /(\\?|？|吗|嘛|么|如何|怎么|是否|哪里|哪|能否)/;
export const goodNewsRegex = /(出单|爆|喜报|榜一|榜单|成交|赚|变现|提现|首单|上岸|赢|冲|爆款|涨粉|好评)/;
export const shareRegex = /(分享|教程|文档|指南|链接|prompt|提示词|方案|亲测|试了|好用|补充|笔记)/i;
export const resolutionRegex = /(解决|搞定|修复|好了|可以了|ok了|OK了|没问题了|隐藏掉|处理了|已退款|已补|闭环|done|fixed|ok)/i;
export const thanksRegex = /(谢谢|感谢|辛苦了|赞|牛|可以了|好了|行了|搞定)/;

function normalizeFilenameForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[_\-\s丨|]/g, '')
    .replace(/[【】\[\]()（）]/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}

export function parseFilenameMeta(filename: string) {
  // Canonical Group Names List (as defined by User)
  // Mapping Strategy: Multiple patterns can map to the SAME canonical name.
  const CANONICAL_GROUPS = [
    // AI Product Line - Period 1
    { name: 'AI产品出海1期-1群', keywords: ['AI产品出海', '1期', '1群'] },
    { name: 'AI产品出海1期-1群', keywords: ['AI产品出海', '11群'] }, // Shorthand

    { name: 'AI产品出海1期-2群', keywords: ['AI产品出海', '1期', '2群'] },
    { name: 'AI产品出海1期-2群', keywords: ['AI产品出海', '12群'] }, // Shorthand

    // AI Product Line - Period 1 (深海圈别名)
    { name: 'AI产品出海1期-1群', keywords: ['深海圈', '1期', '1群'] },
    { name: 'AI产品出海1期-2群', keywords: ['深海圈', '1期', '2群'] },

    // AI Product Line - Period 1 (海外AI产品别名)
    { name: 'AI产品出海1期-1群', keywords: ['海外AI产品', '1群'] },
    { name: 'AI产品出海1期-2群', keywords: ['海外AI产品', '2群'] },
    
    // AI Product Line - Period 2 (Standard)
    { name: 'AI产品出海2期-1群', keywords: ['AI产品出海', '2期', '1群'] },
    { name: 'AI产品出海2期-1群', keywords: ['AI产品出海', '21群'] }, // Shorthand
    
    { name: 'AI产品出海2期-2群', keywords: ['AI产品出海', '2期', '2群'] },
    { name: 'AI产品出海2期-2群', keywords: ['AI产品出海', '22群'] }, // Shorthand

    // AI Product Line - Period 2 (深海圈别名)
    { name: 'AI产品出海2期-1群', keywords: ['深海圈', '2期', '1群'] },
    { name: 'AI产品出海2期-2群', keywords: ['深海圈', '2期', '2群'] },
    
    // AI Product Line - Period 2 (Variant: 新人营 -> Map to Standard)
    { name: 'AI产品出海2期-1群', keywords: ['新人营', '2期', '1群'] }, 
    
    // YouTube
    { name: 'YouTube AI视频1群', keywords: ['YouTube', '1群'] },
    
    { name: 'YouTube AI视频2群', keywords: ['YouTube', '2群'] },
    { name: 'YouTube AI视频2群', keywords: ['YouTube', '新人营', '2群'] }, // Variant: 新人营
    // Handle "YouTube AI Video ... 2群" case specially if needed, but the above usually catches it if split by tokens.
    // However, user's case had "Video2025". 
    // Adding explicit robust match:
    { name: 'YouTube AI视频2群', keywords: ['YouTube', 'Video', '2群'] },
    
    { name: 'YouTube AI视频3群', keywords: ['YouTube', '3群'] },
    
    // Bilibili
    { name: 'B站好物1期', keywords: ['B站'] },
  ];

  // 1. Semantic Matching
  // Normalize checking: remove punctuation, lowercase
  const searchStr = normalizeFilenameForMatch(filename);

  let matchedGroup = null;

  for (const group of CANONICAL_GROUPS) {
      // Check if ALL keywords are present
      const allExist = group.keywords.every(kw => {
          const kwClean = normalizeFilenameForMatch(kw);
          return searchStr.includes(kwClean);
      });
      
      if (allExist) {
          matchedGroup = group.name;
          break; // Match first exact logic
      }
  }

  // Extract Date (Always try to find YYYY-MM-DD or MM-DD)
  // 1. YYYY-MM-DD
  let dateStr = new Date().toISOString().slice(0, 10);
  const dateMatchFull = filename.match(/(\d{4})[-\/](\d{2})[-\/](\d{2})/);
  if (dateMatchFull) {
      dateStr = `${dateMatchFull[1]}-${dateMatchFull[2]}-${dateMatchFull[3]}`;
  } else {
      // 2. MM-DD (fallback current year)
     const dateMatchShort = filename.match(/(\d{1,2})[-\/](\d{1,2})/);
     if (dateMatchShort) {
         const year = new Date().getFullYear();
         dateStr = `${year}-${dateMatchShort[1].padStart(2,'0')}-${dateMatchShort[2].padStart(2,'0')}`;
     }
  }

  if (matchedGroup) {
      // Infer Product Line & Period from Group Name for consistency
      let productLine = '其他';
      if (matchedGroup.includes('AI产品出海') || matchedGroup.includes('新人营')) productLine = 'AI产品出海';
      if (matchedGroup.includes('YouTube')) productLine = 'YouTube AI视频';
      if (matchedGroup.includes('B站')) productLine = 'B站好物交流';

      return {
          productLine,
          period: matchedGroup.includes('1期') ? '1' : matchedGroup.includes('2期') ? '2' : undefined,
          groupNumber: matchedGroup.match(/(\d+)群/)?.[1] || '1',
          groupName: matchedGroup, // New Field for explicit override
          dateStr
      };
  }

  // Fallback to original logic if no semantic match (e.g. for unknown new files)
  const prefixPattern = /(?:深海圈[丨|]?)\s*/;
  const m =
    filename.match(new RegExp(`${prefixPattern.source}(.+?)(\\d+期)?\\s?(\\d+群)?_(\\d{4}-\\d{2}-\\d{2})`)) ||
    filename.match(new RegExp(`${prefixPattern.source}(.+?)_(\\d{4}-\\d{2}-\\d{2})`));

  if (!m) {
    // Last ditch: if valid virtual filename "深海圈丨Dir_File"
    if (filename.includes('深海圈') && filename.includes('_')) {
        const parts = filename.split('_');
        // e.g. 深海圈丨YouTube AI 视频_2群 ...
        // part[0] = 深海圈丨YouTube AI 视频
        // part[1] = 2群 ...
        const rawProduct = parts[0].replace(/深海圈[丨|]\s*/, '').trim();
        return {
             productLine: rawProduct,
             period: undefined,
             groupNumber: filename.match(/(\d+)群/)?.[1] || '1',
             dateStr
        };
    }

    return {
      productLine: 'Unknown',
      period: undefined as string | undefined,
      groupNumber: '1',
      dateStr,
    };
  }
  
  let productLine = (m[1] || '').replace(/(\d+期)?(\d+群)?$/, '').trim();
  const period = m[2]?.replace('期', '');
  const groupNumber = m[3]?.replace('群', '') || '1';
  // dateStr already calculated above

  if (!productLine && filename.includes('深海圈')) {
    productLine = 'AI产品出海';
  }
  if (productLine.includes('海外AI产品')) {
    productLine = 'AI产品出海';
  }

  return { productLine, period, groupNumber, dateStr };
}

function normalizeAuthor(raw: string) {
  // Remove trailing “｜24 小时内回复信息” or similar decorations
  return raw.replace(/[|｜].*$/, '').trim();
}

export function parseMessages(rawText: string): ParsedMessage[] {
  const lines = rawText.split(/\r?\n/);
  const messages: ParsedMessage[] = [];
  let current: ParsedMessage | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const timeMatch = trimmed.match(timePattern);
    const looksLikeHeader = timeMatch && trimmed.indexOf(timeMatch[0]) > -1;

    if (looksLikeHeader) {
      if (current) messages.push(current);
      const time = timeMatch![0];
      const hour = parseInt(time.slice(0, 2), 10);
      const author = normalizeAuthor(trimmed.replace(time, '')).trim();
      current = { author, time, hour, text: '' };
    } else if (current) {
      current.text = current.text ? `${current.text}\n${trimmed}` : trimmed;
    }
  }

  if (current) messages.push(current);
  return messages;
}

function computeAvgResponseMinutes(messages: ParsedMessage[], questionIndexes: number[]) {
  const responseMinutes: number[] = [];

  for (const idx of questionIndexes) {
    const q = messages[idx];
    const qMinutes = q.hour * 60 + parseInt(q.time.slice(3, 5), 10);
    // find first response from different author after the question
    for (let j = idx + 1; j < messages.length; j++) {
      const msg = messages[j];
      if (msg.author === q.author) continue;
      const mMinutes = msg.hour * 60 + parseInt(msg.time.slice(3, 5), 10);
      const diff = mMinutes - qMinutes;
      if (diff < 0) continue;
      responseMinutes.push(diff);
      break;
    }
  }

  if (!responseMinutes.length) return undefined;
  const avg = responseMinutes.reduce((a, b) => a + b, 0) / responseMinutes.length;
  return Math.round(avg);
}

function computeResolutionRate(messages: ParsedMessage[], questionIndexes: number[]) {
  if (!questionIndexes.length) return 0;

  let resolved = 0;
  for (const idx of questionIndexes) {
    const q = messages[idx];
    // scan next N messages or up to 2 hours window
    for (let j = idx + 1; j < Math.min(messages.length, idx + 10); j++) {
      const msg = messages[j];
      // resolution from responder
      if (msg.author !== q.author && resolutionRegex.test(msg.text)) {
        resolved++;
        break;
      }
      // acknowledgement from asker
      if (msg.author === q.author && thanksRegex.test(msg.text)) {
        resolved++;
        break;
      }
    }
  }

  return Math.round((resolved / questionIndexes.length) * 100);
}

export function parseRawChatLog(filename: string, rawText: string): ParsedReport {
  const { productLine, period, groupNumber, dateStr } = parseFilenameMeta(filename);
  const messages = parseMessages(rawText);

  const messageCount = messages.length;
  const questionIndexes: number[] = [];
  const questions: { author: string; text: string }[] = [];
  const goodNews: { author: string; text: string }[] = [];

  messages.forEach((m, idx) => {
    const flat = m.text.replace(/\s+/g, ' ');
    if (questionRegex.test(flat)) {
      questionIndexes.push(idx);
      questions.push({ author: m.author, text: flat });
    }
    if (goodNewsRegex.test(flat)) {
      goodNews.push({ author: m.author, text: flat });
    }
  });

  const questionCount = questions.length;
  const avgResponseTime = computeAvgResponseMinutes(messages, questionIndexes);
  const resolutionRate = computeResolutionRate(messages, questionIndexes);
  const goodNewsCount = goodNews.length;

  // Star students from good news (top 3)
  const starStudents = goodNews.slice(0, 3).map((g, i) => ({
    name: g.author,
    type: '高光',
    achievement: g.text,
    highlight: g.text,
    suggestion: i === 0 ? '联系跟进复盘' : '',
  }));

  // KOCs from sharing keywords (top 3 non-questions)
  const kocs = messages
    .filter((m) => !questionRegex.test(m.text) && shareRegex.test(m.text))
    .slice(0, 3)
    .map((m) => ({
      name: m.author,
      contribution: m.text,
      highlight: m.text,
      suggestion: '公开致谢/收录到知识库',
    }));

  const fullTextLines: string[] = [];
  fullTextLines.push(`### 自动生成日报（原始群聊解析）`);
  fullTextLines.push(`- 文件名：${filename}`);
  fullTextLines.push(
    `- 群：${productLine}${period ? period + '期' : ''}${groupNumber ? groupNumber + '群' : ''}（${dateStr}）`
  );
  fullTextLines.push(`- 消息数：${messageCount}`);
  fullTextLines.push(`- 提问数（规则识别）：${questionCount}`);
  fullTextLines.push(`- 平均响应时间：${avgResponseTime ?? '无数据'} 分钟`);
  fullTextLines.push(`- 解决率（规则/语义估计）：${resolutionRate}%`);
  fullTextLines.push(`- 好事数量（关键词）：${goodNewsCount}`);
  fullTextLines.push('');
  fullTextLines.push(`#### 提问列表`);
  fullTextLines.push(
    questions.length ? questions.map((q) => `- ${q.author}: ${q.text}`).join('\n') : '- 无'
  );
  fullTextLines.push('');
  fullTextLines.push(`#### 好事/高光`);
  fullTextLines.push(
    goodNews.length ? goodNews.map((g) => `- ${g.author}: ${g.text}`).join('\n') : '- 无'
  );

  return {
    productLine,
    period: period ? `${period}期` : undefined,
    groupNumber: groupNumber || '1',
    reportDate: new Date(dateStr),
    messageCount,
    questionCount,
    avgResponseTime,
    resolutionRate,
    goodNewsCount,
    starStudents,
    kocs,
    fullText: fullTextLines.join('\n'),
  };
}
