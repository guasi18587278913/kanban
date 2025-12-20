'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { SmartIcon } from '@/shared/blocks/common';
import { ScrollArea } from '@/shared/components/ui/scroll-area';

export default function CoachCrmPage() {
  const searchParams = useSearchParams();
  const name = searchParams.get('name');
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [answers, setAnswers] = useState<any[]>([]);

  useEffect(() => {
    if (!name) {
      setLoading(false);
      return;
    }
    async function fetchData() {
      try {
        const res = await fetch(`/api/community/member/${name}?role=coach`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        setProfile(data);
        // 作为回答者的记录
        const qa = (data.answers || []).map((q: any) => ({
          ...q,
          date: q.answerTime ? new Date(q.answerTime).toISOString().split('T')[0] : '',
        }));
        setAnswers(qa);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [name]);

  if (!name) {
    return notFound();
  }

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <SmartIcon name="UserCheck2" className="h-5 w-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">{name} 的 CRM</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="答疑次数" value={answers.length} icon="HelpCircle" />
        <StatCard title="活跃消息" value={profile?.stats?.totalMessages || 0} icon="MessageSquare" />
        <StatCard
          title="好事贡献"
          value={profile?.stats?.goodNewsCount || 0}
          icon="Trophy"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SmartIcon name="HelpCircle" className="h-5 w-5 text-muted-foreground" />
            回答记录
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-sm text-muted-foreground">加载中...</div>
          ) : answers.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">暂无回答记录。</div>
          ) : (
            <ScrollArea className="h-[360px] pr-3">
              <div className="space-y-3">
                {answers.map((q, idx) => (
                  <div key={idx} className="rounded border p-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
                      <span>{q.date}</span>
                      {q.productLine && (
                        <>
                          <span>·</span>
                          <span>{q.productLine}</span>
                        </>
                      )}
                      {q.group && (
                        <>
                          <span>·</span>
                          <span>{q.group}</span>
                        </>
                      )}
                      <Badge variant={q.isResolved ? 'secondary' : 'destructive'}>
                        {q.isResolved ? '已解决' : '未解决'}
                      </Badge>
                      {q.responseMinutes != null && (
                        <span className="ml-auto">响应 {q.responseMinutes} 分钟</span>
                      )}
                    </div>
                    <div className="text-sm font-medium mb-1">问题：{q.questionContent}</div>
                    {q.answerContent && (
                      <div className="text-xs text-muted-foreground">回答：{q.answerContent}</div>
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
