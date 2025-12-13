import fs from 'fs';
import path from 'path';

type ParsedMessage = {
  author: string;
  time: string;
  content: string;
  hour: number;
};

type ParsedFile = {
  file: string;
  date: string;
  productLine: string;
  period?: string;
  groupNumber?: string;
  messages: ParsedMessage[];
  stats: {
    messageCount: number;
    questionCount: number;
    goodNewsCount: number;
    hourlyBuckets: Record<string, number>;
    topAuthors: { author: string; count: number }[];
    questions: { author: string; text: string }[];
    goodNews: { author: string; text: string }[];
  };
};

const DEFAULT_DIR =
  '/Users/liyadong/Desktop/瓜斯的收藏夹/生财有术/深海圈/聊天记录/【按照日期更新】';

const timePattern = /(\d{2}):(\d{2}):(\d{2})/;

function parseFilename(file: string) {
  // 深海圈丨AI产品出海1期1群_2025-12-03.txt
  const m =
    file.match(/深海圈丨(.+?)(\d+期)?\s?(\d+群)?_(\d{4}-\d{2}-\d{2})/) ||
    file.match(/深海圈丨(.+?)_(\d{4}-\d{2}-\d{2})/);
  if (!m) return { productLine: 'Unknown', period: undefined, groupNumber: undefined, date: '' };
  const productLine = (m[1] || '').replace(/(\\d+期)?(\\d+群)?$/, '').trim();
  const period = m[2]?.replace('期', '');
  const groupNumber = m[3]?.replace('群', '');
  const date = m[4] || m[2];
  return { productLine, period, groupNumber, date };
}

function normalizeAuthor(raw: string) {
  // 去掉“｜24 小时内回复信息”之类的尾巴
  return raw.replace(/[|｜].*$/, '').trim();
}

function parseChatFile(filePath: string): ParsedFile {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  const { productLine, period, groupNumber, date } = parseFilename(path.basename(filePath));

  const messages: ParsedMessage[] = [];
  let current: ParsedMessage | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const timeMatch = trimmed.match(timePattern);
    const looksLikeHeader = timeMatch && trimmed.indexOf(timeMatch[0]) > -1;

    if (looksLikeHeader) {
      // Flush previous message
      if (current) {
        messages.push(current);
      }
      const time = timeMatch![0];
      const hour = parseInt(time.slice(0, 2), 10);
      const author = normalizeAuthor(trimmed.replace(time, '')).trim();
      current = { author, time, content: '', hour };
    } else {
      if (!current) continue; // skip stray lines before first header
      current.content = current.content
        ? current.content + '\n' + trimmed
        : trimmed;
    }
  }
  if (current) messages.push(current);

  const questionRegex = /(\?|？|吗|嘛|么)/;
  const goodNewsRegex = /(出单|爆|喜报|榜|成交|赚|变现|提现|首单|上岸|赢|冲|爆款)/;

  const hourlyBuckets: Record<string, number> = {};
  const authorCount: Record<string, number> = {};
  const questions: { author: string; text: string }[] = [];
  const goodNews: { author: string; text: string }[] = [];

  for (const msg of messages) {
    authorCount[msg.author] = (authorCount[msg.author] || 0) + 1;
    hourlyBuckets[msg.hour] = (hourlyBuckets[msg.hour] || 0) + 1;
    const text = `${msg.content}`.replace(/\s+/g, ' ');
    if (questionRegex.test(text)) {
      questions.push({ author: msg.author, text });
    }
    if (goodNewsRegex.test(text)) {
      goodNews.push({ author: msg.author, text });
    }
  }

  const topAuthors = Object.entries(authorCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([author, count]) => ({ author, count }));

  return {
    file: path.basename(filePath),
    date,
    productLine,
    period,
    groupNumber,
    messages,
    stats: {
      messageCount: messages.length,
      questionCount: questions.length,
      goodNewsCount: goodNews.length,
      hourlyBuckets,
      topAuthors,
      questions,
      goodNews,
    },
  };
}

function toMarkdown(parsed: ParsedFile) {
  const {
    file,
    date,
    productLine,
    period,
    groupNumber,
    stats: { messageCount, questionCount, goodNewsCount, topAuthors, questions, goodNews, hourlyBuckets },
  } = parsed;

  const hourStr = Object.entries(hourlyBuckets)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([h, c]) => `${h.padStart(2, '0')}:00 - ${c} 条`)
    .join('，');

  return [
    `## ${productLine}${period ? period + '期' : ''}${groupNumber ? groupNumber + '群' : ''} (${date})`,
    `- 文件：${file}`,
    `- 消息数：${messageCount}`,
    `- 提问数（粗识别）：${questionCount}`,
    `- 好事/喜报（关键词）：${goodNewsCount}`,
    `- 小时分布：${hourStr || '无数据'}`,
    `- Top5 讲话人数：${topAuthors.map((t) => `${t.author}(${t.count})`).join('，') || '—'}`,
    ``,
    `### 提问（粗识别）`,
    questions.length
      ? questions.map((q) => `- ${q.author}: ${q.text}`).join('\n')
      : '- 无',
    ``,
    `### 好事/喜报（关键词命中）`,
    goodNews.length
      ? goodNews.map((g) => `- ${g.author}: ${g.text}`).join('\n')
      : '- 无',
    ``,
  ].join('\n');
}

function main() {
  const targetDir = process.argv[2] || DEFAULT_DIR;
  if (!fs.existsSync(targetDir)) {
    console.error(`Directory not found: ${targetDir}`);
    process.exit(1);
  }

  const dateFolders = fs
    .readdirSync(targetDir)
    .filter((f) => !f.startsWith('.'))
    .map((f) => path.join(targetDir, f))
    .filter((p) => fs.statSync(p).isDirectory());

  const summaries: ParsedFile[] = [];

  for (const dateFolder of dateFolders) {
    const files = fs
      .readdirSync(dateFolder)
      .filter((f) => f.endsWith('.txt'))
      .map((f) => path.join(dateFolder, f));

    for (const file of files) {
      try {
        const parsed = parseChatFile(file);
        summaries.push(parsed);
      } catch (e) {
        console.error(`Failed to parse ${file}:`, e);
      }
    }
  }

  // 输出 Markdown 汇总
  const markdown = summaries
    .sort((a, b) => a.file.localeCompare(b.file))
    .map((p) => toMarkdown(p))
    .join('\n');

  console.log(markdown);
}

if (require.main === module) {
  main();
}
