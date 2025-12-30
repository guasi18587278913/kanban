'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/shared/components/ui/scroll-area';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { SmartIcon } from '@/shared/blocks/common';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shared/components/ui/hover-card';
import { Link } from '@/core/i18n/navigation';

function normalizeName(name: string) {
  return name
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    .replace(/[-_—–·•‧·|].*$/, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function buildMemberSlug(item: { id?: string; nickname?: string; nicknameNormalized?: string | null }) {
  const raw = item.id || item.nicknameNormalized || normalizeName(item.nickname || '');
  return encodeURIComponent(raw);
}

const TAG_CATEGORY_LABELS: Record<string, string> = {
  action: '动作',
  progress: '进度',
  achievement: '成果',
  activity: '活跃',
  stage: '阶段',
  intent: '需求',
  niche: '方向',
  risk: '风险',
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

function formatTagLabel(tag: { category: string; name: string }) {
  const label = TAG_CATEGORY_LABELS[tag.category] || tag.category;
  return `${label}·${tag.name}`;
}

function filterDisplayTags(tags: { category: string; name: string }[]) {
  const allowed = new Set(Object.keys(TAG_CATEGORY_LABELS));
  const seen = new Set<string>();
  const result: { category: string; name: string }[] = [];

  (tags || []).forEach((tag) => {
    if (!allowed.has(tag.category)) return;
    const normalized = normalizeTagValue(tag.name || '');
    if (!normalized) return;
    if (WEAK_GENERIC_TAGS.has(normalized)) return;
    if (tag.category === 'niche' && WEAK_NICHE_TAGS.has(normalized)) return;
    const key = `${tag.category}:${normalized}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(tag);
  });

  return result;
}

const EMBED_PAGE_SIZE = 120;

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
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    loadPage(1, true);
  }, []);

  const loadPage = async (nextPage: number, reset = false) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/community/member?role=student&page=${nextPage}&pageSize=${EMBED_PAGE_SIZE}`,
      );
      if (!res.ok) throw new Error(`加载失败：${res.status}`);
      const json = await res.json();
      const nextTotal = json.total || 0;
      setTotal(nextTotal);
      setPage(nextPage);
      setItems((prev) => {
        const merged = reset ? (json.items || []) : [...prev, ...(json.items || [])];
        const seen = new Set<string>();
        const unique = merged.filter((item: StudentItem) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        setHasMore(unique.length < nextTotal);
        return unique;
      });
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

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
          <div className="text-xs text-muted-foreground">
            {loading ? '加载中...' : `已加载 ${items.length} / ${total} 人`}
          </div>
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
          <div className="w-full pr-2">
          <table className="w-full text-sm">
            <colgroup>
              <col className="w-[50px]" />
              <col className="w-[200px]" />
              <col className="w-[80px]" />
              <col className="w-[80px]" />
              <col className="w-[80px]" />
              <col className="w-[90px]" />
            </colgroup>
            <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-background">
              <tr>
                <th className="py-2 pr-2 text-left w-6">#</th>
                <th className="py-2 pr-2 text-left">学员</th>
                <th className="py-2 pr-2 text-left">消息</th>
                <th className="py-2 pr-2 text-left">提问</th>
                <th className="py-2 pr-2 text-left">好事</th>
                <th className="py-2 pr-2 text-left">活跃天</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    加载中...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    暂无数据
                  </td>
                </tr>
              ) : (
                filtered.map((item, idx) => {
                  const slug = buildMemberSlug(item);
                  const displayTags = filterDisplayTags(item.tags || []);
                  const topTags = displayTags.slice(0, 3);
                  const remain = Math.max(displayTags.length - topTags.length, 0);
                  return (
                    <tr key={item.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-2 text-muted-foreground">{idx + 1}</td>
                      <td className="py-2 pr-2">
                        <HoverCard openDelay={60} closeDelay={80}>
                          <HoverCardTrigger asChild>
                            <div className="inline-flex flex-col cursor-pointer">
                              <Link href={`/community/student/${slug}`} className="text-primary hover:underline font-medium">
                                {item.nickname || item.nicknameNormalized || '未命名'}
                              </Link>
                              <div className="text-[11px] text-muted-foreground">
                                {item.productLine} · {item.period || '未分期'}
                              </div>
                            </div>
                          </HoverCardTrigger>
                          {topTags.length > 0 && (
                            <HoverCardContent align="start" side="top" className="w-64 text-xs space-y-2">
                              <div className="flex flex-wrap gap-1">
                                {topTags.map((t) => (
                                  <Badge key={t.category + t.name} variant="secondary" className="text-[11px]">
                                    {formatTagLabel(t)}
                                  </Badge>
                                ))}
                                {remain > 0 && (
                                  <Badge variant="outline" className="text-[11px]">
                                    +{remain}
                                  </Badge>
                                )}
                              </div>
                            </HoverCardContent>
                          )}
                        </HoverCard>
                      </td>
                      <td className="py-2 pr-2">{item.totalMessages ?? 0}</td>
                      <td className="py-2 pr-2">{item.questionCount ?? 0}</td>
                      <td className="py-2 pr-2">{item.goodNewsCount ?? 0}</td>
                      <td className="py-2 pr-2">{item.activeDays ?? 0}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>当前仅展示已加载范围的数据</span>
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore || !hasMore}
            onClick={() => loadPage(page + 1)}
          >
            {loadingMore ? '加载中...' : hasMore ? '加载更多' : '没有更多了'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CoachCrmEmbed() {
  const [items, setItems] = useState<CoachItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');

  useEffect(() => {
    loadPage(1, true);
  }, []);

  const loadPage = async (nextPage: number, reset = false) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      const res = await fetch(
        `/api/community/member?role=coach-volunteer&order=answers&page=${nextPage}&pageSize=${EMBED_PAGE_SIZE}`,
      );
      if (!res.ok) throw new Error(`加载失败：${res.status}`);
      const json = await res.json();
      const nextTotal = json.total || 0;
      setTotal(nextTotal);
      setPage(nextPage);
      setItems((prev) => {
        const merged = reset ? (json.items || []) : [...prev, ...(json.items || [])];
        const seen = new Set<string>();
        const unique = merged.filter((item: CoachItem) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        setHasMore(unique.length < nextTotal);
        return unique;
      });
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

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
          <div className="text-xs text-muted-foreground">
            {loading ? '加载中...' : `已加载 ${items.length} / ${total} 人`}
          </div>
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
          <div className="w-full pr-4">
          <table className="w-full text-sm">
            <colgroup>
              <col className="w-[50px]" />
              <col className="w-[200px]" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col className="w-[110px]" />
              <col className="w-[90px]" />
            </colgroup>
            <thead className="text-xs text-muted-foreground border-b sticky top-0 bg-background">
              <tr>
                <th className="py-2 pr-2 text-left w-6">#</th>
                <th className="py-2 pr-2 text-left">教练 / 志愿者</th>
                <th className="py-2 pr-2 text-left">答疑</th>
                <th className="py-2 pr-2 text-left">解决</th>
                <th className="py-2 pr-2 text-left">平均响应(分)</th>
                <th className="py-2 pr-2 text-left">活跃天</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    加载中...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    暂无数据
                  </td>
                </tr>
              ) : (
                filtered.map((item, idx) => {
                  const slug = buildMemberSlug(item);
                  const displayTags = filterDisplayTags(item.tags || []);
                  const topTags = displayTags.slice(0, 3);
                  const remain = Math.max(displayTags.length - topTags.length, 0);
                  return (
                    <tr key={item.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-2 text-muted-foreground">{idx + 1}</td>
                      <td className="py-2 pr-2">
                        <HoverCard openDelay={60} closeDelay={80}>
                          <HoverCardTrigger asChild>
                            <div className="inline-flex flex-col cursor-pointer">
                              <Link href={`/community/coach/${slug}`} className="text-primary hover:underline font-medium">
                                {item.nickname || item.nicknameNormalized || '未命名'}
                              </Link>
                              <div className="text-[11px] text-muted-foreground">
                                {item.productLine} · {item.period || '未分期'}
                              </div>
                            </div>
                          </HoverCardTrigger>
                          {(topTags.length > 0 || item.role) && (
                            <HoverCardContent align="start" side="top" className="w-64 text-xs space-y-2">
                              <div className="flex flex-wrap gap-1">
                                {item.role && (
                                  <Badge variant="outline" className="text-[11px]">
                                    {item.role}
                                  </Badge>
                                )}
                                {topTags.map((t) => (
                                  <Badge key={t.category + t.name} variant="secondary" className="text-[11px]">
                                    {formatTagLabel(t)}
                                  </Badge>
                                ))}
                                {remain > 0 && (
                                  <Badge variant="outline" className="text-[11px]">
                                    +{remain}
                                  </Badge>
                                )}
                              </div>
                            </HoverCardContent>
                          )}
                        </HoverCard>
                      </td>
                      <td className="py-2 pr-2">{item.answerCount ?? 0}</td>
                      <td className="py-2 pr-2">{item.resolvedCount ?? 0}</td>
                      <td className="py-2 pr-2">{item.avgResponseMinutes ?? '-'}</td>
                      <td className="py-2 pr-2">{item.activeDays ?? 0}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>当前仅展示已加载范围的数据</span>
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore || !hasMore}
            onClick={() => loadPage(page + 1)}
          >
            {loadingMore ? '加载中...' : hasMore ? '加载更多' : '没有更多了'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
