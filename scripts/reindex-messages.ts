import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { parseFilenameMeta, timePattern } from '@/lib/community-raw-parser';

type Msg = {
  file: string;
  productLine: string;
  period?: string;
  groupName?: string;
  date: string;
  author: string;
  time?: string;
  text: string;
  isQuestion: boolean;
};

// Simple question detector: punctuation + keywords
const QUESTION_REGEX = /[?？]|请教|求助|怎么|如何|能否|吗|嘛|么/;

function isQuestionText(text: string) {
  return QUESTION_REGEX.test(text);
}

async function processFile(filePath: string): Promise<Msg[]> {
  const filename = path.basename(filePath);
  const meta = parseFilenameMeta(filename);
  const msgs: Msg[] = [];
  const input = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    // match "Name(wxid_xxx) hh:mm:ss"
    const timeMatch = line.match(timePattern);
    const idx = line.indexOf('(');
    if (idx > 0 && timeMatch) {
      const author = line.slice(0, idx).trim();
      const text = line.slice(timeMatch.index! + timeMatch[0].length).trim();
      msgs.push({
        file: filename,
        productLine: meta.productLine || 'unknown',
        period: meta.period,
        groupName: meta.groupName,
        date: meta.dateStr,
        author,
        time: timeMatch[0],
        text,
        isQuestion: isQuestionText(text),
      });
    }
  }

  return msgs;
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const res: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) res.push(...walk(full));
    else if (entry.endsWith('.txt')) res.push(full);
  }
  return res;
}

async function main() {
  const baseDirs = [
    path.join(process.cwd(), 'private/import/补充导入_split'),
    path.join(process.cwd(), 'private/import/AI产品出海/第1期'),
    path.join(process.cwd(), 'private/import/AI产品出海/第2期'),
  ];
  const files = baseDirs.flatMap(walk);
  console.log(`Scanning ${files.length} files...`);

  const all: Msg[] = [];
  for (const [idx, file] of files.entries()) {
    process.stdout.write(`\r[${idx + 1}/${files.length}] ${path.basename(file)}          `);
    try {
      const msgs = await processFile(file);
      all.push(...msgs);
    } catch (e) {
      console.error(`\nError parsing ${file}`, e);
    }
  }
  console.log(`\nParsed messages: ${all.length}`);

  const summary: Record<string, { messages: number; questions: number }> = {};
  for (const m of all) {
    const key = `${m.productLine}-${m.groupName || ''}-${m.date}`;
    summary[key] = summary[key] || { messages: 0, questions: 0 };
    summary[key].messages += 1;
    if (m.isQuestion) summary[key].questions += 1;
  }

  fs.writeFileSync('tmp-message-index.json', JSON.stringify(all, null, 2));
  fs.writeFileSync('tmp-message-summary.json', JSON.stringify(summary, null, 2));
  console.log('Written tmp-message-index.json and tmp-message-summary.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
