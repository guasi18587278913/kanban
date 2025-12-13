import { db } from '@/core/db';
import { communityDailyReport, communityGroup } from '@/config/db/schema';
import { eq } from 'drizzle-orm';

const APPLY = process.env.APPLY === '1';
const BLOCKED_AUTHORS = ['桑桑'];
const goodNewsKeywords = [
  '成交',
  '下单',
  '首单',
  '出单',
  '订单',
  '付费',
  '收入',
  '营收',
  'gmv',
  '买断',
  '签约',
  '上线',
  '发布',
  '上线了',
  '发布了',
  '下载',
  '增长',
  '涨粉',
  '变现',
  '付款',
  '订阅',
  '收款',
  '提现',
  '通过',
  '审批',
  '支付',
  '开通',
];

const badNewsKeywords = [
  '学习',
  '进度',
  '复盘',
  '感谢',
  '表扬',
  '称赞',
  '好看',
  '设计',
  '心得',
  '体验',
  '安装',
  '注册',
  '报错',
  '验证',
  '网络',
  '梯子',
  '提醒',
  '反馈',
  '问题',
  '解决',
  '修复',
];

function normalizeContent(raw: string) {
  return (raw || '')
    .toLowerCase()
    .replace(/模版/g, '模板')
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function normalizeAuthor(raw: string) {
  return (raw || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function isSimilar(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  // 简单字符集重合度判断，避免引入重型算法
  const setA = new Set(a.split(''));
  const setB = new Set(b.split(''));
  const overlap = Array.from(setA).filter((ch) => setB.has(ch)).length;
  const ratio = overlap / Math.min(setA.size, setB.size || 1);
  // 重合度>=0.8 视为同一条
  return ratio >= 0.8;
}

type ReportInfo = {
  id: string;
  date: string;
  group: string;
  activityFeature: string | null;
};

async function main() {
  const reports = (await db().select().from(communityDailyReport)) as ReportInfo[];
  const groups = await db().select().from(communityGroup);
  const groupNameById = new Map(groups.map((g) => [g.id, g.groupName]));

  let totalRemoved = 0;
  let totalUpdated = 0;
  const touched: any[] = [];

  for (const r of reports) {
    if (!r.activityFeature) continue;
    let items: any[] = [];
    try {
      const parsed = JSON.parse(r.activityFeature as string);
      if (!Array.isArray(parsed)) continue;
      items = parsed;
    } catch {
      continue;
    }

    const date = r.date ? new Date(r.date).toISOString().slice(0, 10) : (r as any).reportDate?.toISOString()?.slice(0, 10);
    const cleaned: any[] = [];
    let removedHere = 0;

    for (const item of items) {
      const author = (item.author || '').trim() || '未注明';
      if (BLOCKED_AUTHORS.some((b) => normalizeAuthor(author) === normalizeAuthor(b))) {
        removedHere += 1;
        continue;
      }
      const authorNorm = normalizeAuthor(author);
      const norm = normalizeContent(item.content || '');
      const candidate = { ...item, _authorNorm: authorNorm, _norm: norm };

      // 过滤明显非好事
      const text = (item.content || '').toLowerCase();
      const hasGood = goodNewsKeywords.some((k) => text.includes(k));
      const hasBad = badNewsKeywords.some((k) => text.includes(k));
      if (!hasGood || hasBad) {
        removedHere += 1;
        continue;
      }

      // 同一日报内：优先按作者合并；若作者缺失，再按相似内容合并
      let merged = false;
      for (let i = 0; i < cleaned.length; i++) {
        const existing = cleaned[i];
        if (authorNorm && existing._authorNorm === authorNorm) {
          if (isSimilar(norm, existing._norm)) {
            // 保留更长文本
            if ((candidate.content || '').length > (existing.content || '').length) {
              cleaned[i] = candidate;
            }
            merged = true;
            removedHere += 1;
            break;
          }
        } else if (!authorNorm && isSimilar(norm, existing._norm)) {
          if ((candidate.content || '').length > (existing.content || '').length) {
            cleaned[i] = candidate;
          }
          merged = true;
          removedHere += 1;
          break;
        }
      }
      if (!merged) {
        cleaned.push(candidate);
      }
    }

    if (removedHere > 0) {
      totalRemoved += removedHere;
      totalUpdated += 1;
      touched.push({
        date,
        group: groupNameById.get((r as any).groupId) || (r as any).groupId,
        before: items.length,
        after: cleaned.length,
        removed: removedHere,
      });

      const output = cleaned.map(({ _norm, _authorNorm, ...rest }) => rest);

      if (APPLY) {
        await db()
          .update(communityDailyReport)
          .set({
            activityFeature: JSON.stringify(output),
            goodNewsCount: output.length,
          })
          .where(eq(communityDailyReport.id, (r as any).id));
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        APPLY,
        totalRemoved,
        totalUpdated,
        touched: touched.slice(0, 10),
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
