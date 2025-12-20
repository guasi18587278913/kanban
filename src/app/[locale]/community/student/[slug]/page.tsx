'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { SmartIcon } from '@/shared/blocks/common';
import { ScrollArea } from '@/shared/components/ui/scroll-area';

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

export default function StudentCrmDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/community/member/${slug}`, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`加载失败: ${res.status}`);
        }
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
  }, []);

  const normalized = slugifyName((slug as string) || '');
  const displayName = data?.member?.nickname || slug;
  const stats = data?.stats;
  const tagsByCategory = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    (data?.tags || []).forEach((t: any) => {
      if (!grouped[t.tagCategory]) grouped[t.tagCategory] = [];
      grouped[t.tagCategory].push(t);
    });
    return grouped;
  }, [data]);

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

      {/* 标签 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SmartIcon name="Tag" className="h-5 w-5 text-muted-foreground" />
            标签
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-4 text-sm text-muted-foreground">加载中...</div>
          ) : data?.tags?.length ? (
            <div className="flex flex-wrap gap-2">
              {Object.entries(tagsByCategory).map(([cat, list]) => (
                <div key={cat} className="flex items-center gap-2 border rounded-full px-3 py-1 bg-muted/40">
                  <span className="text-xs text-muted-foreground">{cat}</span>
                  <div className="flex flex-wrap gap-1">
                    {list.map((t: any) => (
                      <Badge key={t.id} variant="secondary" className="text-[11px]">
                        {t.tagName}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-sm text-muted-foreground">暂无标签。</div>
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
                      <span>{q.date}</span>
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
          ) : (data?.messages || []).length === 0 ? (
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
