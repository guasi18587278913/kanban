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

export default function CoachCrmDetailPage() {
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

  const { answeredList, displayName, summary } = useMemo(() => {
    const normalizedTarget = (slug as string) || '';
    const temp: any[] = [];
    let nameGuess = '';

    (stats || []).forEach((report: any) => {
      (report.questions || []).forEach((q: any) => {
        if (!q?.answeredBy) return;
        const norm = slugifyName(q.answeredBy);
        if (norm === normalizedTarget) {
          if (!nameGuess) nameGuess = q.answeredBy;
          temp.push({
            content: q.content,
            author: q.author,
            answeredBy: q.answeredBy,
            resolved: q.resolved ?? q.status === 'resolved',
            waitMins: q.waitMins,
            date: new Date(report.reportDate).toISOString().split('T')[0],
            group: report.groupName,
            productLine: report.productLine,
          });
        }
      });
    });

    temp.sort((a, b) => (a.date < b.date ? 1 : -1));

    const answeredCount = temp.length;
    const resolvedCount = temp.filter((i) => i.resolved).length;
    const unresolvedCount = answeredCount - resolvedCount;
    const avgWait =
      temp.filter((i) => typeof i.waitMins === 'number').reduce((a, b) => a + (b.waitMins || 0), 0) /
      (temp.filter((i) => typeof i.waitMins === 'number').length || 1);

    return {
      answeredList: temp,
      displayName: nameGuess || slug,
      summary: {
        answeredCount,
        resolvedCount,
        unresolvedCount,
        avgWait: Math.round(avgWait || 0),
      },
    };
  }, [stats, slug]);

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <div className="flex items-center gap-3">
        <SmartIcon name="UserCheck2" className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{displayName} 的教练/志愿者 CRM</h1>
          <p className="text-sm text-muted-foreground">查看该教练的答疑流水与闭环情况</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="答疑总数" value={summary.answeredCount} icon="MessageSquare" />
        <StatCard title="已解决" value={summary.resolvedCount} icon="CheckCircle2" />
        <StatCard title="未解决" value={summary.unresolvedCount} icon="AlertTriangle" />
        <StatCard title="平均等待(分钟)" value={summary.avgWait || '-'} icon="Clock" />
      </div>

      <Card className="border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SmartIcon name="ListTodo" className="h-5 w-5 text-muted-foreground" />
            答疑流水
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-sm text-muted-foreground">加载中...</div>
          ) : answeredList.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">暂无答疑记录。</div>
          ) : (
            <ScrollArea className="h-[540px] pr-3">
              <div className="space-y-3">
                {answeredList.map((item, idx) => (
                  <div key={idx} className="rounded border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
                      <span>{item.date}</span>
                      <span>·</span>
                      <span>{item.productLine}</span>
                      <span>·</span>
                      <span>{item.group}</span>
                      <Badge variant={item.resolved ? 'secondary' : 'destructive'}>
                        {item.resolved ? '已解决' : '未解决'}
                      </Badge>
                      {item.waitMins != null && (
                        <span className="ml-auto">等待 {item.waitMins} 分钟</span>
                      )}
                    </div>
                    <div className="text-sm font-medium mb-1">提问：{item.content}</div>
                    <div className="text-xs text-muted-foreground">提问者：{item.author || '未注明'}</div>
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
