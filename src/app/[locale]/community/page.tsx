'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { getDashboardStatsV2 } from '@/actions/community-v2-actions';
import { SmartIcon } from '@/shared/blocks/common';
import { ChartsSection } from './_components/charts-section';
import { KnowledgeWall } from './_components/knowledge-wall';
import { Link } from '@/core/i18n/navigation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { ChevronDown, ChevronUp } from 'lucide-react';

function buildMemberHref(member: any) {
  const isCoach = member?.role === 'coach' || member?.role === 'volunteer';
  const slug = encodeURIComponent(String(member?.id || member?.nickname || ''));
  return isCoach ? `/community/coach/${slug}` : `/community/student/${slug}`;
}

export default function CommunityDashboardPage() {
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [csLoading, setCsLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [unresolvedLoading, setUnresolvedLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsInsights, setOpsInsights] = useState<any | null>(null);
  
  // Filters
  const [period, setPeriod] = useState<'一期' | '二期' | '全部'>('全部');
  const [productLine, setProductLine] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<'members' | 'messages'>('members');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [unresolved, setUnresolved] = useState<any[]>([]);
  const [actionItems, setActionItems] = useState<any[]>([]);
  
  // UI State
  const [isChartsOpen, setIsChartsOpen] = useState(true);

  // Helpers
  const normalizedPeriod = period === '全部' ? undefined : (period === '一期' ? '1' : '2');

  const [coachStudent, setCoachStudent] = useState<{
    coach?: { summary: any; list: any[] };
    student?: { summary: any; list: any[] };
  } | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const data = await getDashboardStatsV2();
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

  useEffect(() => {
    const params = new URLSearchParams();
    if (productLine !== 'all') params.set('productLine', productLine);
    if (normalizedPeriod) params.set('period', normalizedPeriod);

    async function fetchUnresolved() {
      setUnresolvedLoading(true);
      try {
        const res = await fetch(`/api/community/reports/unresolved?${params.toString()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setUnresolved(data.items || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setUnresolvedLoading(false);
      }
    }

    async function fetchActionItems() {
      setActionLoading(true);
      try {
        const res = await fetch(`/api/community/reports/action-items?${params.toString()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setActionItems(data.items || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setActionLoading(false);
      }
    }

    async function fetchOpsInsights() {
      setOpsLoading(true);
      try {
        const res = await fetch(`/api/community/reports/ops-insights?${params.toString()}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          setOpsInsights(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setOpsLoading(false);
      }
    }

    fetchUnresolved();
    fetchActionItems();
    fetchOpsInsights();
  }, [productLine, normalizedPeriod]);

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({
        q: searchQuery.trim(),
        scope: searchScope,
        limit: '20',
      });
      if (productLine !== 'all') params.set('productLine', productLine);
      if (normalizedPeriod) params.set('period', normalizedPeriod);

      const res = await fetch(`/api/community/search?${params.toString()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.items || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSearchLoading(false);
    }
  }

  function scopeButton(label: string, value: 'members' | 'messages') {
    const active = searchScope === value;
    return (
      <Button
        type="button"
        variant={active ? 'default' : 'outline'}
        size="sm"
        className="h-8"
        onClick={() => setSearchScope(value)}
      >
        {label}
      </Button>
    );
  }

  // Simple aggregation for the overview cards
  // Filter stats locally for KPIs to match the product line filter if selected
  const filteredStats = productLine === 'all' 
    ? stats 
    : stats.filter(s => s.productLine === productLine);

  const totalMessages = filteredStats.reduce((acc, curr) => acc + curr.messageCount, 0);
  const totalQuestions = filteredStats.reduce((acc, curr) => acc + curr.questionCount, 0);
  const totalGoodNews = filteredStats.reduce((acc, curr) => acc + curr.goodNewsCount, 0);
  
  // Calculate average resolution rate safely
  const validResolutionStats = filteredStats.filter(s => s.resolutionRate != null);
  const avgResolutionRate = validResolutionStats.length > 0
    ? Math.round(validResolutionStats.reduce((acc, curr) => acc + (curr.resolutionRate || 0), 0) / validResolutionStats.length)
    : 0;
  
  // Extract available product lines for filter
  const productLines = Array.from(new Set(stats.map(s => s.productLine))).filter(Boolean).sort();

  return (
    <div className="flex flex-col gap-6 px-4 py-6 md:px-10 md:py-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">社群运营看板</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            实时监测社群活跃度、服务质量与高价值产出。
          </p>
        </div>
        
        {/* Product Line Filter */}
        <div className="w-full md:w-[200px]">
             <Select value={productLine} onValueChange={setProductLine}>
                <SelectTrigger>
                    <SelectValue placeholder="选择产品线" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">全部产品线</SelectItem>
                    {productLines.map(pl => (
                        <SelectItem key={pl} value={pl}>{pl}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border rounded-lg p-4 bg-card shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">搜索范围：</span>
          <div className="flex gap-2">
            {scopeButton('成员', 'members')}
            {scopeButton('消息', 'messages')}
          </div>
        </div>
        <div className="flex w-full md:w-auto gap-2">
          <Input
            placeholder={searchScope === 'members' ? '搜昵称/别名… 回车搜索' : '搜消息内容… 回车搜索'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch();
              }
            }}
          />
          <Button onClick={handleSearch} disabled={searchLoading} className="shrink-0">
            {searchLoading ? '搜索中…' : '搜索'}
          </Button>
        </div>
        {searchResults.length > 0 && (
          <span className="text-xs text-muted-foreground md:w-auto w-full text-right">
            结果 {searchResults.length} 条
          </span>
        )}
      </div>

      {searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <SmartIcon name="Search" className="w-4 h-4 text-muted-foreground" />
              搜索结果
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {searchScope === 'members'
              ? searchResults.map((m: any) => {
                  const href = buildMemberHref(m);
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between border rounded-md p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="secondary" className="text-[10px] h-5">
                          {m.role || '未知'}
                        </Badge>
                        <Link href={href} className="text-sm font-medium text-primary hover:underline">
                          {m.nickname}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {m.productLine || '-'} {m.period ? `${m.period}期` : ''}
                        </span>
                      </div>
                      <SmartIcon name="ArrowUpRight" className="w-4 h-4 text-muted-foreground" />
                    </div>
                  );
                })
              : searchResults.map((msg: any) => (
                  <div
                    key={msg.id}
                    className="border rounded-md p-3 space-y-1 bg-muted/30"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="h-5 text-[11px]">
                        {msg.productLine || '未知'} {msg.period ? `${msg.period}期` : ''}
                      </Badge>
                      <span className="font-medium text-foreground">{msg.authorName}</span>
                      {msg.messageTime && (
                        <span>{new Date(msg.messageTime).toLocaleString()}</span>
                      )}
                    </div>
                    <div className="text-sm leading-snug text-foreground/90">{msg.content}</div>
                  </div>
                ))}
          </CardContent>
        </Card>
      )}

      {/* KPI Cards: Mobile 2 cols, Desktop 4 cols */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="累计活跃消息" value={totalMessages} icon="MessageSquare" />
        <KpiCard title="累计提问数量" value={totalQuestions} icon="HelpCircle" />
        <KpiCard title="平均解决率" value={`${avgResolutionRate}%`} icon="CheckCircle2" />
        <KpiCard title="累计好事" value={totalGoodNews} icon="Trophy" />
      </div>

      {/* Visualizations: Collapsible */}
      {/* 运营面板 */}
      {/* 数据趋势分析（移动到知识墙上方） */}
      {!loading && stats.length > 0 && (
          <Collapsible open={isChartsOpen} onOpenChange={setIsChartsOpen} className="border rounded-lg bg-card text-card-foreground shadow-sm">
             <div className="flex items-center justify-between px-6 py-4 border-b">
                 <h3 className="font-semibold flex items-center gap-2">
                     <SmartIcon name="BarChart3" className="w-4 h-4" />
                     数据趋势分析
                 </h3>
                 <CollapsibleTrigger asChild>
                     <Button variant="ghost" size="sm" className="w-9 h-9 p-0">
                         {isChartsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                     </Button>
                 </CollapsibleTrigger>
             </div>
             <CollapsibleContent>
                 <div className="p-2 md:p-6">
                    <ChartsSection 
                        data={stats} 
                        showTrends={true} 
                        showValue={true} 
                        fixedProductLine={productLine}
                    />
                 </div>
             </CollapsibleContent>
          </Collapsible>
      )}

      {/* Knowledge Wall (Personas & Outcomes) */}
      <KnowledgeWall data={filteredStats} />

      {/* Unresolved & Action Items */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <SmartIcon name="AlertCircle" className="w-4 h-4 text-orange-500" />
                未解决问题
              </CardTitle>
              <Badge variant="destructive" className="text-[11px] h-5">
                {unresolved.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {unresolvedLoading ? (
              <div className="text-sm text-muted-foreground">加载中...</div>
            ) : unresolved.length === 0 ? (
              <div className="text-sm text-muted-foreground">暂无未解决问题 🎉</div>
            ) : (
              unresolved.map((q) => (
                <div key={q.id} className="border rounded-md p-3 bg-muted/30">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="h-5 text-[11px]">
                        {q.productLine || '未知'} {q.period ? `${q.period}期` : ''}
                      </Badge>
                      <span>{q.asker || q.askerName || '未知'}</span>
                    </div>
                    {q.questionTime && <span>{new Date(q.questionTime).toLocaleDateString()}</span>}
                  </div>
                  <div className="text-sm text-foreground/90 leading-snug">{q.content}</div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <SmartIcon name="ListChecks" className="w-4 h-4 text-green-500" />
                运营清单
              </CardTitle>
              <Badge variant="secondary" className="text-[11px] h-5">
                {actionItems.length + (opsInsights?.valueAnchors?.length || 0) + (opsInsights?.rhythms?.length || 0)}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {actionLoading ? (
              <div className="text-sm text-muted-foreground">加载中...</div>
            ) : actionItems.length === 0 ? (
              <div className="text-sm text-muted-foreground">暂无待办。</div>
            ) : (
              actionItems.map((it, idx) => (
                <div key={idx} className="border rounded-md p-3 bg-muted/20">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="h-5 text-[11px]">
                        {it.category || it.title || '待处理'}
                      </Badge>
                      {(it.productLine || it.period) && (
                        <span>
                          {it.productLine || ''} {it.period ? `${it.period}期` : ''}
                        </span>
                      )}
                    </div>
                    {it.date && <span>{new Date(it.date).toLocaleDateString()}</span>}
                  </div>
                  <div className="text-sm text-foreground/90">{it.description || '暂无描述'}</div>
                  {(it.related || it.relatedTo) && (
                    <div className="text-xs text-muted-foreground mt-1">关联：{it.related || it.relatedTo}</div>
                  )}
                </div>
              ))
            )}
            {/* 注入运营面板的价值锚点与节奏提醒 */}
            {opsInsights && (
              <>
                {(opsInsights.valueAnchors || []).map((v: any, idx: number) => (
                  <div key={`va-${idx}`} className="border rounded-md p-3 bg-muted/20">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <Badge variant="secondary" className="h-5 text-[11px]">价值锚点</Badge>
                    </div>
                    <div className="text-sm text-foreground/90">{v.title}</div>
                    {v.detail && <div className="text-xs text-muted-foreground">{v.detail}</div>}
                    {v.suggestion && <div className="text-xs text-primary mt-1">{v.suggestion}</div>}
                  </div>
                ))}
                {(opsInsights.rhythms || []).map((r: any, idx: number) => (
                  <div key={`rh-${idx}`} className="border rounded-md p-3 bg-muted/20">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <Badge variant="secondary" className="h-5 text-[11px]">节奏提醒</Badge>
                    </div>
                    <div className="text-sm text-foreground/90">{r.title}</div>
                    {r.status && <div className="text-xs text-muted-foreground">{r.status}</div>}
                    {r.suggestion && <div className="text-xs text-primary mt-1">{r.suggestion}</div>}
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Coach & Student Panels */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
           <p className="text-base font-semibold">成员活跃榜</p>
           <div className="flex items-center gap-2">
               <span className="text-sm text-muted-foreground hidden md:inline">期数：</span>
               <div className="flex bg-muted p-1 rounded-md">
                {(['全部', '一期', '二期'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1 rounded-sm text-xs md:text-sm transition-all ${
                      period === p ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
           </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <RoleCard
            title="教练/志愿者答疑"
            loading={csLoading}
            total={coachStudent?.coach?.summary?.total || 0}
            answerTotal={coachStudent?.coach?.summary?.coachAnswerTotal || 0}
            active={coachStudent?.coach?.summary?.coachActive || 0}
            items={() => {
	              const base = coachStudent?.coach?.list || [];
	      return base.map((b: any) => ({
	        id: b.id,
	        name: b.name,
	        messageCount: b.messageCount,
	        answerCount: b.answerCount,
	        score: b.score,
	        tags: [b.period, ...(b.tags || [])].filter(Boolean),
      }));
    }}
            icon="UserCheck2"
            linkPrefix="/community/coach"
          />
          <RoleCard
            title="学员发言"
            loading={csLoading}
            total={coachStudent?.student?.summary?.total || 0}
            active={coachStudent?.student?.summary?.studentActive || 0}
            items={() =>
	        (coachStudent?.student?.list || []).map((item: any) => ({
	          id: item.id,
	          name: item.name,
	          messageCount: item.messageCount,
	          answerCount: item.answerCount,
	          score: item.score,
	          tags: [item.period, ...(item.tags || [])].filter(Boolean),
        }))
      }
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
  items:
    | { id?: string; name: string; messageCount?: number; answerCount?: number; score?: number; tags?: string[] }[]
    | (() => { id?: string; name: string; messageCount?: number; answerCount?: number; score?: number; tags?: string[] }[]);
  loading: boolean;
  icon: string;
  linkPrefix?: string;
}) {
  const resolvedItems = typeof items === 'function' ? items() : items;
  const isPrivacyMode = process.env.NEXT_PUBLIC_PRIVACY_MODE === 'true';

  const displayName = (raw?: string) => {
    if (!raw) return '';
    // 去掉产品线和角色前缀，如 "AI产品出海-coach-xxx" -> "xxx"
    return raw
      .replace(/^AI产品出海[-_]/, '')
      .replace(/^(coach|student|volunteer)[-_]/i, '')
      .trim();
  };

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
              <div
                key={`${item.id || item.name}-${idx}`}
                className="flex items-center justify-between border-b pb-2 last:border-b-0 last:pb-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs w-6 text-right">{idx + 1}</span>
                  {linkPrefix ? (
                    <Link
                      href={`${linkPrefix}/${encodeURIComponent(String(item.id || item.name))}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {isPrivacyMode ? 'Masked User' : displayName(item.name)}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium">{isPrivacyMode ? 'Masked User' : displayName(item.name)}</span>
                  )}
                  {/* render tags */}
                  {item.tags && item.tags.length > 0 && (
                      <div className="flex gap-1">
                          {item.tags.map(t => (
                              <Badge key={t} variant="secondary" className="text-[10px] h-4 px-1">{t}</Badge>
                          ))}
                      </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex gap-3 items-center">
                  {item.score !== undefined && (
                    <span className="text-foreground font-semibold">Score {item.score}</span>
                  )}
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

function SectionList({ title, items }: { title: string; items: any[] }) {
  if (!items || items.length === 0) {
    return (
      <div className="border rounded-md p-3">
        <div className="text-sm font-semibold mb-2">{title}</div>
        <div className="text-xs text-muted-foreground">暂无数据</div>
      </div>
    );
  }
  return (
    <div className="border rounded-md p-3">
      <div className="text-sm font-semibold mb-2">{title}</div>
      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex flex-col gap-1">
            <div className="text-sm font-medium text-foreground/90">{item.title || item.nickname || item.detail}</div>
            {item.detail && <div className="text-xs text-muted-foreground">{item.detail}</div>}
            {item.status && <div className="text-xs text-muted-foreground">{item.status}</div>}
            {(item.suggestion || item.extra) && (
              <div className="text-xs text-primary/90">
                {Array.isArray(item.suggestion)
                  ? item.suggestion.join(' / ')
                  : Array.isArray(item.extra)
                    ? item.extra.join(' / ')
                    : item.suggestion || item.extra}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
