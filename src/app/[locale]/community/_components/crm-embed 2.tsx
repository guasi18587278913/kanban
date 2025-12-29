'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/shared/components/ui/scroll-area';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { SmartIcon } from '@/shared/blocks/common';
import { Link } from '@/core/i18n/navigation';

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

type StudentItem = {
  id: string;
  nickname: string;
  nicknameNormalized: string | null;
  productLine: string;
  period: string | null;
  totalMessages: number;
  questionCount: number;
  goodNewsCount: number;
  activeDays: number;
  kocContributions: number;
  tags: { category: string; name: string }[];
};

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

export function StudentCrmEmbed() {
  const [items, setItems] = useState<StudentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    async function fetchList() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/community/member?role=student&pageSize=5000', { cache: 'no-store' });
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

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <SmartIcon name="Users" className="h-5 w-5 text-primary" />
            学员 CRM 列表
          </CardTitle>
          <div className="text-xs text-muted-foreground">{loading ? '加载中...' : `共 ${total} 人`}</div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="输入学员昵称/标签关键词"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Button variant="outline" size="sm">
            <Link href="/community/student">查看完整页</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error && <div className="text-sm text-red-500 mb-2">加载失败：{error}</div>}
        <ScrollArea className="h-[720px] w-full">
          <div className="min-w-[960px] pr-2">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[40px]" />
              <col className="w-[220px]" />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col className="w-[70px]" />
              <col className="w-[80px]" />
              <col className="w-[200px]" />
            </colgroup>
            <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-background">
              <tr>
                <th className="py-2 pr-2 text-left w-6">#</th>
                <th className="py-2 pr-2 text-left">学员</th>
                <th className="py-2 pr-2 text-left">消息</th>
                <th className="py-2 pr-2 text-left">提问</th>
                <th className="py-2 pr-2 text-left">好事</th>
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
                        <Link href={`/community/student/${slug}`} className="text-primary hover:underline font-medium">
                          {item.nickname || item.nicknameNormalized || '未命名'}
                        </Link>
                        <div className="text-[11px] text-muted-foreground">
                          {item.productLine} · {item.period || '未分期'}
                        </div>
                      </td>
                      <td className="py-2 pr-2">{item.totalMessages ?? 0}</td>
                      <td className="py-2 pr-2">{item.questionCount ?? 0}</td>
                      <td className="py-2 pr-2">{item.goodNewsCount ?? 0}</td>
                      <td className="py-2 pr-2">{item.activeDays ?? 0}</td>
                      <td className="py-2 pr-2">
                        <div className="flex flex-wrap gap-1">
                          {topTags.map((t) => (
                            <Badge key={t.category + t.name} variant="secondary" className="text-[10px]">
                              {t.name}
                            </Badge>
                          ))}
                          {remain > 0 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{remain}
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export function CoachCrmEmbed() {
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

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <SmartIcon name="UserCheck2" className="h-5 w-5 text-primary" />
            教练 / 志愿者 CRM 列表
          </CardTitle>
          <div className="text-xs text-muted-foreground">{loading ? '加载中...' : `共 ${total} 人`}</div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="输入昵称/标签关键词"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <Button variant="outline" size="sm">
            <Link href="/community/coach">查看完整页</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error && <div className="text-sm text-red-500 mb-2">加载失败：{error}</div>}
        <ScrollArea className="h-[720px] w-full">
          <div className="min-w-[1200px] pr-4">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-background">
              <tr>
                <th className="py-2 pr-2 text-left w-6">#</th>
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
                          <Link href={`/community/coach/${slug}`} className="text-primary hover:underline font-medium">
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
                            <Badge variant="outline" className="text-[10px]">
                              +{remain}
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
