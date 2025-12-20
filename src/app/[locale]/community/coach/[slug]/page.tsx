'use client';

import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { SmartIcon } from '@/shared/blocks/common';
import { Button } from '@/shared/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { FixedSizeList as List } from 'react-window';
import { toast } from 'sonner';

type MemberApiResponse = {
  profile: any;
  stats: any;
  questions: any[];
  answers: any[];
  goodNews: any[];
  kocs: any[];
  stars: any[];
};

type TimelineItem = {
  id: string;
  type: 'question' | 'answer' | 'good_news' | 'share' | 'koc_record' | 'star_student' | 'normal';
  author: string;
  content: string;
  ts: string;
};

function parseMilestones(raw?: string | null) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch (e) {
    // fallthrough to split
  }
  return raw.split(/[,，;；]/).map((s) => s.trim()).filter(Boolean);
}

function buildTags(profile: any) {
  if (!profile) {
    return { identity: [], progress: [], achievement: [] };
  }
  const identity: string[] = [];
  if (profile.circleIdentity) identity.push(profile.circleIdentity);
  if (profile.productLine) {
    const period = profile.period ? `${profile.period}期` : '';
    identity.push(period ? `${profile.productLine} ${period}` : profile.productLine);
  }
  if (profile.location) identity.push(profile.location);

  const progress: string[] = [];
  if (profile.progressAiProduct) progress.push(profile.progressAiProduct);
  if (profile.progressYoutube) progress.push(profile.progressYoutube);
  if (profile.progressBilibili) progress.push(profile.progressBilibili);

  const achievement: string[] = [];
  achievement.push(...parseMilestones(profile.milestones));
  if (profile.revenueLevel) achievement.push(profile.revenueLevel);
  if (profile.niche) achievement.push(profile.niche);

  return { identity, progress, achievement };
}

function buildTimeline(data: MemberApiResponse | null, fallbackName: string, isPrivacyMode = false): TimelineItem[] {
  if (!data) return [];
  const items: TimelineItem[] = [];
  const displayName = isPrivacyMode ? 'Masked User' : (data.profile?.nickname || fallbackName);

  (data.questions || []).forEach((q) => {
    items.push({
      id: `q-${q.id}`,
      type: 'question',
      author: q.author || displayName,
      content: isPrivacyMode ? '******' : (q.content || q.questionContent || '提问'),
      ts: q.questionTime ? new Date(q.questionTime).toISOString() : new Date().toISOString(),
    });
  });

  (data.answers || []).forEach((a) => {
    items.push({
      id: `a-${a.id}`,
      type: 'answer',
      author: isPrivacyMode ? 'Masked User' : (data.profile?.nickname || displayName),
      content: isPrivacyMode ? '******' : (a.answerContent || a.questionContent || '回答'),
      ts: a.answerTime ? new Date(a.answerTime).toISOString() : new Date().toISOString(),
    });
  });

  (data.goodNews || []).forEach((g) => {
    items.push({
      id: `gn-${g.id}`,
      type: 'good_news',
      author: isPrivacyMode ? 'Masked User' : (g.authorName || displayName),
      content: isPrivacyMode ? '******' : g.content,
      ts: g.date ? new Date(g.date).toISOString() : new Date().toISOString(),
    });
  });

  (data.kocs || []).forEach((k) => {
    items.push({
      id: `koc-${k.id}`,
      type: 'koc_record',
      author: isPrivacyMode ? 'Masked User' : (data.profile?.nickname || fallbackName),
      content: isPrivacyMode ? '******' : k.content,
      ts: k.date ? new Date(k.date).toISOString() : new Date().toISOString(),
    });
  });

  (data.stars || []).forEach((s) => {
    items.push({
      id: `star-${s.id}`,
      type: 'star_student',
      author: isPrivacyMode ? 'Masked User' : (data.profile?.nickname || fallbackName),
      content: isPrivacyMode ? '******' : s.content,
      ts: s.date ? new Date(s.date).toISOString() : new Date().toISOString(),
    });
  });

  return items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

// 1. Timeline Row Component for Virtual Scroll
const TimelineRow = ({ index, style, data }: { index: number; style: CSSProperties; data: TimelineItem[] }) => {
  const item = data[index];

  const typeConfig: Record<string, { color: string; icon: string; label: string }> = {
    question: { color: 'bg-blue-100 text-blue-700', icon: 'HelpCircle', label: '提问' },
    answer: { color: 'bg-green-100 text-green-700', icon: 'MessageSquare', label: '回答' },
    good_news: { color: 'bg-red-100 text-red-700', icon: 'Trophy', label: '报喜' },
    share: { color: 'bg-yellow-100 text-yellow-700', icon: 'Share2', label: '分享' },
    koc_record: { color: 'bg-purple-100 text-purple-700', icon: 'Star', label: 'KOC' },
    star_student: { color: 'bg-amber-100 text-amber-700', icon: 'Award', label: '优秀学员' },
    normal: { color: 'bg-gray-100 text-gray-500', icon: 'MessageCircle', label: '消息' },
  };

  const config = typeConfig[item.type] || typeConfig['normal'];
  const dateStr = new Date(item.ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  return (
    <div style={style} className="px-4 py-2">
      <div className="flex gap-3 text-sm border-b pb-2 h-full items-start">
         <div className={`p-1.5 rounded-full shrink-0 ${config.color} mt-1`}>
            <SmartIcon name={config.icon} className="w-3 h-3" />
         </div>
         <div className="flex-1 min-w-0">
             <div className="flex justify-between items-center mb-1">
                 <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground/90">{item.author}</span>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1">{config.label}</Badge>
                 </div>
                 <span className="text-xs text-muted-foreground">{dateStr}</span>
             </div>
             <p className="text-foreground/80 break-all line-clamp-2">{item.content}</p>
         </div>
      </div>
    </div>
  );
};

export default function CoachCrmDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const isPrivacyMode = process.env.NEXT_PUBLIC_PRIVACY_MODE === 'true'; 
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<MemberApiResponse | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [associations, setAssociations] = useState<{ goodNews: any[]; kocs: any[]; stars: any[]; qas: any[] }>({
    goodNews: [],
    kocs: [],
    stars: [],
    qas: [],
  });
  const [timelineTab, setTimelineTab] = useState('highlights');
  const [error, setError] = useState<string | null>(null);

  const realName = useMemo(() => decodeURIComponent(slug), [slug]);
  const displayName = useMemo(() => {
    if (isPrivacyMode) return 'Masked User';
    return data?.profile?.nickname || realName;
  }, [data?.profile?.nickname, realName, isPrivacyMode]);

  // Privacy: Mask sensitive profile fields
  const safeProfile = useMemo(() => {
    const raw = data?.profile || {};
    if (!isPrivacyMode) return raw;
    return {
      ...raw,
      nickname: 'Masked User',
      productLine: '******',
      period: '**',
      circleIdentity: '******',
      location: '******',
      progressAiProduct: '******',
      progressYoutube: '******',
      progressBilibili: '******',
      milestones: null, // or "[]"
      revenueLevel: '******',
      niche: '******',
    };
  }, [data?.profile, isPrivacyMode]);

  useEffect(() => {
    let mounted = true;
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        // FIX: Always use realName for API, never masked name
        const res = await fetch(`/api/community/member/${encodeURIComponent(realName)}`, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`请求失败: ${res.status}`);
        }
        const payload = (await res.json()) as MemberApiResponse;
        if (!mounted) return;
        setData(payload);
        setTimeline(buildTimeline(payload, realName, isPrivacyMode));
        setAssociations({
          goodNews: payload.goodNews || [],
          kocs: payload.kocs || [],
          stars: payload.stars || [],
          // QA 审核：取未审核的提问
          qas: (payload.questions || []).filter((q) => !q.isVerified),
        });
      } catch (e: any) {
        console.error(e);
        if (mounted) setError(e?.message || '加载失败');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchData();
    return () => {
      mounted = false;
    };
  }, [realName, isPrivacyMode]);

  // Handle Action Item Copy
  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板');
  };

  const handleVerify = async (type: string, id: string) => {
    // Optimistic Update
    const previous = { ...associations };
    const key =
      type === 'good_news'
        ? 'goodNews'
        : type === 'koc_record' || type === 'koc'
        ? 'kocs'
        : type === 'star_student' || type === 'star'
        ? 'stars'
        : 'qas';
    setAssociations((prev) => ({
      ...prev,
      [key]: (prev as any)[key].map((item: any) =>
        item.id === id ? { ...item, isVerified: true, status: 'active' } : item
      ),
    }));

    const secret = sessionStorage.getItem('admin_secret') || window.prompt('请输入管理员密钥 (默认: secret)');
    if (!secret) return;
    sessionStorage.setItem('admin_secret', secret);

    // Map to API types
    const apiType =
      type === 'good_news'
        ? 'good_news'
        : type === 'koc_record'
        ? 'koc'
        : type === 'star_student'
        ? 'star'
        : type === 'question'
        ? 'qa'
        : type;

    try {
      const res = await fetch('/api/community/review', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-secret': secret,
        },
        body: JSON.stringify({ type: apiType, id, decision: 'approve' }),
      });
      if (!res.ok) throw new Error('审核失败');
      toast.success('已审核通过');
    } catch (e: any) {
      // Rollback
      setAssociations(previous);
      toast.error(e?.message || '审核失败');
    }
  };

  // Filtered Timeline
  const filteredTimeline = useMemo(() => {
    if (timelineTab === 'all') return timeline;
    return timeline.filter((t) => ['question', 'answer', 'good_news', 'share', 'koc_record', 'star_student'].includes(t.type));
  }, [timeline, timelineTab]);

  const tags = useMemo(() => buildTags(safeProfile), [safeProfile]);
  const stats = data?.stats || { totalMessages: 0, answerCount: 0, goodNewsCount: 0, activeDays: 0 };
  const profile = safeProfile;

  if (loading) {
    return <div className="p-10 text-center text-muted-foreground animate-pulse">正在加载用户画像...</div>;
  }

  if (error) {
    return <div className="p-10 text-center text-destructive">加载失败：{error}</div>;
  }

  return (
    <div className="p-4 md:p-8 flex flex-col gap-6 max-w-7xl mx-auto">
      {/* 1. Profile Header */}
      <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between border-b pb-6">
         <div className="flex items-start gap-4">
             {/* Avatar Placeholder */}
             <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold border-2 border-primary/20">
                 {profile?.nickname?.[0]?.toUpperCase() || displayName[0]?.toUpperCase() || 'U'}
             </div>
             <div>
                 <div className="flex items-center gap-3">
                     <h1 className="text-2xl font-bold tracking-tight">{profile?.nickname || displayName}</h1>
                     <Badge className={profile?.role === 'coach' ? 'bg-indigo-500' : 'bg-blue-500'}>
                         {profile?.role === 'coach' ? '教练' : profile?.role === 'volunteer' ? '志愿者' : '学员'}
                     </Badge>
                     {profile?.activityLevel && <Badge variant="outline">{profile.activityLevel}</Badge>}
                 </div>
                 <div className="text-sm text-muted-foreground mt-1 flex gap-2">
                     <span>{profile?.productLine || '未分配产品线'}</span>
                     {profile?.period && (
                       <>
                         <span>·</span>
                         <span>{profile.period}期</span>
                       </>
                     )}
                 </div>
             </div>
         </div>

         {/* Tag Groups */}
         <div className="grid grid-cols-3 gap-x-8 gap-y-2 text-sm bg-muted/30 p-3 rounded-lg border">
             <div>
                 <span className="text-xs font-medium text-muted-foreground block mb-1">身份与权益</span>
                 <div className="flex flex-wrap gap-1">
                     {tags.identity.length > 0 ? (
                       tags.identity.map((t) => (
                         <Badge key={t} variant="secondary" className="text-[10px] h-5">{t}</Badge>
                       ))
                     ) : (
                       <span className="text-xs text-muted-foreground/50">-</span>
                     )}
                 </div>
             </div>
             <div>
                 <span className="text-xs font-medium text-muted-foreground block mb-1">学习进度</span>
                 <div className="flex flex-wrap gap-1">
                     {tags.progress.length > 0 ? (
                       tags.progress.map((t) => (
                         <Badge key={t} variant="secondary" className="text-[10px] h-5">{t}</Badge>
                       ))
                     ) : (
                       <span className="text-xs text-muted-foreground/50">-</span>
                     )}
                 </div>
             </div>
             <div>
                 <span className="text-xs font-medium text-muted-foreground block mb-1">成果/价值</span>
                  <div className="flex flex-wrap gap-1">
                     {tags.achievement.length > 0 ? (
                       tags.achievement.map((t) => (
                         <Badge key={t} variant="default" className="text-[10px] h-5 bg-orange-500 hover:bg-orange-600">{t}</Badge>
                       ))
                     ) : (
                       <span className="text-xs text-muted-foreground/50">-</span>
                     )}
                 </div>
             </div>
         </div>
      </div>

      {/* 2. KPI Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <StatCard title="累计消息" value={stats.totalMessages || 0} icon="MessageSquare" />
        <StatCard title="答疑贡献" value={stats.answerCount || 0} icon="HelpCircle" />
        <StatCard title="好事产出" value={stats.goodNewsCount || 0} icon="Trophy" />
        <StatCard title="活跃天数" value={stats.activeDays || 0} icon="Zap" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 h-[600px]">
          {/* 3. Timeline (Left 2 Cols) */}
          <Card className="lg:col-span-2 flex flex-col h-full">
              <CardHeader className="pb-3 border-b">
                  <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                          <SmartIcon name="History" className="h-5 w-5 text-muted-foreground" />
                          互动时间线
                      </CardTitle>
                      <Tabs value={timelineTab} onValueChange={setTimelineTab} className="w-[200px]">
                        <TabsList className="grid w-full grid-cols-2 h-8">
                            <TabsTrigger value="highlights" className="text-xs">高光时刻</TabsTrigger>
                            <TabsTrigger value="all" className="text-xs">全部</TabsTrigger>
                        </TabsList>
                      </Tabs>
                  </div>
              </CardHeader>
              <div className="flex-1">
                  {filteredTimeline.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                      暂无互动记录
                    </div>
                  ) : (
                    <List
                      height={500}
                      itemCount={filteredTimeline.length}
                      itemSize={90}
                      width="100%"
                      itemData={filteredTimeline}
                    >
                      {TimelineRow}
                    </List>
                  )}
              </div>
          </Card>

          {/* 4. Action & Associations (Right Col) */}
          <div className="flex flex-col gap-6 h-full overflow-y-auto">

              {/* Action Items */}
              <Card>
                  <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                         <SmartIcon name="Zap" className="w-4 h-4 text-orange-500" />
                          行动建议
                      </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                      <div className="bg-orange-50 border border-orange-100 p-3 rounded-md text-sm">
                          <div className="font-medium text-orange-800 mb-1">未闭环提问催办</div>
                          <p className="text-xs text-muted-foreground mb-2">同学你好，看到你关于“Key购买”的问题还没解决，是遇到卡点了吗？</p>
                          <Button size="sm" variant="outline" className="h-6 w-full text-xs" onClick={() => handleCopy("同学你好，看到你关于“Key购买”的问题还没解决，是遇到卡点了吗？")}>
                              复制话术
                          </Button>
                      </div>
                      <div className="bg-green-50 border border-green-100 p-3 rounded-md text-sm">
                          <div className="font-medium text-green-800 mb-1">里程碑祝贺</div>
                          <p className="text-xs text-muted-foreground mb-2">恭喜突破首单！这是一个巨大的里程碑，期待你分享更多经验！</p>
                          <Button size="sm" variant="outline" className="h-6 w-full text-xs" onClick={() => handleCopy("恭喜突破首单！这是一个巨大的里程碑，期待你分享更多经验！")}>
                              复制话术
                          </Button>
                      </div>
                  </CardContent>
              </Card>

                  {/* Associations Lists: Render Sections for Each Type */}
                  {[
                    { key: 'goodNews', label: '好事记录', icon: 'Trophy', color: 'text-red-500', type: 'good_news' },
                    { key: 'kocs', label: 'KOC 记录', icon: 'Star', color: 'text-purple-500', type: 'koc_record' },
                    { key: 'stars', label: '优秀学员', icon: 'Award', color: 'text-amber-500', type: 'star_student' },
                    { key: 'qas', label: '待审核提问', icon: 'HelpCircle', color: 'text-blue-500', type: 'question' },
                  ].map((section) => (
                    <Card key={section.key} className="flex-1">
                      <CardHeader className="pb-3 border-b">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <SmartIcon name={section.icon} className={`w-4 h-4 ${section.color}`} />
                          {section.label} ({(associations as any)[section.key]?.length || 0})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        {((associations as any)[section.key] || []).length === 0 ? (
                          <div className="py-4 text-center text-xs text-muted-foreground">暂无数据</div>
                        ) : (
                          ((associations as any)[section.key] || []).map((item: any) => (
                            <div
                              key={item.id}
                              className="p-3 border-b last:border-0 hover:bg-muted/50 transition-colors flex justify-between items-center group"
                            >
                              <div>
                                <div className="text-sm font-medium line-clamp-2">
                                  {section.type === 'question'
                                    ? item.content || item.questionContent
                                    : item.content}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {item.date ? new Date(item.date).toLocaleDateString() : ''}
                                </div>
                              </div>
                              {item.isVerified ? (
                                <div className="flex items-center text-green-600 text-xs gap-1">
                                  <SmartIcon name="Check" className="w-3 h-3" />
                                  <span>已审</span>
                                </div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 opacity-0 group-hover:opacity-100 text-xs text-blue-600"
                                  onClick={() => handleVerify(section.type, item.id)}
                                >
                                  审核
                                </Button>
                              )}
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>
                  ))}
          </div>
      </div>
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
