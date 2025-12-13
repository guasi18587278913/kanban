import fs from 'fs';
import path from 'path';
import { db } from '@/core/db';
import { communityDailyReport, communityGroup } from '@/config/db/schema';

const BASE_DIR = path.join(process.cwd(), 'private/import/第一批导入聊天_split');
const questionRegex = /(\?|？|吗|嘛|么|如何|怎么|是否|哪里|哪|能否)/;
const timePattern = /\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/;
const goodNewsRegex = /(出单|爆|喜报|榜|成交|赚|变现|提现|首单|上岸|赢|冲|爆款|涨粉|好评|offer|Offer|晋升|获奖|成交)/;

const samples: { groupLabel: string; period: number; group: number; dates: string[] }[] = [
  { groupLabel: '1期1群', period: 1, group: 1, dates: ['2025-05-28', '2025-06-20', '2025-07-15', '2025-08-05'] },
  { groupLabel: '1期2群', period: 1, group: 2, dates: ['2025-05-23', '2025-06-30', '2025-08-05'] },
  { groupLabel: '2期1群', period: 2, group: 1, dates: ['2025-10-30', '2025-11-15', '2025-12-02'] },
  { groupLabel: '2期2群', period: 2, group: 2, dates: ['2025-10-30', '2025-11-15', '2025-12-02'] },
];

function countRaw(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  let msg = 0;
  let q = 0;
  let good = 0;
  lines.forEach((line) => {
    if (timePattern.test(line)) {
      msg += 1;
      const text = line;
      if (questionRegex.test(text)) q += 1;
      if (goodNewsRegex.test(text)) good += 1;
    }
  });
  return { msg, q, good };
}

async function main() {
  const groups = await db().select().from(communityGroup);
  const reports = await db().select().from(communityDailyReport);
  const groupedReports = new Map<string, any[]>();
  reports.forEach((r) => {
    const g = groups.find((g) => g.id === r.groupId);
    const key = g ? `${g.productLine}${g.period || ''}-${g.groupNumber}群` : r.groupId;
    if (!groupedReports.has(key)) groupedReports.set(key, []);
    groupedReports.get(key)!.push(r);
  });
  // sort by date
  groupedReports.forEach((arr) => arr.sort((a, b) => a.reportDate.getTime() - b.reportDate.getTime()));

  const results: any[] = [];

  for (const s of samples) {
    for (const date of s.dates) {
      const filename = `深海圈丨AI产品出海${s.period}期${s.group}群_${date}.txt`;
      const filePath = path.join(BASE_DIR, filename);
      if (!fs.existsSync(filePath)) {
        results.push({ group: s.groupLabel, date, error: 'file_not_found' });
        continue;
      }
      const rawStats = countRaw(filePath);
      const key = `AI产品出海${s.period}期-${s.group}群`;
      const report = (groupedReports.get(key) || []).find(
        (r) => r.reportDate.toISOString().slice(0, 10) === date
      );
      results.push({
        group: s.groupLabel,
        date,
        raw: rawStats,
        db: report
          ? {
              msg: report.messageCount,
              q: report.questionCount,
              res: report.resolutionRate,
              good: report.goodNewsCount,
              avgResp: report.avgResponseTime,
            }
          : null,
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
