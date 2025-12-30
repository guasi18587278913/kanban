'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { SmartIcon } from '@/shared/blocks/common';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from '@/shared/components/ui/chart';

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

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toISOString().slice(0, 10);
}

type MemberTag = {
  id: string;
  tagCategory: string;
  tagName: string;
  tagValue?: string | null;
  confidence?: string | null;
  source?: string | null;
  updatedAt?: string | null;
};

type DerivedTag = {
  category: string;
  name: string;
  evidence?: string | null;
  level?: 'high' | 'medium' | 'low';
};

type ActivitySummary = {
  rangeDays: number;
  rangeStart: string;
  rangeEnd: string;
  totalMessages: number;
  daily: { date: string; count: number }[];
  hourly: { hour: string; count: number }[];
};

const ACTIVITY_CHART_CONFIG: ChartConfig = {
  count: {
    label: '消息数',
    color: 'var(--chart-2)',
  },
};

const LLM_TAG_CATEGORY_LABELS: Record<string, string> = {
  stage: '阶段',
  intent: '需求',
  niche: '方向',
  risk: '风险',
};

const LLM_TAG_CATEGORY_ORDER = ['stage', 'intent', 'niche', 'risk'];

const LLM_TAG_CATEGORY_LIMITS: Record<string, number> = {
  stage: 1,
  intent: 2,
  niche: 2,
  risk: 2,
};

const WEAK_NICHE_TAGS = new Set(['AI工具', 'AI应用', '工具', '工具类', 'AI产品', 'AI']);
const WEAK_GENERIC_TAGS = new Set([
  '乐于助人',
  '热心',
  '积极',
  '正能量',
  '活跃',
  '高活跃',
  '中活跃',
  '低活跃',
  'positive',
  'neutral',
  '中性',
  '中立',
]);

function normalizeTagValue(value: string) {
  return value.replace(/\s+/g, '').trim().toLowerCase();
}

function confidenceRank(value?: string | null) {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  if (value === 'low') return 1;
  return 0;
}

function formatConfidence(value?: string | null) {
  if (value === 'high') return '高置信';
  if (value === 'medium') return '中置信';
  if (value === 'low') return '低置信';
  return null;
}

function formatPriority(value?: string | null) {
  if (value === 'high') return '高优先';
  if (value === 'medium') return '中优先';
  if (value === 'low') return '低优先';
  return null;
}

function priorityVariant(value?: string | null) {
  if (value === 'high') return 'destructive';
  if (value === 'medium') return 'outline';
  if (value === 'low') return 'secondary';
  return 'secondary';
}

function buildEvidence(value?: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (cleaned.length <= 120) return { short: cleaned, full: cleaned };
  return { short: `${cleaned.slice(0, 120)}...`, full: cleaned };
}

function buildActivitySummaryFromMessages(
  messages: Array<{ time: string | Date }>,
  rangeDays = 60
): ActivitySummary | null {
  if (!messages || messages.length === 0) return null;
  const summaryStart = new Date();
  summaryStart.setDate(summaryStart.getDate() - (rangeDays - 1));
  summaryStart.setHours(0, 0, 0, 0);

  const formatDateKey = (value: Date) => value.toISOString().slice(0, 10);
  const toDate = (value: unknown) => {
    if (!value) return null;
    if (value instanceof Date) return value;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  };

  const dailyCounts = new Map<string, number>();
  const hourlyCounts = Array.from({ length: 24 }, () => 0);
  let totalMessages = 0;

  messages.forEach((m) => {
    const dateObj = toDate(m.time);
    if (!dateObj || dateObj < summaryStart) return;
    totalMessages += 1;
    const key = formatDateKey(dateObj);
    dailyCounts.set(key, (dailyCounts.get(key) || 0) + 1);
    const hour = dateObj.getHours();
    if (hour >= 0 && hour < 24) {
      hourlyCounts[hour] += 1;
    }
  });

  const daily: { date: string; count: number }[] = [];
  const cursor = new Date(summaryStart);
  for (let i = 0; i < rangeDays; i += 1) {
    const key = formatDateKey(cursor);
    daily.push({ date: key, count: dailyCounts.get(key) || 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const hourly = hourlyCounts.map((count, hour) => ({
    hour: String(hour).padStart(2, '0'),
    count,
  }));

  return {
    rangeDays,
    rangeStart: formatDateKey(summaryStart),
    rangeEnd: formatDateKey(new Date()),
    totalMessages,
    daily,
    hourly,
  };
}

export default function StudentCrmDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/community/member/${slug}`);
        if (res.status === 404) {
          setError('未找到该学员，请检查链接或返回列表重新选择。');
          setData(null);
          return;
        }
        if (!res.ok) throw new Error(`加载失败: ${res.status}`);
        const json = await res.json();
        setData(json);
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [slug]);

  const displayName = data?.member?.nickname || (slug ? safeDecode(String(slug)) : '');
  const stats = data?.stats;
  const tagGroups = useMemo(() => {
    const grouped = new Map<string, MemberTag[]>();
    const seen = new Set<string>();
    const tags = Array.isArray(data?.tags) ? (data.tags as MemberTag[]) : [];

    tags.forEach((tag) => {
      const category = tag.tagCategory;
      if (!LLM_TAG_CATEGORY_LABELS[category]) return;
      const normalized = normalizeTagValue(tag.tagName || '');
      if (!normalized) return;
      const isManual = tag.source === 'manual';
      if (!isManual && WEAK_GENERIC_TAGS.has(normalized)) return;
      if (category === 'niche' && WEAK_NICHE_TAGS.has(normalized)) return;
      if (!isManual && confidenceRank(tag.confidence) < 2) return;
      if (!isManual && !tag.tagValue) return;

      const key = `${category}:${normalized}`;
      if (seen.has(key)) return;
      seen.add(key);

      const list = grouped.get(category) || [];
      list.push(tag);
      grouped.set(category, list);
    });

    const toTime = (value?: string | null) => {
      if (!value) return 0;
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    return LLM_TAG_CATEGORY_ORDER.flatMap((category) => {
      const list = grouped.get(category);
      if (!list || list.length === 0) return [];
      const sorted = list.sort((a, b) => {
        const confidence = confidenceRank(b.confidence) - confidenceRank(a.confidence);
        if (confidence !== 0) return confidence;
        return toTime(b.updatedAt) - toTime(a.updatedAt);
      });
      const limit = LLM_TAG_CATEGORY_LIMITS[category] ?? sorted.length;
      return [[category, sorted.slice(0, limit)] as [string, MemberTag[]]];
    });
  }, [data]);

  const derivedTagGroups = useMemo(() => {
    const grouped = new Map<string, DerivedTag[]>();
    const tags = Array.isArray(data?.derivedTags) ? (data.derivedTags as DerivedTag[]) : [];
    const rank = (value?: string | null) => {
      if (value === 'high') return 3;
      if (value === 'medium') return 2;
      if (value === 'low') return 1;
      return 0;
    };

    tags.forEach((tag) => {
      if (!tag?.category || !tag?.name) return;
      const list = grouped.get(tag.category) || [];
      list.push(tag);
      grouped.set(tag.category, list);
    });

    grouped.forEach((list, key) => {
      list.sort((a, b) => rank(b.level) - rank(a.level));
      grouped.set(key, list);
    });

    return grouped;
  }, [data]);

  const actionTags = [
    ...(derivedTagGroups.get('action') || []),
    ...(derivedTagGroups.get('risk') || []),
  ];
  const progressTags = [
    ...(derivedTagGroups.get('progress') || []),
    ...(derivedTagGroups.get('activity') || []),
  ];
  const achievementTags = derivedTagGroups.get('achievement') || [];

  const activitySummary = useMemo(() => {
    if (data?.activitySummary) return data.activitySummary as ActivitySummary;
    return buildActivitySummaryFromMessages(data?.messages || []);
  }, [data]);

  const activityMeta =
    activitySummary && activitySummary.totalMessages > 0
      ? `近${activitySummary.rangeDays}天（${activitySummary.rangeStart} ~ ${activitySummary.rangeEnd}）共 ${activitySummary.totalMessages} 条消息`
      : null;

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <div className="flex items-center gap-3">
        <SmartIcon name="Users" className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{displayName} 的学员 CRM</h1>
          <p className="text-sm text-muted-foreground">查看该学员的标签、提问/好事记录与互动时间线</p>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">加载失败：{error}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="总消息" value={stats?.totalMessages ?? 0} icon="MessageSquare" />
        <StatCard title="提问次数" value={stats?.questionCount ?? 0} icon="HelpCircle" />
        <StatCard title="好事贡献" value={stats?.goodNewsCount ?? 0} icon="Trophy" />
        <StatCard title="回答次数" value={stats?.answerCount ?? 0} icon="CheckCircle2" />
        <StatCard title="活跃天数" value={stats?.activeDays ?? 0} icon="Activity" />
        <StatCard title="KOC 贡献" value={stats?.kocContributions ?? 0} icon="Sparkles" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SmartIcon name="User" className="h-5 w-5 text-muted-foreground" />
            学员信息
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 text-sm md:grid-cols-3">
            <InfoItem label="星球编号" value={data?.member?.planetId || '-'} />
            <InfoItem label="微信号" value={data?.member?.wechatId || '-'} />
            <InfoItem label="期数" value={data?.member?.period || '-'} />
            <InfoItem label="状态" value={data?.member?.status || '-'} />
            <InfoItem label="加入时间" value={formatDate(data?.member?.joinDate)} />
            <InfoItem label="到期时间" value={formatDate(data?.member?.expireDate)} />
          </div>
        </CardContent>
      </Card>

      {/* 标签 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SmartIcon name="Tag" className="h-5 w-5 text-muted-foreground" />
            标签
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            优先展示可执行的运营信号与阶段/成果标签，AI 标签仅作为辅助参考。
          </p>
          {loading ? (
            <div className="py-4 text-sm text-muted-foreground">加载中...</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground mb-2">运营信号</div>
                {actionTags.length === 0 ? (
                  <div className="text-xs text-muted-foreground">暂无明显信号</div>
                ) : (
                  <div className="space-y-2">
                    {actionTags.map((tag, idx) => {
                      const evidence = buildEvidence(tag.evidence || undefined);
                      const priority = formatPriority(tag.level);
                      return (
                        <div key={`${tag.category}-${tag.name}-${idx}`} className="rounded border px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="text-[11px]">
                              {tag.name}
                            </Badge>
                            {priority && (
                              <Badge variant={priorityVariant(tag.level)} className="text-[10px]">
                                {priority}
                              </Badge>
                            )}
                          </div>
                          {evidence && (
                            <div className="text-xs text-muted-foreground mt-1" title={evidence.full}>
                              {evidence.short}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded border p-3">
                <div className="text-xs text-muted-foreground mb-2">进度 / 成果</div>
                {[...progressTags, ...achievementTags].length === 0 ? (
                  <div className="text-xs text-muted-foreground">暂无进度/成果标签</div>
                ) : (
                  <div className="space-y-2">
                    {[...progressTags, ...achievementTags].map((tag, idx) => {
                      const evidence = buildEvidence(tag.evidence || undefined);
                      const priority = formatPriority(tag.level);
                      return (
                        <div key={`${tag.category}-${tag.name}-${idx}`} className="rounded border px-3 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="text-[11px]">
                              {tag.name}
                            </Badge>
                            {priority && (
                              <Badge variant={priorityVariant(tag.level)} className="text-[10px]">
                                {priority}
                              </Badge>
                            )}
                          </div>
                          {evidence && (
                            <div className="text-xs text-muted-foreground mt-1" title={evidence.full}>
                              {evidence.short}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded border p-3 md:col-span-2">
                <div className="text-xs text-muted-foreground mb-2">AI 洞察标签</div>
                {tagGroups.length === 0 ? (
                  <div className="text-xs text-muted-foreground">暂无高置信 AI 标签</div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {tagGroups.map(([cat, list]) => (
                      <div key={cat} className="rounded border p-3">
                        <div className="text-xs text-muted-foreground mb-2">
                          {LLM_TAG_CATEGORY_LABELS[cat] || cat}
                        </div>
                        <div className="space-y-2">
                          {list.map((t) => {
                            const normalizedTag = normalizeTagValue(t.tagName || '').toLowerCase();
                            const normalizedEvidence = normalizeTagValue(t.tagValue || '').toLowerCase();
                            const evidence =
                              normalizedTag && normalizedEvidence.includes(normalizedTag)
                                ? buildEvidence(t.tagValue)
                                : null;
                            const confidence = formatConfidence(t.confidence);
                            return (
                              <div key={t.id} className="rounded border px-3 py-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="secondary" className="text-[11px]">
                                    {t.tagName}
                                  </Badge>
                                  {confidence && (
                                    <Badge variant="outline" className="text-[10px]">
                                      {confidence}
                                    </Badge>
                                  )}
                                </div>
                                {evidence ? (
                                  <div className="text-xs text-muted-foreground mt-1" title={evidence.full}>
                                    {evidence.short}
                                  </div>
                                ) : (
                                  <div className="text-xs text-muted-foreground mt-1">暂无引用</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SmartIcon name="HelpCircle" className="h-5 w-5 text-muted-foreground" />
            提问记录
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-sm text-muted-foreground">加载中...</div>
          ) : (data?.qa || []).length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">暂无提问记录。</div>
          ) : (
            <ScrollArea className="h-[360px] pr-3">
              <div className="space-y-3">
                {(data?.qa || []).map((q: any, idx: number) => (
                  <div key={idx} className="rounded border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
                      <span>{formatDate(q.questionTime)}</span>
                      <span>·</span>
                      <span>{q.productLine}</span>
                      <span>·</span>
                      <span>
                        {q.period}期{q.groupNumber}群
                      </span>
                      <Badge variant={q.isResolved ? 'secondary' : 'destructive'}>
                        {q.isResolved ? '已解决' : '未解决'}
                      </Badge>
                    </div>
                    <div className="text-sm font-medium mb-1">提问：{q.question}</div>
                    {q.answer && (
                      <div className="text-xs text-muted-foreground">回答：{q.answer}</div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SmartIcon name="Trophy" className="h-5 w-5 text-muted-foreground" />
            好事/高光
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-sm text-muted-foreground">加载中...</div>
          ) : (data?.goodNews || []).length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">暂无好事记录。</div>
          ) : (
            <ScrollArea className="h-[260px] pr-3">
              <div className="space-y-3">
                {(data?.goodNews || []).map((g: any, idx: number) => (
                  <div key={idx} className="rounded border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
                      <span>{new Date(g.date).toISOString().split('T')[0]}</span>
                      <span>·</span>
                      <span>{g.productLine}</span>
                      <span>·</span>
                      <span>
                        {g.period}期{g.groupNumber}群
                      </span>
                    </div>
                    <div className="text-sm">{g.content}</div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SmartIcon name="MessageSquare" className="h-5 w-5 text-muted-foreground" />
            互动时间线
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-sm text-muted-foreground">加载中...</div>
          ) : (
            <>
              {activitySummary && activitySummary.totalMessages > 0 ? (
                <div className="mb-4 space-y-3">
                  <div className="text-xs text-muted-foreground">{activityMeta}</div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded border p-3">
                      <div className="text-sm font-medium mb-2">活跃趋势</div>
                      <ChartContainer config={ACTIVITY_CHART_CONFIG} className="aspect-auto h-[180px] w-full">
                        <LineChart data={activitySummary.daily} margin={{ left: 8, right: 8 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            tickFormatter={(value) => String(value).slice(5)}
                          />
                          <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                          <ChartTooltip
                            cursor={false}
                            content={
                              <ChartTooltipContent
                                indicator="line"
                                labelFormatter={(value) => `日期 ${value}`}
                                formatter={(value) => (
                                  <div className="flex min-w-[120px] items-center text-xs text-muted-foreground">
                                    {value} 条
                                  </div>
                                )}
                              />
                            }
                          />
                          <Line
                            dataKey="count"
                            type="monotone"
                            stroke="var(--color-count)"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4 }}
                          />
                        </LineChart>
                      </ChartContainer>
                    </div>
                    <div className="rounded border p-3">
                      <div className="text-sm font-medium mb-2">一天内活跃分布</div>
                      <ChartContainer config={ACTIVITY_CHART_CONFIG} className="aspect-auto h-[180px] w-full">
                        <BarChart data={activitySummary.hourly} margin={{ left: 8, right: 8 }}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} />
                          <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                          <ChartTooltip
                            cursor={false}
                            content={
                              <ChartTooltipContent
                                indicator="dot"
                                labelFormatter={(value) => `${value}:00`}
                                formatter={(value) => (
                                  <div className="flex min-w-[120px] items-center text-xs text-muted-foreground">
                                    {value} 条
                                  </div>
                                )}
                              />
                            }
                          />
                          <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mb-4 text-xs text-muted-foreground">暂无可视化统计数据。</div>
              )}

              {(data?.messages || []).length === 0 ? (
                <div className="py-6 text-sm text-muted-foreground">暂无互动记录。</div>
              ) : (
                <ScrollArea className="h-[360px] pr-3">
                  <div className="space-y-3">
                    {(data?.messages || []).map((m: any) => (
                      <div key={m.id} className="rounded border p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
                          <span>{new Date(m.time).toISOString().replace('T', ' ').slice(0, 16)}</span>
                          <span>·</span>
                          <span>{m.productLine}</span>
                          <span>·</span>
                          <span>
                            {m.period}期{m.groupNumber}群
                          </span>
                          <Badge variant="secondary">{m.type}</Badge>
                        </div>
                        <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string | number; icon: string }) {
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

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
