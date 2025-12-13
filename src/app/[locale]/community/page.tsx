
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { getDashboardStats } from '@/actions/community-actions';
import { SmartIcon } from '@/shared/blocks/common';
import { ChartsSection } from './_components/charts-section';
import { KnowledgeWall } from './_components/knowledge-wall';
import { Link } from '@/core/i18n/navigation';

function normalizeName(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function slugifyName(name: string) {
  return normalizeName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function CommunityDashboardPage() {
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [csLoading, setCsLoading] = useState(false);
  const [period, setPeriod] = useState<'一期' | '二期' | '全部'>('全部');
  const [coachStudent, setCoachStudent] = useState<{
    coachTop: { name: string; count: number }[];
    coachAnswerTop?: { name: string; count: number }[];
    coachAnswerTotal?: number;
    coachTotal: number;
    coachActive: number;
    studentTop: { name: string; count: number }[];
    studentTotal: number;
    studentActive: number;
  } | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const data = await getDashboardStats();
        // Stats in Overview need dates normalized for charts? 
        // ChartsSection expects reportDate string. getDashboardStats returns it.
        setStats(data.map((d: any) => ({
            ...d,
            reportDate: d.reportDate,
        })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  useEffect(() => {
    async function fetchCs() {
      setCsLoading(true);
      try {
        const res = await fetch(`/api/community/coach-student?period=${period}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setCoachStudent(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setCsLoading(false);
      }
    }
    fetchCs();
  }, [period]);

  // Simple aggregation for the overview cards
  const totalMessages = stats.reduce((acc, curr) => acc + curr.messageCount, 0);
  const totalQuestions = stats.reduce((acc, curr) => acc + curr.questionCount, 0);
  const totalGoodNews = stats.reduce((acc, curr) => acc + curr.goodNewsCount, 0);
  
  // Calculate average resolution rate safely
  const validResolutionStats = stats.filter(s => s.resolutionRate != null);
  const avgResolutionRate = validResolutionStats.length > 0
    ? Math.round(validResolutionStats.reduce((acc, curr) => acc + (curr.resolutionRate || 0), 0) / validResolutionStats.length)
    : 0;

  // answeredBy counts from parsed questions（LLM 输出）
  const answeredByCounts = useMemo(() => {
    const map = new Map<string, number>();
    (stats || []).forEach((report) => {
      (report.questions || []).forEach((q: any) => {
        if (!q?.answeredBy) return;
        const key = normalizeName(q.answeredBy);
        map.set(key, (map.get(key) || 0) + 1);
      });
    });
    return map;
  }, [stats]);

  return (
    <div className="flex flex-col gap-10 px-10 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">社群运营看板</h1>
          <p className="text-muted-foreground mt-2">
            实时监测社群活跃度、服务质量与高价值产出。
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="累计活跃消息" value={totalMessages} icon="MessageSquare" />
        <KpiCard title="累计提问数量" value={totalQuestions} icon="HelpCircle" />
        <KpiCard title="平均解决率" value={`${avgResolutionRate}%`} icon="CheckCircle2" />
        <KpiCard title="累计好事" value={totalGoodNews} icon="Trophy" />
      </div>

      {/* Visualizations: Value Trend ONLY (for Overview) */}
      {!loading && stats.length > 0 && (
          <ChartsSection 
            data={stats} 
            showTrends={false} 
            showValue={true} 
            // fixedProductLine (unspecified implies 'all' or filtering allowed)
            // User: "Aggregated 3 SKU total". We can default to 'all' and user can filter if they want, 
            // OR if the requirement is STRICTLY total, we could hide filters. 
            // Given "Aggregated" context, I will leave filters enabled so user *can* drill down if they wish, 
            // but the default 'all' view gives the total.
          />
      )}

      {/* Knowledge Wall (Personas & Outcomes) */}
      <KnowledgeWall data={stats} />

      {/* Coach & Student Panels */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">期数筛选：</p>
          <div className="flex gap-2">
            {(['全部', '一期', '二期'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  period === p ? 'bg-primary text-white border-primary' : 'border-border'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <RoleCard
            title="教练/志愿者答疑"
            loading={csLoading}
            total={coachStudent?.coachTotal || 0}
            answerTotal={
              Array.from(answeredByCounts.values()).reduce((a, b) => a + b, 0) ||
              coachStudent?.coachAnswerTotal ||
              0
            }
            active={coachStudent?.coachActive || 0}
            items={() => {
              const base = coachStudent?.coachTop || [];
              const fromAnswers = Array.from(answeredByCounts.entries()).map(([norm, count]) => ({
                norm,
                name: base.find((b) => normalizeName(b.name) === norm)?.name || norm,
                answerCount: count,
              }));

              // merge message counts + answer counts
              const mergedMap = new Map<string, { name: string; messageCount?: number; answerCount?: number }>();
              base.forEach((b) => {
                const norm = normalizeName(b.name);
                mergedMap.set(norm, { name: b.name, messageCount: b.count, answerCount: 0 });
              });
              fromAnswers.forEach((a) => {
                const existing = mergedMap.get(a.norm);
                if (existing) {
                  existing.answerCount = a.answerCount;
                } else {
                  mergedMap.set(a.norm, { name: a.name, messageCount: 0, answerCount: a.answerCount });
                }
              });

              // sort by messageCount desc as primary
              return Array.from(mergedMap.values()).sort((a, b) => (b.messageCount || 0) - (a.messageCount || 0));
            }}
            icon="UserCheck2"
            linkPrefix="/community/coach"
          />
          <RoleCard
            title="学员发言"
            loading={csLoading}
            total={coachStudent?.studentTotal || 0}
            active={coachStudent?.studentActive || 0}
            items={() => (coachStudent?.studentTop || []).map((item) => ({
              name: item.name,
              messageCount: item.count,
            }))}
            icon="Users"
            linkPrefix="/community/student"
          />
        </div>
      </div>

    </div>
  );
}

function KpiCard({ title, value, icon }: { title: string, value: string | number, icon: string }) {
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

function RoleCard({
  title,
  total,
  answerTotal,
  active,
  items,
  loading,
  icon,
  linkPrefix,
}: {
  title: string;
  total: number;
  answerTotal?: number;
  active: number;
  items: { name: string; messageCount?: number; answerCount?: number }[] | (() => { name: string; messageCount?: number; answerCount?: number }[]);
  loading: boolean;
  icon: string;
  linkPrefix?: string;
}) {
  const resolvedItems = typeof items === 'function' ? items() : items;

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            总计 {total} 条{answerTotal !== undefined ? ` · 答疑 ${answerTotal} 条` : ''} · 活跃 {active} 人
          </p>
        </div>
        <SmartIcon name={icon} className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent className="max-h-[460px] overflow-y-auto pr-2">
        {loading ? (
          <div className="py-6 text-sm text-muted-foreground">加载中...</div>
        ) : resolvedItems.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">暂无数据</div>
        ) : (
          <div className="flex flex-col gap-3">
            {resolvedItems.map((item, idx) => (
              <div key={item.name + idx} className="flex items-center justify-between border-b pb-2 last:border-b-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs w-6 text-right">{idx + 1}</span>
                  {linkPrefix ? (
                    <Link
                      href={`${linkPrefix}/${slugifyName(item.name)}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {item.name}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium">{item.name}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex gap-2">
                  <span>消息 {item.messageCount ?? 0}</span>
                  {item.answerCount !== undefined && <span className="text-green-600">答疑 {item.answerCount}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
