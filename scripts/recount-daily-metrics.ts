import fs from 'fs';
import path from 'path';

import { db } from '@/core/db';
import { communityDailyReport, communityGroup } from '@/config/db/schema';
import { eq } from 'drizzle-orm';

type ParsedName = {
  productLine: string;
  period: string;
  groupNumber: number;
  date: string; // YYYY-MM-DD
};

type ParsedMessage = {
  author: string;
  timestamp: Date;
  text: string;
};

type ParsedStats = {
  messageCount: number;
  questionCount: number;
  goodNewsCount: number;
  avgResponseTime: number | null;
  resolutionRate?: number | null;
};

const BASE_DIR = path.join(process.cwd(), 'private/import/第一批导入聊天_split');
const APPLY = process.env.APPLY === '1';
const MAX_AVG_RESPONSE_MIN = Number(process.env.MAX_AVG_RESPONSE ?? 120);

const fileNameRegex =
  /^深海圈丨(?<productLine>.+?)(?<period>\d)期(?<group>\d)群_(?<date>\d{4}-\d{2}-\d{2})\.txt$/;

const headerRegex =
  /^\s*(?!>)(?<author>.*?)\s+(?<md>\d{2}-\d{2})\s+(?<time>\d{2}:\d{2}:\d{2})(?<rest>.*)$/;

// 粗规则：问号/疑问词
const questionRegex =
  /(？|\?|吗|嘛|么|如何|怎么|是否|哪里|哪|能否|可否|怎样|咋|多久|多少|有没有|行不)/i;

// 粗规则：喜报/成交相关关键词
const goodNewsRegex =
  /(出单|喜报|成交|下单|首单|到账|爆单|变现|付费|买了|签单|GMV|收入|转化|付款|冲上|破\d|涨粉|录取|offer)/i;

function parseFileName(fileName: string): ParsedName | null {
  const match = fileNameRegex.exec(fileName);
  if (!match || !match.groups) return null;
  return {
    productLine: match.groups.productLine.replace(/\s+/g, ''),
    period: match.groups.period,
    groupNumber: Number(match.groups.group),
    date: match.groups.date,
  };
}

function buildTimestamp(date: string, time: string) {
  // Assume UTC+8 timezone for chat timestamps
  return new Date(`${date}T${time}+08:00`);
}

function parseMessages(filePath: string, fileDate: string): ParsedMessage[] {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const messages: ParsedMessage[] = [];

  let current: ParsedMessage | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const header = headerRegex.exec(line);
    if (header && header.groups) {
      // flush previous
      if (current) {
        messages.push(current);
      }
      const author = (header.groups.author || '').trim() || '未知';
      const timestamp = buildTimestamp(fileDate, header.groups.time);
      const trailing = (header.groups.rest || '').trim();
      current = {
        author,
        timestamp,
        text: trailing ? trailing : '',
      };
      continue;
    }

    if (current) {
      // Skip quoted historical lines to避免误计数
      if (line.startsWith('>')) continue;
      current.text = current.text ? `${current.text}\n${line}` : line;
    }
  }

  if (current) {
    messages.push(current);
  }

  return messages;
}

function computeAvgResponse(messages: ParsedMessage[]): number | null {
  if (messages.length < 2) return null;
  const deltas: number[] = [];
  for (let i = 1; i < messages.length; i++) {
    const deltaMs = messages[i].timestamp.getTime() - messages[i - 1].timestamp.getTime();
    if (deltaMs >= 0) {
      deltas.push(deltaMs / 60000);
    }
  }
  if (!deltas.length) return null;
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return Math.round(avg);
}

function computeStats(messages: ParsedMessage[]): ParsedStats {
  let questionCount = 0;
  let goodNewsCount = 0;

  for (const msg of messages) {
    const text = `${msg.text}`.replace(/\s+/g, ' ');
    if (questionRegex.test(text)) questionCount += 1;
    if (goodNewsRegex.test(text)) goodNewsCount += 1;
  }

  return {
    messageCount: messages.length,
    questionCount,
    goodNewsCount,
    avgResponseTime: computeAvgResponse(messages),
  };
}

function makeGroupKey(productLine: string, period: string | null, groupNumber: number | null) {
  const normalizedPeriod = period ? period.replace(/期$/, '') : '';
  return `${productLine}${normalizedPeriod ? `${normalizedPeriod}期` : ''}-${groupNumber ?? ''}群`;
}

async function main() {
  if (!fs.existsSync(BASE_DIR)) {
    throw new Error(`Input dir not found: ${BASE_DIR}`);
  }

  const groups = await db().select().from(communityGroup);
  const reports = await db().select().from(communityDailyReport);

  const groupKeyById = new Map<string, string>();
  const groupIdByKey = new Map<string, string>();

  groups.forEach((g) => {
    const key = makeGroupKey(g.productLine, g.period, g.groupNumber);
    groupKeyById.set(g.id, key);
    if (!groupIdByKey.has(key)) {
      groupIdByKey.set(key, g.id);
    }
  });

  const reportIndex = new Map<string, (typeof reports)[number]>();
  reports.forEach((r) => {
    const date = r.reportDate.toISOString().slice(0, 10);
    const key = `${groupKeyById.get(r.groupId)}|${date}`;
    reportIndex.set(key, r);
  });

  const files = fs
    .readdirSync(BASE_DIR)
    .filter((f) => f.endsWith('.txt'))
    .sort();

  const summary = {
    totalFiles: files.length,
    matched: 0,
    missingReport: 0,
    updated: 0,
    avgRespSkipped: 0,
  };

  const avgRespSkippedFiles: string[] = [];
  const preview: any[] = [];

  for (const file of files) {
    const parsedName = parseFileName(file);
    if (!parsedName) continue;
    const groupKey = makeGroupKey(parsedName.productLine, parsedName.period, parsedName.groupNumber);
    const reportKey = `${groupKey}|${parsedName.date}`;
    const report = reportIndex.get(reportKey);
    if (!report) {
      summary.missingReport += 1;
      continue;
    }

    summary.matched += 1;

    const filePath = path.join(BASE_DIR, file);
    const messages = parseMessages(filePath, parsedName.date);
    const stats = computeStats(messages);

    const updatePayload: Partial<typeof report> = {
      messageCount: stats.messageCount,
      questionCount: stats.questionCount,
      goodNewsCount: stats.goodNewsCount,
    };

    if (stats.avgResponseTime !== null && stats.avgResponseTime <= MAX_AVG_RESPONSE_MIN) {
      updatePayload.avgResponseTime = stats.avgResponseTime;
    } else if (stats.avgResponseTime !== null) {
      summary.avgRespSkipped += 1;
      avgRespSkippedFiles.push(file);
    }

    // resolutionRate: optional，如果未来需要可填充，这里保持不变

    preview.push({
      file,
      groupKey,
      date: parsedName.date,
      newStats: {
        messageCount: stats.messageCount,
        questionCount: stats.questionCount,
        goodNewsCount: stats.goodNewsCount,
        avgResponseTime:
          'avgResponseTime' in updatePayload ? updatePayload.avgResponseTime : '(kept)',
      },
      oldStats: {
        messageCount: report.messageCount,
        questionCount: report.questionCount,
        goodNewsCount: report.goodNewsCount,
        avgResponseTime: report.avgResponseTime,
      },
    });

    if (APPLY) {
      await db()
        .update(communityDailyReport)
        .set(updatePayload)
        .where(eq(communityDailyReport.id, report.id));
      summary.updated += 1;
    }
  }

  console.log(
    JSON.stringify(
      {
        APPLY,
        MAX_AVG_RESPONSE_MIN,
        summary,
        avgRespSkippedFiles,
        preview: preview.slice(0, 8), // show first few for quick diff
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
