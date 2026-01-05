'use client';

import { useEffect, useMemo, useState } from "react";
import { format, isSameDay } from "date-fns";
import { CalendarIcon, TrendingUp } from "lucide-react";

import { Calendar } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Button } from "@/shared/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/shared/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import { getDashboardStatsV2 as getDashboardStats } from "@/actions/community-v2-actions";
import { SmartIcon } from "@/shared/blocks/common";
import { ChartsSection } from "./charts-section";

// Define Interfaces
export interface Report {
  id: string;
  reportDate: string | Date;
  messageCount: number;
  questionCount: number;
  goodNewsCount: number;
  resolutionRate?: number | null;
  avgResponseTime?: number | null;
  groupName: string;
  productLine: string;
  // Enhanced fields
  goodNewsParsed?: any[];
  questions?: any[];
  kocs?: any[];
  richInsight?: any;
}

export interface MonitoringViewProps {
  initialProductLine?: string;
  title?: string;
  hideHeader?: boolean;
}

type RichDailyInsight = any;

type BriefQuestion = {
  group: string;
  question: string;
  author?: string;
  date?: string | Date;
  waitMins?: number | null;
};

type BriefKocLead = {
  id?: string;
  name: string;
  title: string;
  tags: string[];
  score?: number | null;
  group: string;
};

type BriefGoodNews = {
  content: string;
  author?: string;
  group: string;
};

type BriefSignal = {
  title: string;
  detail?: string;
  action?: string;
  level?: 'high' | 'medium' | 'low';
};

// Helper Functions
function sortGroupNames(a: string, b: string) {
  const matchA = a.match(/(\d+)期(\d+)群/);
  const matchB = b.match(/(\d+)期(\d+)群/);
  
  if (matchA && matchB) {
    const periodA = parseInt(matchA[1]);
    const periodB = parseInt(matchB[1]);
    if (periodA !== periodB) return periodA - periodB;
    
    const groupA = parseInt(matchA[2]);
    const groupB = parseInt(matchB[2]);
    return groupA - groupB;
  }
  
  return a.localeCompare(b);
}

function normalizeKocTags(input?: unknown): string[] {
  if (!input) return [];
  const list = Array.isArray(input) ? input : String(input).split(/[，,\/、|｜]/);
  return Array.from(new Set(list.map((tag) => String(tag).trim()).filter(Boolean)));
}

function parseKocContribution(raw?: string | null) {
  const detail: { title?: string; tags?: string[]; reason?: string } = {};
  if (!raw) return detail;
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const parts = line.split(/[:：]/);
      if (parts.length < 2) return;
      const key = parts.shift()?.trim();
      const value = parts.join(":").trim();
      if (!key || !value) return;
      if (key === "标题") detail.title = value;
      if (key === "标签") detail.tags = normalizeKocTags(value);
      if (key === "入选理由") detail.reason = value;
    });
  return detail;
}

function getKocSummary(koc: any) {
  const parsed = parseKocContribution(koc?.contribution);
  const title = koc?.title || koc?.suggestedTitle || parsed.title || "";
  const reason = koc?.reason || parsed.reason || "";
  const summary =
    title ||
    reason ||
    koc?.contribution ||
    koc?.value ||
    koc?.summary ||
    "";
  return summary.trim();
}

// Mock Data
const MOCKED_INSIGHTS: Record<string, any> = {};

export function MonitoringView({ initialProductLine, title, hideHeader }: MonitoringViewProps) {
  const [stats, setStats] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductLine, setSelectedProductLine] = useState<string>(initialProductLine || 'all');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // Extract Groups & Structure based on current Product Line
  const { availableGroups, periodGroups, periods } = useMemo(() => {
    if (!stats.length) return { availableGroups: [], periodGroups: {}, periods: [] };
    
    let filtered = stats;
    // If specific product line is selected, filter groups by it
    if (selectedProductLine !== 'all') {
      filtered = stats.filter(r => r.productLine === selectedProductLine);
    }
    
    const uniqueGroups = Array.from(new Set(filtered.map(r => r.groupName))).filter(Boolean).sort(sortGroupNames);
    
    // Group by Period
    const grouped: Record<string, string[]> = {};
    uniqueGroups.forEach(g => {
        const match = g.match(/(\d+)期/);
        const period = match ? `${match[1]}期` : '其他';
        if (!grouped[period]) grouped[period] = [];
        grouped[period].push(g);
    });
    
    const relevantPeriods = Object.keys(grouped).sort();

    return { availableGroups: uniqueGroups, periodGroups: grouped, periods: relevantPeriods };
  }, [stats, selectedProductLine]);

  // Set default period
  const [selectedPeriod, setSelectedPeriod] = useState<string>('all');
  
  // Update selected period when periods change
  useEffect(() => {
      if (periods.length > 0 && selectedPeriod !== 'all' && !periods.includes(selectedPeriod)) {
          setSelectedPeriod('all');
      }
  }, [periods, selectedPeriod]);


  // Auto-select first group when product line changes or data loads
  useEffect(() => {
      async function fetchStats() {
        try {
          const data = await getDashboardStats();
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

  // Compute Metrics
  const { targetDate, historicalReports, actionBrief } = useMemo(() => {
    if (!stats.length) {
      return { 
          targetDate: null, 
          filteredReports: [], 
          anomalies: [], 
          kpis: { messages: 0, questions: 0, goodNews: 0, resolutionRate: 0, msgChange: 0 },
          unresolvedQuestions: [],
          highlights: [],
          historicalReports: [],
          richInsight: null,
          actionBrief: {
            dateLabel: '',
            questions: [],
            kocLeads: [],
            goodNews: [],
            signals: [],
            hasValue: false,
          }
      };
    }

    // 1. Determine "Today" (Target Date)
    // If user selected a date, use it. Otherwise use latest from stats.
    let target: Date;
    if (selectedDate) {
        target = selectedDate;
    } else {
        const dates = stats.map((r) => new Date(r.reportDate));
        target = new Date(Math.max(...dates.map((d) => d.getTime())));
    }
    
    // Previous Day for Comparison
    const prev = new Date(target);
    prev.setDate(target.getDate() - 1);
    
    const isTarget = (d: string | Date | Date) => isSameDay(new Date(d), target);
    const isPrev = (d: string | Date | Date) => isSameDay(new Date(d), prev);

    // 2. Filter by Product Line (Historical Data)
    let currentReports = stats;
    if (selectedProductLine && selectedProductLine !== 'all') {
        currentReports = stats.filter(r => r.productLine === selectedProductLine);
    }
    
    // 3. Filter by Group (If selected)
    // Logic: If 'all' is selected, include all.
    // If a specific group is selected, filter by it.
    // 3. Filter by Period & Group
    if (selectedGroup && selectedGroup !== 'all') {
        currentReports = currentReports.filter(r => r.groupName === selectedGroup);
    } else if (selectedPeriod && selectedPeriod !== 'all') {
        // If Group is 'all' but Period is specific, filter by Period
        // We can use the logic that period names are usually part of group names, OR check against the computed period groups
        const validGroups = periodGroups[selectedPeriod] || [];
        currentReports = currentReports.filter(r => validGroups.includes(r.groupName));
    }

    // 4. Get Target and Prev Data for Ring-over-Ring
    const yReports = currentReports.filter(r => isTarget(r.reportDate));
    const pReports = currentReports.filter(r => isPrev(r.reportDate));
    
    // Map prev day for comparison
    const prevMap = new Map<string, Report>();
    pReports.forEach(r => prevMap.set(`${r.productLine}-${r.groupName}`, r));

    // ... (keep existing KPI aggregation logic)
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
    
    const aggPrev = pReports.reduce((acc, cur) => { acc.messages += cur.messageCount; return acc; }, { messages: 0 });

    const kpi = {
      messages: agg.messages,
      questions: agg.questions,
      goodNews: agg.goodNews,
      resolutionRate: agg.resCnt ? Math.round(agg.resSum / agg.resCnt) : 0,
      msgChange: aggPrev.messages > 0 ? Math.round(((agg.messages - aggPrev.messages) / aggPrev.messages) * 100) : 0
    };

    // ... (keep existing Anomaly, Unresolved, Highlight logic)
    const anomaliesList: any[] = [];
    yReports.forEach((r) => {
        const prevR = prevMap.get(`${r.productLine}-${r.groupName}`);
        
        // 1. Low Resolution
        if ((r.resolutionRate ?? 100) < 80) {
            const unresolvedQ = r.questions?.find((q: any) => !q.a || q.a.length < 2);
            anomaliesList.push({
                type: 'low_res',
                title: '解决率低',
                value: `${r.resolutionRate}%`,
                group: r.groupName,
                desc: '有提问未闭环',
                example: unresolvedQ ? `例：${unresolvedQ.content || unresolvedQ.q || unresolvedQ.text}` : undefined,
                action: '联系管理员跟进'
            });
        }
        // 2. High Response Time
        if ((r.avgResponseTime ?? 0) > 30) { 
             const slowQ = r.questions?.sort((a: any, b: any) => (b.waitMins || 0) - (a.waitMins || 0))[0];
             anomaliesList.push({
                type: 'slow_resp',
                title: '响应慢',
                value: `${r.avgResponseTime}m`,
                group: r.groupName,
                desc: '平均响应超30分钟',
                example: slowQ ? `例：${slowQ.content || slowQ.q || slowQ.text} (${slowQ.waitMins}m)` : undefined,
                action: '检查值班情况'
            });
        }
        // 3. Message Spike
        if (prevR) {
            const diff = r.messageCount - prevR.messageCount;
            const pct = prevR.messageCount > 20 ? (diff / prevR.messageCount) * 100 : 0;
            if (pct > 100) {
                 anomaliesList.push({
                    type: 'spike',
                    title: '消息暴涨',
                    value: `+${Math.round(pct)}%`,
                    group: r.groupName,
                    desc: '热度异常上升',
                    action: '查看是否有热点或风险'
                });
            }
        }
    });

    const unresolved: BriefQuestion[] = [];
    yReports.forEach(r => {
        if (r.questions) {
            r.questions.forEach(q => {
               const answerText = typeof q.a === 'string' ? q.a : '';
               const resolved = q.isResolved === true || answerText.trim().length > 0;
               if (!resolved) {
                   unresolved.push({
                       group: r.groupName,
                       question: q.content || q.q || q.text || '未获取到问题内容',
                       author: q.author || '未知',
                       date: q.questionTime || r.reportDate,
                       waitMins: typeof q.waitMins === 'number' ? q.waitMins : null,
                   });
               }
            });
        }
    });

    // Deduplicate highlights across groups on the same day
    const normalizeContent = (str: string) =>
      (str || '')
        .toLowerCase()
        .replace(/模版/g, '模板')
        .replace(/\s+/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '');

    const normalizeAuthor = (str: string) =>
      (str || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '');

    const isSimilar = (a: string, b: string) => {
      if (!a || !b) return false;
      if (a === b) return true;
      const setA = new Set(a.split(''));
      const setB = new Set(b.split(''));
      const overlap = Array.from(setA).filter((ch) => setB.has(ch)).length;
      const ratio = overlap / Math.min(setA.size, setB.size || 1);
      return ratio >= 0.8;
    };

    const highlightList: any[] = [];
    const mergeHighlight = (incoming: any) => {
        for (let i = 0; i < highlightList.length; i++) {
            const existing = highlightList[i];
            const sameDate = incoming.date === existing.date;
            const authorMatch = incoming._authorKey && existing._authorKey === incoming._authorKey;
            const contentMatch = isSimilar(incoming._normContent, existing._normContent);
            if (sameDate && ((incoming._authorKey && authorMatch) || contentMatch)) {
                if (incoming.content.length > existing.content.length) {
                    highlightList[i] = { ...incoming, group: existing.group };
                }
                const groups = new Set(`${highlightList[i].group}`.split('/').map((g: string) => g.trim()).filter(Boolean));
                groups.add(incoming.group);
                highlightList[i].group = Array.from(groups).join(' / ');
                return;
            }
        }
        highlightList.push(incoming);
    };

    yReports.forEach(r => {
        const dateStr = new Date(r.reportDate).toISOString().split('T')[0];
        if (r.goodNewsParsed) {
            r.goodNewsParsed.forEach((g: any) => {
                const normContent = normalizeContent(g.content || '');
                const authorKey = normalizeAuthor(g.author || '');
                mergeHighlight({
                    type: 'good_news',
                    content: (g.content || '').trim(),
                    group: r.groupName,
                    date: dateStr,
                    _normContent: normContent,
                    _authorKey: authorKey
                });
            });
        }
        if (r.kocs) {
             r.kocs.forEach((k: any) => {
                const summary = getKocSummary(k);
                const normalized = summary ? `${k.kocName}: ${summary}`.trim() : `${k.kocName || ''}`.trim();
                mergeHighlight({
                    type: 'koc',
                    content: normalized,
                    group: r.groupName,
                    date: dateStr,
                    _normContent: normalizeContent(normalized),
                    _authorKey: normalizeAuthor(k.kocName || '')
                });
             });
        }
    });

    const highlightItems = highlightList;
    const targetDateStr = target.toISOString().split('T')[0];

    const briefQuestions: BriefQuestion[] = unresolved.map((q) => ({
      group: q.group,
      question: q.question,
      author: q.author,
      date: q.date,
      waitMins: typeof q.waitMins === 'number' ? q.waitMins : null,
    }));

    const kocLeads: BriefKocLead[] = [];
    const kocSeen = new Set<string>();
    yReports.forEach((r) => {
      (r.kocs || []).forEach((k: any) => {
        const title = getKocSummary(k);
        if (!title) return;
        const name = k.kocName || k.author || '匿名';
        const key = `${normalizeAuthor(name)}:${normalizeContent(title)}`;
        if (kocSeen.has(key)) return;
        kocSeen.add(key);
        kocLeads.push({
          id: k.id,
          name,
          title,
          tags: normalizeKocTags(k.tags || k.detail?.tags || []),
          score: k.score?.total ?? k.scoreTotal ?? null,
          group: r.groupName,
        });
      });
    });
    kocLeads.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const goodNewsItems: BriefGoodNews[] = [];
    const goodNewsSeen = new Set<string>();
    yReports.forEach((r) => {
      (r.goodNewsParsed || []).forEach((g: any) => {
        const content = String(g.content || '').trim();
        if (!content) return;
        const author = String(g.author || '').trim();
        const key = `${normalizeAuthor(author)}:${normalizeContent(content)}`;
        if (goodNewsSeen.has(key)) return;
        goodNewsSeen.add(key);
        goodNewsItems.push({
          content,
          author: author || undefined,
          group: r.groupName,
        });
      });
    });

    const signals: BriefSignal[] = [];
    const avgWindowDays = 7;
    const windowStart = new Date(target);
    windowStart.setDate(windowStart.getDate() - avgWindowDays);
    const lastWindow = currentReports.filter((r) => {
      const d = new Date(r.reportDate);
      return d < target && d >= windowStart;
    });
    const avgMessages =
      lastWindow.length > 0
        ? Math.round(lastWindow.reduce((sum, r) => sum + r.messageCount, 0) / lastWindow.length)
        : 0;
    if (avgMessages > 0 && agg.messages < avgMessages * 0.6) {
      signals.push({
        title: '活跃度下滑',
        detail: `昨日 ${agg.messages} 条，近${avgWindowDays}日均值 ${avgMessages} 条`,
        action: '建议发起话题/活动拉活跃',
        level: 'medium',
      });
    }
    if (kpi.questions > 0 && kpi.resolutionRate < 80) {
      signals.push({
        title: '解决率偏低',
        detail: `昨日解决率 ${kpi.resolutionRate}%`,
        action: '补充答疑或提醒教练跟进',
        level: 'high',
      });
    }
    if (kpi.goodNews === 0) {
      signals.push({
        title: '昨日无已审核好事',
        action: '检查好事审核或引导学员分享',
        level: 'low',
      });
    }

    const actionBrief = {
      dateLabel: targetDateStr,
      questions: briefQuestions.slice(0, 8),
      kocLeads: kocLeads.slice(0, 8),
      goodNews: goodNewsItems.slice(0, 8),
      signals,
      hasValue:
        briefQuestions.length > 0 ||
        kocLeads.length > 0 ||
        goodNewsItems.length > 0 ||
        signals.length > 0,
    };

    // Check for Rich Insight
    let insight = null;
    if (selectedGroup && selectedGroup !== 'all') {
         // Try exact match
         const key = `${selectedGroup}-${targetDateStr}`;
         insight = MOCKED_INSIGHTS[key];
         if (!insight) {
            const yReport = yReports.find(r => r.groupName === selectedGroup);
            if (yReport && yReport.richInsight) {
                insight = yReport.richInsight;
            }
         }
    }

    return {
        targetDate: target,
        filteredReports: yReports,
        anomalies: anomaliesList,
        kpis: kpi,
        unresolvedQuestions: unresolved,
        highlights: highlightItems,
        historicalReports: currentReports,
        richInsight: insight,
        actionBrief
    };
  }, [
    stats,
    selectedProductLine,
    selectedGroup,
    selectedDate,
    periodGroups,
    selectedPeriod,
  ]);

  const displayTitle = title || (selectedProductLine === 'all' ? '全站昨日监测' : `${selectedProductLine} - 数据看板`);
  if (hideHeader && !actionBrief.hasValue) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header & Filter */}
      {!hideHeader && (
      <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold tracking-tight mr-4">{displayTitle}</h1>
              
              {/* 1. Date Selector */}
              <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">日期:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant={"outline"}
                            className={cn(
                                "w-[140px] justify-start text-left font-normal",
                                !targetDate && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {targetDate ? format(targetDate, "yyyy/MM/dd") : <span>Pick a date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={setSelectedDate}
                            initialFocus
                        />
                    </PopoverContent>
                  </Popover>
              </div>

               {/* 2. Unified Scope Selector */}
               {(selectedProductLine !== 'all' || initialProductLine) && periods.length > 0 && (
                   <div className="flex items-center gap-2">
                       <span className="text-sm font-medium text-muted-foreground">范围:</span>
                       <Select 
                            value={
                                selectedPeriod === 'all' 
                                  ? 'all' 
                                  : selectedGroup === 'all' 
                                    ? `period:${selectedPeriod}` 
                                    : `group:${selectedGroup}`
                            }
                            onValueChange={(v) => {
                                if (v === 'all') {
                                    setSelectedPeriod('all');
                                    setSelectedGroup('all');
                                } else if (v.startsWith('period:')) {
                                    setSelectedPeriod(v.replace('period:', ''));
                                    setSelectedGroup('all');
                                } else if (v.startsWith('group:')) {
                                    const g = v.replace('group:', '');
                                    setSelectedGroup(g);
                                    // Reverse lookup period if needed, or rely on existing period if it matches
                                    // Ideally we find which period this group belongs to:
                                    const p = periods.find(p => periodGroups[p]?.includes(g));
                                    if (p) setSelectedPeriod(p);
                                }
                            }}
                        >
                            <SelectTrigger className="w-[160px]">
                                <SelectValue placeholder="选择范围" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[500px]">
                                <SelectItem value="all" className="font-bold">全部群组 (总览)</SelectItem>
                                {periods.map(p => (
                                    <SelectGroup key={p}>
                                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/30 mt-1">
                                            {p}
                                        </div>
                                        <SelectItem value={`period:${p}`} className="pl-4">
                                            <span className="font-medium">📌 {p}汇总</span>
                                        </SelectItem>
                                        {(periodGroups[p] || []).map(g => {
                                            // Name Simplification Logic:
                                            // 1. Remove Product Line
                                            // 2. Remove Period
                                            // 3. Remove connecting symbols (-/_)
                                            const simpleName = g
                                                .replace(selectedProductLine, '')
                                                .replace(p, '')
                                                .replace(/^[-_\s]+/, '');
                                            return (
                                                <SelectItem key={g} value={`group:${g}`} className="pl-6 text-muted-foreground data-[state=checked]:text-foreground">
                                                    {simpleName || g}
                                                </SelectItem>
                                            )
                                        })}
                                    </SelectGroup>
                                ))}
                            </SelectContent>
                        </Select>
                   </div>
               )}

               {/* Removed Obsolete Group Selector */}
            </div>

            {/* Product Line Switcher (Far Right) */}
            <div className="flex items-center gap-2">
                <Select 
                    value={selectedProductLine} 
                    onValueChange={(v) => {
                        setSelectedProductLine(v);
                        setSelectedGroup('all'); 
                        setSelectedPeriod(periods[0] || 'all');
                    }} 
                    disabled={!!initialProductLine}
                >
                    <SelectTrigger className="w-[160px] border-none bg-transparent hover:bg-accent text-right font-medium text-muted-foreground">
                        <SelectValue placeholder="切换视角" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全站总览</SelectItem>
                        <SelectItem value="AI产品出海">AI产品出海</SelectItem>
                        <SelectItem value="YouTube AI视频">YouTube AI视频</SelectItem>
                        <SelectItem value="B站好物">B站好物</SelectItem>
                    </SelectContent>
                </Select>
            </div>
          </div>
      </div>
      )}
      <div className="flex items-center gap-2 mt-4 pb-2 border-b">
        <SmartIcon name="Activity" className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold tracking-tight">每日行动简报</h2>
        {actionBrief.dateLabel && (
          <span className="text-xs text-muted-foreground">
            {actionBrief.dateLabel}
          </span>
        )}
      </div>

      {actionBrief.hasValue ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {actionBrief.questions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SmartIcon name="ListTodo" className="h-5 w-5 text-blue-500" />
                  待跟进问题 ({actionBrief.questions.length})
                </CardTitle>
                <CardDescription>需要运营/教练跟进的未闭环提问</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                {actionBrief.questions.map((q, idx) => (
                  <div key={idx} className="rounded border p-3 text-sm bg-muted/20">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
                      <Badge variant="outline" className="text-blue-600 bg-blue-50 border-blue-200">
                        {q.group}
                      </Badge>
                      <span>{q.author || '未知'}</span>
                      {q.waitMins != null && <span>等待 {q.waitMins} 分钟</span>}
                    </div>
                    <div className="text-foreground/90">{q.question}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {actionBrief.kocLeads.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SmartIcon name="Sparkles" className="h-5 w-5 text-amber-500" />
                  可约稿线索 ({actionBrief.kocLeads.length})
                </CardTitle>
                <CardDescription>优先联系可产出内容的人选</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                {actionBrief.kocLeads.map((koc, idx) => (
                  <div key={`${koc.name}-${idx}`} className="rounded border p-3 text-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{koc.name}</span>
                      {koc.score != null && <span>评分 {koc.score}</span>}
                    </div>
                    <div className="text-foreground/90 font-medium">{koc.title}</div>
                    {koc.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {koc.tags.slice(0, 4).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 text-xs text-muted-foreground">{koc.group}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {actionBrief.goodNews.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SmartIcon name="Trophy" className="h-5 w-5 text-rose-500" />
                  已审核好事 ({actionBrief.goodNews.length})
                </CardTitle>
                <CardDescription>适合扩散的高光案例</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[360px] overflow-y-auto pr-2">
                {actionBrief.goodNews.map((gn, idx) => (
                  <div key={`${gn.content}-${idx}`} className="rounded border p-3 text-sm">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{gn.author || '未注明'}</span>
                      <span>{gn.group}</span>
                    </div>
                    <div className="text-foreground/90">{gn.content}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {actionBrief.signals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <SmartIcon name="AlertTriangle" className="h-5 w-5 text-orange-500" />
                  健康提醒 ({actionBrief.signals.length})
                </CardTitle>
                <CardDescription>需要运营介入的风险信号</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {actionBrief.signals.map((signal, idx) => (
                  <div key={`${signal.title}-${idx}`} className="rounded border p-3 text-sm bg-orange-50/40">
                    <div className="flex items-center gap-2 font-medium text-orange-700">
                      <span>{signal.title}</span>
                      {signal.level && (
                        <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-200">
                          {signal.level === 'high' ? '高优先' : signal.level === 'medium' ? '中优先' : '低优先'}
                        </Badge>
                      )}
                    </div>
                    {signal.detail && <div className="mt-1 text-xs text-muted-foreground">{signal.detail}</div>}
                    {signal.action && <div className="mt-2 text-xs text-primary">建议：{signal.action}</div>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        !hideHeader && (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              暂无需要处理的行动项。
            </CardContent>
          </Card>
        )
      )}

       {/* 1. Historical Charts (Moved to Bottom) */}
       {!hideHeader && !loading && historicalReports.length > 0 && (
           <div className="pt-8 border-t mb-8">
               <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-5 h-5 text-muted-foreground" />
                    <h2 className="text-lg font-semibold tracking-tight text-muted-foreground">数据趋势参考 (近30天)</h2>
                </div>
               <ChartsSection 
                 data={historicalReports} 
                 fixedProductLine={initialProductLine || selectedProductLine} 
                 showValue={false} 
                 showFilters={false} 
               />
           </div>
       )}

      {/* 群组明细数据表：隐藏 */}
    </div>
  );
}

function KpiCard({ title, value, icon, sub, color }: any) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <SmartIcon name={icon} className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", color)}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// --- New Component: DailyDetailedReview ---
function DailyDetailedReview({ insight }: { insight: RichDailyInsight }) {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            {/* Top Row: Activity & Response */}
            <div className="grid md:grid-cols-2 gap-6">
                {/* 1. Activity Characteristics */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <SmartIcon name="Activity" className="h-5 w-5 text-primary" />
                            群活跃特征
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="text-2xl font-bold">{insight.activitySummary.total} <span className="text-sm font-normal text-muted-foreground">条消息</span></div>
                            <div className="flex gap-2">
                                {insight.activitySummary.tags.map((tag: string) => (
                                    <Badge key={tag} variant="secondary">{tag}</Badge>
                                ))}
                            </div>
                        </div>

                        {insight.activitySummary.narrative && (
                            <div className="pt-4 border-t">
                                <span className="text-xs font-semibold text-muted-foreground block mb-2">活跃画像</span>
                                <div className="text-sm text-foreground/90 leading-relaxed bg-muted/30 p-3 rounded-md">
                                    {insight.activitySummary.narrative}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* 2 & 3. Question & Speed */}
                <Card className="flex flex-col">
                     <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <SmartIcon name="Zap" className="h-5 w-5 text-blue-500" />
                            响应与解决
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6 flex-1">
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <div className="text-sm text-muted-foreground mb-1">平均响应</div>
                                <div className="text-xl font-bold">{insight.responseSpeed.avg} <span className="text-xs text-green-500 bg-green-50 px-1 rounded">极速</span></div>
                                <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{insight.responseSpeed.example}</div>
                             </div>
                             <div>
                                <div className="text-sm text-muted-foreground mb-1">解决率</div>
                                <div className="text-xl font-bold text-green-600">{insight.resolution.rate}</div>
                                <div className="text-xs text-muted-foreground mt-1">所有提问均闭环</div>
                             </div>
                        </div>
                        
                        {/* Question Categories (New) */}
                        {insight.questionAnalysis.categories && (
                            <div className="pt-2 border-t">
                                <span className="text-xs font-semibold text-muted-foreground block mb-2">问题分布</span>
                                <div className="space-y-2">
                                    {insight.questionAnalysis.categories.map((cat: any, i: number) => (
                                        <div key={i} className="text-sm">
                                            <div className="flex justify-between mb-1">
                                                <span className="font-medium text-xs">{cat.name}</span>
                                                <span className="text-xs text-muted-foreground">{cat.percentage}</span>
                                            </div>
                                            <div className="text-xs text-muted-foreground bg-slate-50 p-1.5 rounded truncate">
                                                {cat.examples.join('、')}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Unresolved Questions Warning (New) */}
                        {insight.unresolvedQuestions && insight.unresolvedQuestions.length > 0 && (
                            <div className="pt-2 border-t">
                                <div className="flex items-center gap-2 mb-2 text-orange-600">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span className="text-xs font-bold">待跟进 ({insight.unresolvedQuestions.length})</span>
                                </div>
                                <div className="space-y-2">
                                    {insight.unresolvedQuestions.slice(0, 3).map((uq: any, i: number) => (
                                        <div key={i} className="text-xs bg-orange-50 border border-orange-100 p-2 rounded">
                                            <div className="flex justify-between font-medium text-orange-700 mb-1">
                                                <span>{uq.asker}</span>
                                                <span>{uq.waitDuration}</span>
                                            </div>
                                            <div className="text-orange-800/80 truncate">
                                                {uq.question}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}


                    </CardContent>
                </Card>
            </div>

            {/* Middle Row: People (Star Users & KOCs) */}
            <div className="grid md:grid-cols-2 gap-6">
                {/* 6. Star Students */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5 text-indigo-500" />
                            标杆学员识别
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {insight.starStudents.map((s: any, i: number) => (
                            <div key={i} className="bg-indigo-50/50 p-4 rounded-lg space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="font-semibold text-indigo-700">{s.name}</div>
                                    <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">{s.role}</Badge>
                                </div>
                                <div className="text-sm">
                                    <span className="font-medium text-muted-foreground">价值：</span>{s.value}
                                </div>
                                <div className="text-sm">
                                    <span className="font-medium text-muted-foreground">行为：</span>{s.action}
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* 7. KOCs */}
                <Card>
                    <CardHeader>
                         <CardTitle className="flex items-center gap-2">
                            <Lightbulb className="h-5 w-5 text-amber-500" />
                            分享官 (KOC)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {insight.kocs.map((k: any, i: number) => (
                            <div key={i} className="flex gap-4 items-start p-3 border rounded-lg hover:bg-accent/50 transition-colors">
                                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 font-bold shrink-0">
                                    {k.name[0]}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium">{k.name}</span>
                                        <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200">{k.role}</span>
                                    </div>
                                    <div className="text-sm text-muted-foreground">{getKocSummary(k)}</div>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>

            {/* Bottom Row: Action List */}
            <Card className="border-l-4 border-l-primary/50">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <SmartIcon name="ListTodo" className="h-5 w-5 text-primary" />
                        下一步运营清单 (Action List)
                    </CardTitle>
                    <CardDescription>针对本群“{insight.activitySummary.tags.join('、')}”特点建议执行</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                        {insight.actionList.map((action: any, i: number) => (
                            <div key={i} className="flex flex-col gap-3 p-4 rounded-lg bg-secondary/20 border">
                                <div className="flex items-center gap-2">
                                     <Badge variant="outline">{action.type}</Badge>
                                     <span className="font-semibold text-sm">{action.title}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                    <strong>背景：</strong> {action.bg}
                                </div>
                                <div className="mt-auto pt-3 border-t text-sm font-medium text-primary">
                                    👉 动作：{action.action}
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
