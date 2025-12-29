import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Link } from '@/core/i18n/navigation';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Trophy, Medal, Award, Star, TrendingUp, Quote, ChevronDown } from 'lucide-react';

interface KnowledgeWallProps {
  data: any[]; // CommunityDailyReport[]
}

export function KnowledgeWall({ data }: KnowledgeWallProps) {
  
  // Aggregate Personas and Content from reports
  const { starStudents, kocs, goodNewsList } = useMemo(() => {
    const starMap = new Map<string, { count: number; reasons: Set<string>; originalName: string }>();
    const kocMap = new Map<
      string,
      {
        count: number;
        entries: Map<string, KocEntry>;
        originalName: string;
        groups: Set<string>;
      }
    >();
    const news: { content: string; date: string; group: string; author?: string }[] = [];

    type KocEntry = {
      raw: string;
      model?: string;
      coreAchievement?: string;
      highlightQuote?: string;
      suggestedTitle?: string;
      reason?: string;
      scoreText?: string;
      scoreTotal?: number;
    };

    const normalizeKocKey = (value: string) =>
      (value || '')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[^\p{L}\p{N}]/gu, '');

    const stripLabel = (value: string) =>
      value.replace(/^(模型|核心事迹|高光语录|推荐选题|入选理由|评分)\s*[:：]\s*/g, '').trim();

    const parseKocContribution = (text: string): KocEntry => {
      const entry: KocEntry = { raw: (text || '').trim() };
      if (!entry.raw) return entry;

      const lines = entry.raw
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
      const extras: string[] = [];

      lines.forEach((line) => {
        const match = line.match(/^(模型|核心事迹|高光语录|推荐选题|入选理由|评分)\s*[:：]\s*(.*)$/);
        if (!match) {
          extras.push(line);
          return;
        }
        const label = match[1];
        const value = match[2]?.trim() || '';
        if (!value) return;

        if (label === '模型') entry.model = value;
        if (label === '核心事迹') entry.coreAchievement = value;
        if (label === '高光语录') entry.highlightQuote = value;
        if (label === '推荐选题') entry.suggestedTitle = value;
        if (label === '入选理由') entry.reason = value;
        if (label === '评分') {
          entry.scoreText = value;
          const scoreMatch = value.match(/总分\s*(\d+)/);
          if (scoreMatch) entry.scoreTotal = Number(scoreMatch[1]);
        }
      });

      if (!entry.coreAchievement && extras.length > 0) {
        entry.coreAchievement = stripLabel(extras[0]);
      }

      return entry;
    };

    const pickSummaryEntry = (entries: KocEntry[]) => {
      if (entries.length === 0) return null;
      const sorted = [...entries].sort((a, b) => {
        const scoreA = a.scoreTotal ?? -1;
        const scoreB = b.scoreTotal ?? -1;
        if (scoreA !== scoreB) return scoreB - scoreA;
        const lenA = (a.coreAchievement || a.highlightQuote || a.suggestedTitle || a.reason || a.raw).length;
        const lenB = (b.coreAchievement || b.highlightQuote || b.suggestedTitle || b.reason || b.raw).length;
        return lenB - lenA;
      });
      return sorted[0];
    };

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
                const reason = typeof koc === 'object' ? koc.contribution : '';
                const group = report.groupName || '';

                if (!rawName) return;
                const cleanName = normalizeName(rawName.trim());
                
                const entry = kocMap.get(cleanName) || { count: 0, entries: new Map(), originalName: cleanName, groups: new Set() };
                entry.count += 1;
                if (reason) {
                  const parsed = parseKocContribution(reason);
                  const dedupeKey = normalizeKocKey(
                    parsed.coreAchievement || parsed.highlightQuote || parsed.suggestedTitle || parsed.reason || parsed.raw
                  );
                  const safeKey = dedupeKey || `${normalizeKocKey(parsed.raw)}-${entry.entries.size}`;
                  if (!entry.entries.has(safeKey)) {
                    entry.entries.set(safeKey, parsed);
                  }
                }
                if (group) entry.groups.add(group);
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
          const entries = Array.from(data.entries.values()).sort((a, b) => (b.scoreTotal ?? 0) - (a.scoreTotal ?? 0));
          const summaryEntry = pickSummaryEntry(entries);
          const summary = summaryEntry
            ? stripLabel(summaryEntry.coreAchievement || summaryEntry.highlightQuote || summaryEntry.suggestedTitle || summaryEntry.reason || summaryEntry.raw)
            : '';

          return {
            name,
            count: data.count,
            uniqueCount: entries.length,
            summary,
            entries,
            groups: Array.from(data.groups),
          };
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
                 <ScrollArea className="h-[500px] w-full pr-4">
                     {kocs.length === 0 ? (
                        <div className="w-full text-center text-muted-foreground py-8 text-sm">暂无 KOC 数据</div>
                     ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {kocs.map((koc, index) => {
                                const isTop = index < 3;
                                const summary = koc.summary || '暂无摘要';

                                return (
                                    <details
                                        key={koc.name}
                                        className={`group rounded-lg border p-3 transition-shadow ${isTop ? 'border-emerald-500/50 bg-emerald-50/60' : 'bg-muted/30'}`}
                                    >
                                        <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="truncate text-sm font-semibold">{koc.name}</span>
                                                        <Badge
                                                            variant="outline"
                                                            className={isTop ? 'border-emerald-500 bg-emerald-500 text-white' : ''}
                                                        >
                                                            +{koc.count}
                                                        </Badge>
                                                    </div>
                                                    <div className="mt-1 text-xs text-muted-foreground line-clamp-2 group-open:hidden">
                                                        {summary}
                                                    </div>
                                                    <div className="mt-1 hidden text-[11px] text-muted-foreground group-open:block">
                                                        已展开 · 去重后 {koc.uniqueCount} 条
                                                    </div>
                                                </div>
                                                <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                                            </div>
                                        </summary>
                                        <div className="mt-3 space-y-3 text-xs text-muted-foreground">
                                            <div className="flex flex-wrap gap-2 text-[11px] text-emerald-600/90">
                                                {koc.groups?.length > 0 && <span>群组：{koc.groups.join('、')}</span>}
                                                {koc.uniqueCount !== koc.count && (
                                                    <span>原始 {koc.count} 次 / 去重后 {koc.uniqueCount} 条</span>
                                                )}
                                            </div>

                                            {koc.entries.length > 0 ? (
                                                <div className="space-y-2 max-h-64 overflow-auto pr-2">
                                                    {koc.entries.map((entry, idx) => {
                                                        const entrySummary =
                                                          entry.coreAchievement ||
                                                          entry.highlightQuote ||
                                                          entry.suggestedTitle ||
                                                          entry.reason ||
                                                          entry.raw;
                                                        return (
                                                            <div key={`${koc.name}-entry-${idx}`} className="rounded-md border border-border/60 bg-background/80 p-2">
                                                                <div className="text-sm text-foreground/90">{entrySummary}</div>
                                                                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-emerald-600/80">
                                                                    {entry.model && <span className="rounded bg-emerald-50/80 px-1.5 py-0.5">模型：{entry.model}</span>}
                                                                    {entry.scoreText && <span className="rounded bg-emerald-50/80 px-1.5 py-0.5">{entry.scoreText}</span>}
                                                                </div>
                                                                {entry.highlightQuote && (
                                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                                        <span className="text-emerald-600">高光语录：</span>{entry.highlightQuote}
                                                                    </div>
                                                                )}
                                                                {entry.suggestedTitle && (
                                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                                        <span className="text-emerald-600">推荐选题：</span>{entry.suggestedTitle}
                                                                    </div>
                                                                )}
                                                                {entry.reason && (
                                                                    <div className="mt-1 text-xs text-muted-foreground">
                                                                        <span className="text-emerald-600">入选理由：</span>{entry.reason}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="text-[11px] text-muted-foreground">暂无补充信息</div>
                                            )}
                                        </div>
                                    </details>
                                );
                            })}
                        </div>
                     )}
                 </ScrollArea>
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
