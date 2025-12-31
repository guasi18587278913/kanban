export const TAG_CATEGORY_LABELS: Record<string, string> = {
  stage: '阶段',
  intent: '需求',
  niche: '方向',
  achievement: '成果',
  expertise: '擅长领域',
  action: '动作',
  progress: '进度',
  activity: '活跃',
  risk: '风险',
  sentiment: '情绪',
};

export const TAG_CATEGORY_OPTIONS = Object.entries(TAG_CATEGORY_LABELS).map(
  ([value, title]) => ({
    value,
    title,
  })
);

export const TAG_STATUS_LABELS: Record<string, string> = {
  active: '启用',
  inactive: '停用',
};

export const TAG_STATUS_OPTIONS = Object.entries(TAG_STATUS_LABELS).map(
  ([value, title]) => ({
    value,
    title,
  })
);

export function parseAliasInput(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatAliases(aliases?: string[] | null): string {
  if (!aliases || aliases.length === 0) return '';
  return aliases.join('\n');
}
