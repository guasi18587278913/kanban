/**
 * 生成 V2 数据 HTML 预览
 *
 * 用法:
 *   npx tsx scripts/generate-preview-v2.ts
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const TARGET_FILES = [
  '深海圈丨AI产品出海2期2群_2025-12-10.txt',
  '深海圈丨AI产品出海2期1群_2025-12-10.txt',
  '深海圈丨AI产品出海2期2群_2025-12-09.txt',
  '深海圈丨AI产品出海2期1群_2025-12-09.txt',
];

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(d?: Date | null) {
  if (!d) return '-';
  return d.toISOString().slice(0, 10);
}

function formatMinutes(value?: number | null) {
  if (value === null || value === undefined) return '-';
  return `${value} 分钟`;
}

async function main() {
  const { db } = await import('../src/core/db');
  const {
    rawChatLog,
    dailyStats,
    qaRecord,
    goodNews,
    kocRecord,
  } = await import('../src/config/db/schema-community-v2');
  const { inArray, eq, and, asc } = await import('drizzle-orm');

  const logs = await db()
    .select()
    .from(rawChatLog)
    .where(inArray(rawChatLog.fileName, TARGET_FILES))
    .orderBy(asc(rawChatLog.chatDate));

  const cards: string[] = [];

  for (const log of logs) {
    const [stats] = await db()
      .select()
      .from(dailyStats)
      .where(
        and(
          eq(dailyStats.productLine, log.productLine),
          eq(dailyStats.period, log.period),
          eq(dailyStats.groupNumber, log.groupNumber),
          eq(dailyStats.statsDate, log.chatDate)
        )
      );

    const qaList = await db()
      .select()
      .from(qaRecord)
      .where(eq(qaRecord.sourceLogId, log.id))
      .orderBy(asc(qaRecord.questionTime));

    const newsList = await db()
      .select()
      .from(goodNews)
      .where(eq(goodNews.sourceLogId, log.id))
      .orderBy(asc(goodNews.eventDate));

    const kocList = await db()
      .select()
      .from(kocRecord)
      .where(eq(kocRecord.sourceLogId, log.id))
      .orderBy(asc(kocRecord.recordDate));

    const qaItems = qaList
      .map((qa) => {
        const question = escapeHtml(qa.questionContent || '').slice(0, 180);
        const answerName = qa.answererName ? escapeHtml(qa.answererName) : '—';
        const resolved = qa.isResolved ? '已解决' : '未解决';
        const wait = qa.responseMinutes ?? null;
        return `<li><strong>${escapeHtml(qa.askerName || '')}</strong>：${question}<br/><span class="muted">答：${answerName} · ${resolved} · ${formatMinutes(wait)}</span></li>`;
      })
      .join('');

    const newsItems = newsList
      .map((gn) => {
        const content = escapeHtml(gn.content || '').slice(0, 180);
        const status = gn.isVerified ? '已审核' : '待审核';
        const confidence = gn.confidence || 'medium';
        return `<li><strong>${escapeHtml(gn.authorName || '')}</strong>：${content}<br/><span class="muted">${confidence} · ${status}</span></li>`;
      })
      .join('');

    const kocItems = kocList
      .map((koc) => {
        const contribution = escapeHtml(koc.contribution || '').replace(/\n/g, '<br/>');
        const model = koc.contributionType ? escapeHtml(koc.contributionType) : 'KOC';
        return `<li><strong>${escapeHtml(koc.kocName || '')}</strong>：${contribution}<br/><span class="muted">${model}</span></li>`;
      })
      .join('');

    const snippet = escapeHtml((log.rawContent || '').split(/\r?\n/).slice(0, 20).join('\n'));

    const resolutionRate = stats?.resolutionRate ? `${stats.resolutionRate}%` : '-';
    const avgResponse = formatMinutes(stats?.avgResponseMinutes ?? null);

    cards.push(`
      <section class="card">
        <div class="card-head">
          <div>
            <div class="badge">${escapeHtml(log.productLine || '')}${escapeHtml(log.period || '')}期${log.groupNumber}群</div>
            <h2>${formatDate(log.chatDate)} · ${escapeHtml(log.fileName || '')}</h2>
          </div>
          <div class="stat-pill">原始消息: ${log.messageCount || 0}</div>
        </div>
        <div class="stats">
          <div><span>统计消息</span><strong>${stats?.messageCount ?? 0}</strong></div>
          <div><span>问答数</span><strong>${qaList.length}</strong></div>
          <div><span>好事数</span><strong>${newsList.length}</strong></div>
          <div><span>KOC</span><strong>${kocList.length}</strong></div>
          <div><span>解决率</span><strong>${resolutionRate}</strong></div>
          <div><span>平均响应</span><strong>${avgResponse}</strong></div>
        </div>
        <details open>
          <summary>问答（${qaList.length}）</summary>
          <ol>${qaItems || '<li class="muted">暂无</li>'}</ol>
        </details>
        <details>
          <summary>好事（${newsList.length}）</summary>
          <ol>${newsItems || '<li class="muted">暂无</li>'}</ol>
        </details>
        <details>
          <summary>KOC（${kocList.length}）</summary>
          <ol>${kocItems || '<li class="muted">暂无</li>'}</ol>
        </details>
        <details>
          <summary>原始聊天片段（前 20 行）</summary>
          <pre>${snippet}</pre>
        </details>
      </section>
    `);
  }

  const now = new Date();
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>V2 数据预览</title>
  <style>
    :root {
      --bg: #f6f3ed;
      --bg-2: #e7f2f0;
      --card: rgba(255, 255, 255, 0.86);
      --ink: #1c1c1c;
      --muted: #5d5d5d;
      --accent: #0f766e;
      --accent-2: #e07a5f;
      --border: rgba(15, 118, 110, 0.2);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "STKaiti", "Kaiti SC", "KaiTi", "Songti SC", serif;
      color: var(--ink);
      background: radial-gradient(circle at top left, #fff4e0 0%, transparent 35%),
                  radial-gradient(circle at 20% 80%, #e7f2f0 0%, transparent 40%),
                  linear-gradient(135deg, var(--bg), var(--bg-2));
      min-height: 100vh;
    }
    header {
      padding: 32px 28px 18px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      letter-spacing: 1px;
    }
    .subtitle {
      color: var(--muted);
      font-size: 14px;
    }
    main {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 18px;
      padding: 0 24px 40px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 18px;
      box-shadow: 0 12px 30px rgba(15, 118, 110, 0.12);
      animation: floatIn 0.5s ease both;
    }
    .card:nth-child(2n) { animation-delay: 0.08s; }
    .card:nth-child(3n) { animation-delay: 0.16s; }
    .card:nth-child(4n) { animation-delay: 0.24s; }
    .card-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: flex-start;
      margin-bottom: 12px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(15, 118, 110, 0.12);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
    }
    h2 {
      margin: 6px 0 0;
      font-size: 16px;
      font-weight: 600;
    }
    .stat-pill {
      background: #fff;
      border: 1px dashed var(--accent-2);
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      color: var(--accent-2);
      white-space: nowrap;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .stats div {
      background: rgba(15, 118, 110, 0.06);
      border-radius: 10px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .stats span {
      font-size: 11px;
      color: var(--muted);
    }
    .stats strong {
      font-size: 16px;
    }
    details {
      background: rgba(255, 255, 255, 0.6);
      border-radius: 12px;
      padding: 8px 10px;
      margin-bottom: 10px;
    }
    summary {
      cursor: pointer;
      font-weight: 600;
      color: var(--accent);
    }
    ol {
      margin: 10px 0 0 18px;
      padding: 0;
      font-size: 13px;
      line-height: 1.5;
    }
    pre {
      white-space: pre-wrap;
      background: #111827;
      color: #f9fafb;
      padding: 10px;
      border-radius: 12px;
      font-size: 12px;
    }
    .muted {
      color: var(--muted);
      font-size: 12px;
    }
    footer {
      padding: 0 28px 32px;
      color: var(--muted);
      font-size: 12px;
    }
    @keyframes floatIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body>
  <header>
    <h1>V2 数据预览（测试样本）</h1>
    <div class="subtitle">生成时间：${now.toLocaleString()} · 仅展示 4 份测试群聊记录</div>
  </header>
  <main>
    ${cards.join('\n')}
  </main>
  <footer>数据来自 V2 分析管道，仅用于快速预览。</footer>
</body>
</html>
`;

  const outputPath = path.join(process.cwd(), 'private/preview-v2.html');
  fs.writeFileSync(outputPath, html);
  console.log(`已生成: ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
