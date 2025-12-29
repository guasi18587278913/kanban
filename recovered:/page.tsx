'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { SmartIcon } from '@/shared/blocks/common';
import { ScrollArea } from '@/shared/components/ui/scroll-area';

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function CoachCrmDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!slug) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/community/coach/${slug}`);
        if (res.status === 404) {
          setError('未找到该教练/志愿者，请检查链接或返回列表重新选择。');
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

  const { answeredList, displayName, summary } = useMemo(() => {
    const list = (data?.qa || []).map((item: any) => ({
      content: item.question,
      author: item.askerName,
      answeredBy: data?.member?.nickname || '',
      resolved: item.isResolved,
      waitMins: item.responseMinutes,
      date: item.questionTime ? new Date(item.questionTime).toISOString().split('T')[0] : '',
      group: `${item.productLine || ''}${item.period ? `${item.period}期` : ''}${item.groupNumber ?? ''}群`,
      productLine: item.productLine,
      answer: item.answer,
      answerTime: item.answerTime,
    }));

    return {
      answeredList: list,
      displayName: data?.member?.nickname || safeDecode(String(slug || '')),
      summary: data?.summary || {
        answeredCount: 0,
        resolvedCount: 0,
        unresolvedCount: 0,
        avgWait: 0,
      },
    };
  }, [data, slug]);

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <div className="flex items-center gap-3">
        <SmartIcon name="UserCheck2" className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{displayName} 的教练/志愿者 CRM</h1>
          <p className="text-sm text-muted-foreground">查看该教练的答疑流水与闭环情况</p>
        </div>
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

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
                    <div className="mt-2 text-sm text-foreground/90">
                      回复：{item.answer || '暂无解析回复'}
                    </div>
                    {item.answerTime && (
                      <div className="text-xs text-muted-foreground mt-1">
                        回复时间：{new Date(item.answerTime).toLocaleString()}
                      </div>
                    )}
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
