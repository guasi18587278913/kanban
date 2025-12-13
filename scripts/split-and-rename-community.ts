import fs from 'fs';
import path from 'path';

type SplitMap = Record<string, string[]>;

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function extractMeta(filename: string) {
  // Expect names like: AI产品出海1期1群 5月21日-12月3日.txt
  // productLine: AI产品出海, period: 1, group: 1
  const m = filename.match(/(AI产品出海)(\d)期(\d)群/);
  if (!m) {
    throw new Error(`无法从文件名解析期数/群号: ${filename}`);
  }
  return {
    productLine: m[1],
    period: m[2],
    group: m[3],
  };
}

function detectDate(line: string) {
  // Match "05-21 10:10:05"
  const m = line.match(/(\d{2})-(\d{2})\s+\d{2}:\d{2}:\d{2}/);
  if (!m) return null;
  return `${m[1]}-${m[2]}`; // MM-DD
}

function splitByDate(lines: string[], year: number) {
  const bucket: SplitMap = {};
  let currentDate: string | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    const datePart = detectDate(line);
    if (datePart) {
      currentDate = `${year}-${datePart}`;
    }
    if (!currentDate) {
      // Skip until we meet the first timestamp
      continue;
    }
    if (!bucket[currentDate]) {
      bucket[currentDate] = [];
    }
    bucket[currentDate].push(line);
  }

  return bucket;
}

function writeDailyFiles({
  inputFile,
  outputDir,
  year,
}: {
  inputFile: string;
  outputDir: string;
  year: number;
}) {
  const filename = path.basename(inputFile);
  const { productLine, period, group } = extractMeta(filename);

  const content = fs.readFileSync(inputFile, 'utf-8');
  const lines = content.split('\n');
  const splitMap = splitByDate(lines, year);

  const entries = Object.entries(splitMap).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  if (entries.length === 0) {
    console.warn(`⚠️ 未在文件中找到日期: ${filename}`);
    return;
  }

  for (const [date, dailyLines] of entries) {
    const targetName = `深海圈丨${productLine}${period}期${group}群_${date}.txt`;
    const targetPath = path.join(outputDir, targetName);
    fs.writeFileSync(targetPath, dailyLines.join('\n'), 'utf-8');
  }

  console.log(
    `✅ ${filename} -> 拆分 ${entries.length} 天，输出目录: ${outputDir}`
  );
}

async function main() {
  // Usage: pnpm tsx scripts/split-and-rename-community.ts [inputDir] [outputDir] [year]
  const inputDir =
    process.argv[2] ||
    path.join(process.cwd(), 'private/import/第一批导入聊天');
  const outputDir =
    process.argv[3] ||
    path.join(process.cwd(), 'private/import/第一批导入聊天_split');
  const year = Number(process.argv[4] || 2025);

  if (!fs.existsSync(inputDir)) {
    throw new Error(`输入目录不存在: ${inputDir}`);
  }

  ensureDir(outputDir);

  const files = fs
    .readdirSync(inputDir)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => path.join(inputDir, f));

  if (files.length === 0) {
    console.warn(`输入目录下未找到 .txt 文件: ${inputDir}`);
    return;
  }

  for (const file of files) {
    writeDailyFiles({ inputFile: file, outputDir, year });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
