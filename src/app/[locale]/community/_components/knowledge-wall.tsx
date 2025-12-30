import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Link } from '@/core/i18n/navigation';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Trophy, Medal, Award, Star, TrendingUp, Quote } from 'lucide-react';

interface KnowledgeWallProps {
  data: any[]; // CommunityDailyReport[]
}

type KocContributionDetail = {
  title?: string;
  tags?: string[];
  reason?: string;
  scoreText?: string;
  scoreTotal?: number;
  extra?: string[];
};

function parseKocContribution(raw: string): KocContributionDetail {
  const detail: KocContributionDetail = {};
  if (!raw) return detail;
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line) => {
    const parts = line.split(/[:：]/);
    if (parts.length < 2) {
      detail.extra = [...(detail.extra || []), line];
      return;
    }
    const key = parts.shift()?.trim();
    const value = parts.join(':').trim();
    if (!key) return;
    if (key === '标题') detail.title = value;
    else if (key === '标签') {
      const tags = value
        .split(/[，,\/、|｜]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (tags.length > 0) detail.tags = tags;
    }
    else if (key === '入选理由') detail.reason = value;
    else if (key === '推荐选题' && !detail.title) detail.title = value;
    else if (key === '核心事迹' && !detail.reason) detail.reason = value;
    else if (key === '模型' && (!detail.tags || detail.tags.length === 0)) {
      const tags = value
        .split(/[\/|｜]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (tags.length > 0) detail.tags = tags;
    }
    else if (key === '评分') {
      detail.scoreText = value;
      const totalMatch = value.match(/总分\s*([0-9]+)/);
      if (totalMatch) {
        detail.scoreTotal = Number(totalMatch[1]);
      }
    }
    else detail.extra = [...(detail.extra || []), line];
  });

  return detail;
}

function buildKocSummary(detail: KocContributionDetail, raw: string) {
  if (detail.title) return detail.title;
  if (detail.reason) return detail.reason;
  if (!raw) return '';
  const fallback = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('评分') && !line.startsWith('标签'));
  return fallback[0] || raw.split('\n')[0] || '';
}

function buildScoreText(score?: { reproducibility?: number; scarcity?: number; validation?: number; total?: number } | null) {
  if (!score) return '';
  const parts = [];
  if (score.reproducibility != null) parts.push(`复现${score.reproducibility}`);
  if (score.scarcity != null) parts.push(`稀缺${score.scarcity}`);
  if (score.validation != null) parts.push(`验证${score.validation}`);
  if (parts.length === 0 && score.total == null) return '';
  const base = parts.join('/');
  if (score.total != null) {
    return `${base || '评分'} (总分 ${score.total})`;
  }
  return base;
}

function formatKocDate(value: unknown) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function normalizeKocTags(input?: string[] | string) {
  if (!input) return [];
  const raw = Array.isArray(input) ? input : input.split(/[，,\/、|｜]/);
  const cleaned = raw.map((tag) => tag.trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

export function KnowledgeWall({ data }: KnowledgeWallProps) {
  
  // Aggregate Personas and Content from reports
  const { starStudents, kocs, goodNewsList } = useMemo(() => {
    const starMap = new Map<string, { count: number; reasons: Set<string>; originalName: string }>();
    const kocMap = new Map<string, {
      count: number;
      originalName: string;
      groups: Set<string>;
      contributions: Array<{
        summary: string;
        detail: KocContributionDetail;
        raw: string;
        recordDate?: string | Date;
        dateLabel: string;
        groupName?: string;
      }>;
      contributionKeys: Set<string>;
      tags: Set<string>;
    }>();
    const news: { content: string; date: string; group: string; author?: string }[] = [];

    // Helper to normalize names (strip location/title suffixes)
    // "陈江河-广州" -> "陈江河"
    // "Gary曹淦-总教练" -> "Gary曹淦" (Maybe too aggressive? Let's check)
    // "溯光-青岛" -> "溯光"
    const normalizeName = (name: string) => {
        // Stop at common separators: - _ | — ( ) （ ）
        // But be careful not to strip valid parts of names if they use these chars?
        // Usually safe to strip after first hyphen for community nicknames.
        return name.split(/[-_—|（(]/)[0].trim();
    };

    data.forEach(report => {
        // Aggregate Star Students
        if (Array.isArray(report.starStudents)) {
            report.starStudents.forEach((student: any) => {
                if (!student) return;
                const rawName = typeof student === 'string' ? student : student.studentName;
                const reason = typeof student === 'object' ? student.achievement : '';
                
                if (!rawName) return;
                const cleanName = normalizeName(rawName.trim());
                
                const entry = starMap.get(cleanName) || { count: 0, reasons: new Set(), originalName: cleanName }; // Default to cleanName, or could track most frequent rawName
                entry.count += 1;
                if (reason) entry.reasons.add(reason);
                
                // You might ideally want to pick the "shortest" or "most frequent" display name
                // For now, using the normalized (short) name is cleaner for the leaderboard.
                starMap.set(cleanName, entry);
            });
        }

        // Aggregate KOCs
        if (Array.isArray(report.kocs)) {
             report.kocs.forEach((koc: any) => {
                if (!koc) return;
                const rawName = typeof koc === 'string' ? koc : koc.kocName;
                const rawContribution = typeof koc === 'object' ? koc.contribution || '' : '';
                const group = report.groupName || '';

                if (!rawName) return;
                const cleanName = normalizeName(rawName.trim());

                const entry = kocMap.get(cleanName) || {
                  count: 0,
                  originalName: cleanName,
                  groups: new Set<string>(),
                  contributions: [],
                  contributionKeys: new Set<string>(),
                  tags: new Set<string>(),
                };

                const parsedDetail = parseKocContribution(rawContribution);
                const scoreText = buildScoreText(typeof koc === 'object' ? koc.score : null);
                const providedTags = typeof koc === 'object' ? koc.tags : undefined;
                const normalizedTags = normalizeKocTags(providedTags);
                const detail: KocContributionDetail = {
                  ...parsedDetail,
                  title: (typeof koc === 'object' && (koc.title || koc.suggestedTitle)) || parsedDetail.title,
                  tags: normalizedTags.length > 0 ? normalizedTags : parsedDetail.tags,
                  reason: (typeof koc === 'object' && koc.reason) || parsedDetail.reason,
                  scoreText: scoreText || parsedDetail.scoreText,
                  scoreTotal:
                    (typeof koc === 'object' && koc.score && koc.score.total != null ? koc.score.total : parsedDetail.scoreTotal),
                };

                const summary = buildKocSummary(detail, rawContribution);
                const recordDate = typeof koc === 'object' && koc.recordDate ? koc.recordDate : report.reportDate;
                const dateObj = recordDate ? new Date(recordDate) : null;
                const dateKey = dateObj && !Number.isNaN(dateObj.getTime()) ? dateObj.toISOString().slice(0, 10) : '';
                const dateLabel = formatKocDate(recordDate);
                const contributionKey = `${dateKey}-${summary}`;

                if (!entry.contributionKeys.has(contributionKey)) {
                  entry.contributionKeys.add(contributionKey);
                  entry.contributions.push({
                    summary,
                    detail,
                    raw: rawContribution,
                    recordDate,
                    dateLabel,
                    groupName: group,
                  });
                }

                (detail.tags || []).forEach((tag) => entry.tags.add(tag));
                if (group) entry.groups.add(group);
                entry.count = entry.contributions.length;
                kocMap.set(cleanName, entry);
            });
        }

        // Aggregate Good News 
        // Use parsed array if available, fallback to string split
        if (report.goodNewsParsed && Array.isArray(report.goodNewsParsed)) {
             report.goodNewsParsed.forEach((item: any) => {
                 news.push({
                    content: item.content,
                    date: item.date || new Date(report.reportDate).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }),
                    group: item.group || report.groupName,
                    author: item.author || '未注明'
                 });
             });
        } else if (report.goodNews) {
            const lines = report.goodNews.split('\n').filter((l: string) => l.trim().length > 0);
            lines.forEach((line: string) => {
                news.push({
                    content: line.trim(),
                    date: new Date(report.reportDate).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }),
                    group: report.groupName,
                    author: '未注明'
                });
            });
        }
    });

    // Sort stars and KOCs
    const sortedStars = Array.from(starMap.entries())
        .map(([name, data]) => ({ name, count: data.count, reason: Array.from(data.reasons)[0] || '' }))
        .sort((a, b) => b.count - a.count);
        
    const sortedKocs = Array.from(kocMap.entries())
        .map(([name, data]) => {
          const contributions = [...data.contributions].sort((a, b) => {
            const aTime = a.recordDate ? new Date(a.recordDate).getTime() : 0;
            const bTime = b.recordDate ? new Date(b.recordDate).getTime() : 0;
            return bTime - aTime;
          });
          const latest = contributions[0];
          return ({
            name,
            count: data.count,
            summary: latest?.summary || '',
            detail: latest?.detail,
            contributions,
            tags: Array.from(data.tags),
            groups: Array.from(data.groups).slice(0, 5).join('、') // cap length
          });
        })
        .sort((a, b) => b.count - a.count);

    // Deduplicate Good News 更强：按日期 + 作者（优先）/ 规范化内容去重，保留最长文本，群名合并
    const normalizeContent = (str: string) =>
      (str || '')
        .toLowerCase()
        .replace(/模版/g, '模板')
        .replace(/\s+/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '');

    const normalizeAuthor = (str: string) =>
      (str || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '');

    const isSimilar = (a: string, b: string) => {
      if (!a || !b) return false;
      if (a === b) return true;
      const setA = new Set(a.split(''));
      const setB = new Set(b.split(''));
      const overlap = Array.from(setA).filter((ch) => setB.has(ch)).length;
      const ratio = overlap / Math.min(setA.size, setB.size || 1);
      return ratio >= 0.8;
    };

    const mergedNews: any[] = [];

    news.forEach(item => {
        const authorKey = normalizeAuthor(item.author || '');
        const normContent = normalizeContent(item.content);
        const date = item.date;
        let merged = false;

        for (let i = 0; i < mergedNews.length; i++) {
            const existing = mergedNews[i];
            const sameDate = existing.date === date;
            const authorMatch = authorKey && existing._authorKey === authorKey;
            const contentMatch = isSimilar(normContent, existing._normContent);
            if (sameDate && ((authorKey && authorMatch) || (!authorKey && contentMatch))) {
                // 保留更长文本
                if (item.content.length > existing.content.length) {
                    mergedNews[i] = { ...item, _authorKey: authorKey, _normContent: normContent, group: existing.group };
                }
                const groups = new Set(`${mergedNews[i].group}`.split('/').map((g: string) => g.trim()).filter(Boolean));
                groups.add(item.group);
                mergedNews[i].group = Array.from(groups).join(' / ');
                merged = true;
                break;
            }
            if (sameDate && contentMatch) {
                if (item.content.length > existing.content.length) {
                    mergedNews[i] = { ...item, _authorKey: authorKey, _normContent: normContent, group: existing.group };
                }
                const groups = new Set(`${mergedNews[i].group}`.split('/').map((g: string) => g.trim()).filter(Boolean));
                groups.add(item.group);
                mergedNews[i].group = Array.from(groups).join(' / ');
                merged = true;
                break;
            }
        }

        if (!merged) {
            mergedNews.push({ ...item, _authorKey: authorKey, _normContent: normContent });
        }
    });

    const uniqueNewsMap = new Map<string, { content: string; date: string; group: string; author?: string }>();
    mergedNews.forEach((m) => {
        uniqueNewsMap.set(`${m.date}-${m.content}-${m.group}`, { content: m.content, date: m.date, group: m.group, author: m.author });
    });

    const sortedNews = Array.from(uniqueNewsMap.values()).reverse();

    return { starStudents: sortedStars, kocs: sortedKocs, goodNewsList: sortedNews };
  }, [data]);

  const [selectedKocName, setSelectedKocName] = useState<string | null>(null);
  const selectedKoc = useMemo(() => {
    if (kocs.length === 0) return null;
    if (!selectedKocName) return kocs[0];
    return kocs.find((koc) => koc.name === selectedKocName) || kocs[0];
  }, [kocs, selectedKocName]);
  const selectedKocIndex = selectedKoc ? kocs.findIndex((koc) => koc.name === selectedKoc.name) : -1;
  const kocTags = (selectedKoc?.tags?.length ? selectedKoc.tags : selectedKoc?.detail?.tags || []).slice(0, 4);
  const recentContributions = selectedKoc?.contributions?.slice(0, 3) ?? [];
  const moreContributions = recentContributions.slice(1);

  if (data.length === 0) return null;

  return (
    <div className="grid gap-6 md:grid-cols-2">
        
        {/* 1. KOC Radar (Community Contributors) */}
        <Card className="col-span-1">
            <CardHeader>
                <div className="flex items-center gap-2">
                    <Medal className="h-5 w-5 text-emerald-500" />
                    <CardTitle>KOC 活跃榜</CardTitle>
                </div>
                <CardDescription>社区最活跃的分享官与贡献者</CardDescription>
            </CardHeader>
            <CardContent>
                {kocs.length === 0 ? (
                  <div className="w-full text-center text-muted-foreground py-8 text-sm">暂无 KOC 数据</div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                    <ScrollArea className="h-[500px] w-full pr-3">
                      <div className="space-y-2">
                        {kocs.map((koc, index) => {
                          const isActive = selectedKoc?.name === koc.name;
                          return (
                            <button
                              key={koc.name}
                              type="button"
                              onClick={() => setSelectedKocName(koc.name)}
                              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                                isActive
                                  ? 'border-emerald-500/60 bg-emerald-50/70'
                                  : 'border-border hover:bg-muted/60'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold ${index < 3 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                                  #{index + 1}
                                </span>
                                <span className="text-sm font-medium">{koc.name}</span>
                                <Badge
                                  variant={index < 3 ? 'default' : 'outline'}
                                  className={index < 3 ? 'ml-auto bg-emerald-500 text-white hover:bg-emerald-600 border-transparent' : 'ml-auto'}
                                >
                                  +{koc.count}
                                </Badge>
                              </div>
                              {koc.summary && (
                                <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                  {koc.summary}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>

                    <div className="h-[500px] rounded-xl border bg-muted/20 p-4 flex flex-col gap-4 overflow-y-auto">
                      {selectedKoc ? (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-xs text-muted-foreground">KOC 亮点详情</div>
                              <div className="text-lg font-semibold">{selectedKoc.name}</div>
                              <div className="text-xs text-muted-foreground">
                                排名 #{selectedKocIndex + 1} · 活跃 +{selectedKoc.count}
                              </div>
                            </div>
                            {selectedKocIndex >= 0 && selectedKocIndex < 3 && (
                              <Badge className="bg-emerald-500 text-white">Top {selectedKocIndex + 1}</Badge>
                            )}
                          </div>

                          <div className="space-y-3 text-sm">
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">标签</div>
                              <div className="flex flex-wrap gap-2">
                                {kocTags.length > 0 ? (
                                  kocTags.map((tag) => (
                                    <Badge key={tag} variant="outline">
                                      {tag}
                                    </Badge>
                                  ))
                                ) : (
                                  <Badge variant="outline">待标注</Badge>
                                )}
                              </div>
                            </div>

                            <div>
                              <div className="text-xs text-muted-foreground mb-1">标题</div>
                              <div className="text-sm leading-relaxed">
                                {selectedKoc.detail?.title || selectedKoc.summary || '暂无记录'}
                              </div>
                            </div>

                            {selectedKoc.detail?.reason && (
                              <div>
                                <div className="text-xs text-muted-foreground mb-1">入选理由</div>
                                <div className="text-sm leading-relaxed whitespace-pre-line">{selectedKoc.detail.reason}</div>
                              </div>
                            )}

                            {moreContributions.length > 0 && (
                              <div>
                                <div className="text-xs text-muted-foreground mb-2">更多贡献</div>
                                <div className="space-y-2">
                                  {moreContributions.map((item, idx) => (
                                    <div key={`${item.dateLabel}-${idx}`} className="rounded-md border bg-background px-3 py-2 text-xs text-muted-foreground">
                                      <div className="flex items-center justify-between">
                                        <span>{item.dateLabel || '近期'}</span>
                                      </div>
                                      <div className="mt-1 text-sm font-medium text-foreground">
                                      {item.detail.title || item.summary}
                                    </div>
                                    {item.detail.reason && (
                                      <div className="mt-1 line-clamp-2">理由：{item.detail.reason}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-muted-foreground">选择左侧成员查看亮点</div>
                      )}
                    </div>
                  </div>
                )}
            </CardContent>
        </Card>

        {/* 2. Good News Wall (Outcomes) */}
        <Card className="col-span-1">
             <CardHeader>
                <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-rose-500" />
                    <CardTitle>好事发生墙</CardTitle>
                </div>
                <CardDescription>记录社群里的每一个高光时刻</CardDescription>
                <div className="flex justify-end">
                  <Link href="/community/good-news-review" className="text-xs text-primary hover:underline">
                    好事审核
                  </Link>
                </div>
            </CardHeader>
            <CardContent>
                <ScrollArea className="h-[500px] w-full pr-4">
                    <div className="space-y-4">
                        {goodNewsList.map((item, i) => (
                            <div key={i} className="relative pl-4 border-l-2 border-rose-100 dark:border-rose-900/50 py-1">
                                <div className="absolute -left-[5px] top-2 h-2.5 w-2.5 rounded-full bg-rose-400 ring-4 ring-white dark:ring-zinc-950" />
                                <div className="text-xs text-muted-foreground mb-1 flex items-center justify-between">
                                    <span>{item.date} · {item.group}</span>
                                </div>
                                <div className="text-sm leading-relaxed text-foreground/90">
                                    <Quote className="inline-block h-3 w-3 text-rose-300 mr-1 -mt-1 transform rotate-180" />
                                    {/* Parse bold text: **text** */}
                                    {item.author && <span className="font-semibold text-rose-600 dark:text-rose-300 mr-1">{item.author}：</span>}
                                    {item.content.split(/(\*\*.*?\*\*)/).map((part, i) => {
                                        if (part.startsWith('**') && part.endsWith('**')) {
                                            return <span key={i} className="font-bold text-rose-600 dark:text-rose-400 mx-1">{part.slice(2, -2)}</span>;
                                        }
                                        return <span key={i}>{part}</span>;
                                    })}
                                </div>
                            </div>
                        ))}
                        {goodNewsList.length === 0 && <div className="text-center text-muted-foreground py-8 text-sm">暂无好事数据</div>}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    </div>
  );
}
