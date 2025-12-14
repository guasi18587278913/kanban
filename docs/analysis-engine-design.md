# 分析引擎设计文档

## 1. 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        分析引擎 (Analysis Engine)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │   预处理层    │ -> │   规则引擎    │ -> │   LLM增强    │      │
│  │ Preprocessor │    │ Rule Engine  │    │ LLM Enhance  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │               │
│         v                   v                   v               │
│  ┌─────────────────────────────────────────────────────┐       │
│  │                    输出层 (Output)                   │       │
│  │  daily_stats | good_news | koc_record | qa_record   │       │
│  │              star_student | member tags             │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 数据流

```
raw_chat_log (status: pending)
       │
       v
[1. 预处理] 解析消息、识别成员
       │
       v
[2. 规则引擎] 统计、问答检测、关键词匹配
       │
       v
[3. LLM增强] 好事提取、标杆识别、KOC识别（可选）
       │
       v
[4. 输出] 写入派生表 + 更新成员标签
       │
       v
raw_chat_log (status: processed)
```

## 3. 各层详细设计

### 3.1 预处理层 (Preprocessor)

**输入**: raw_chat_log.raw_content
**输出**: 结构化消息数组

```typescript
interface ParsedMessage {
  author: string;           // 原始昵称
  authorNormalized: string; // 标准化昵称（用于匹配成员）
  memberId?: string;        // 匹配到的成员ID
  memberRole?: string;      // coach/volunteer/student
  time: string;             // HH:MM:SS
  timestamp: Date;          // 完整时间戳
  text: string;             // 消息内容
  type: 'text' | 'image' | 'link' | 'file' | 'merged'; // 消息类型
}
```

**功能**:
1. 解析原始文本，提取每条消息
2. 标准化昵称，匹配 member 表
3. 识别消息类型（文本、图片、链接、合并转发）
4. 计算精确时间戳

### 3.2 规则引擎 (Rule Engine)

**基于关键词和模式的快速提取**

#### 3.2.1 基础统计
- 消息总数
- 活跃人数（去重）
- 时段分布（按小时统计）

#### 3.2.2 问答检测
```typescript
// 问题识别模式
const questionPatterns = [
  /(\?|？)/,                    // 问号
  /(请问|求助|问下|问一下)/,     // 求助词
  /(怎么|如何|为什么|哪里)/,     // 疑问词
  /(能不能|可不可以|是不是)/,    // 确认词
];

// 解决识别模式
const resolutionPatterns = [
  /(谢谢|感谢|搞定|解决了|好了|OK)/,
  /(明白了|懂了|知道了|学到了)/,
];
```

#### 3.2.3 好事关键词
```typescript
const goodNewsPatterns = [
  // 收入相关
  /(出单|成交|变现|提现|赚了?|收入|收款)/,
  // 里程碑
  /(首单|破百|破千|破万|上岸)/,
  // 平台成就
  /(YPP|开通收益|过审|上架|通过)/,
  // 增长指标
  /(涨粉|爆款|播放量|订阅)/,
  // 固定模板
  /(#生财好事|#举手|喜报)/,
];
```

#### 3.2.4 贡献识别
```typescript
const contributionPatterns = [
  /(分享|教程|文档|指南|经验)/,
  /(prompt|提示词|模板|工具)/,
  /(亲测|试了|推荐|好用)/,
];
```

### 3.3 LLM增强层 (可选，用于深度分析)

**何时触发LLM**:
1. 规则引擎检测到高价值内容时（好事 > 3条）
2. 需要语义理解时（判断标杆类型、提取成就细节）
3. 生成运营建议时

**Prompt 设计原则**:
1. 单一职责：每次调用只做一件事
2. 结构化输出：强制 JSON 格式
3. 上下文最小化：只传必要内容，降低成本

```typescript
// 好事提取 Prompt
const goodNewsPrompt = `
你是社群运营专家。从以下聊天记录中提取"好事"（成员的成就/收获）。

规则：
1. 只提取明确的成就（出单、变现、里程碑）
2. 必须有具体数据或描述
3. 排除转发他人、纯表情、祝贺语

输出 JSON:
{
  "goodNews": [
    {"author": "昵称", "content": "成就描述", "category": "首单/变现/里程碑/其他"}
  ]
}
`;
```

### 3.4 输出层

**写入目标**:

| 源数据 | 目标表 | 说明 |
|--------|--------|------|
| 基础统计 | daily_stats | 每日汇总 |
| 好事 | good_news | 按条存储 |
| KOC贡献 | koc_record | 按条存储 |
| 问答 | qa_record | 按条存储 |
| 标杆学员 | star_student | 按条存储 |
| 活跃度 | member.activity_level | 更新标签 |

## 4. 成员标签更新策略

### 4.1 活跃度计算

```typescript
// 30天滑动窗口
function calculateActivityLevel(memberId: string): string {
  const last30Days = getMessageCountLast30Days(memberId);

  if (last30Days >= 50) return '高活';      // 日均 1.6+ 条
  if (last30Days >= 20) return '中活';      // 日均 0.6+ 条
  if (last30Days >= 5)  return '低活';      // 有参与
  return '沉默';                            // 几乎无参与
}
```

### 4.2 里程碑检测

```typescript
// 从好事记录自动更新
function detectMilestones(memberId: string, goodNews: GoodNews[]): string[] {
  const milestones: string[] = [];

  for (const news of goodNews) {
    if (/首单|第一单/.test(news.content)) milestones.push('首单');
    if (/首次变现|第一次收入/.test(news.content)) milestones.push('首次变现');
    if (/破百|100/.test(news.content)) milestones.push('破百');
    if (/破千|1000/.test(news.content)) milestones.push('破千');
    if (/YPP|开通收益/.test(news.content)) milestones.push('YPP通过');
  }

  return [...new Set(milestones)];
}
```

### 4.3 变现量级推断

```typescript
function inferRevenueLevel(content: string): string | null {
  // 提取金额
  const amountMatch = content.match(/(\d+(?:\.\d+)?)\s*(美?[元刀]|USD|\$)/);
  if (!amountMatch) return null;

  const amount = parseFloat(amountMatch[1]);
  const isUSD = /美|刀|USD|\$/.test(amountMatch[2]);
  const cnyAmount = isUSD ? amount * 7.2 : amount;

  if (cnyAmount >= 10000) return '万元级';
  if (cnyAmount >= 1000) return '千元级';
  if (cnyAmount >= 100) return '百元级';
  if (cnyAmount > 0) return '小额(<100)';
  return null;
}
```

## 5. 处理流程

### 5.1 批量处理脚本

```bash
# 处理所有待处理记录
npx tsx scripts/run-analysis.ts

# 只处理指定日期
npx tsx scripts/run-analysis.ts --date 2025-12-14

# 重新处理（覆盖已处理）
npx tsx scripts/run-analysis.ts --force

# 不使用LLM（仅规则引擎）
npx tsx scripts/run-analysis.ts --no-llm
```

### 5.2 增量处理

每日导入后自动触发分析：
```typescript
// daily-import.ts 末尾
if (newRecords > 0) {
  await runAnalysis({ onlyPending: true });
}
```

## 6. 性能优化

### 6.1 批量查询成员

```typescript
// 预加载所有成员的昵称映射
const memberMap = new Map<string, Member>();
const members = await db().select().from(member);
for (const m of members) {
  memberMap.set(m.nicknameNormalized, m);
}
```

### 6.2 LLM调用优化

1. **批量处理**：多条记录合并成一个请求
2. **缓存**：相同内容不重复调用
3. **降级**：LLM失败时回退到规则引擎

### 6.3 数据库写入优化

```typescript
// 批量插入
await db().insert(goodNews).values(batch);

// 事务保护
await db().transaction(async (tx) => {
  await tx.update(rawChatLog).set({ status: 'processed' });
  await tx.insert(dailyStats).values(stats);
});
```

## 7. 文件结构

```
src/lib/analysis/
├── index.ts              # 主入口
├── preprocessor.ts       # 预处理层
├── rule-engine.ts        # 规则引擎
├── llm-enhancer.ts       # LLM增强（可选）
├── output-writer.ts      # 输出层
├── member-tagger.ts      # 成员标签更新
└── patterns.ts           # 正则模式定义

scripts/
├── run-analysis.ts       # 分析执行脚本
└── daily-import.ts       # (已有) 集成分析触发
```

## 8. 下一步实现计划

1. **Phase 1**: 实现预处理层 + 规则引擎（纯规则，无LLM）
2. **Phase 2**: 实现输出层，写入派生表
3. **Phase 3**: 添加成员标签更新逻辑
4. **Phase 4**: 集成LLM增强（可选）
5. **Phase 5**: 优化和测试

---

## 确认问题

在开始实现前，需要确认：

1. **LLM使用策略**：
   - A) 全量使用LLM（更准确，成本高）
   - B) 仅规则引擎（快速，可能漏提取）
   - C) 混合模式（规则先行，LLM补充）

2. **好事审核流程**：
   - 自动提取的好事是否需要人工审核？
   - 还是直接展示，后续可标记删除？

3. **处理优先级**：
   - 先处理最新数据？
   - 还是从最早开始按时间顺序？
