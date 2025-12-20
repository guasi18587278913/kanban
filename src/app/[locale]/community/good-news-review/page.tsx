'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { SmartIcon } from '@/shared/blocks/common';

type GoodNewsItem = {
  id: string;
  authorName: string;
  content: string;
  category: string | null;
  revenueLevel: string | null;
  eventDate: string;
  isVerified: boolean;
  productLine: string | null;
  period: string | null;
  groupNumber: number | null;
  confidence: string | null;
  sourceLogId: string;
  memberId: string | null;
};

const VERIFIED_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '未审核', value: 'false' },
  { label: '已审核', value: 'true' },
];

export default function GoodNewsReviewPage() {
  const [items, setItems] = useState<GoodNewsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 默认查看“已审核”以便直接对照好事墙，必要时切换“未审核”做初筛
  const [verified, setVerified] = useState<'all' | 'true' | 'false'>('true');
  const [keyword, setKeyword] = useState('');
  const [productLine, setProductLine] = useState<'all' | 'AI产品出海'>('AI产品出海');
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (verified !== 'all') params.set('verified', verified);
      if (keyword.trim()) params.set('keyword', keyword.trim());
      if (productLine && productLine !== 'all') params.set('productLine', productLine);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      params.set('pageSize', '200');

      const res = await fetch(`/api/community/good-news?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`加载失败 ${res.status}`);
      const json = await res.json();
      setItems(json.items || []);
      setTotal(json.total || 0);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  async function updateStatus(id: string, isVerified: boolean) {
    setUpdatingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/community/good-news/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVerified }),
      });
      if (!res.ok) throw new Error(`更新失败 ${res.status}`);
      // refresh locally
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, isVerified } : i)));
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : '更新失败');
    } finally {
      setUpdatingIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }
  }

  const filtered = useMemo(() => {
    return items;
  }, [items]);

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <SmartIcon name="Trophy" className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">好事审核</h1>
          <p className="text-sm text-muted-foreground">按状态/日期/关键词筛选，人工确认后才能在面板展示。</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SmartIcon name="Filter" className="h-4 w-4 text-muted-foreground" />
            筛选
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">审核状态</div>
            <Select value={verified} onValueChange={(v: any) => setVerified(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VERIFIED_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">产品线</div>
            <Select value={productLine} onValueChange={(v: any) => setProductLine(v)}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="AI产品出海">AI产品出海</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">日期起</div>
            <Input type="date" value={dateFrom || ''} onChange={(e) => setDateFrom(e.target.value || undefined)} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">日期止</div>
            <Input type="date" value={dateTo || ''} onChange={(e) => setDateTo(e.target.value || undefined)} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">关键词</div>
            <div className="flex gap-2">
              <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="作者/内容关键词" />
              <Button onClick={loadData} disabled={loading}>搜索</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <SmartIcon name="List" className="h-4 w-4 text-muted-foreground" />
            <CardTitle>好事列表</CardTitle>
          </div>
          <div className="text-xs text-muted-foreground">{loading ? '加载中...' : `共 ${total} 条`}</div>
        </CardHeader>
        <CardContent>
          {error && <div className="text-sm text-red-500 mb-2">加载失败：{error}</div>}
          <ScrollArea className="h-[640px] pr-3">
            <div className="space-y-3">
              {filtered.length === 0 && !loading && (
                <div className="text-center text-muted-foreground py-10 text-sm">暂无数据</div>
              )}
              {filtered.map((item) => (
                <div key={item.id} className="border rounded p-3 space-y-2">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{format(new Date(item.eventDate), 'yyyy-MM-dd', { locale: zhCN })}</span>
                    {item.productLine && <span>· {item.productLine}</span>}
                    {item.period && <span>· {item.period}</span>}
                    {item.groupNumber != null && <span>· {item.groupNumber}群</span>}
                    {item.category && <Badge variant="outline">{item.category}</Badge>}
                    {item.revenueLevel && <Badge variant="outline">{item.revenueLevel}</Badge>}
                    {item.confidence && <Badge variant="secondary">置信度 {item.confidence}</Badge>}
                    <Badge variant={item.isVerified ? 'secondary' : 'outline'}>
                      {item.isVerified ? '已审核' : '未审核'}
                    </Badge>
                  </div>
                  <div className="text-sm">
                    <span className="font-medium mr-2">{item.authorName}</span>
                    <span className="whitespace-pre-wrap break-words">{item.content}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={item.isVerified ? 'outline' : 'default'}
                      disabled={updatingIds.has(item.id)}
                      onClick={() => updateStatus(item.id, true)}
                    >
                      通过
                    </Button>
                    <Button
                      size="sm"
                      variant={!item.isVerified ? 'outline' : 'destructive'}
                      disabled={updatingIds.has(item.id)}
                      onClick={() => updateStatus(item.id, false)}
                    >
                      拒绝
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
