/**
 * 预处理层
 * 将原始群聊文本解析为结构化消息数组
 */

import {
  MESSAGE_HEADER_PATTERN,
  MESSAGE_HEADER_PATTERN_SIMPLE,
  IMAGE_PATTERN,
  LINK_PATTERN,
  FILE_PATTERN,
  MERGED_PATTERN,
  EMOJI_ONLY_PATTERN,
  RED_PACKET_PATTERN,
  STICKER_PATTERN,
} from './patterns';

// ============================================
// 类型定义
// ============================================

export interface ParsedMessage {
  index: number;              // 消息序号
  author: string;             // 原始昵称
  authorNormalized: string;   // 标准化昵称
  wxId?: string;              // 微信ID
  memberId?: string;          // 匹配到的成员ID
  memberRole?: 'coach' | 'volunteer' | 'student';
  time: string;               // HH:MM:SS
  hour: number;               // 小时
  minute: number;             // 分钟
  timestamp: Date;            // 完整时间戳
  text: string;               // 消息内容
  type: MessageType;          // 消息类型
  isValid: boolean;           // 是否为有效消息（排除系统消息等）
}

export type MessageType =
  | 'text'
  | 'image'
  | 'link'
  | 'file'
  | 'merged'
  | 'emoji'
  | 'red_packet'
  | 'sticker'
  | 'system';

export interface PreprocessResult {
  messages: ParsedMessage[];
  stats: {
    totalMessages: number;
    validMessages: number;
    uniqueAuthors: number;
    hourlyDistribution: Record<number, number>;
    messageTypes: Record<MessageType, number>;
  };
  authorMap: Map<string, { count: number; firstSeen: Date; lastSeen: Date }>;
}

// ============================================
// 成员映射（运行时填充）
// ============================================

let memberLookup: Map<string, { id: string; role: string }> | null = null;

export function setMemberLookup(lookup: Map<string, { id: string; role: string }>) {
  memberLookup = lookup;
}

// ============================================
// 昵称标准化
// ============================================

export function normalizeNickname(name: string): string {
  return name
    // 移除括号内容
    .replace(/（.*?）|\(.*?\)|【.*?】|\[.*?\]/g, '')
    // 移除分隔符后的内容
    .replace(/[-_—–·•‧·｜|].*$/, '')
    // 移除空白
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

// ============================================
// 消息类型检测
// ============================================

function detectMessageType(text: string): MessageType {
  if (RED_PACKET_PATTERN.test(text)) return 'red_packet';
  if (STICKER_PATTERN.test(text)) return 'sticker';
  if (IMAGE_PATTERN.test(text)) return 'image';
  if (FILE_PATTERN.test(text)) return 'file';
  if (MERGED_PATTERN.test(text)) return 'merged';
  if (LINK_PATTERN.test(text)) return 'link';
  if (EMOJI_ONLY_PATTERN.test(text)) return 'emoji';
  return 'text';
}

// ============================================
// 消息解析
// ============================================

export function parseMessages(
  rawContent: string,
  chatDate: Date
): PreprocessResult {
  const lines = rawContent.split(/\r?\n/);
  const messages: ParsedMessage[] = [];
  const authorMap = new Map<string, { count: number; firstSeen: Date; lastSeen: Date }>();
  const hourlyDistribution: Record<number, number> = {};
  const messageTypes: Record<MessageType, number> = {
    text: 0,
    image: 0,
    link: 0,
    file: 0,
    merged: 0,
    emoji: 0,
    red_packet: 0,
    sticker: 0,
    system: 0,
  };

  let currentMessage: Partial<ParsedMessage> | null = null;
  let textBuffer: string[] = [];
  let messageIndex = 0;

  const flushCurrentMessage = () => {
    if (currentMessage && currentMessage.author) {
      const text = textBuffer.join('\n').trim();
      const type = detectMessageType(text);
      const isValid = type !== 'system' && type !== 'emoji' && text.length > 0;

      const msg: ParsedMessage = {
        index: messageIndex++,
        author: currentMessage.author!,
        authorNormalized: currentMessage.authorNormalized!,
        wxId: currentMessage.wxId,
        memberId: currentMessage.memberId,
        memberRole: currentMessage.memberRole,
        time: currentMessage.time!,
        hour: currentMessage.hour!,
        minute: currentMessage.minute!,
        timestamp: currentMessage.timestamp!,
        text,
        type,
        isValid,
      };

      messages.push(msg);
      messageTypes[type]++;

      // 更新作者统计
      const authorKey = currentMessage.authorNormalized!;
      const existing = authorMap.get(authorKey);
      if (existing) {
        existing.count++;
        existing.lastSeen = msg.timestamp;
      } else {
        authorMap.set(authorKey, {
          count: 1,
          firstSeen: msg.timestamp,
          lastSeen: msg.timestamp,
        });
      }

      // 更新时段分布
      hourlyDistribution[msg.hour] = (hourlyDistribution[msg.hour] || 0) + 1;
    }
    currentMessage = null;
    textBuffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 尝试匹配消息头部
    const match = trimmed.match(MESSAGE_HEADER_PATTERN);
    const simpleMatch = match ? null : trimmed.match(MESSAGE_HEADER_PATTERN_SIMPLE);

    if (match || simpleMatch) {
      // 先保存上一条消息
      flushCurrentMessage();

      let author = '';
      let wxId: string | undefined;
      let hour = 0;
      let minute = 0;
      let second = 0;
      const timestamp = new Date(chatDate);

      if (match) {
        author = match[1].trim();
        wxId = match[2];
        const month = parseInt(match[3], 10);
        const day = parseInt(match[4], 10);
        hour = parseInt(match[5], 10);
        minute = parseInt(match[6], 10);
        second = parseInt(match[7], 10);

        // 构建完整时间戳
        timestamp.setMonth(month - 1);
        timestamp.setDate(day);
        timestamp.setHours(hour, minute, second, 0);
      } else if (simpleMatch) {
        author = simpleMatch[1].trim();
        hour = parseInt(simpleMatch[2], 10);
        minute = parseInt(simpleMatch[3], 10);
        second = parseInt(simpleMatch[4], 10);
        timestamp.setHours(hour, minute, second, 0);
      }

      const authorNormalized = normalizeNickname(author);

      // 查找成员
      let memberId: string | undefined;
      let memberRole: 'coach' | 'volunteer' | 'student' | undefined;
      if (memberLookup) {
        const found = memberLookup.get(authorNormalized);
        if (found) {
          memberId = found.id;
          memberRole = found.role as 'coach' | 'volunteer' | 'student';
        }
      }

      currentMessage = {
        author,
        authorNormalized,
        wxId,
        memberId,
        memberRole,
        time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`,
        hour,
        minute,
        timestamp,
      };
    } else if (currentMessage) {
      // 继续累积消息内容
      textBuffer.push(trimmed);
    }
  }

  // 处理最后一条消息
  flushCurrentMessage();

  // 计算统计
  const validMessages = messages.filter(m => m.isValid).length;
  const uniqueAuthors = authorMap.size;

  return {
    messages,
    stats: {
      totalMessages: messages.length,
      validMessages,
      uniqueAuthors,
      hourlyDistribution,
      messageTypes,
    },
    authorMap,
  };
}

// ============================================
// 辅助函数
// ============================================

/**
 * 计算两条消息之间的分钟差
 */
export function getMinutesDiff(msg1: ParsedMessage, msg2: ParsedMessage): number {
  return Math.round((msg2.timestamp.getTime() - msg1.timestamp.getTime()) / 60000);
}

/**
 * 获取消息的时间字符串
 */
export function formatMessageTime(msg: ParsedMessage): string {
  return `${msg.hour.toString().padStart(2, '0')}:${msg.minute.toString().padStart(2, '0')}`;
}
