export type TagCategory =
  | 'action'
  | 'progress'
  | 'achievement'
  | 'activity'
  | 'risk'
  | 'profile'
  | 'stage'
  | 'intent'
  | 'niche'
  | 'expertise'
  | 'sentiment';

export type DerivedTag = {
  category: TagCategory;
  name: string;
  evidence?: string | null;
  level?: 'high' | 'medium' | 'low';
};

export type MemberTagInput = {
  productLine?: string | null;
  role?: string | null;
  activityLevel?: string | null;
  progressAiProduct?: string | null;
  progressYoutube?: string | null;
  progressBilibili?: string | null;
  revenueLevel?: string | null;
  milestones?: string | null;
  expireDate?: Date | string | null;
  status?: string | null;
  wechatId?: string | null;
  lastActiveDate?: Date | string | null;
  avgResponseMinutes?: number | null;
};

export type QaSummaryInput = {
  question?: string | null;
  questionTime?: Date | string | null;
  isResolved?: boolean | null;
  waitMinutes?: number | null;
  askerName?: string | null;
};

export type GoodNewsSummaryInput = {
  content?: string | null;
  date?: Date | string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeKey(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function truncate(value: string, length = 80) {
  if (value.length <= length) return value;
  return `${value.slice(0, length)}...`;
}

function parseMilestones(raw?: string | null) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === 'string');
  } catch {
    // ignore, try fallback
  }
  const invalid = new Set(['未知', '无', '-']);
  return raw
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter((item) => item && !invalid.has(item));
}

function pickProgress(input: MemberTagInput) {
  const productLine = input.productLine || '';
  if (productLine.includes('YouTube')) return input.progressYoutube || null;
  if (productLine.includes('B站')) return input.progressBilibili || null;
  return input.progressAiProduct || null;
}

export function mergeTags(...lists: DerivedTag[][]): DerivedTag[] {
  const merged: DerivedTag[] = [];
  const seen = new Set<string>();
  lists.flat().forEach((tag) => {
    const key = `${tag.category}:${normalizeKey(tag.name)}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(tag);
  });
  return merged;
}

export function buildBaseMemberTags(input: MemberTagInput, now = new Date()): DerivedTag[] {
  const tags: DerivedTag[] = [];
  const seen = new Set<string>();

  const add = (tag: DerivedTag) => {
    const key = `${tag.category}:${normalizeKey(tag.name)}`;
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(tag);
  };

  const invalidValues = new Set(['未知', '无', '-', '']);

  const progress = pickProgress(input);
  if (progress && !invalidValues.has(progress.trim())) {
    add({ category: 'progress', name: progress });
  }

  if (input.activityLevel && !invalidValues.has(input.activityLevel.trim())) {
    add({ category: 'activity', name: input.activityLevel });
  }

  if (input.revenueLevel && input.revenueLevel !== '未变现') {
    add({ category: 'achievement', name: `变现:${input.revenueLevel}` });
  }

  const milestones = parseMilestones(input.milestones);
  milestones.forEach((m) => {
    add({ category: 'achievement', name: `里程碑:${m}` });
  });

  if (!input.wechatId) {
    add({ category: 'action', name: '微信号缺失', level: 'low' });
  }

  const expireDate = toDate(input.expireDate);
  if (expireDate) {
    const daysLeft = Math.ceil((expireDate.getTime() - now.getTime()) / DAY_MS);
    if (daysLeft < 0 || input.status === 'expired') {
      add({
        category: 'action',
        name: '已到期',
        level: 'high',
        evidence: `到期日 ${formatDate(expireDate)}`,
      });
    } else if (daysLeft <= 30) {
      add({
        category: 'action',
        name: '即将到期',
        level: daysLeft <= 7 ? 'high' : 'medium',
        evidence: `剩余 ${daysLeft} 天（${formatDate(expireDate)}）`,
      });
    }
  } else if (input.status === 'expired') {
    add({
      category: 'action',
      name: '已到期',
      level: 'high',
    });
  }

  const lastActiveDate = toDate(input.lastActiveDate);
  if (lastActiveDate) {
    const idleDays = Math.floor((now.getTime() - lastActiveDate.getTime()) / DAY_MS);
    if (idleDays >= 30) {
      add({
        category: 'action',
        name: '需要激活',
        level: 'high',
        evidence: `上次活跃 ${formatDate(lastActiveDate)}`,
      });
    } else if (idleDays >= 14) {
      add({
        category: 'action',
        name: '14天未发言',
        level: 'high',
        evidence: `上次活跃 ${formatDate(lastActiveDate)}`,
      });
    } else if (idleDays >= 7) {
      add({
        category: 'action',
        name: '7天未发言',
        level: 'medium',
        evidence: `上次活跃 ${formatDate(lastActiveDate)}`,
      });
    }
  }

  if ((input.role === 'coach' || input.role === 'volunteer') && input.avgResponseMinutes) {
    if (input.avgResponseMinutes >= 30) {
      add({
        category: 'action',
        name: '响应偏慢',
        level: 'high',
        evidence: `平均响应 ${input.avgResponseMinutes} 分钟`,
      });
    } else if (input.avgResponseMinutes >= 10) {
      add({
        category: 'action',
        name: '响应偏慢',
        level: 'medium',
        evidence: `平均响应 ${input.avgResponseMinutes} 分钟`,
      });
    }
  }

  return tags;
}

export function buildActionTagsFromRecords(
  input: {
    qaList?: QaSummaryInput[];
    goodNewsList?: GoodNewsSummaryInput[];
    now?: Date;
  }
): DerivedTag[] {
  const tags: DerivedTag[] = [];
  const now = input.now ?? new Date();
  const seen = new Set<string>();
  const add = (tag: DerivedTag) => {
    const key = `${tag.category}:${normalizeKey(tag.name)}`;
    if (seen.has(key)) return;
    seen.add(key);
    tags.push(tag);
  };

  const qaList = input.qaList || [];
  const unresolved = qaList
    .filter((q) => q && q.isResolved !== true)
    .filter((q) => {
      const time = toDate(q.questionTime);
      if (!time) return true;
      return now.getTime() - time.getTime() <= 14 * DAY_MS;
    })
    .sort((a, b) => {
      const timeA = toDate(a.questionTime)?.getTime() || 0;
      const timeB = toDate(b.questionTime)?.getTime() || 0;
      return timeB - timeA;
    });

  if (unresolved.length > 0) {
    const latest = unresolved[0];
    const summary = latest.question || '';
    const author = latest.askerName ? `${latest.askerName}：` : '';
    const waitInfo =
      typeof latest.waitMinutes === 'number'
        ? `，等待 ${Math.round(latest.waitMinutes)} 分钟`
        : '';
    add({
      category: 'action',
      name: '待跟进问题',
      level: 'high',
      evidence: `提问：${author}${truncate(summary, 80)}${waitInfo}`,
    });
  }

  const goodNewsList = input.goodNewsList || [];
  const recentGoodNews = goodNewsList
    .map((g) => ({ ...g, dateObj: toDate(g.date) }))
    .filter((g) => g.dateObj && now.getTime() - g.dateObj.getTime() <= 14 * DAY_MS)
    .sort((a, b) => (b.dateObj?.getTime() || 0) - (a.dateObj?.getTime() || 0));

  if (recentGoodNews.length > 0) {
    const latest = recentGoodNews[0];
    const content = latest.content || '';
    add({
      category: 'achievement',
      name: '近期好事',
      level: 'medium',
      evidence: truncate(content, 80),
    });
  }

  return tags;
}
