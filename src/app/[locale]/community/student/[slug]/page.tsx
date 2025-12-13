'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDashboardStats } from '@/actions/community-actions';
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
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await getDashboardStats();
        setStats(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const { questions, goodNews, displayName } = useMemo(() => {
    const normalizedTarget = (slug as string) || '';
    const qs: any[] = [];
    const gns: any[] = [];
    let nameGuess = '';

    (stats || []).forEach((report: any) => {
      (report.questions || []).forEach((q: any) => {
        const normAuthor = slugifyName(q.author || '');
        if (normAuthor === normalizedTarget) {
          if (!nameGuess) nameGuess = q.author;
          qs.push({
            content: q.content,
            resolved: q.resolved ?? q.status === 'resolved',
            waitMins: q.waitMins,
            date: new Date(report.reportDate).toISOString().split('T')[0],
            group: report.groupName,
            productLine: report.productLine,
            answeredBy: q.answeredBy,
          });
        }
      });

      (report.goodNewsParsed || []).forEach((g: any) => {
        const normAuthor = slugifyName(g.author || '');
        if (normAuthor === normalizedTarget) {
          if (!nameGuess) nameGuess = g.author;
          gns.push({
            content: g.content,
            date: new Date(report.reportDate).toISOString().split('T')[0],
            group: g.group || report.groupName,
            productLine: report.productLine,
          });
        }
      });
    });

    qs.sort((a, b) => (a.date < b.date ? 1 : -1));
    gns.sort((a, b) => (a.date < b.date ? 1 : -1));

    return { questions: qs, goodNews: gns, displayName: nameGuess || slug };
  }, [stats, slug]);

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <div className="flex items-center gap-3">
        <SmartIcon name="Users" className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{displayName} 的学员 CRM</h1>
          <p className="text-sm text-muted-foreground">查看该学员的提问、好事与参与记录</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="提问次数" value={questions.length} icon="HelpCircle" />
        <StatCard title="好事贡献" value={goodNews.length} icon="Trophy" />
        <StatCard
          title="已解决提问"
          value={questions.filter((q) => q.resolved).length}
          icon="CheckCircle2"
        />
      </div>

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
          ) : questions.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">暂无提问记录。</div>
          ) : (
            <ScrollArea className="h-[360px] pr-3">
              <div className="space-y-3">
                {questions.map((q, idx) => (
                  <div key={idx} className="rounded border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
                      <span>{q.date}</span>
                      <span>·</span>
                      <span>{q.productLine}</span>
                      <span>·</span>
                      <span>{q.group}</span>
                      <Badge variant={q.resolved ? 'secondary' : 'destructive'}>
                        {q.resolved ? '已解决' : '未解决'}
                      </Badge>
                      {q.waitMins != null && (
                        <span className="ml-auto">等待 {q.waitMins} 分钟</span>
                      )}
                    </div>
                    <div className="text-sm font-medium mb-1">提问：{q.content}</div>
                    {q.answeredBy && (
                      <div className="text-xs text-muted-foreground">回答者：{q.answeredBy}</div>
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
          ) : goodNews.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">暂无好事记录。</div>
          ) : (
            <ScrollArea className="h-[260px] pr-3">
              <div className="space-y-3">
                {goodNews.map((g, idx) => (
                  <div key={idx} className="rounded border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
                      <span>{g.date}</span>
                      <span>·</span>
                      <span>{g.productLine}</span>
                      <span>·</span>
                      <span>{g.group}</span>
                    </div>
                    <div className="text-sm">{g.content}</div>
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
