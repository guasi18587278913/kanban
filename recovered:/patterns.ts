/**
 * 正则模式定义
 * 用于规则引擎的关键词匹配
 */

// ============================================
// 消息解析
// ============================================

// 消息头部模式: 昵称(wxid) MM-DD HH:MM:SS
export const MESSAGE_HEADER_PATTERN = /^(.+?)\s*\(([^)]+)\)\s+(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/;
// 简化消息头部: 昵称 HH:MM:SS
export const MESSAGE_HEADER_PATTERN_SIMPLE = /^(.+?)\s+(\d{2}):(\d{2}):(\d{2})$/;

// 时间模式
export const TIME_PATTERN = /(\d{2}):(\d{2}):(\d{2})/;

// ============================================
// 问答检测
// ============================================

// 问题识别
export const QUESTION_PATTERNS = [
  /[?？]/,                           // 问号
  /请问|求助|问下|问一下|咨询/,        // 求助词
  /怎么|如何|为什么|什么|哪里|哪个/,   // 疑问词
  /能不能|可不可以|是不是|有没有/,    // 确认词
  /求|跪求|急|在线等/,               // 紧急词
];

// 问题解决
export const RESOLUTION_PATTERNS = [
  /解决了?|搞定了?|修复了?|好了|可以了/,
  /OK了|ok了|Done|done|Fixed|fixed/,
  /没问题了|正常了|成功了/,
];

// 感谢（问题解决的信号）
export const THANKS_PATTERNS = [
  /谢谢|感谢|多谢|辛苦了?/,
  /太棒了|牛|厉害|赞/,
  /明白了|懂了|知道了|学到了|受教了/,
];

// ============================================
// 好事检测
// ============================================

// 收入相关
export const REVENUE_PATTERNS = [
  /出单|成交|变现|提现|收入|收款|入账/,
  /赚了?|盈利|利润|营收/,
  /(\d+(?:\.\d+)?)\s*(美?[元刀]|USD|\$|rmb|RMB)/,
];

// 里程碑
export const MILESTONE_PATTERNS = [
  /首单|第一单|首次|第一次/,
  /破[百千万]|破\d+/,
  /上岸|起步|开张/,
];

// 平台成就
export const PLATFORM_PATTERNS = [
  /YPP|开通收益|过审|审核通过/,
  /上架|发布|上线/,
  /通过|批准|获批/,
];

// 增长指标
export const GROWTH_PATTERNS = [
  /涨粉|新增粉丝|粉丝.*[+＋]/,
  /爆款|爆了|火了/,
  /播放量|观看量|阅读量/,
  /订阅|关注/,
];

// 固定模板
export const TEMPLATE_PATTERNS = [
  /#生财好事|#举手|#喜报|#战报/,
  /\[喜报\]|\[战报\]|\[好消息\]/,
];

// 合并所有好事模式
export const GOOD_NEWS_PATTERNS = [
  ...REVENUE_PATTERNS,
  ...MILESTONE_PATTERNS,
  ...PLATFORM_PATTERNS,
  ...GROWTH_PATTERNS,
  ...TEMPLATE_PATTERNS,
];

// ============================================
// 贡献检测 (KOC)
// ============================================

export const CONTRIBUTION_PATTERNS = [
  /分享|教程|文档|指南|攻略/,
  /经验|心得|总结|复盘/,
  /prompt|提示词|模板|工具|资源/,
  /亲测|测试|试了|实测/,
  /推荐|安利|好用|神器/,
];

// ============================================
// 消息类型检测
// ============================================

export const IMAGE_PATTERN = /\[图片\]|\[Image\]/i;
export const LINK_PATTERN = /https?:\/\/[^\s]+/;
export const FILE_PATTERN = /\[文件\]|\[File\]/i;
export const MERGED_PATTERN = /\[合并转发\]|--- 以下为合并转发 ---/;
export const EMOJI_ONLY_PATTERN = /^[\s\p{Emoji}\p{Emoji_Presentation}\p{Emoji_Modifier}\p{Emoji_Modifier_Base}\p{Emoji_Component}]+$/u;
export const RED_PACKET_PATTERN = /\[红包\]|收到红包|发出红包/;
export const STICKER_PATTERN = /\[表情\]|\[动画表情\]/;

// ============================================
// 金额提取
// ============================================

export const AMOUNT_PATTERN = /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(美?[元刀]|USD|\$|rmb|RMB|CNY|人民币)?/g;

/**
 * 解析金额并转换为人民币
 */
export function parseAmount(text: string): { amount: number; currency: 'CNY' | 'USD' } | null {
  const match = text.match(/(\d+(?:,\d{3})*(?:\.\d+)?)\s*(美?[元刀]|USD|\$|rmb|RMB|CNY|人民币)?/);
  if (!match) return null;

  const amount = parseFloat(match[1].replace(/,/g, ''));
  const currencyStr = match[2] || '';
  const isUSD = /美|刀|USD|\$/i.test(currencyStr);

  return {
    amount,
    currency: isUSD ? 'USD' : 'CNY',
  };
}

/**
 * 推断变现量级
 */
export function inferRevenueLevel(text: string): string | null {
  const parsed = parseAmount(text);
  if (!parsed) return null;

  const cnyAmount = parsed.currency === 'USD' ? parsed.amount * 7.2 : parsed.amount;

  if (cnyAmount >= 10000) return '万元级';
  if (cnyAmount >= 1000) return '千元级';
  if (cnyAmount >= 100) return '百元级';
  if (cnyAmount > 0) return '小额(<100)';
  return null;
}

// ============================================
// 辅助函数
// ============================================

/**
 * 测试文本是否匹配任一模式
 */
export function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

/**
 * 获取所有匹配的模式
 */
export function getMatchedPatterns(text: string, patterns: RegExp[]): RegExp[] {
  return patterns.filter(p => p.test(text));
}
