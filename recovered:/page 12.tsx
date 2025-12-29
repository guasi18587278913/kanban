'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { getDashboardStatsV2 } from '@/actions/community-v2-actions';
import { Badge } from '@/shared/components/ui/badge';
import { SmartIcon } from '@/shared/blocks/common';
import { useSearchParams } from 'next/navigation';

type Report = {
  id: string;
  reportDate: string;
  messageCount: number;
  questionCount: number;
  avgResponseTime?: number;
  resolutionRate?: number;
  goodNewsCount: number;
  groupName: string;
  productLine: string;
  questions?: any[];
  actionItems?: any[];
  goodNewsParsed?: any[];
};

function isSameDay(d1: Date, d2: Date) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export default function YesterdayMonitoringPage() {
  const [stats, setStats] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProduct, setFilterProduct] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');

  useEffect(() => {
    async function fetchStats() {
      try {
        const data = await getDashboardStatsV2();
        setStats(
          data.map((d: any) => ({
            ...d,
            reportDate: d.reportDate,
          }))
        );
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  const { targetDate, yesterdayReports, anomalies, kpis } = useMemo(() => {
    // filter
    const filteredByProduct = filterProduct === 'all' ? stats : stats.filter((r) => r.productLine === filterProduct);
    const filtered = filterGroup === 'all' ? filteredByProduct : filteredByProduct.filter((r) => r.groupName === filterGroup);

    if (!filtered.length) {
      return { targetDate: null, yesterdayReports: [], anomalies: [], kpis: { messages: 0, questions: 0, goodNews: 0, resolutionRate: 0 } };
    }

    // 1) 找到数据中最新的一天（支持演示/回溯）
    const dates = filtered.map((r) => new Date(r.reportDate));
    const latest = new Date(Math.max(...dates.map((d) => d.getTime())));

    // 2) 目标日 = 最新一天，前一日 = 最新一天的前一天
    const target = latest;
    const prev = new Date(target);
    prev.setDate(target.getDate() - 1);

    const byDay = (target: Date) => filtered.filter((r) => isSameDay(new Date(r.reportDate), target));

    const yReports = byDay(target);
    const pReports = byDay(prev);

    // Map prev day by group key
    const prevMap = new Map<string, Report>();
    pReports.forEach((r) => {
      prevMap.set(`${r.productLine}-${r.groupName}`, r);
    });

    // Build anomalies list
    const anomaliesList: {
      title: string;
      value: string;
      change?: string;
      groupName: string;
      productLine: string;
      severity: 'high' | 'med';
      detail?: string;
      action?: string;
    }[] = [];

    yReports.forEach((r) => {
      const key = `${r.productLine}-${r.groupName}`;
      const prev = prevMap.get(key);

      // 1) 解决率低
      if ((r.resolutionRate ?? 100) < 80) {
        anomaliesList.push({
          title: '解决率偏低',
          value: `${r.resolutionRate ?? 0}%`,
          change: prev?.resolutionRate ? `${(r.resolutionRate ?? 0) - prev.resolutionRate}%` : undefined,
          groupName: r.groupName,
          productLine: r.productLine,
          severity: 'high',
          detail: (() => {
            const unresolved = (r.questions || []).find((q: any) => q.status === 'unresolved');
            return unresolved
              ? `${unresolved.author || '未注明'} 提问: ${unresolved.content}，已等待 ${unresolved.waitMins ?? '?'} 分钟`
              : '部分提问未闭环，请私聊跟进并补 FAQ';
          })(),
          action: '联系群管理员，梳理未解决问题并更新 FAQ/公告',
        });
      }

      // 2) 响应时间高
      if ((r.avgResponseTime ?? 0) > 10) {
        anomaliesList.push({
          title: '响应时间偏高',
          value: `${r.avgResponseTime} 分钟`,
          change:
            prev?.avgResponseTime !== undefined
              ? `${(r.avgResponseTime ?? 0) - (prev.avgResponseTime ?? 0)}`
              : undefined,
          groupName: r.groupName,
          productLine: r.productLine,
          severity: 'med',
          detail: (() => {
            const slow = (r.questions || []).find((q: any) => q.waitMins && q.waitMins > 10);
            return slow
              ? `${slow.author || '未注明'} 提问: ${slow.content}，首答等待 ${slow.waitMins} 分钟`
              : '昨日响应慢，请检查值班或补充应答 SOP';
          })(),
          action: '确认值班覆盖；给高频问题加快捷回复/FAQ',
        });
      }

      // 3) 消息暴涨/暴跌
      if (prev) {
        const diff = r.messageCount - prev.messageCount;
        const pct = prev.messageCount > 0 ? (diff / prev.messageCount) * 100 : null;
        if (pct !== null) {
          if (pct >= 100) {
            anomaliesList.push({
              title: '消息暴涨',
              value: `${diff > 0 ? '+' : ''}${Math.round(pct)}%`,
              groupName: r.groupName,
              productLine: r.productLine,
              severity: 'med',
              detail: '互动骤增，需关注热点话题是否可沉淀或有风险',
              action: '定位热点话题，决定放大（沉淀）或引导（风险）',
            });
          } else if (pct <= -40) {
            anomaliesList.push({
              title: '消息骤降',
              value: `${Math.round(pct)}%`,
              groupName: r.groupName,
              productLine: r.productLine,
              severity: 'med',
              detail: '互动显著下降，检查运营频次或话题供给',
              action: '补充话题/活动；排查是否有封禁/技术问题',
            });
          }
        }
      }
    });

    // KPIs (yesterday only)
    const agg = yReports.reduce(
      (acc, cur) => {
        acc.messages += cur.messageCount;
        acc.questions += cur.questionCount;
        acc.goodNews += cur.goodNewsCount;
        if (cur.resolutionRate != null) {
          acc.resSum += cur.resolutionRate;
          acc.resCnt += 1;
        }
        return acc;
      },
      { messages: 0, questions: 0, goodNews: 0, resSum: 0, resCnt: 0 }
    );
    const kpi = {
      messages: agg.messages,
      questions: agg.questions,
      goodNews: agg.goodNews,
      resolutionRate: agg.resCnt ? Math.round(agg.resSum / agg.resCnt) : 0,
    };

    return {
      targetDate: target,
      yesterdayReports: yReports,
      anomalies: anomaliesList,
      kpis: kpi,
    };
  }, [stats, filterProduct, filterGroup]);

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">昨日监测</h1>
          <p className="text-muted-foreground mt-2">
            聚焦最近一天的异常、未闭环与跟进建议。{targetDate ? `（日期：${new Date(targetDate).toLocaleDateString()}）` : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="昨日消息" value={kpis.messages} icon="MessageSquare" />
        <KpiCard title="昨日提问" value={kpis.questions} icon="HelpCircle" />
        <KpiCard title="昨日解决率" value={`${kpis.resolutionRate}%`} icon="CheckCircle2" />
        <KpiCard title="昨日好事" value={kpis.goodNews} icon="Trophy" />
      </div>

      {/* 简单筛选器 */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">筛选:</span>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={filterProduct}
          onChange={(e) => {
            setFilterProduct(e.target.value);
            setFilterGroup('all');
          }}
        >
          <option value="all">全部产品线</option>
          {Array.from(new Set(stats.map((s) => s.productLine))).map((pl) => (
            <option key={pl} value={pl}>
              {pl}
            </option>
          ))}
        </select>
        {filterProduct !== 'all' && (
          <select
            className="border rounded px-2 py-1 text-sm"
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
          >
            <option value="all">该产品线下全部群</option>
            {Array.from(new Set(stats.filter((s) => s.productLine === filterProduct).map((s) => s.groupName))).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>异常与预警</CardTitle>
            <CardDescription>昨日表现异常的群组，优先跟进。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <div className="text-sm text-muted-foreground">加载中…</div>}
            {!loading && anomalies.length === 0 && (
              <div className="text-sm text-muted-foreground">暂无明显异常。</div>
            )}
            {!loading &&
              anomalies.map((a, idx) => (
                <div
                  key={idx}
                  className="flex flex-col gap-2 rounded border p-3"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant={a.severity === 'high' ? 'destructive' : 'outline'}>
                      {a.title}
                    </Badge>
                    <span className="text-sm text-muted-foreground">{a.productLine}</span>
                    <span className="text-sm font-medium">{a.groupName}</span>
                  </div>
                  <div className="text-sm text-foreground">
                    当前：{a.value} {a.change && <span className="text-muted-foreground">({a.change})</span>}
                  </div>
                  {a.detail && (
                    <div className="text-sm text-muted-foreground">
                      案例：{a.detail}
                    </div>
                  )}
                  {a.action && (
                    <div className="text-sm text-foreground">
                      建议：{a.action}
                    </div>
                  )}
                  {!a.detail && (
                    <div className="text-xs text-muted-foreground">
                      暂无原文案例（待接入未闭环提问/原文片段数据）
                    </div>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>快速行动建议</CardTitle>
            <CardDescription>根据昨日异常生成的跟进提示。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {anomalies.length === 0 && <div className="text-muted-foreground">暂无建议。</div>}
            {anomalies.length > 0 &&
              anomalies.slice(0, 6).map((a, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <SmartIcon name="ArrowRight" className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{a.title} · {a.groupName}</div>
                    <div className="text-muted-foreground">
                      建议：联系群内管理员跟进；检查应答 SOP；针对 {a.productLine} 更新公告/FAQ。
                    </div>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>昨日群组摘要</CardTitle>
          <CardDescription>昨日各群核心指标。</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-center text-muted-foreground">加载中…</div>
          ) : yesterdayReports.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">昨日无数据。</div>
          ) : (
              <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm text-left">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors">
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">群组</th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">消息</th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">提问</th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">均响</th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">解决率</th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">好事</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {yesterdayReports.map((r: any) => (
                      <tr key={r.id} className="border-b">
                        <td className="px-4 py-2 align-middle">
                          <div className="font-medium">{r.groupName}</div>
                          <div className="text-xs text-muted-foreground">{r.productLine}</div>
                        </td>
                        <td className="px-4 py-2 align-middle">{r.messageCount}</td>
                        <td className="px-4 py-2 align-middle">{r.questionCount}</td>
                        <td className="px-4 py-2 align-middle">{r.avgResponseTime ?? '-'}</td>
                        <td className="px-4 py-2 align-middle">{r.resolutionRate ?? 0}%</td>
                        <td className="px-4 py-2 align-middle">{r.goodNewsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ title, value, icon }: { title: string; value: string | number; icon: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <SmartIcon name={icon} className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
