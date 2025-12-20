'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { SmartIcon } from '@/shared/blocks/common';
import { Link } from '@/core/i18n/navigation';

type CoachItem = {
  id: string;
  nickname: string;
  nicknameNormalized: string | null;
  role: string;
  productLine: string;
  period: string | null;
  totalMessages: number;
  answerCount: number;
  resolvedCount: number | null;
  helpedStudents: number | null;
  avgResponseMinutes: number | null;
  activeDays: number;
  tags: { category: string; name: string }[];
};

function normalizeName(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function slugifyName(name: string) {
  return normalizeName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function CoachCrmPage() {
  const router = useRouter();
  const [items, setItems] = useState<CoachItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    async function fetchList() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/community/member?role=coach-volunteer&order=answers&pageSize=5000', {
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`加载失败：${res.status}`);
        const json = await res.json();
        setItems(json.items || []);
        setTotal(json.total || (json.items || []).length || 0);
      } catch (e: any) {
        setError(e?.message || '加载失败');
      } finally {
        setLoading(false);
      }
    }
    fetchList();
  }, []);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return items;
    return items.filter(
      (i) =>
        i.nickname.toLowerCase().includes(k) ||
        (i.nicknameNormalized || '').includes(k) ||
        i.tags.some((t) => t.name.toLowerCase().includes(k)),
    );
  }, [items, keyword]);

  const handleJump = (name?: string) => {
    const target = name || keyword;
    if (!target?.trim()) return;
    router.push(`/community/coach/${slugifyName(target)}`);
  };

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <SmartIcon name="UserCheck2" className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">教练 / 志愿者 CRM</h1>
          <p className="text-sm text-muted-foreground">
            查看答疑流水、平均响应时间与活跃度，直接跳转到教练/志愿者 CRM 详情。
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SmartIcon name="Search" className="h-4 w-4 text-muted-foreground" />
            搜索或跳转到教练/志愿者详情
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex-1 flex items-center gap-2">
            <Input
              placeholder="输入教练/志愿者昵称关键词"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
            />
            <Button onClick={() => handleJump()}>打开 CRM</Button>
          </div>
          <div className="text-xs text-muted-foreground">也可以直接点击下方表格的名称跳转。</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <SmartIcon name="ListTodo" className="h-4 w-4 text-muted-foreground" />
              教练 / 志愿者列表（按答疑数排序）
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">展示当前已解析的数据，方便跳转到 CRM 详情。</p>
          </div>
          <div className="text-xs text-muted-foreground">{loading ? '加载中...' : `共 ${total} 人`}</div>
        </CardHeader>
        <CardContent>
          {error && <div className="text-sm text-red-500 mb-2">加载失败：{error}</div>}
          <ScrollArea className="h-[540px]">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-2 text-left w-16">#</th>
                  <th className="py-2 pr-2 text-left">教练 / 志愿者</th>
                  <th className="py-2 pr-2 text-left">答疑</th>
                  <th className="py-2 pr-2 text-left">解决</th>
                  <th className="py-2 pr-2 text-left">平均响应(分)</th>
                  <th className="py-2 pr-2 text-left">活跃天</th>
                  <th className="py-2 pr-2 text-left">标签</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      加载中...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  filtered.map((item, idx) => {
                    const slug = slugifyName(item.nickname || item.nicknameNormalized || '');
                    const topTags = (item.tags || []).slice(0, 3);
                    const remain = Math.max((item.tags || []).length - topTags.length, 0);
                    return (
                      <tr key={item.id} className="border-b last:border-b-0">
                        <td className="py-2 pr-2 text-muted-foreground">{idx + 1}</td>
                        <td className="py-2 pr-2">
                          <div className="flex flex-col">
                            <Link
                              href={`/community/coach/${slug}`}
                              className="text-primary hover:underline font-medium"
                            >
                              {item.nickname || item.nicknameNormalized || '未命名'}
                            </Link>
                            <div className="text-[11px] text-muted-foreground">
                              {item.productLine} · {item.period || '未分期'}
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-2">{item.answerCount ?? 0}</td>
                        <td className="py-2 pr-2">{item.resolvedCount ?? 0}</td>
                        <td className="py-2 pr-2">{item.avgResponseMinutes ?? '-'}</td>
                        <td className="py-2 pr-2">{item.activeDays ?? 0}</td>
                        <td className="py-2 pr-2">
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-[10px]">
                              {item.role}
                            </Badge>
                            {topTags.map((t) => (
                              <Badge key={t.category + t.name} variant="secondary" className="text-[10px]">
                                {t.name}
                              </Badge>
                            ))}
                            {remain > 0 && (
                              <Badge variant="outline" className="text-[10px]">+{remain}</Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
