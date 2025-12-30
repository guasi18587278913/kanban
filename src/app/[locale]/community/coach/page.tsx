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

const PAGE_SIZE = 200;

export default function CoachCrmPage() {
  const router = useRouter();
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
        `/api/community/member?role=coach-volunteer&order=answers&page=${nextPage}&pageSize=${PAGE_SIZE}`,
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

  const handleJump = async (name?: string) => {
    const target = (name || keyword || '').trim();
    if (!target) return;
    const normalizedTarget = normalizeName(target);
    const match = items.find(
      (i) =>
        i.id === target ||
        normalizeName(i.nickname) === normalizedTarget ||
        (i.nicknameNormalized || '').toLowerCase() === normalizedTarget
    );
    if (match) {
      setError(null);
      router.push(`/community/coach/${buildMemberSlug(match)}`);
      return;
    }
    try {
      const res = await fetch(`/api/community/coach/${encodeURIComponent(target)}`);
      if (!res.ok) throw new Error('未找到该教练/志愿者，请检查昵称是否正确');
      const json = await res.json();
      if (!json?.member?.id) throw new Error('未找到该教练/志愿者，请检查昵称是否正确');
      setError(null);
      router.push(`/community/coach/${json.member.id}`);
    } catch (e: any) {
      setError(e?.message || '未找到该教练/志愿者，请检查昵称是否正确');
    }
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
          <div className="text-xs text-muted-foreground">
            {loading ? '加载中...' : `已加载 ${items.length} / ${total} 人`}
          </div>
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
                    const slug = buildMemberSlug(item);
                    const displayTags = filterDisplayTags(item.tags || []);
                    const topTags = displayTags.slice(0, 3);
                    const remain = Math.max(displayTags.length - topTags.length, 0);
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
                                {formatTagLabel(t)}
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
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
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
    </div>
  );
}
