import fs from 'fs';
import path from 'path';
import { db } from '@/core/db';
import { communityDailyReport, communityGroup } from '@/config/db/schema';

const INPUT_DIR = path.join(process.cwd(), 'private/import/第一批导入聊天_split');

function listFiles() {
  const files = fs
    .readdirSync(INPUT_DIR)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => path.join(INPUT_DIR, f));
  const grouped: Record<string, string[]> = {};
  files.forEach((p) => {
    const name = path.basename(p);
    const m = name.match(/(AI产品出海)(\d)期(\d)群_(\d{4}-\d{2}-\d{2})/);
    if (m) {
      const key = `${m[1]}${m[2]}期${m[3]}群`;
      const date = m[4];
      (grouped[key] ||= []).push(date);
    }
  });
  Object.keys(grouped).forEach((k) => grouped[k].sort());
  return grouped;
}

async function listReports() {
  const groups = await db().select().from(communityGroup);
  const reports = await db().select().from(communityDailyReport);
  const grouped: Record<string, string[]> = {};
  reports.forEach((r) => {
    const g = groups.find((g) => g.id === r.groupId);
    const key = g ? `${g.productLine}${g.period || ''}${g.groupNumber}群` : r.groupId;
    const date = r.reportDate.toISOString().slice(0, 10);
    (grouped[key] ||= []).push(date);
  });
  Object.keys(grouped).forEach((k) => grouped[k].sort());
  return grouped;
}

async function main() {
  const files = listFiles();
  const reports = await listReports();
  const missing: Record<string, string[]> = {};
  Object.keys(files).forEach((key) => {
    const fileDates = new Set(files[key]);
    const reportDates = new Set(reports[key] || []);
    const miss: string[] = [];
    fileDates.forEach((d) => {
      if (!reportDates.has(d)) miss.push(d);
    });
    if (miss.length) missing[key] = miss.sort();
  });
  console.log(JSON.stringify({ missing }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
